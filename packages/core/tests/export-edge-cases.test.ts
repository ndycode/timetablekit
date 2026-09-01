import { describe, expect, it } from "vitest";
import { TimetableError, parseTimetable, toICS } from "../src";
import type { TimetableEvent, TimetableParseResult } from "../src";

const options = {
  locale: "en-PH",
  timezone: "Asia/Manila",
  evidence: "none" as const,
};

async function weeklyResult(): Promise<TimetableParseResult> {
  return parseTimetable(
    {
      kind: "text",
      text: "Export Edge; Monday; 09:00-10:30; Room Cedar",
      filename: "edge.txt",
    },
    { ...options, term: { startsOn: "2026-09-01", endsOn: "2026-09-30" } },
  );
}

function errorCode(action: () => void): string | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof TimetableError ? error.code : undefined;
  }
  return undefined;
}

describe("ICS export edge cases", () => {
  it("exports exact dates and UTC timestamps", async () => {
    const result = await parseTimetable(
      {
        kind: "text",
        text: "Exact Export; 2026-09-14, 2026-09-15; 09:00-10:00",
      },
      options,
    );
    const ics = toICS(result, { timezoneMode: "UTC" });

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART:20260914T010000Z");
    expect(ics).toContain("DTEND:20260915T020000Z");
    expect(ics).toContain("UID:");
  });

  it("uses an explicit range and includes optional descriptions", async () => {
    const result = await weeklyResult();
    const event = result.events[0];
    expect(event).toBeDefined();
    if (event === undefined) return;
    const enriched: TimetableEvent = {
      ...event,
      code: "EDGE-101",
      eventType: "Lab",
      instructor: "Mira Vale",
      notes: "Bring map",
      title: "A,B;C\\D",
    };
    const enrichedResult: TimetableParseResult = {
      ...result,
      events: [enriched],
    };
    const ics = toICS(enrichedResult, { dtstamp: "20260901T000000Z" });

    expect(ics).toContain("SUMMARY:A\\,B\\;C\\\\D");
    expect(ics).toContain(
      "DESCRIPTION:Code: EDGE-101\\nType: Lab\\nInstructor: Mira Vale\\nBring map",
    );
  });

  it("requires a concrete range for weekly events", async () => {
    const result = await parseTimetable(
      { kind: "text", text: "No Range; Monday; 09:00-10:00" },
      options,
    );

    expect(errorCode(() => toICS(result))).toBe("EXPORT_REQUIRES_TERM");
  });

  it("rejects invalid export timezones and impossible recurrence starts", async () => {
    const result = await weeklyResult();
    const event = result.events[0];
    expect(event).toBeDefined();
    if (event === undefined) return;
    const badTimezone: TimetableParseResult = {
      ...result,
      timezone: "Mars/Orbit",
    };
    expect(errorCode(() => toICS(badTimezone))).toBe("EXPORT_INVALID_RESULT");
    const eventTimezoneInjection: TimetableParseResult = {
      ...result,
      events: [{ ...event, timezone: "Asia/Manila\r\nX-Bad: yes" }],
    };
    expect(errorCode(() => toICS(eventTimezoneInjection))).toBe(
      "EXPORT_INVALID_RESULT",
    );
    const impossibleRange: TimetableParseResult = {
      ...result,
      events: [{ ...event, schedule: { kind: "weekly", weekdays: ["MO"] } }],
      term: { startsOn: "2026-02-30", endsOn: "2026-03-01" },
    };
    expect(errorCode(() => toICS(impossibleRange))).toBe(
      "EXPORT_INVALID_RESULT",
    );
    expect(new TimetableError("EXPORT_INVALID_RESULT", "bad")).toMatchObject({
      name: "TimetableError",
      code: "EXPORT_INVALID_RESULT",
    });
    expect(
      errorCode(() =>
        toICS(result, { dtstamp: "20260901T000000Z\r\nX-Bad: yes" }),
      ),
    ).toBe("EXPORT_INVALID_RESULT");
    expect(
      errorCode(() => toICS(result, { dtstamp: "20261340T256099Z" })),
    ).toBe("EXPORT_INVALID_RESULT");
    const weeklyDateInjection: TimetableParseResult = {
      ...result,
      events: [
        {
          ...event,
          schedule: {
            kind: "weekly",
            weekdays: ["MO"],
            startsOn: "2026-09-01",
            endsOn: "2026-09-30\r\nX-Bad: yes",
          },
        },
      ],
    };
    expect(errorCode(() => toICS(weeklyDateInjection))).toBe(
      "EXPORT_INVALID_RESULT",
    );
  });

  it("preserves supported low four-digit years in UTC output", async () => {
    const result = await weeklyResult();
    const event = result.events[0];
    expect(event).toBeDefined();
    if (event === undefined) return;
    const lowYear: TimetableParseResult = {
      ...result,
      timezone: "UTC",
      events: [
        {
          ...event,
          timezone: "UTC",
          startTime: "01:00",
          endTime: "02:00",
          schedule: { kind: "exact", exactDates: ["0099-09-14"] },
        },
      ],
    };
    expect(toICS(lowYear, { timezoneMode: "UTC" })).toContain(
      "DTSTART:00990914T010000Z",
    );
    const lowYearEvent = lowYear.events[0];
    expect(lowYearEvent).toBeDefined();
    if (lowYearEvent === undefined) return;
    expect(
      errorCode(() =>
        toICS({
          ...lowYear,
          events: [
            {
              ...lowYearEvent,
              schedule: { kind: "exact", exactDates: ["0000-09-14"] },
            },
          ],
        }),
      ),
    ).toBe("EXPORT_INVALID_RESULT");
  });
});
