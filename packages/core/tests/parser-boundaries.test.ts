import { describe, expect, it } from "vitest";
import {
  createLocaleRegistry,
  EN_PH_LOCALE,
  normalizeLocaleAlias,
  parseWeekdays,
} from "../src";
import {
  addDays,
  dateWithin,
  findDates,
  parseDate,
  weekdayForDate,
} from "../src/parser/date.js";
import { parseCsv, type CsvRecord } from "../src/parser/csv.js";
import {
  parseCsvCandidates,
  parseCsvFallbackLine,
} from "../src/parser/csv-rows.js";
import {
  addEvidence,
  cleanCell,
  makeEvidence,
  normalizeText,
  sanitizeFilename,
  sourceLocationForLine,
  utf8ByteLength,
  lineStartOffsets,
} from "../src/parser/text.js";
import type { FieldEvidence } from "../src";
import {
  formatTime,
  parseTime,
  parseTimeRange,
  timeToMinutes,
} from "../src/parser/time.js";

describe("text boundary helpers", () => {
  it("normalizes controls, spaces, dashes, and line endings", () => {
    expect(normalizeText("A\u0000B\u00a0C\u2007D\u202fE‐F\r\nG\u0008H")).toBe(
      "A B C D E-F\nG H",
    );
    expect(cleanCell("  many\t spaces  ")).toBe("many spaces");
    expect(utf8ByteLength("界".repeat(3))).toBe(9);
  });

  it("sanitizes filenames and keeps evidence bounded", () => {
    expect(sanitizeFilename(undefined)).toBeUndefined();
    expect(sanitizeFilename("/fictional/room?.txt")).toBe("room_.txt");
    expect(sanitizeFilename("...")).toBeUndefined();
    expect(sanitizeFilename("x".repeat(200))).toHaveLength(160);
    const source = { kind: "text" as const };
    const location = sourceLocationForLine(3, "row text");
    expect(makeEvidence(source, location, "none", "row text")).toBeUndefined();
    expect(makeEvidence(source, location, "locations", "row text")).toEqual({
      source,
      location,
    });
    expect(makeEvidence(source, location, "snippets", "row text")).toEqual({
      source,
      location,
      excerpt: "row text",
    });
    const target: Partial<Record<string, readonly FieldEvidence[]>> = {};
    addEvidence(target, "title", undefined);
    const first = makeEvidence(source, location, "locations", "row text");
    addEvidence(target, "title", first);
    addEvidence(target, "title", first);
    expect(target.title).toEqual([first, first]);
    expect(lineStartOffsets("one\ntwo\n")).toEqual([0, 4, 8]);
  });
});

describe("date and locale helpers", () => {
  it("parses ISO, MDY, and DMY dates and rejects impossible dates", () => {
    expect(parseDate("2026/9/4", EN_PH_LOCALE)).toEqual({
      kind: "ok",
      date: "2026-09-04",
    });
    expect(parseDate("9/4/2026", EN_PH_LOCALE)).toEqual({
      kind: "ok",
      date: "2026-09-04",
    });
    expect(
      parseDate("4/9/2026", { ...EN_PH_LOCALE, dateOrder: "DMY" }),
    ).toEqual({ kind: "ok", date: "2026-09-04" });
    expect(parseDate("2026-02-30", EN_PH_LOCALE)).toEqual({ kind: "invalid" });
    expect(parseDate("not a date", EN_PH_LOCALE)).toEqual({ kind: "invalid" });
  });

  it("finds valid dates and calculates calendar boundaries", () => {
    expect(
      findDates("Open 2026-09-04 then 09/05/2026 and 2026-02-30", EN_PH_LOCALE),
    ).toEqual([
      { date: "2026-09-04", location: { charStart: 5, charEnd: 15 } },
      { date: "2026-09-05", location: { charStart: 21, charEnd: 31 } },
    ]);
    expect(weekdayForDate("2026-09-07")).toBe("MO");
    expect(weekdayForDate("2026-02-30")).toBeUndefined();
    expect(
      dateWithin("2026-09-04", {
        startsOn: "2026-09-01",
        endsOn: "2026-09-10",
      }),
    ).toBe(true);
    expect(
      dateWithin("2026-09-11", {
        startsOn: "2026-09-01",
        endsOn: "2026-09-10",
      }),
    ).toBe(false);
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("not-a-date", 1)).toBeUndefined();
  });

  it("recognizes direct and compact weekday aliases", () => {
    expect(parseWeekdays("Wed. Friday", EN_PH_LOCALE)).toEqual({
      weekdays: ["WE", "FR"],
      tokens: ["Wed", "Friday"],
    });
    expect(parseWeekdays("MTWF", EN_PH_LOCALE).weekdays).toEqual([
      "MO",
      "TU",
      "WE",
      "FR",
    ]);
    expect(parseWeekdays("unknown", EN_PH_LOCALE)).toEqual({
      weekdays: [],
      tokens: [],
    });
    expect(normalizeLocaleAlias("  Élément\tDeux  ")).toBe("element deux");
  });

  it("keeps locale registries immutable and reports missing locales", () => {
    const registry = createLocaleRegistry();
    expect(registry.get("EN-ph")).toBe(EN_PH_LOCALE);
    expect(() => registry.get("missing")).toThrow("not registered");
    const custom = {
      id: "toy",
      dayAliases: { x: "MO" as const },
      dateOrder: "YMD" as const,
    };
    const extended = registry.with(custom);
    expect(extended.get("TOY")).toEqual(custom);
    const replaced = extended.with({
      ...custom,
      dayAliases: { y: "TU" as const },
    });
    expect(replaced.get("toy").dayAliases).toEqual({ y: "TU" });
  });
});

describe("time and CSV parser boundaries", () => {
  it("handles meridiems, separators, dates, and invalid ranges", () => {
    expect(parseTime("12 AM")).toMatchObject({
      kind: "ok",
      time: "00:00",
      ambiguous: false,
    });
    expect(parseTime("12 PM")).toMatchObject({
      kind: "ok",
      time: "12:00",
      ambiguous: false,
    });
    expect(parseTime("9", "PM")).toMatchObject({
      kind: "ok",
      time: "21:00",
      ambiguous: false,
    });
    expect(parseTime("13 PM").kind).toBe("invalid");
    expect(parseTime("1260")).toEqual({ kind: "invalid", reason: "format" });
    expect(parseTime("not-time")).toEqual({
      kind: "invalid",
      reason: "format",
    });
    expect(parseTimeRange("09:00 to 10:00")).toMatchObject({
      kind: "ok",
      startTime: "09:00",
      endTime: "10:00",
    });
    expect(parseTimeRange("09:00–10:00")).toMatchObject({
      kind: "ok",
      startTime: "09:00",
      endTime: "10:00",
    });
    expect(parseTimeRange("2026-09-01 09:00-10:00")).toMatchObject({
      kind: "ok",
      startTime: "09:00",
      endTime: "10:00",
    });
    expect(parseTimeRange("09:00 / 10:00").kind).toBe("missing-end");
    expect(parseTimeRange("not a time")).toEqual({ kind: "none" });
    expect(formatTime(-1, 0)).toBeUndefined();
    expect(formatTime(24, 0)).toBeUndefined();
    expect(formatTime(1, 60)).toBeUndefined();
    expect(timeToMinutes("24:00")).toBeUndefined();
  });

  it("parses inferred delimiters, quotes, and malformed CSV", () => {
    expect(parseCsv("a;b\n1;2")).toMatchObject({
      kind: "ok",
      delimiter: ";",
      records: [{ values: ["a", "b"] }, { values: ["1", "2"] }],
    });
    expect(parseCsv("a\tb\n1\t2")).toMatchObject({
      kind: "ok",
      delimiter: "\t",
    });
    expect(parseCsv('a,b\n"c,d","e""f"')).toMatchObject({
      kind: "ok",
      records: [{ values: ["a", "b"] }, { values: ["c,d", 'e"f'] }],
    });
    expect(parseCsv(" \r\n ")).toEqual({ kind: "invalid", reason: "empty" });
    expect(parseCsv('a,b\n"unterminated')).toEqual({
      kind: "invalid",
      reason: "unterminated-quote",
    });
  });

  it("covers CSV candidate fallbacks and row-level warnings", () => {
    const parsed = parseCsvCandidates(
      "title,days,start,end\nBad Start,Monday,nope,10:00\nBad End,Monday,09:00,nope",
      EN_PH_LOCALE,
      ",",
    );
    expect(parsed.candidates).toEqual([]);
    expect(parsed.warnings.map((warning) => warning.code)).toEqual([
      "INVALID_TIME_RANGE",
      "INVALID_TIME_RANGE",
    ]);
    const record: CsvRecord = {
      values: ["Fallback Item", "Monday", "09:00-10:00"],
      line: 2,
      charStart: 0,
      charEnd: 35,
    };
    expect(parseCsvFallbackLine(record, EN_PH_LOCALE)).toMatchObject({
      title: "Fallback Item",
      startTime: "09:00",
      endTime: "10:00",
    });
    const range = parseCsvCandidates(
      "title,day,time\nRange Item,Tuesday,9-10",
      EN_PH_LOCALE,
      undefined,
    );
    expect(range.warnings).toEqual([]);
    expect(
      range.candidates[0]?.warnings.map((warning) => warning.code),
    ).toEqual(["AMBIGUOUS_TIME"]);
  });
});
