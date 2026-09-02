import { describe, expect, it } from "vitest";
import type {
  EventCorrection,
  TimetableEvent,
  TimetableParseResult,
} from "../src/index.js";
import {
  TimetableParseResultSchema,
  applyEventCorrection,
  assessTimetableResult,
  warningForEventField,
  warningsForEvent,
  warningsForResult,
} from "../src/index.js";

const event: TimetableEvent = {
  id: "event-1",
  title: "Discrete Math",
  code: "MATH-101",
  eventType: "Lecture",
  schedule: { kind: "weekly", weekdays: ["MO", "WE"] },
  startTime: "09:00",
  endTime: "10:00",
  timezone: "Asia/Manila",
  location: "Room Cedar",
  instructor: "Mira Vale",
  notes: "Bring a notebook",
  confidence: 0.8,
  fieldConfidence: {},
  evidence: {},
};

function resultWith(
  events: readonly TimetableEvent[] = [event],
  warnings: TimetableParseResult["warnings"] = [],
  conflicts: TimetableParseResult["conflicts"] = [],
): TimetableParseResult {
  return {
    schemaVersion: "1.0",
    source: { kind: "text" },
    timezone: "Asia/Manila",
    locale: "en-PH",
    events,
    warnings,
    conflicts,
    parse: {
      durationMs: 1,
      deterministicConfidence:
        events.length === 0
          ? 0
          : events.reduce((sum, value) => sum + value.confidence, 0) /
            events.length,
      aiRecoveryUsed: false,
      providersUsed: [],
      stageReports: [],
    },
  };
}

describe("result assessment", () => {
  it("marks a result with events and ordinary warnings usable", () => {
    const assessment = assessTimetableResult(
      resultWith(
        [event],
        [
          {
            code: "LOW_CONFIDENCE",
            severity: "warning",
            message: "The event has low confidence.",
            eventId: event.id,
          },
        ],
      ),
    );

    expect(assessment).toEqual({ status: "usable", reasons: [] });
    expect(Object.isFrozen(assessment)).toBe(true);
    expect(Object.isFrozen(assessment.reasons)).toBe(true);
  });

  it("reports no events", () => {
    expect(assessTimetableResult(resultWith([]))).toEqual({
      status: "unusable",
      reasons: ["NO_EVENTS"],
    });
  });

  it("reports error-severity warnings", () => {
    expect(
      assessTimetableResult(
        resultWith(
          [event],
          [
            {
              code: "MISSING_TITLE",
              severity: "error",
              message: "The event has no title.",
              eventId: event.id,
              field: "title",
            },
          ],
        ),
      ),
    ).toEqual({ status: "unusable", reasons: ["ERROR_WARNINGS"] });
  });

  it("reports both reasons in their fixed order", () => {
    expect(
      assessTimetableResult(
        resultWith(
          [],
          [
            {
              code: "UNSUPPORTED_PROVIDER",
              severity: "error",
              message: "No provider supports this source.",
            },
          ],
        ),
      ),
    ).toEqual({
      status: "unusable",
      reasons: ["NO_EVENTS", "ERROR_WARNINGS"],
    });
  });

  it("treats a conflict without a listed warning as an error", () => {
    const conflict = {
      code: "SCHEDULE_CONFLICT" as const,
      id: "conflict-1",
      eventIds: [event.id, "event-2"] as const,
      occurrence: { kind: "weekday" as const, weekday: "MO" as const },
      overlap: { startsAt: "09:30", endsAt: "09:45" },
    };
    expect(assessTimetableResult(resultWith([event], [], [conflict]))).toEqual({
      status: "unusable",
      reasons: ["ERROR_WARNINGS"],
    });
  });
});

describe("result corrections", () => {
  it("normalizes every correction field variant", () => {
    const cases: readonly {
      readonly name: string;
      readonly correction: EventCorrection;
      readonly assert: (updated: TimetableEvent) => void;
    }[] = [
      {
        name: "title",
        correction: {
          eventId: event.id,
          field: "title",
          value: "  Discrete Mathematics  ",
        },
        assert: (updated) => expect(updated.title).toBe("Discrete Mathematics"),
      },
      {
        name: "code",
        correction: {
          eventId: event.id,
          field: "code",
          value: "  MATH-201  ",
        },
        assert: (updated) => expect(updated.code).toBe("MATH-201"),
      },
      {
        name: "eventType",
        correction: {
          eventId: event.id,
          field: "eventType",
          value: "  Seminar  ",
        },
        assert: (updated) => expect(updated.eventType).toBe("Seminar"),
      },
      {
        name: "schedule",
        correction: {
          eventId: event.id,
          field: "schedule",
          value: {
            kind: "weekly",
            weekdays: ["FR", "MO", "MO"],
            startsOn: " 2026-09-01 ",
            endsOn: " 2026-09-30 ",
          },
        },
        assert: (updated) =>
          expect(updated.schedule).toEqual({
            kind: "weekly",
            weekdays: ["MO", "FR"],
            startsOn: "2026-09-01",
            endsOn: "2026-09-30",
          }),
      },
      {
        name: "startTime",
        correction: {
          eventId: event.id,
          field: "startTime",
          value: " 08:30 ",
        },
        assert: (updated) => expect(updated.startTime).toBe("08:30"),
      },
      {
        name: "endTime",
        correction: {
          eventId: event.id,
          field: "endTime",
          value: " 10:30 ",
        },
        assert: (updated) => expect(updated.endTime).toBe("10:30"),
      },
      {
        name: "timezone",
        correction: {
          eventId: event.id,
          field: "timezone",
          value: " UTC ",
        },
        assert: (updated) => expect(updated.timezone).toBe("UTC"),
      },
      {
        name: "location",
        correction: {
          eventId: event.id,
          field: "location",
          value: "  Room Maple  ",
        },
        assert: (updated) => expect(updated.location).toBe("Room Maple"),
      },
      {
        name: "instructor",
        correction: {
          eventId: event.id,
          field: "instructor",
          value: "  Noor Vale  ",
        },
        assert: (updated) => expect(updated.instructor).toBe("Noor Vale"),
      },
      {
        name: "notes",
        correction: {
          eventId: event.id,
          field: "notes",
          value: "  Bring a map  ",
        },
        assert: (updated) => expect(updated.notes).toBe("Bring a map"),
      },
    ];

    for (const current of cases) {
      const result = applyEventCorrection(resultWith(), current.correction);
      expect(TimetableParseResultSchema.safeParse(result).success).toBe(true);
      const updated = result.events[0];
      expect(updated, current.name).toBeDefined();
      if (updated !== undefined) current.assert(updated);
    }
  });

  it("rejects corrections that would break the result schema", () => {
    const invalidCorrections: readonly EventCorrection[] = [
      { eventId: event.id, field: "title", value: " " },
      { eventId: event.id, field: "startTime", value: "" },
      { eventId: event.id, field: "timezone", value: " " },
      {
        eventId: event.id,
        field: "schedule",
        value: { kind: "weekly", weekdays: [] },
      },
      {
        eventId: event.id,
        field: "schedule",
        value: { kind: "exact", exactDates: [] },
      },
    ];

    for (const correction of invalidCorrections) {
      expect(() => applyEventCorrection(resultWith(), correction)).toThrow();
    }
  });

  it("canonicalizes exact dates and removes blank optional fields", () => {
    const exactEvent: TimetableEvent = {
      ...event,
      schedule: {
        kind: "exact",
        exactDates: ["2026-09-14"],
      },
    };
    const result = resultWith([exactEvent]);
    const corrected = applyEventCorrection(result, {
      eventId: event.id,
      field: "schedule",
      value: {
        kind: "exact",
        exactDates: [" 2026-09-15", "2026-09-14", "2026-09-15 "],
      },
    });
    expect(corrected.events[0]?.schedule).toEqual({
      kind: "exact",
      exactDates: ["2026-09-14", "2026-09-15"],
    });

    const blank = (
      field: "code" | "eventType" | "location" | "instructor" | "notes",
    ) =>
      applyEventCorrection(resultWith(), {
        eventId: event.id,
        field,
        value: " \t ",
      });
    expect(blank("code").events[0]).not.toHaveProperty("code");
    expect(blank("eventType").events[0]).not.toHaveProperty("eventType");
    expect(blank("location").events[0]).not.toHaveProperty("location");
    expect(blank("instructor").events[0]).not.toHaveProperty("instructor");
    expect(blank("notes").events[0]).not.toHaveProperty("notes");
  });

  it("removes corrected warnings while preserving unrelated source warnings", () => {
    const result = resultWith(
      [event],
      [
        {
          code: "MISSING_TITLE",
          severity: "error",
          message: "The event has no title.",
          eventId: event.id,
          field: "title",
        },
        {
          code: "MISSING_TITLE",
          severity: "error",
          message: "The source row has no title.",
          eventId: event.id,
          field: "title",
          source: { line: 4 },
        },
        {
          code: "POSSIBLE_DUPLICATE",
          severity: "warning",
          message: "The source row may be duplicated.",
          eventId: event.id,
          source: { line: 5 },
        },
      ],
    );
    const corrected = applyEventCorrection(result, {
      eventId: event.id,
      field: "title",
      value: "Corrected title",
    });

    expect(corrected.warnings).toEqual([
      expect.objectContaining({
        code: "POSSIBLE_DUPLICATE",
        source: { line: 5 },
      }),
    ]);
  });

  it("sorts recomputed warnings deterministically", () => {
    const result = resultWith(
      [event],
      [
        {
          code: "POSSIBLE_DUPLICATE",
          severity: "warning",
          message: "Possible duplicate.",
          source: { line: 12 },
        },
        {
          code: "LOW_CONFIDENCE",
          severity: "warning",
          message: "Low confidence.",
          source: { line: 11 },
        },
      ],
    );
    const corrected = applyEventCorrection(result, {
      eventId: event.id,
      field: "title",
      value: "Updated title",
    });

    expect(corrected.warnings.map((warning) => warning.code)).toEqual([
      "LOW_CONFIDENCE",
      "POSSIBLE_DUPLICATE",
    ]);
  });

  it("rebuilds bounded conflicts and deterministic confidence", () => {
    const second: TimetableEvent = {
      ...event,
      id: "event-2",
      title: "Algorithms",
      startTime: "09:30",
      endTime: "10:30",
      confidence: 0.6,
    };
    const result = resultWith([event, second]);
    expect(resultWith([event, second]).conflicts).toHaveLength(0);
    const corrected = applyEventCorrection(result, {
      eventId: event.id,
      field: "endTime",
      value: "09:15",
    });

    expect(corrected.conflicts).toHaveLength(0);
    expect(
      warningsForResult(corrected).some(
        (warning) => warning.code === "SCHEDULE_CONFLICT",
      ),
    ).toBe(false);
    expect(corrected.parse.deterministicConfidence).toBeCloseTo(0.7);
  });

  it("returns the original result for unknown events and canonical no-ops", () => {
    const result = resultWith();
    expect(
      applyEventCorrection(result, {
        eventId: "missing-event",
        field: "title",
        value: "Anything",
      }),
    ).toBe(result);
    expect(
      applyEventCorrection(result, {
        eventId: event.id,
        field: "title",
        value: "  Discrete Math  ",
      }),
    ).toBe(result);
    const corrected = applyEventCorrection(result, {
      eventId: event.id,
      field: "location",
      value: " Room Cedar ",
    });
    expect(corrected).toBe(result);
    expect(
      applyEventCorrection(corrected, {
        eventId: event.id,
        field: "location",
        value: " Room Cedar ",
      }),
    ).toBe(result);
    expect(
      applyEventCorrection(result, {
        eventId: event.id,
        field: "schedule",
        value: { kind: "weekly", weekdays: ["WE", "MO", "MO"] },
      }),
    ).toBe(result);
  });

  it("keeps optional-field no-ops and term-aware corrections canonical", () => {
    const withoutOptional: TimetableEvent = {
      id: event.id,
      title: event.title,
      schedule: event.schedule,
      startTime: event.startTime,
      endTime: event.endTime,
      timezone: event.timezone,
      confidence: event.confidence,
      fieldConfidence: {},
      evidence: {},
    };
    const termResult: TimetableParseResult = {
      ...resultWith([withoutOptional]),
      term: { startsOn: "2026-09-01", endsOn: "2026-09-30" },
    };
    const optionalFields = [
      "code",
      "eventType",
      "location",
      "instructor",
      "notes",
    ] as const;
    for (const field of optionalFields) {
      expect(
        applyEventCorrection(termResult, {
          eventId: event.id,
          field,
          value: " ",
        }),
      ).toBe(termResult);
    }
    for (const correction of [
      { eventId: event.id, field: "startTime", value: event.startTime },
      { eventId: event.id, field: "endTime", value: event.endTime },
      { eventId: event.id, field: "timezone", value: event.timezone },
    ] as const) {
      expect(applyEventCorrection(termResult, correction)).toBe(termResult);
    }

    const bounded = applyEventCorrection(termResult, {
      eventId: event.id,
      field: "schedule",
      value: {
        kind: "weekly",
        weekdays: ["MO"],
        startsOn: " ",
        endsOn: "2026-09-20",
      },
    });
    expect(bounded.events[0]?.schedule).toEqual({
      kind: "weekly",
      weekdays: ["MO"],
      endsOn: "2026-09-20",
    });
    expect(TimetableParseResultSchema.safeParse(bounded).success).toBe(true);
  });

  it("does not duplicate an existing conflict warning", () => {
    const conflict = {
      code: "SCHEDULE_CONFLICT" as const,
      id: "conflict-1",
      eventIds: [event.id, "event-2"] as const,
      occurrence: { kind: "weekday" as const, weekday: "MO" as const },
      overlap: { startsAt: "09:30", endsAt: "09:45" },
    };
    const warning = {
      code: "SCHEDULE_CONFLICT" as const,
      severity: "error" as const,
      message: "Two events overlap on the same occurrence.",
      details: { conflictId: conflict.id },
    };
    expect(
      warningsForResult(resultWith([event], [warning], [conflict])),
    ).toEqual([warning]);
  });

  it("projects conflict warnings and event warnings", () => {
    const conflict = {
      code: "SCHEDULE_CONFLICT" as const,
      id: "conflict-1",
      eventIds: [event.id, "event-2"] as const,
      occurrence: { kind: "weekday" as const, weekday: "MO" as const },
      overlap: { startsAt: "09:30", endsAt: "09:45" },
    };
    const result = resultWith(
      [event],
      [
        {
          code: "MISSING_TITLE",
          severity: "error",
          message: "The event has no title.",
          eventId: event.id,
          field: "title",
        },
      ],
      [conflict],
    );
    expect(warningsForResult(result)).toEqual([
      expect.objectContaining({
        code: "MISSING_TITLE",
      }),
      {
        code: "SCHEDULE_CONFLICT",
        severity: "error",
        message: "Two events overlap on the same occurrence.",
        details: { conflictId: "conflict-1" },
      },
    ]);
    expect(warningForEventField(result, event.id, "title")?.code).toBe(
      "MISSING_TITLE",
    );
    expect(warningsForEvent(result, event.id)).toHaveLength(1);
  });
});
