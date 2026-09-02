import { describe, expect, it } from "vitest";
import {
  detectConflicts,
  EN_PH_LOCALE,
  parseTimeRange,
  parseTimetable,
} from "../src";
import { parseLine } from "../src/parser/row.js";
import type { EventSchedule, TimetableEvent } from "../src";

describe("parser regression boundaries", () => {
  it.each(["Math 101", "CS101", "ENG-101", "MAP-201", "2026"])(
    "does not treat %s as a time",
    (value) => {
      expect(parseTimeRange(value)).toEqual({ kind: "none" });
    },
  );

  it("recognizes explicit compact ranges before unrelated numbers", () => {
    expect(parseTimeRange("Math 101; Monday; 9-10")).toMatchObject({
      kind: "ok",
      startTime: "09:00",
      endTime: "10:00",
    });
    expect(parseTimeRange("Monday; 0900-1030")).toMatchObject({
      kind: "ok",
      startTime: "09:00",
      endTime: "10:30",
    });
    expect(parseTimeRange("Course 2026; Monday; 1900-2000")).toMatchObject({
      kind: "ok",
      startTime: "19:00",
      endTime: "20:00",
    });
  });

  it.each([
    ["Math 101", "Math 101", "MATH 101"],
    ["BIO 101", "BIO 101", "BIO 101"],
    ["CS101", "CS101", "CS101"],
    ["ENG-101 Writing", "Writing", "ENG-101"],
  ] as const)(
    "parses a complete text row that starts with %s",
    async (sourceTitle, title, code) => {
      const result = await parseTimetable(
        {
          kind: "text",
          text: `${sourceTitle}; Monday; 09:00-10:00`,
        },
        { locale: "en-PH", timezone: "Asia/Manila" },
      );

      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatchObject({
        title,
        startTime: "09:00",
        endTime: "10:00",
      });
      expect(result.events[0]?.code).toBe(code);
    },
  );

  it("does not treat academic years or room ranges as times", async () => {
    const academicYear = await parseTimetable(
      {
        kind: "text",
        text: "AY 2025-2040; Monday; 9-10; Seminar",
      },
      { locale: "en-PH", timezone: "Asia/Manila" },
    );
    expect(academicYear.events[0]).toMatchObject({
      title: "Seminar",
      startTime: "09:00",
      endTime: "10:00",
    });

    const roomRange = await parseTimetable(
      {
        kind: "text",
        text: "Studio; Monday; Room 100-200; 9-10",
      },
      { locale: "en-PH", timezone: "Asia/Manila" },
    );
    expect(roomRange.events[0]).toMatchObject({
      startTime: "09:00",
      endTime: "10:00",
    });
  });

  it("rejects an extra token in a chained range", () => {
    expect(parseTimeRange("9-10-11")).toEqual({
      kind: "invalid",
      reason: "format",
    });
  });

  it.each([
    ["Typewriter", "eventType"],
    ["Roommate", "location"],
    ["Instructorial", "instructor"],
    ["Notesworthy", "notes"],
    ["Prototype", "eventType"],
    ["classroom", "location"],
    ["keynotes", "notes"],
  ] as const)("does not read %s as a metadata label", (value, field) => {
    const parsed = parseLine(
      {
        text: `${value}; Wednesday; 10:00-11:00`,
        location: { line: 1, charStart: 0, charEnd: value.length + 25 },
      },
      EN_PH_LOCALE,
    );
    expect(parsed.candidate).toBeDefined();
    expect(parsed.candidate?.[field]).toBeUndefined();
  });

  it("emits evidence only for recognized fields with field-specific snippets", async () => {
    const result = await parseTimetable(
      {
        kind: "text",
        text: "Evidence Review; Thursday; 10:00-11:00; Room Cedar; Instructor Mira Vale",
      },
      {
        locale: "en-PH",
        timezone: "Asia/Manila",
        evidence: "snippets",
      },
    );
    const evidence = result.events[0]?.evidence;
    expect(evidence?.title?.[0]?.excerpt).toBe("Evidence Review");
    expect(evidence?.schedule?.[0]?.excerpt).toContain("Thursday");
    expect(evidence?.startTime?.[0]?.excerpt).toBe("10:00");
    expect(evidence?.endTime?.[0]?.excerpt).toBe("11:00");
    expect(evidence?.location?.[0]?.excerpt).toBe("Cedar");
    expect(evidence?.instructor?.[0]?.excerpt).toBe("Mira Vale");
    expect(evidence?.timezone).toBeUndefined();
    expect(evidence?.code).toBeUndefined();
    expect(evidence?.eventType).toBeUndefined();
    expect(evidence?.notes).toBeUndefined();
  });

  it("canonicalizes exact date sets before merging events", async () => {
    const result = await parseTimetable(
      {
        kind: "text",
        text: [
          "Field Check; 2026-09-15, 2026-09-29, 2026-09-15; 14:00-15:00",
          "Field Check; 2026-09-29, 2026-09-15; 14:00-15:00",
        ].join("\n"),
      },
      { locale: "en-PH", timezone: "Asia/Manila", evidence: "none" },
    );
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.schedule).toEqual({
      kind: "exact",
      exactDates: ["2026-09-15", "2026-09-29"],
    });
    expect(result.warnings.map((warning) => warning.code)).toContain(
      "DUPLICATE_EVENT",
    );
  });
});

function event(
  id: string,
  schedule: EventSchedule,
  startTime = "09:00",
  endTime = "10:00",
): TimetableEvent {
  return {
    id,
    title: id,
    schedule,
    startTime,
    endTime,
    timezone: "Asia/Manila",
    confidence: 0.9,
    fieldConfidence: {},
    evidence: {},
  };
}

describe("exact-date conflict regressions", () => {
  it("excludes exact-date conflicts outside the selected term and deduplicates occurrences", () => {
    const outside = detectConflicts(
      [
        event("outside-a", { kind: "exact", exactDates: ["2026-08-31"] }),
        event("outside-b", { kind: "exact", exactDates: ["2026-08-31"] }),
      ],
      { term: { startsOn: "2026-09-01", endsOn: "2026-09-30" } },
    );
    expect(outside).toEqual([]);

    const inside = detectConflicts([
      event("inside-a", {
        kind: "exact",
        exactDates: ["2026-09-14", "2026-09-14"],
      }),
      event("inside-b", {
        kind: "exact",
        exactDates: ["2026-09-14", "2026-09-14"],
      }),
    ]);
    expect(inside).toHaveLength(1);
    expect(inside[0]?.occurrence).toEqual({
      kind: "date",
      date: "2026-09-14",
    });
  });

  it("does not conflict weekly schedules whose active date ranges do not overlap", () => {
    const left = event("left", {
      kind: "weekly",
      weekdays: ["MO"],
      startsOn: "2026-01-01",
      endsOn: "2026-01-31",
    });
    const right = event("right", {
      kind: "weekly",
      weekdays: ["MO"],
      startsOn: "2026-02-01",
      endsOn: "2026-02-28",
    });

    expect(detectConflicts([left, right])).toEqual([]);
  });

  it("requires a shared weekday to occur inside a short weekly overlap", () => {
    const left = event("left", {
      kind: "weekly",
      weekdays: ["MO"],
      startsOn: "2026-09-01",
      endsOn: "2026-09-04",
    });
    const right = event("right", {
      kind: "weekly",
      weekdays: ["MO"],
      startsOn: "2026-09-01",
      endsOn: "2026-09-04",
    });

    expect(detectConflicts([left, right])).toEqual([]);
  });
});
