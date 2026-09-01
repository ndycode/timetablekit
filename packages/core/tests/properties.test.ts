import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  formatTime,
  parseTime,
  parseTimetable,
  timeToMinutes,
  toCSV,
  toICS,
  toJSON,
} from "../src";

const parserOptions = {
  locale: "en-PH",
  timezone: "Asia/Manila",
  evidence: "none" as const,
};

describe("core parser properties", () => {
  it("round-trips every canonical clock value", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        (hour, minute) => {
          const formatted = formatTime(hour, minute);
          expect(formatted).toBeDefined();
          if (formatted === undefined) return;
          expect(parseTime(formatted)).toEqual({
            kind: "ok",
            time: formatted,
            ambiguous: false,
          });
          expect(timeToMinutes(formatted)).toBe(hour * 60 + minute);
        },
      ),
      { numRuns: 80 },
    );
  });

  it("parses generated safe rows into one normalized event", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "Amber Study",
          "River Arc",
          "Quiet Orbit",
          "Cedar Workshop",
        ),
        fc.constantFrom("Monday", "Tuesday", "Wednesday", "Thursday", "Friday"),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 1, max: 3 }),
        async (title, day, startHour, duration) => {
          const endHour = startHour + duration;
          const startTime = `${String(startHour).padStart(2, "0")}:00`;
          const endTime = `${String(endHour).padStart(2, "0")}:00`;
          const result = await parseTimetable(
            { kind: "text", text: `${title}; ${day}; ${startTime}-${endTime}` },
            parserOptions,
          );

          expect(result.events).toHaveLength(1);
          const parsed = result.events[0];
          expect(parsed).toBeDefined();
          if (parsed === undefined) return;
          expect(parsed.title).toBe(title);
          expect(parsed.startTime).toBe(startTime);
          expect(parsed.endTime).toBe(endTime);
          expect(result.warnings).toEqual([]);
        },
      ),
      { numRuns: 40 },
    );
  });

  it("keeps all public export serializers valid for generated rows", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("Export Amber", "Export River", "Export Orbit"),
        fc.constantFrom("Monday", "Wednesday", "Friday"),
        async (title, day) => {
          const result = await parseTimetable(
            { kind: "text", text: `${title}; ${day}; 09:00-10:00` },
            {
              ...parserOptions,
              term: { startsOn: "2026-09-01", endsOn: "2026-09-30" },
            },
          );

          expect(() => JSON.parse(toJSON(result))).not.toThrow();
          expect(toCSV(result)).toContain(title);
          expect(toICS(result, { dtstamp: "20260901T000000Z" })).toContain(
            "BEGIN:VCALENDAR",
          );
        },
      ),
      { numRuns: 20 },
    );
  });
});
