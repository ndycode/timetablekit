"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type {
  ParseProgress,
  TimetableInput,
  TimetableParseResult,
} from "@ndycode/timetablekit";
import { fileToTimetableInput } from "./input-boundary";
import {
  createInitialPlaygroundState,
  currentInputForSource,
  draftSettingsError,
  parseOptionsFor,
  PROGRESS_LABELS,
  playgroundReducer,
  settingsFromState,
  type PlaygroundSettings,
  type PlaygroundState,
  type PlaygroundTab,
} from "./playground-model";
import { parsePlaygroundInput } from "./playground-parser";
import { SAMPLE_INPUT } from "./samples";

type ActiveRequest = {
  readonly id: number;
  readonly controller: AbortController;
};

export type PlaygroundController = {
  readonly state: PlaygroundState;
  readonly currentInput: TimetableInput | undefined;
  readonly selectTab: (tab: PlaygroundTab) => void;
  readonly setPasteText: (text: string) => void;
  readonly setLocale: (locale: string) => void;
  readonly setTimezone: (timezone: string) => void;
  readonly setTermStarts: (value: string) => void;
  readonly setTermEnds: (value: string) => void;
  readonly setAiRecovery: (enabled: boolean) => void;
  readonly runParse: (
    nextInput?: TimetableInput,
    settings?: PlaygroundSettings,
  ) => Promise<void>;
  readonly handleFile: (file: File | undefined) => Promise<void>;
  readonly stop: () => void;
  readonly reset: () => void;
  readonly updateResult: (result: TimetableParseResult) => void;
  readonly notify: (status: string, error?: string) => void;
};

function parseErrorMessage(caught: unknown): string {
  return caught instanceof Error
    ? caught.message
    : "We could not read that schedule.";
}

export function usePlayground(): PlaygroundController {
  const [state, dispatch] = useReducer(
    playgroundReducer,
    undefined,
    createInitialPlaygroundState,
  );
  const requestIdRef = useRef(0);
  const activeRequestRef = useRef<ActiveRequest | null>(null);

  const currentInput = useMemo(
    () => currentInputForSource(state.source),
    [state.source],
  );
  const settings = useMemo(
    () => settingsFromState(state),
    [
      state.aiRecovery,
      state.locale,
      state.termEnds,
      state.termStarts,
      state.timezone,
    ],
  );

  const runParse = useCallback(
    async (
      nextInput: TimetableInput | undefined = currentInput,
      settingsSnapshot: PlaygroundSettings = settings,
    ): Promise<void> => {
      activeRequestRef.current?.controller.abort();
      activeRequestRef.current = null;
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;

      if (nextInput === undefined) {
        dispatch({
          type: "parse-failed",
          message: "Choose a file before reading the schedule.",
          status: "Choose a file before reading the schedule.",
        });
        return;
      }
      const settingsError = draftSettingsError(settingsSnapshot);
      if (settingsError !== undefined) {
        dispatch({
          type: "parse-failed",
          message: settingsError,
          status: "The date range needs attention.",
        });
        return;
      }

      const controller = new AbortController();
      activeRequestRef.current = { id: requestId, controller };
      dispatch({ type: "parse-started" });
      const onProgress = (value: ParseProgress): void => {
        if (
          activeRequestRef.current?.id !== requestId ||
          controller.signal.aborted
        ) {
          return;
        }
        const ratio =
          value.total === undefined || value.total === 0
            ? 0.5
            : value.completed / value.total;
        dispatch({
          type: "parse-progressed",
          progress: Math.round(Math.max(0, Math.min(1, ratio)) * 100),
          status: PROGRESS_LABELS[value.stage] ?? value.message,
        });
      };
      const options = parseOptionsFor(
        settingsSnapshot,
        controller.signal,
        onProgress,
      );

      try {
        const parsed = await parsePlaygroundInput(nextInput, options);
        if (
          activeRequestRef.current?.id !== requestId ||
          controller.signal.aborted
        ) {
          return;
        }
        dispatch({ type: "parse-succeeded", result: parsed });
      } catch (caught) {
        if (activeRequestRef.current?.id !== requestId) return;
        if (controller.signal.aborted) {
          dispatch({ type: "parse-stopped" });
        } else {
          dispatch({
            type: "parse-failed",
            message: parseErrorMessage(caught),
          });
        }
      } finally {
        if (activeRequestRef.current?.id === requestId) {
          activeRequestRef.current = null;
        }
      }
    },
    [currentInput, settings],
  );

  const initialParseRef = useRef<{
    readonly runParse: PlaygroundController["runParse"];
    readonly settings: PlaygroundSettings;
  } | null>(null);
  if (initialParseRef.current === null) {
    initialParseRef.current = { runParse, settings };
  }

  const stop = useCallback((): void => {
    const activeRequest = activeRequestRef.current;
    if (activeRequest === null) return;
    activeRequest.controller.abort();
    activeRequestRef.current = null;
    dispatch({ type: "parse-stopped" });
  }, []);

  const reset = useCallback((): void => {
    stop();
    const initialState = createInitialPlaygroundState();
    dispatch({ type: "reset" });
    void runParse(SAMPLE_INPUT, settingsFromState(initialState));
  }, [runParse, stop]);

  const handleFile = useCallback(
    async (file: File | undefined): Promise<void> => {
      if (file === undefined) return;
      stop();
      try {
        const boundary = await fileToTimetableInput(file);
        if (!boundary.ok) {
          dispatch({ type: "file-rejected", message: boundary.message });
          return;
        }
        dispatch({
          type: "file-selected",
          input: boundary.input,
          label: boundary.label,
        });
      } catch (caught) {
        dispatch({
          type: "file-rejected",
          message: parseErrorMessage(caught),
        });
      }
    },
    [stop],
  );

  const selectTab = useCallback(
    (tab: PlaygroundTab): void => {
      stop();
      dispatch({ type: "tab-changed", tab });
    },
    [stop],
  );
  const setPasteText = useCallback(
    (text: string): void => {
      stop();
      dispatch({ type: "paste-text-changed", text });
    },
    [stop],
  );
  const setLocale = useCallback(
    (locale: string): void => {
      stop();
      dispatch({ type: "locale-changed", locale });
    },
    [stop],
  );
  const setTimezone = useCallback(
    (timezone: string): void => {
      stop();
      dispatch({ type: "timezone-changed", timezone });
    },
    [stop],
  );
  const setTermStarts = useCallback(
    (value: string): void => {
      stop();
      dispatch({ type: "term-start-changed", value });
    },
    [stop],
  );
  const setTermEnds = useCallback(
    (value: string): void => {
      stop();
      dispatch({ type: "term-end-changed", value });
    },
    [stop],
  );
  const setAiRecovery = useCallback(
    (enabled: boolean): void => {
      stop();
      dispatch({ type: "ai-recovery-changed", enabled });
    },
    [stop],
  );
  const updateResult = useCallback(
    (result: TimetableParseResult): void =>
      dispatch({ type: "result-updated", result }),
    [],
  );
  const notify = useCallback(
    (status: string, error?: string): void =>
      dispatch({
        type: "notice-set",
        status,
        ...(error === undefined ? {} : { error }),
      }),
    [],
  );

  useEffect(() => {
    const initialParse = initialParseRef.current;
    if (initialParse === null) return;
    void initialParse.runParse(SAMPLE_INPUT, initialParse.settings);
  }, []);

  useEffect(
    () => () => {
      activeRequestRef.current?.controller.abort();
      activeRequestRef.current = null;
    },
    [],
  );

  return {
    state,
    currentInput,
    selectTab,
    setPasteText,
    setLocale,
    setTimezone,
    setTermStarts,
    setTermEnds,
    setAiRecovery,
    runParse,
    handleFile,
    stop,
    reset,
    updateResult,
    notify,
  };
}
