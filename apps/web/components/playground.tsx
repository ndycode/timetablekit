"use client";

import { useMemo, useState } from "react";
import { toCSV, toICS, toJSON } from "@ndycode/timetablekit";
import {
  applyEventCorrection,
  type PlaygroundCorrection,
} from "../lib/playground-model";
import { usePlayground } from "../lib/use-playground";
import { PlaygroundEvents } from "./playground-events";
import { PlaygroundIssues } from "./playground-issues";
import { PlaygroundJson, type ExportFormat } from "./playground-json";
import { PlaygroundPreview } from "./playground-preview";
import { PlaygroundSource } from "./playground-source";
import { ShieldCheckIcon } from "./icons";

function toDownload(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function sdkSnippet(locale: string, timezone: string): string {
  return `import { parseTimetable, toICS } from "@ndycode/timetablekit"

const result = await parseTimetable(
  { kind: "text", text: rawTimetable },
  { locale: "${locale}", timezone: "${timezone}" },
)

const calendar = toICS(result)`;
}

export default function Playground() {
  const controller = usePlayground();
  const {
    state,
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
  } = controller;
  const [copyStatus, setCopyStatus] = useState("");

  const jsonText = useMemo(
    () =>
      state.result === null
        ? "Read a schedule to see the JSON."
        : toJSON(state.result, { pretty: true }),
    [state.result],
  );

  function correctEvent(correction: PlaygroundCorrection): void {
    if (state.result === null) return;
    updateResult(applyEventCorrection(state.result, correction));
  }

  function exportFormat(format: ExportFormat): void {
    const result = state.result;
    if (result === null) return;
    try {
      if (format === "json") {
        toDownload(
          "timetable.json",
          toJSON(result, { pretty: true }),
          "application/json",
        );
      } else if (format === "csv") {
        toDownload("timetable.csv", toCSV(result), "text/csv;charset=utf-8");
      } else {
        toDownload(
          "timetable.ics",
          toICS(result),
          "text/calendar;charset=utf-8",
        );
      }
      setCopyStatus("");
      notify(`${format.toUpperCase()} file ready to download.`);
    } catch (caught) {
      notify(
        "We could not create the file.",
        caught instanceof Error ? caught.message : "The export failed.",
      );
    }
  }

  async function copySdk(): Promise<void> {
    try {
      if (typeof navigator.clipboard?.writeText !== "function") {
        throw new Error("Clipboard is not available in this browser.");
      }
      await navigator.clipboard.writeText(
        sdkSnippet(state.locale, state.timezone),
      );
      setCopyStatus("Copied to clipboard.");
      notify("Example code copied.");
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "We could not copy the example.";
      setCopyStatus("Copy failed.");
      notify("We could not copy the example.", message);
    }
  }

  return (
    <main
      id="main-content"
      className="playground-shell"
      data-testid="playground"
    >
      <div className="playground-intro">
        <div>
          <h1>Check your schedule.</h1>
          <p>
            Start with a sample. Paste a schedule. Or choose a local file. We
            read it in your browser by default.
          </p>
        </div>
        <p className="privacy-note" data-testid="privacy-note">
          <ShieldCheckIcon aria-hidden="true" />
          <strong>Runs in this browser.</strong> No account or API key.
        </p>
      </div>

      <div className="playground-layout">
        <div className="playground-workspace">
          <PlaygroundSource
            state={state}
            onTabChange={selectTab}
            onPasteTextChange={setPasteText}
            onLocaleChange={setLocale}
            onTimezoneChange={setTimezone}
            onTermStartChange={setTermStarts}
            onTermEndChange={setTermEnds}
            onAiRecoveryChange={setAiRecovery}
            onFileSelect={(file) => void handleFile(file)}
            onRead={() => void runParse()}
            onStop={stop}
            onReset={reset}
          />
          <PlaygroundEvents result={state.result} onCorrection={correctEvent} />
          <PlaygroundJson
            jsonText={jsonText}
            hasResult={state.result !== null}
            copyStatus={copyStatus}
            onExport={exportFormat}
            onCopy={() => void copySdk()}
          />
        </div>
        <aside
          className="playground-rail"
          aria-label="Issues and schedule preview"
          data-testid="playground-rail"
        >
          <PlaygroundIssues result={state.result} />
          <PlaygroundPreview result={state.result} />
        </aside>
      </div>
    </main>
  );
}
