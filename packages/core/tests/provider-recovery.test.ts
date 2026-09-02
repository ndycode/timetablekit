import { describe, expect, it } from "vitest";
import {
  ProviderError,
  TimetableError,
  createTimetableParser,
  deterministicProvider,
  parseTimetable,
} from "../src";
import {
  applyRecoveryPatches,
  eventFieldValue,
  isRecoveryResponse,
} from "../src/recovery.js";
import { isAbortError } from "../src/errors.js";
import {
  DEFAULT_RESOURCE_LIMITS,
  inputByteLength,
  isExtractionArtifact,
  providerWarning,
  resolveLimits,
  sourceDescriptor,
  stageProgress,
} from "../src/providers.js";
import type {
  ExtractionArtifact,
  ExtractionProvider,
  EventSchedule,
  ProviderContext,
  RecoveryPatch,
  RecoveryProvider,
  RecoveryResponse,
  TextDocument,
  TimetableEvent,
  TimetableInput,
} from "../src";

const options = {
  locale: "en-PH",
  timezone: "Asia/Manila",
  evidence: "none" as const,
};

function baseEvent(overrides: Partial<TimetableEvent> = {}): TimetableEvent {
  return {
    id: "evt-recovery",
    title: "Original Entry",
    code: "OLD-101",
    eventType: "Lecture",
    schedule: { kind: "weekly", weekdays: ["MO"] },
    startTime: "09:00",
    endTime: "10:00",
    timezone: "Asia/Manila",
    location: "Old Hall",
    instructor: "Old Guide",
    notes: "Old note",
    confidence: 0.6,
    fieldConfidence: {},
    evidence: {},
    ...overrides,
  };
}

function textArtifact(text: string, providerId = "custom"): ExtractionArtifact {
  const document: TextDocument = {
    source: { kind: "text" },
    pages: [
      {
        pageNumber: 1,
        lines: [
          { text, location: { line: 1, charStart: 0, charEnd: text.length } },
        ],
      },
    ],
  };
  return { providerId, document, warnings: [] };
}

function contextFor(limits = DEFAULT_RESOURCE_LIMITS): {
  readonly context: ProviderContext;
  readonly progress: unknown[];
} {
  const progress: unknown[] = [];
  return {
    context: {
      signal: new AbortController().signal,
      limits,
      reportProgress: (value) => progress.push(value),
    },
    progress,
  };
}

describe("provider boundaries", () => {
  it("resolves limits, describes all input kinds, and measures bytes", () => {
    expect(resolveLimits(undefined)).toEqual(DEFAULT_RESOURCE_LIMITS);
    expect(resolveLimits({ maxInputBytes: 12, timeoutMs: 4 })).toMatchObject({
      maxInputBytes: 12,
      timeoutMs: 4,
      maxPdfPages: 100,
    });
    expect(sourceDescriptor({ kind: "text", text: "x" })).toEqual({
      kind: "text",
    });
    expect(
      sourceDescriptor({
        kind: "csv",
        text: "x",
        filename: "../fictional.csv",
      }),
    ).toEqual({ kind: "csv", filename: "fictional.csv" });
    expect(
      sourceDescriptor({
        kind: "image",
        bytes: new Uint8Array([1]),
        mimeType: "image/png",
        filename: "/fictional/a?.png",
      }),
    ).toEqual({ kind: "image", filename: "a_.png", mimeType: "image/png" });
    expect(
      sourceDescriptor({
        kind: "pdf",
        bytes: new Uint8Array([1]),
        mimeType: "application/pdf",
      }),
    ).toEqual({ kind: "pdf", mimeType: "application/pdf" });
    expect(inputByteLength({ kind: "text", text: "界" })).toBe(3);
    expect(
      inputByteLength({
        kind: "image",
        bytes: new Uint8Array([1, 2]),
        mimeType: "image/png",
      }),
    ).toBe(2);
    expect(stageProgress("extract", "done", 1)).toEqual({
      stage: "extract",
      message: "done",
      completed: 1,
    });
    expect(stageProgress("extract", "done", 1, 1)).toEqual({
      stage: "extract",
      message: "done",
      completed: 1,
      total: 1,
    });
  });

  it("extracts text locally, reports progress, and enforces limits and aborts", async () => {
    const provider = deterministicProvider();
    expect(provider.supports({ kind: "text", text: "x" })).toBe(true);
    expect(provider.supports({ kind: "csv", text: "x" })).toBe(true);
    expect(
      provider.supports({
        kind: "image",
        bytes: new Uint8Array(),
        mimeType: "image/png",
      }),
    ).toBe(false);
    const regular = contextFor();
    const artifact = await provider.extract(
      { kind: "text", text: "Alpha\nBeta" },
      regular.context,
    );
    expect(artifact.document.pages[0]?.lines).toHaveLength(2);
    expect(regular.progress).toEqual([
      {
        stage: "extract",
        completed: 1,
        total: 1,
        message: "Text extracted locally.",
      },
    ]);
    await expect(
      provider.extract(
        { kind: "text", text: "too long" },
        contextFor(resolveLimits({ maxInputBytes: 1 })).context,
      ),
    ).rejects.toMatchObject({ providerCode: "RESOURCE_LIMIT" });
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.extract(
        { kind: "text", text: "x" },
        { ...contextFor().context, signal: controller.signal },
      ),
    ).rejects.toMatchObject({ providerCode: "ABORTED" });
  });

  it("validates provider artifacts and maps provider failures", () => {
    const artifact = textArtifact("Synthetic Monday 09:00-10:00");
    expect(isExtractionArtifact(artifact)).toBe(true);
    expect(isExtractionArtifact(null)).toBe(false);
    expect(
      isExtractionArtifact({
        providerId: "x",
        document: {
          source: {},
          pages: [{ lines: [{ text: "x", location: null }] }],
        },
        warnings: [],
      }),
    ).toBe(false);
    expect(
      isExtractionArtifact({
        providerId: "x",
        document: { source: { kind: "text" }, pages: [] },
        warnings: [],
      }),
    ).toBe(true);
    expect(
      isExtractionArtifact({
        providerId: "x",
        document: {
          source: { kind: "text" },
          pages: [
            {
              pageNumber: 1,
              lines: [
                {
                  text: "x",
                  location: { line: 1, charStart: 1, charEnd: 0 },
                },
              ],
            },
          ],
        },
        warnings: [],
      }),
    ).toBe(false);
    expect(
      isExtractionArtifact({
        providerId: "x",
        document: { source: { kind: "text" }, pages: [] },
        warnings: [
          {
            code: "NO_TEXT_FOUND",
            severity: "warning",
            message: "x",
            source: { line: 0 },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isExtractionArtifact({
        providerId: "x",
        document: { source: {}, pages: [{ lines: [null] }] },
        warnings: [],
      }),
    ).toBe(false);

    expect(providerWarning(new ProviderError("p", "ABORTED"), "p").code).toBe(
      "PROVIDER_ABORTED",
    );
    expect(providerWarning(new ProviderError("p", "TIMEOUT"), "p").code).toBe(
      "PROVIDER_TIMEOUT",
    );
    expect(
      providerWarning(new ProviderError("p", "INVALID_OUTPUT"), "p").code,
    ).toBe("PROVIDER_OUTPUT_INVALID");
    for (const providerCode of [
      "UNSUPPORTED_INPUT",
      "RESOURCE_LIMIT",
      "UNAVAILABLE",
      "FAILED",
    ] as const) {
      expect(
        providerWarning(new ProviderError("p", providerCode), "p").code,
      ).toBe("PROVIDER_FAILED");
    }
    expect(
      providerWarning(new TimetableError("ABORTED", "stop"), "p").code,
    ).toBe("PROVIDER_ABORTED");
    expect(providerWarning(new Error("failure"), "p").message).toContain(
      "p provider",
    );
    expect(isAbortError(new TimetableError("ABORTED", "stop"))).toBe(true);
    expect(isAbortError(new Error("stop"))).toBe(false);
  });
});

describe("recovery boundary", () => {
  it("accepts valid recovery responses and rejects malformed ones", () => {
    const valid: RecoveryResponse = {
      patches: [
        {
          eventId: "evt-recovery",
          field: "title",
          value: "Recovered",
          confidence: 0.8,
        },
        {
          eventId: "evt-recovery",
          field: "schedule",
          value: { kind: "weekly", weekdays: ["TU"] },
          confidence: 0.8,
        },
        {
          eventId: "evt-recovery",
          field: "schedule",
          value: { kind: "exact", exactDates: ["2026-09-01"] },
          confidence: 0.8,
        },
        {
          eventId: "evt-recovery",
          field: "notes",
          value: "one, two",
          confidence: 0.8,
        },
      ],
    };
    expect(isRecoveryResponse(valid)).toBe(true);
    expect(isRecoveryResponse(null)).toBe(false);
    expect(
      isRecoveryResponse({
        patches: [{ eventId: "x", field: "title", value: "x", confidence: 2 }],
      }),
    ).toBe(false);
    expect(
      isRecoveryResponse({
        patches: [{ eventId: "x", field: "title", value: 4, confidence: 0.5 }],
      }),
    ).toBe(false);
    expect(
      isRecoveryResponse({
        patches: [
          { eventId: "x", field: "unknown", value: "x", confidence: 0.5 },
        ],
      }),
    ).toBe(false);
    expect(isRecoveryResponse({ patches: "not-an-array" })).toBe(false);
    expect(isRecoveryResponse({ patches: [null] })).toBe(false);
    expect(
      isRecoveryResponse({
        patches: [
          {
            eventId: "x",
            field: "notes",
            value: ["not-text"],
            confidence: 0.5,
          },
        ],
      }),
    ).toBe(false);
  });

  it("applies every supported field and counts invalid patches", () => {
    const original = baseEvent();
    const patches: RecoveryPatch[] = [
      {
        eventId: original.id,
        field: "title",
        value: "  Recovered Entry  ",
        confidence: 0.8,
      },
      {
        eventId: original.id,
        field: "code",
        value: " NEW-202 ",
        confidence: 0.81,
      },
      {
        eventId: original.id,
        field: "eventType",
        value: " Lab ",
        confidence: 0.82,
      },
      {
        eventId: original.id,
        field: "schedule",
        value: { kind: "weekly", weekdays: ["TU"] },
        confidence: 0.83,
      },
      {
        eventId: original.id,
        field: "startTime",
        value: "8:30 AM",
        confidence: 0.84,
      },
      {
        eventId: original.id,
        field: "endTime",
        value: "10:30",
        confidence: 0.85,
      },
      {
        eventId: original.id,
        field: "timezone",
        value: "UTC",
        confidence: 0.86,
      },
      {
        eventId: original.id,
        field: "location",
        value: " New Hall ",
        confidence: 0.87,
      },
      {
        eventId: original.id,
        field: "instructor",
        value: " New Guide ",
        confidence: 0.88,
      },
      {
        eventId: original.id,
        field: "notes",
        value: " New note ",
        confidence: 0.89,
      },
    ];
    const applied = applyRecoveryPatches([original], { patches });
    expect(applied.applied).toBe(10);
    expect(applied.invalid).toBe(0);
    const recovered = applied.events[0];
    expect(recovered).toMatchObject({
      title: "Recovered Entry",
      code: "NEW-202",
      eventType: "Lab",
      schedule: { kind: "weekly", weekdays: ["TU"] },
      startTime: "08:30",
      endTime: "10:30",
      timezone: "UTC",
      location: "New Hall",
      instructor: "New Guide",
      notes: "New note",
      confidence: 0.89,
    });
    if (recovered === undefined) return;
    expect(eventFieldValue(recovered, "title")).toBe("Recovered Entry");
    expect(eventFieldValue(recovered, "code")).toBe("NEW-202");
    expect(eventFieldValue(recovered, "eventType")).toBe("Lab");
    expect(eventFieldValue(recovered, "schedule")).toBe("TU");
    expect(
      eventFieldValue(
        {
          ...recovered,
          schedule: { kind: "exact", exactDates: ["2026-09-01"] },
        },
        "schedule",
      ),
    ).toBe("2026-09-01");
    expect(eventFieldValue(recovered, "startTime")).toBe("08:30");
    expect(eventFieldValue(recovered, "endTime")).toBe("10:30");
    expect(eventFieldValue(recovered, "timezone")).toBe("UTC");
    expect(eventFieldValue(recovered, "location")).toBe("New Hall");
    expect(eventFieldValue(recovered, "instructor")).toBe("New Guide");
    expect(eventFieldValue(recovered, "notes")).toBe("New note");

    const invalid = applyRecoveryPatches([original], {
      patches: [
        { eventId: "missing", field: "title", value: "x", confidence: 0.8 },
        { eventId: original.id, field: "title", value: " ", confidence: 0.8 },
        {
          eventId: original.id,
          field: "code",
          value: ["not-text"],
          confidence: 0.8,
        },
        {
          eventId: original.id,
          field: "eventType",
          value: ["not-text"],
          confidence: 0.8,
        },
        {
          eventId: original.id,
          field: "schedule",
          value: "not-a-schedule",
          confidence: 0.8,
        },
        {
          eventId: original.id,
          field: "startTime",
          value: ["not-time"],
          confidence: 0.8,
        },
        {
          eventId: original.id,
          field: "endTime",
          value: "not-time",
          confidence: 0.8,
        },
        { eventId: original.id, field: "timezone", value: "", confidence: 0.8 },
        {
          eventId: original.id,
          field: "location",
          value: ["not-text"],
          confidence: 0.8,
        },
        {
          eventId: original.id,
          field: "instructor",
          value: ["not-text"],
          confidence: 0.8,
        },
        {
          eventId: original.id,
          field: "notes",
          value: ["not-text"],
          confidence: 0.8,
        },
      ],
    });
    expect(invalid).toMatchObject({ applied: 0, invalid: 11 });
  });

  it("treats identical values and confidence as valid no-ops", () => {
    const original = baseEvent();
    const unchanged = applyRecoveryPatches([original], {
      patches: [
        {
          eventId: original.id,
          field: "title",
          value: " Original Entry ",
          confidence: 0.6,
        },
      ],
    });
    expect(unchanged).toMatchObject({ applied: 0, invalid: 0 });
    expect(unchanged.appliedPatches).toEqual([]);
    expect(unchanged.events).toEqual([original]);

    const confidenceOnly = applyRecoveryPatches([original], {
      patches: [
        {
          eventId: original.id,
          field: "title",
          value: "Original Entry",
          confidence: 0.7,
        },
      ],
    });
    expect(confidenceOnly).toMatchObject({ applied: 1, invalid: 0 });
    expect(confidenceOnly.events[0]).toMatchObject({ confidence: 0.7 });
  });
});

describe("pipeline provider and recovery paths", () => {
  it("uses default options and reports unsupported inputs and size limits", async () => {
    const defaults = await parseTimetable({
      kind: "text",
      text: "Default Entry; Monday; 09:00-10:00",
    });
    expect(defaults).toMatchObject({
      timezone: "UTC",
      locale: "en-PH",
      events: [{ title: "Default Entry" }],
    });
    const image = await createTimetableParser().parse(
      {
        kind: "image",
        bytes: new Uint8Array([1]),
        mimeType: "image/png",
        filename: "placeholder.png",
      },
      options,
    );
    expect(image).toMatchObject({
      source: { kind: "image", mimeType: "image/png" },
      events: [],
    });
    expect(image.warnings.map((warning) => warning.code)).toContain(
      "UNSUPPORTED_PROVIDER",
    );
    const limited = await createTimetableParser().parse(
      {
        kind: "text",
        text: "Sized Entry; Monday; 09:00-10:00",
        filename: "sized.txt",
      },
      { ...options, limits: { maxInputBytes: 1 } },
    );
    expect(limited.warnings.map((warning) => warning.code)).toContain(
      "FILE_TOO_LARGE",
    );
    expect(limited.parse.stageReports.map((report) => report.status)).toEqual([
      "completed",
      "skipped",
      "completed",
    ]);

    const unrecognized = await parseTimetable(
      { kind: "text", text: "This is not a timetable." },
      options,
    );
    expect(unrecognized.events).toEqual([]);
    expect(unrecognized.warnings.map((warning) => warning.code)).toContain(
      "NO_EVENTS_FOUND",
    );
  });

  it("handles provider selection, custom artifacts, failures, and invalid output", async () => {
    const input: TimetableInput = {
      kind: "text",
      text: "Custom Entry; Tuesday; 10:00-11:00",
    };
    const custom: ExtractionProvider = {
      id: "custom",
      supports: () => true,
      extract: async () => textArtifact(input.text, "custom"),
    };
    const customResult = await createTimetableParser({
      providers: [custom],
    }).parse(input, options);
    expect(customResult).toMatchObject({
      events: [{ title: "Custom Entry" }],
      parse: { providersUsed: ["custom"] },
    });

    const mismatched: ExtractionProvider = {
      id: "mismatched",
      supports: () => true,
      extract: async () => textArtifact(input.text, "another-provider"),
    };
    const mismatchedResult = await createTimetableParser({
      providers: [mismatched],
    }).parse(input, options);
    expect(mismatchedResult.warnings.map((warning) => warning.code)).toContain(
      "PROVIDER_OUTPUT_INVALID",
    );

    const empty: ExtractionProvider = {
      id: "empty",
      supports: () => true,
      extract: async () => ({
        providerId: "empty",
        document: { source: { kind: "text" }, pages: [] },
        warnings: [],
      }),
    };
    const emptyResult = await createTimetableParser({
      providers: [empty],
    }).parse(input, options);
    expect(emptyResult.warnings.map((warning) => warning.code)).toContain(
      "NO_TEXT_FOUND",
    );

    const invalid: ExtractionProvider = {
      id: "invalid",
      supports: () => true,
      extract: async () => ({}) as ExtractionArtifact,
    };
    const invalidResult = await createTimetableParser({
      providers: [invalid],
    }).parse(input, options);
    expect(invalidResult.warnings.map((warning) => warning.code)).toContain(
      "PROVIDER_OUTPUT_INVALID",
    );

    const failed: ExtractionProvider = {
      id: "failed",
      supports: () => true,
      extract: async () => {
        throw new ProviderError("failed", "TIMEOUT");
      },
    };
    const failedResult = await createTimetableParser({
      providers: [failed],
    }).parse(input, options);
    expect(failedResult.warnings.map((warning) => warning.code)).toContain(
      "PROVIDER_TIMEOUT",
    );

    const inspectFailed: ExtractionProvider = {
      id: "inspect-failed",
      supports: () => {
        throw new Error("cannot inspect");
      },
      extract: async () => textArtifact(input.text, "inspect-failed"),
    };
    const inspectResult = await createTimetableParser({
      providers: [inspectFailed],
    }).parse(input, options);
    expect(inspectResult.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["PROVIDER_FAILED", "UNSUPPORTED_PROVIDER"]),
    );

    const unsupported: ExtractionProvider = {
      id: "unsupported",
      supports: () => false,
      extract: async () => textArtifact(input.text, "unsupported"),
    };
    const unsupportedResult = await createTimetableParser({
      providers: [unsupported],
    }).parse(input, options);
    expect(unsupportedResult.warnings.map((warning) => warning.code)).toContain(
      "UNSUPPORTED_PROVIDER",
    );
  });

  it("parses CSV from the selected provider artifact", async () => {
    const input: TimetableInput = {
      kind: "csv",
      text: "title,days,start,end\nRaw,Monday,09:00,10:00",
    };
    const provided = "title,days,start,end\nProvided,Tuesday,11:00,12:00";
    const provider: ExtractionProvider = {
      id: "csv-transform",
      supports: () => true,
      extract: async () => ({
        providerId: "csv-transform",
        document: {
          source: { kind: "csv" },
          pages: [
            {
              pageNumber: 1,
              lines: provided.split("\n").map((text, index) => ({
                text,
                location: {
                  line: index + 1,
                  charStart: 0,
                  charEnd: text.length,
                },
              })),
            },
          ],
        },
        warnings: [],
      }),
    };

    const result = await createTimetableParser({ providers: [provider] }).parse(
      input,
      options,
    );

    expect(result.events).toMatchObject([
      {
        title: "Provided",
        schedule: { kind: "weekly", weekdays: ["TU"] },
        startTime: "11:00",
        endTime: "12:00",
      },
    ]);
  });

  it("supports consented recovery and safe recovery fallbacks", async () => {
    const input: TimetableInput = {
      kind: "text",
      text: "Recoverable Entry; Monday; 9-10",
    };
    const recoveryBase = {
      ...options,
      recovery: { enabled: true, consent: true },
    };
    const initial = await parseTimetable(input, options);
    const eventId = initial.events[0]?.id;
    expect(eventId).toBeDefined();
    if (eventId === undefined) return;

    const skipped = await parseTimetable(input, {
      ...options,
      recovery: { enabled: true, consent: false },
    });
    expect(skipped.warnings.map((warning) => warning.code)).toContain(
      "AI_RECOVERY_SKIPPED",
    );
    const unavailable = await parseTimetable(input, recoveryBase);
    expect(unavailable.warnings.map((warning) => warning.code)).toContain(
      "AI_PROVIDER_UNAVAILABLE",
    );

    let requestField: string | undefined;
    const successfulProvider: RecoveryProvider = {
      id: "recovery",
      recover: async (request) => {
        requestField = request.unresolved[0]?.field;
        return {
          patches: [
            { eventId, field: "startTime", value: "09:00", confidence: 0.9 },
            {
              eventId,
              field: "title",
              value: "Should not apply",
              confidence: 0.9,
            },
          ],
        };
      },
    };
    const recovered = await createTimetableParser({
      recoveryProvider: successfulProvider,
    }).parse(input, recoveryBase);
    expect(requestField).toBe("startTime");
    expect(recovered).toMatchObject({
      events: [{ title: "Recoverable Entry", startTime: "09:00" }],
      parse: {
        aiRecoveryUsed: true,
        providersUsed: ["deterministic", "recovery"],
      },
    });
    expect(recovered.warnings.map((warning) => warning.code)).not.toContain(
      "AMBIGUOUS_TIME",
    );

    const invalidResponseProvider: RecoveryProvider = {
      id: "invalid-recovery",
      recover: async () => null as unknown as RecoveryResponse,
    };
    const invalidResponse = await createTimetableParser({
      recoveryProvider: invalidResponseProvider,
    }).parse(input, recoveryBase);
    expect(invalidResponse.warnings.map((warning) => warning.code)).toContain(
      "AI_OUTPUT_INVALID",
    );

    const invalidPatchProvider: RecoveryProvider = {
      id: "invalid-patch",
      recover: async () => ({
        patches: [
          {
            eventId: "missing",
            field: "title",
            value: "Never Applied",
            confidence: 0.9,
          },
        ],
      }),
    };
    const invalidPatch = await createTimetableParser({
      recoveryProvider: invalidPatchProvider,
    }).parse(input, recoveryBase);
    expect(invalidPatch.warnings.map((warning) => warning.code)).toContain(
      "AI_OUTPUT_INVALID",
    );

    const unavailableProvider: RecoveryProvider = {
      id: "unavailable",
      recover: async () => {
        throw new Error("offline");
      },
    };
    const unavailableRecovery = await createTimetableParser({
      recoveryProvider: unavailableProvider,
    }).parse(input, recoveryBase);
    expect(
      unavailableRecovery.warnings.map((warning) => warning.code),
    ).toContain("AI_PROVIDER_UNAVAILABLE");

    const abortedProvider: RecoveryProvider = {
      id: "aborted",
      recover: async () => {
        throw new ProviderError("aborted", "ABORTED");
      },
    };
    await expect(
      createTimetableParser({ recoveryProvider: abortedProvider }).parse(
        input,
        recoveryBase,
      ),
    ).rejects.toMatchObject({ code: "ABORTED" });
  });

  it("does not report recovery use for a valid no-op patch", async () => {
    const input: TimetableInput = {
      kind: "text",
      text: "No-op Entry; Monday; 9-10",
    };
    const initial = await parseTimetable(input, options);
    const eventId = initial.events[0]?.id;
    expect(eventId).toBeDefined();
    if (eventId === undefined) return;
    const provider: RecoveryProvider = {
      id: "no-op-recovery",
      recover: async () => ({
        patches: [
          { eventId, field: "startTime", value: "09:00", confidence: 0 },
        ],
      }),
    };
    const result = await createTimetableParser({
      recoveryProvider: provider,
    }).parse(input, {
      ...options,
      recovery: { enabled: true, consent: true },
    });
    expect(result.parse.aiRecoveryUsed).toBe(false);
    expect(result.parse.providersUsed).toEqual(["deterministic"]);
    expect(
      result.parse.stageReports.find((report) => report.stage === "recovery"),
    ).toMatchObject({ providerId: "no-op-recovery", status: "completed" });
    expect(
      result.warnings.filter((warning) => warning.code === "AI_OUTPUT_INVALID"),
    ).toHaveLength(0);
    expect(
      result.warnings.filter(
        (warning) =>
          warning.code === "AMBIGUOUS_TIME" && warning.field === "startTime",
      ),
    ).toHaveLength(1);
  });

  it("stops before extraction when the caller aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      parseTimetable(
        { kind: "text", text: "Aborted Entry; Monday; 09:00-10:00" },
        { ...options, signal: controller.signal },
      ),
    ).rejects.toMatchObject({ code: "ABORTED" });
  });
});
