import { describe, expect, it } from "vitest";
import {
  applyEventCorrection as coreApplyEventCorrection,
  warningForEventField as coreWarningForEventField,
  warningsForEvent as coreWarningsForEvent,
  warningsForResult as coreWarningsForResult,
} from "@ndycode/timetablekit";
import type {
  TimetableEvent,
  TimetableParseResult,
} from "@ndycode/timetablekit";
import {
  applyEventCorrection,
  warningForEventField,
  warningsForResult,
} from "../src/index.js";

const event: TimetableEvent = {
  id: "fictional-event-1",
  title: "Discrete Math",
  schedule: { kind: "weekly", weekdays: ["MO", "WE"] },
  startTime: "09:00",
  endTime: "10:00",
  timezone: "Asia/Manila",
  confidence: 0.8,
  fieldConfidence: {},
  evidence: {},
};

function resultWith(
  nextEvent: TimetableEvent = event,
  warnings: TimetableParseResult["warnings"] = [],
): TimetableParseResult {
  return {
    schemaVersion: "1.0",
    source: { kind: "text", filename: "fictional.txt" },
    timezone: "Asia/Manila",
    locale: "en-PH",
    events: [nextEvent],
    warnings,
    conflicts: [],
    parse: {
      durationMs: 1,
      deterministicConfidence: nextEvent.confidence,
      aiRecoveryUsed: false,
      providersUsed: [],
      stageReports: [],
    },
  };
}

describe("TimetableKit React corrections", () => {
  it("re-exports core result helpers directly", async () => {
    const react = await import("../src/index.js");
    expect(react.applyEventCorrection).toBe(coreApplyEventCorrection);
    expect(react.warningForEventField).toBe(coreWarningForEventField);
    expect(react.warningsForEvent).toBe(coreWarningsForEvent);
    expect(react.warningsForResult).toBe(coreWarningsForResult);
  });

  it("updates a field and clears its resolved validation warning", () => {
    const invalidEvent = { ...event, title: "   " };
    const result = resultWith(invalidEvent, [
      {
        code: "MISSING_TITLE",
        severity: "error",
        message: "The event has no title.",
        eventId: event.id,
        field: "title",
      },
    ]);

    const corrected = applyEventCorrection(result, {
      eventId: event.id,
      field: "title",
      value: "Discrete Mathematics",
    });

    expect(corrected.events[0]?.title).toBe("Discrete Mathematics");
    expect(warningForEventField(corrected, event.id, "title")).toBeUndefined();
    expect(corrected.warnings).toEqual([]);
  });

  it("revalidates an invalid time correction and removes the warning after fixing it", () => {
    const result = resultWith();
    const invalid = applyEventCorrection(result, {
      eventId: event.id,
      field: "endTime",
      value: "08:00",
    });

    expect(warningForEventField(invalid, event.id, "endTime")?.code).toBe(
      "INVALID_TIME_RANGE",
    );

    const fixed = applyEventCorrection(invalid, {
      eventId: event.id,
      field: "endTime",
      value: "11:00",
    });

    expect(warningForEventField(fixed, event.id, "endTime")).toBeUndefined();
    expect(fixed.events[0]?.endTime).toBe("11:00");
  });

  it("adds a display warning when a result contains an unlisted conflict", () => {
    const conflictResult = resultWith();
    const withConflict: TimetableParseResult = {
      ...conflictResult,
      conflicts: [
        {
          code: "SCHEDULE_CONFLICT",
          id: "conflict-1",
          eventIds: [event.id, "fictional-event-2"],
          occurrence: { kind: "weekday", weekday: "MO" },
          overlap: { startsAt: "09:30", endsAt: "09:45" },
        },
      ],
    };

    expect(warningsForResult(withConflict)).toEqual([
      {
        code: "SCHEDULE_CONFLICT",
        severity: "error",
        message: "Two events overlap on the same occurrence.",
        details: { conflictId: "conflict-1" },
      },
    ]);
  });
});
