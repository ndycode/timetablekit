import { describe, expect, it } from "vitest";
import {
  escapeCsvField,
  escapeIcsText,
  foldIcsLine,
  parseTimetable,
  toCSV,
  toICS,
  toJSON,
} from "../src";

const options = {
  locale: "en-PH",
  timezone: "Asia/Manila",
  evidence: "none" as const,
  term: { startsOn: "2026-09-01", endsOn: "2026-09-30" },
};

async function exportResult() {
  return parseTimetable(
    {
      kind: "text",
      text: "Exportable Workshop; Monday; 09:00-10:30; Room Cedar",
      filename: "exportable.txt",
    },
    options,
  );
}

describe("public JSON, CSV, and ICS exports", () => {
  it("serializes a parsed result as deterministic JSON", async () => {
    const result = await exportResult();
    const compact = toJSON(result);
    const pretty = toJSON(result, { pretty: true });

    expect(JSON.parse(compact)).toEqual(JSON.parse(pretty));
    expect(compact.indexOf('"aiRecoveryUsed"')).toBeGreaterThan(
      compact.indexOf('"events"'),
    );
    expect(JSON.parse(compact)).toMatchObject({
      schemaVersion: "1.0",
      source: { kind: "text", filename: "exportable.txt" },
      events: [
        {
          title: "Exportable Workshop",
          schedule: { kind: "weekly", weekdays: ["MO"] },
        },
      ],
    });
  });

  it("writes CSV headers, normalized fields, and a final CRLF", async () => {
    const result = await exportResult();
    const csv = toCSV(result);

    expect(csv.startsWith("id,title,code,eventType,scheduleKind")).toBe(true);
    expect(csv).toContain("Exportable Workshop");
    expect(csv).toContain("Cedar");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("writes a bounded weekly ICS recurrence with a fixed timestamp", async () => {
    const result = await exportResult();
    const ics = toICS(result, { dtstamp: "20260901T000000Z" });

    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("DTSTAMP:20260901T000000Z");
    expect(ics).toContain("DTSTART;TZID=Asia/Manila:20260907T090000");
    expect(ics).toContain("DTEND;TZID=Asia/Manila:20260907T103000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260930T235959");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("escapes CSV and ICS control characters", () => {
    expect(escapeCsvField("=fictional formula")).toBe("'=fictional formula");
    expect(escapeCsvField("\t=fictional formula")).toBe(
      "'\t=fictional formula",
    );
    expect(escapeCsvField('comma, line\nquote"')).toBe(
      '"comma, line\nquote"""',
    );
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("folds long UTF-8 ICS lines at the byte boundary", () => {
    const folded = foldIcsLine(`SUMMARY:${"界".repeat(40)}`);
    const lines = folded.split("\r\n");

    expect(lines.length).toBeGreaterThan(1);
    expect(
      lines.slice(0, -1).every((line) => Buffer.byteLength(line, "utf8") <= 75),
    ).toBe(true);
    expect(lines.slice(1).every((line) => line.startsWith(" "))).toBe(true);
  });
});
