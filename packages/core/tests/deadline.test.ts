import { describe, expect, it, vi } from "vitest";
import {
  createTimetableParser,
  EN_PH_LOCALE,
  OptionsValidationError,
} from "../src";
import { createParseDeadline, DeadlineTimeoutError } from "../src/deadline.js";
import type {
  ExtractionArtifact,
  ExtractionProvider,
  RecoveryProvider,
  LocaleRegistry,
  TimetableInput,
} from "../src";

const options = {
  locale: "en-PH",
  timezone: "Asia/Manila",
  evidence: "none" as const,
};

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function pending<T>(): {
  readonly promise: Promise<T>;
  readonly reject: (reason?: unknown) => void;
} {
  let rejectPromise: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((_resolve, reject) => {
    rejectPromise = reject;
  });
  return { promise, reject: rejectPromise };
}

describe("parse-wide deadlines", () => {
  it("rejects a pre-aborted caller without invoking work", async () => {
    const controller = new AbortController();
    controller.abort();
    const deadline = createParseDeadline(100, controller.signal);
    let called = false;

    await expect(
      deadline.run("extract", "pre-aborted", () => {
        called = true;
        return "unreachable";
      }),
    ).rejects.toMatchObject({ code: "ABORTED" });
    expect(called).toBe(false);
    deadline.dispose();
    deadline.dispose();
  });

  it("passes through immediate values and synchronous failures", async () => {
    const deadline = createParseDeadline(100, new AbortController().signal);
    await expect(
      deadline.run("extract", "immediate", () => "ready"),
    ).resolves.toBe("ready");
    await expect(
      deadline.run("recovery", "throwing", () => {
        throw new Error("operation failed");
      }),
    ).rejects.toThrow("operation failed");
    deadline.dispose();
  });

  it("does not invoke an operation after an expired deadline", async () => {
    const deadline = createParseDeadline(1, new AbortController().signal);
    await wait(10);
    let called = false;
    await expect(
      deadline.run("extract", "expired", () => {
        called = true;
        return "late";
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
      details: { provider: "expired", stage: "extract" },
    });
    expect(called).toBe(false);
    deadline.dispose();
  });

  it("settles a never-resolving extraction and observes a late rejection", async () => {
    const input: TimetableInput = {
      kind: "text",
      text: "Stuck Entry; Monday; 09:00-10:00",
    };
    let signal: AbortSignal | undefined;
    let lateReject: (reason?: unknown) => void = () => undefined;
    let lateHostProgress = false;
    const provider: ExtractionProvider = {
      id: "stuck-extraction",
      supports: () => true,
      extract: async (_input, context) => {
        signal = context.signal;
        const operation = pending<ExtractionArtifact>();
        lateReject = operation.reject;
        context.signal.addEventListener("abort", () => {
          context.reportProgress({
            stage: "extract",
            completed: 99,
            total: 100,
            message: "late",
          });
        });
        return operation.promise;
      },
    };
    const result = await createTimetableParser({ providers: [provider] }).parse(
      input,
      {
        ...options,
        limits: { timeoutMs: 30 },
        onProgress: (progress) => {
          if (progress.completed === 99) lateHostProgress = true;
        },
      },
    );
    expect(result.events).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "PROVIDER_TIMEOUT",
          details: { provider: "stuck-extraction", stage: "extract" },
        }),
      ]),
    );
    expect(result.parse.stageReports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "extract",
          status: "failed",
          providerId: "stuck-extraction",
        }),
      ]),
    );
    expect(signal?.aborted).toBe(true);
    expect(lateHostProgress).toBe(false);
    lateReject(new Error("late extraction rejection"));
    await wait(0);
  });

  it("keeps the deterministic result when recovery never resolves", async () => {
    const input: TimetableInput = {
      kind: "text",
      text: "Recoverable Entry; Monday; 9-10",
    };
    let signal: AbortSignal | undefined;
    let lateReject: (reason?: unknown) => void = () => undefined;
    let lateHostProgress = false;
    const provider: RecoveryProvider = {
      id: "stuck-recovery",
      recover: async (_request, context) => {
        signal = context.signal;
        const operation = pending<never>();
        lateReject = operation.reject;
        context.signal.addEventListener("abort", () => {
          context.reportProgress({
            stage: "recovery",
            completed: 99,
            total: 100,
            message: "late",
          });
        });
        return operation.promise;
      },
    };
    const result = await createTimetableParser({
      recoveryProvider: provider,
    }).parse(input, {
      ...options,
      limits: { timeoutMs: 200 },
      recovery: { enabled: true, consent: true },
      onProgress: (progress) => {
        if (progress.completed === 99) lateHostProgress = true;
      },
    });
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.parse.aiRecoveryUsed).toBe(false);
    expect(result.parse.providersUsed).toEqual(["deterministic"]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "PROVIDER_TIMEOUT",
          details: { provider: "stuck-recovery", stage: "recovery" },
        }),
      ]),
    );
    expect(result.parse.stageReports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "recovery",
          status: "failed",
          providerId: "stuck-recovery",
        }),
      ]),
    );
    expect(signal?.aborted).toBe(true);
    expect(lateHostProgress).toBe(false);
    lateReject(new Error("late recovery rejection"));
    await wait(0);
  });

  it("keeps deterministic events when recovery revalidation times out", async () => {
    const input: TimetableInput = {
      kind: "text",
      text: "Recoverable Entry; Monday; 9-10",
    };
    const initial = await createTimetableParser().parse(input, options);
    const eventId = initial.events[0]?.id;
    expect(eventId).toBeDefined();
    if (eventId === undefined) return;

    let recoveryStarted = false;
    const recoveryProvider: RecoveryProvider = {
      id: "revalidation-timeout",
      recover: async () => {
        recoveryStarted = true;
        return {
          patches: [
            { eventId, field: "startTime", value: "09:00", confidence: 0.9 },
          ],
        };
      },
    };
    const originalDateTimeFormat = Intl.DateTimeFormat;
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (
      locales?: string | string[],
      formatOptions?: Intl.DateTimeFormatOptions,
    ): Intl.DateTimeFormat {
      if (recoveryStarted) {
        const until = Date.now() + 100;
        while (Date.now() < until) {
          continue;
        }
      }
      return new originalDateTimeFormat(locales, formatOptions);
    });

    try {
      const result = await createTimetableParser({
        recoveryProvider,
      }).parse(input, {
        ...options,
        limits: { timeoutMs: 50 },
        recovery: { enabled: true, consent: true },
      });

      expect(result.events).toEqual(initial.events);
      expect(result.parse.aiRecoveryUsed).toBe(false);
      expect(result.parse.providersUsed).toEqual(["deterministic"]);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "PROVIDER_TIMEOUT",
            details: { stage: "validate" },
          }),
        ]),
      );
      expect(result.parse.stageReports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stage: "recovery",
            status: "failed",
            providerId: "revalidation-timeout",
          }),
        ]),
      );
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("reports an invalid recovery provider identity", async () => {
    const provider = {
      id: "",
      recover: async () => ({ patches: [] }),
    } as RecoveryProvider;
    const result = await createTimetableParser({
      recoveryProvider: provider,
    }).parse(
      { kind: "text", text: "Invalid Recovery; Monday; 9-10" },
      {
        ...options,
        recovery: { enabled: true, consent: true },
      },
    );

    expect(result.warnings.map((warning) => warning.code)).toContain(
      "AI_PROVIDER_UNAVAILABLE",
    );
    expect(
      result.parse.stageReports.find((report) => report.stage === "recovery"),
    ).toMatchObject({ status: "skipped" });
  });

  it("keeps caller abort distinct from a deadline timeout", async () => {
    const controller = new AbortController();
    let lateReject: (reason?: unknown) => void = () => undefined;
    const provider: ExtractionProvider = {
      id: "abortable-extraction",
      supports: () => true,
      extract: async () => {
        const operation = pending<ExtractionArtifact>();
        lateReject = operation.reject;
        return operation.promise;
      },
    };
    const parsing = createTimetableParser({ providers: [provider] }).parse(
      { kind: "text", text: "Abort Entry; Monday; 09:00-10:00" },
      { ...options, signal: controller.signal, limits: { timeoutMs: 100 } },
    );
    await wait(5);
    controller.abort();
    await expect(parsing).rejects.toMatchObject({ code: "ABORTED" });
    lateReject(new Error("late abort rejection"));
    await wait(0);
  });

  it("exposes the typed timeout error from the deadline adapter", async () => {
    const deadline = createParseDeadline(5, new AbortController().signal);
    await expect(
      deadline.run(
        "recovery",
        "provider",
        () => new Promise<never>(() => undefined),
      ),
    ).rejects.toBeInstanceOf(DeadlineTimeoutError);
    deadline.dispose();
  });

  it("maps hostile deadline listener hooks to invalid options", async () => {
    const setupFailure = createParseDeadline(100, new AbortController().signal);
    Object.defineProperty(setupFailure.signal, "addEventListener", {
      value: () => {
        throw new Error("hostile internal addEventListener");
      },
    });
    await expect(
      setupFailure.run("extract", "hostile", () => pending<never>().promise),
    ).rejects.toMatchObject({ code: "INVALID_OPTIONS" });
    setupFailure.dispose();

    const cleanupFailure = createParseDeadline(
      100,
      new AbortController().signal,
    );
    Object.defineProperty(cleanupFailure.signal, "removeEventListener", {
      value: () => {
        throw new Error("hostile internal removeEventListener");
      },
    });
    await expect(
      cleanupFailure.run("extract", "cleanup", () => "ready"),
    ).resolves.toBe("ready");
    cleanupFailure.dispose();

    const alreadyAborted = createParseDeadline(
      100,
      new AbortController().signal,
    );
    Object.defineProperty(alreadyAborted.signal, "aborted", { value: true });
    await expect(
      alreadyAborted.run("extract", "aborted", () => pending<never>().promise),
    ).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
      details: { provider: "aborted", stage: "extract" },
    });
    alreadyAborted.dispose();
  });

  it("maps hostile deadline state reads to invalid options", async () => {
    let callerReads = 0;
    const callerSignal = {
      get aborted(): boolean {
        callerReads += 1;
        if (callerReads < 3) return false;
        throw new Error("hostile caller aborted getter");
      },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as AbortSignal;
    const timeoutRead = createParseDeadline(100, callerSignal);
    const timeoutResult = timeoutRead.run(
      "extract",
      "hostile",
      () => pending<never>().promise,
    );
    timeoutRead.signal.dispatchEvent(new Event("abort"));
    await expect(timeoutResult).rejects.toMatchObject({
      code: "INVALID_OPTIONS",
    });
    timeoutRead.dispose();

    let assertionReads = 0;
    const assertionSignal = {
      get aborted(): boolean {
        assertionReads += 1;
        if (assertionReads === 1) return false;
        throw new Error("hostile assertion getter");
      },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as AbortSignal;
    const assertion = createParseDeadline(100, assertionSignal);
    expect(() => assertion.assertAvailable("extract")).toThrow(
      OptionsValidationError,
    );
    assertion.dispose();

    const internalRead = createParseDeadline(100, new AbortController().signal);
    Object.defineProperty(internalRead.signal, "aborted", {
      get: () => {
        throw new Error("hostile internal aborted getter");
      },
    });
    await expect(
      internalRead.run("extract", "hostile", () => pending<never>().promise),
    ).rejects.toMatchObject({ code: "INVALID_OPTIONS" });
    internalRead.dispose();
  });

  it("handles expired and rearmed deadline timers and guarded cleanup", () => {
    const alreadyExpired = createParseDeadline(0, new AbortController().signal);
    expect(alreadyExpired.signal.aborted).toBe(true);
    alreadyExpired.dispose();

    vi.useFakeTimers();
    try {
      const start = Date.now();
      const nowValues = [start, start, start, start, start + 10];
      vi.spyOn(Date, "now").mockImplementation(
        () => nowValues.shift() ?? start + 10,
      );
      const rearmed = createParseDeadline(5, new AbortController().signal);
      vi.advanceTimersByTime(5);
      expect(rearmed.signal.aborted).toBe(false);
      vi.advanceTimersByTime(5);
      expect(rearmed.signal.aborted).toBe(true);
      rearmed.dispose();

      const cleanup = createParseDeadline(100, new AbortController().signal);
      vi.spyOn(globalThis, "clearTimeout").mockImplementation(() => {
        throw new Error("hostile clearTimeout");
      });
      vi.spyOn(AbortController.prototype, "abort").mockImplementation(() => {
        throw new Error("hostile AbortController.abort");
      });
      expect(() => cleanup.dispose()).not.toThrow();
      vi.advanceTimersByTime(100);
      vi.clearAllTimers();
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it("returns a bounded timeout result when synchronous normalization overruns", async () => {
    const registry: LocaleRegistry = {
      get: () => {
        const until = Date.now() + 100;
        while (Date.now() < until) {
          continue;
        }
        return EN_PH_LOCALE;
      },
      with: () => registry,
    };
    const result = await createTimetableParser({
      localeRegistry: registry,
    }).parse(
      { kind: "text", text: "Slow Entry; Monday; 09:00-10:00" },
      { ...options, limits: { timeoutMs: 50 } },
    );

    expect(result.events).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "PROVIDER_TIMEOUT",
          details: { stage: "normalize" },
        }),
      ]),
    );
    expect(result.parse.stageReports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "normalize", status: "failed" }),
        expect.objectContaining({ stage: "deduplicate", status: "skipped" }),
        expect.objectContaining({ stage: "validate", status: "skipped" }),
        expect.objectContaining({ stage: "conflicts", status: "skipped" }),
        expect.objectContaining({ stage: "finalize", status: "completed" }),
      ]),
    );
  });

  it("maps hostile caller signal setup to invalid options", async () => {
    let removeCalls = 0;
    const signal = {
      aborted: false,
      addEventListener: () => {
        throw new Error("hostile addEventListener");
      },
      removeEventListener: () => {
        removeCalls += 1;
        throw new Error("hostile removeEventListener");
      },
    } as unknown as AbortSignal;

    await expect(
      createTimetableParser().parse(
        { kind: "text", text: "Invalid Signal; Monday; 09:00-10:00" },
        { ...options, signal },
      ),
    ).rejects.toBeInstanceOf(OptionsValidationError);
    expect(removeCalls).toBe(1);
  });

  it("does not let hostile caller signal cleanup mask a result", async () => {
    const signal = {
      aborted: false,
      addEventListener: () => undefined,
      removeEventListener: () => {
        throw new Error("hostile removeEventListener");
      },
    } as unknown as AbortSignal;

    const result = await createTimetableParser().parse(
      { kind: "text", text: "Cleanup Signal; Monday; 09:00-10:00" },
      { ...options, signal },
    );
    expect(result.events).toHaveLength(1);
  });

  it("maps hostile caller signal access to invalid options", async () => {
    const signal = {
      get aborted(): boolean {
        throw new Error("hostile aborted getter");
      },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as AbortSignal;

    await expect(
      createTimetableParser().parse(
        { kind: "text", text: "Invalid Access; Monday; 09:00-10:00" },
        { ...options, signal },
      ),
    ).rejects.toMatchObject({
      name: "OptionsValidationError",
      code: "INVALID_OPTIONS",
    });
  });
});
