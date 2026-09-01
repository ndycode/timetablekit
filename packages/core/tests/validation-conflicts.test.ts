import { describe, expect, it } from "vitest";
import {
  detectConflicts,
  detectConflictsBounded,
  parseTimetable,
  validateTimetable,
} from "../src";
import type { EventSchedule, TimetableEvent } from "../src";

function event(
  id: string,
  schedule: EventSchedule,
  startTime: string,
  endTime: string,
  overrides: Partial<
    Pick<TimetableEvent, "title" | "timezone" | "confidence">
  > = {},
): TimetableEvent {
  return {
    id,
    title: overrides.title ?? id,
    schedule,
    startTime,
    endTime,
    timezone: overrides.timezone ?? "Asia/Manila",
    confidence: overrides.confidence ?? 0.9,
    fieldConfidence: {},
    evidence: {},
  };
}

describe("timetable validation", () => {
  it("reports invalid context and event fields without throwing", () => {
    const warnings = validateTimetable(
      [
        event(
          "evt-invalid",
          {
            kind: "weekly",
            weekdays: [],
            startsOn: "not-a-date",
            endsOn: "2026-09-01",
          },
          "25:00",
          "08:00",
          { title: " ", timezone: "Mars/Orbit", confidence: 0.5 },
        ),
      ],
      {
        timezone: "Mars/Orbit",
        term: { startsOn: "2026-12-01", endsOn: "2026-11-01" },
      },
    );
    const codes = warnings.map((warning) => warning.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        "INVALID_TIMEZONE",
        "INVALID_TERM_RANGE",
        "MISSING_TITLE",
        "MISSING_START_TIME",
        "UNKNOWN_DAY_LABEL",
        "INVALID_DATE",
        "LOW_CONFIDENCE",
      ]),
    );
    expect(warnings.every((warning) => warning.message.length > 0)).toBe(true);
  });
});

describe("schedule conflicts", () => {
  it("bounds conflict output for large overlapping inputs", async () => {
    const letters = (value: number): string => {
      let result = "";
      let current = value;
      do {
        result = String.fromCharCode(65 + (current % 26)) + result;
        current = Math.floor(current / 26) - 1;
      } while (current >= 0);
      return result;
    };
    const text = [
      "title,day,start,end",
      ...Array.from(
        { length: 1_000 },
        (_, index) => `Topic ${letters(index)} Section,Monday,09:00,10:00`,
      ),
    ].join("\n");

    const result = await parseTimetable(
      { kind: "csv", text },
      { locale: "en-PH", timezone: "UTC" },
    );

    expect(result.events).toHaveLength(1_000);
    expect(result.conflicts).toHaveLength(1_000);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "CONFLICT_LIMIT",
          details: { limit: 1_000 },
        }),
      ]),
    );
  });

  it("keeps the unbounded public helper complete", () => {
    const events = Array.from({ length: 46 }, (_, index) =>
      event(
        `evt-${String(index).padStart(2, "0")}`,
        { kind: "weekly", weekdays: ["MO"] },
        "09:00",
        "10:00",
      ),
    );

    expect(detectConflicts(events)).toHaveLength(1_035);
  });

  it("bounds pair work separately from conflict output", () => {
    const events = [
      event("evt-a", { kind: "weekly", weekdays: ["MO"] }, "09:00", "10:00"),
      event("evt-b", { kind: "weekly", weekdays: ["MO"] }, "09:00", "10:00"),
      event("evt-c", { kind: "weekly", weekdays: ["MO"] }, "09:00", "10:00"),
    ];

    const result = detectConflictsBounded(events, {
      maxConflicts: Number.MAX_SAFE_INTEGER,
      maxPairs: 1,
    });

    expect(result.conflicts).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });

  it("skips an impossible long weekly term without enumerating it", () => {
    const monday = event(
      "evt-monday",
      { kind: "weekly", weekdays: ["MO"] },
      "09:00",
      "10:00",
    );
    const tuesday = event(
      "evt-tuesday",
      { kind: "weekly", weekdays: ["TU"] },
      "09:00",
      "10:00",
    );

    expect(
      detectConflicts([monday, tuesday], {
        term: { startsOn: "2026-01-01", endsOn: "9999-12-31" },
      }),
    ).toEqual([]);
  });

  it("sorts event ids and reports a shared weekly overlap", () => {
    const first = event(
      "evt-a",
      { kind: "weekly", weekdays: ["MO"] },
      "09:00",
      "10:30",
    );
    const second = event(
      "evt-b",
      { kind: "weekly", weekdays: ["MO"] },
      "10:00",
      "11:00",
    );

    expect(detectConflicts([second, first])).toMatchObject([
      {
        eventIds: ["evt-a", "evt-b"],
        occurrence: { kind: "weekday", weekday: "MO" },
        overlap: { startsAt: "10:00", endsAt: "10:30" },
      },
    ]);
  });

  it("does not flag adjacent events or different timezones", () => {
    const first = event(
      "evt-a",
      { kind: "weekly", weekdays: ["TU"] },
      "09:00",
      "10:00",
    );
    const adjacent = event(
      "evt-b",
      { kind: "weekly", weekdays: ["TU"] },
      "10:00",
      "11:00",
    );
    const elsewhere = event(
      "evt-c",
      { kind: "weekly", weekdays: ["TU"] },
      "09:30",
      "10:30",
      { timezone: "UTC" },
    );

    expect(detectConflicts([first, adjacent])).toEqual([]);
    expect(detectConflicts([first, elsewhere])).toEqual([]);
  });

  it("maps exact-date overlaps to date occurrences inside a term", () => {
    const first = event(
      "evt-a",
      { kind: "exact", exactDates: ["2026-09-14"] },
      "13:00",
      "14:00",
    );
    const second = event(
      "evt-b",
      { kind: "exact", exactDates: ["2026-09-14", "2026-09-15"] },
      "13:30",
      "14:30",
    );

    expect(
      detectConflicts([first, second], {
        term: { startsOn: "2026-09-01", endsOn: "2026-09-30" },
      }),
    ).toMatchObject([
      {
        occurrence: { kind: "date", date: "2026-09-14" },
        overlap: { startsAt: "13:30", endsAt: "14:00" },
      },
    ]);
  });
});
