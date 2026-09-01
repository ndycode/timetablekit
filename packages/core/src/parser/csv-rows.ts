import { findDates, parseDate } from "./date.js";
import { parseCsv, type CsvRecord } from "./csv.js";
import { parseLine, type Candidate } from "./row.js";
import { parseTime, parseTimeRange } from "./time.js";
import { cleanCell } from "./text.js";
import { makeWarning } from "./warnings.js";
import { parseWeekdays } from "../locale/registry.js";
import type {
  EventField,
  EventSchedule,
  LocaleDefinition,
  ParseWarning,
} from "../schema/types.js";

type CsvColumn =
  | "title"
  | "code"
  | "eventType"
  | "days"
  | "date"
  | "start"
  | "end"
  | "range"
  | "location"
  | "instructor"
  | "notes";

type CsvHeaderMap = Partial<Record<CsvColumn, number>>;

export type CsvCandidateParse = {
  readonly candidates: readonly Candidate[];
  readonly warnings: readonly ParseWarning[];
};

const HEADER_ALIASES: Readonly<Record<string, CsvColumn>> = {
  title: "title",
  course: "title",
  "course title": "title",
  subject: "title",
  class: "title",
  event: "title",
  name: "title",
  code: "code",
  "course code": "code",
  section: "code",
  type: "eventType",
  "event type": "eventType",
  day: "days",
  days: "days",
  weekday: "days",
  weekdays: "days",
  date: "date",
  dates: "date",
  "exact date": "date",
  start: "start",
  "start time": "start",
  begins: "start",
  end: "end",
  "end time": "end",
  finishes: "end",
  time: "range",
  times: "range",
  range: "range",
  "time range": "range",
  room: "location",
  location: "location",
  venue: "location",
  instructor: "instructor",
  teacher: "instructor",
  professor: "instructor",
  notes: "notes",
  remarks: "notes",
};

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headerMap(record: CsvRecord): CsvHeaderMap {
  const result: CsvHeaderMap = {};
  record.values.forEach((value, index) => {
    const column = HEADER_ALIASES[normalizeHeader(value)];
    if (column !== undefined && result[column] === undefined) {
      result[column] = index;
    }
  });
  return result;
}

function valueAt(
  record: CsvRecord,
  headers: CsvHeaderMap,
  column: CsvColumn,
): string {
  const index = headers[column];
  return index === undefined ? "" : cleanCell(record.values[index] ?? "");
}

function fieldLocations(location: {
  readonly line: number;
  readonly charStart: number;
  readonly charEnd: number;
}): Partial<
  Record<
    EventField,
    {
      readonly line: number;
      readonly charStart: number;
      readonly charEnd: number;
    }
  >
> {
  return {
    title: location,
    code: location,
    eventType: location,
    schedule: location,
    startTime: location,
    endTime: location,
    location,
    instructor: location,
    notes: location,
  };
}

function parseDateValues(
  value: string,
  definition: LocaleDefinition,
): readonly string[] {
  const found = findDates(value, definition).map((entry) => entry.date);
  if (found.length > 0) {
    return [...new Set(found)];
  }
  const direct = value
    .split(/[|;,]+/u)
    .map((part) => parseDate(part, definition))
    .filter((entry) => entry.kind === "ok")
    .map((entry) => entry.date);
  return [...new Set(direct)];
}

function candidateForRecord(
  record: CsvRecord,
  headers: CsvHeaderMap,
  definition: LocaleDefinition,
): {
  readonly candidate?: Candidate;
  readonly warnings: readonly ParseWarning[];
} {
  const location = {
    line: record.line,
    charStart: record.charStart,
    charEnd: record.charEnd,
  };
  const title = valueAt(record, headers, "title");
  const code = valueAt(record, headers, "code");
  const daysText = valueAt(record, headers, "days");
  const dateText = valueAt(record, headers, "date");
  const dates = parseDateValues(dateText, definition);
  const days = parseWeekdays(daysText, definition).weekdays;
  const schedule: EventSchedule | undefined =
    dates.length > 0
      ? { kind: "exact", exactDates: dates }
      : days.length > 0
        ? { kind: "weekly", weekdays: days }
        : undefined;
  const warnings: ParseWarning[] = [];
  if (title.length === 0) {
    warnings.push(
      makeWarning({
        code: "MISSING_TITLE",
        severity: "error",
        message: "The CSV row has no event title.",
        source: location,
        field: "title",
      }),
    );
  }
  if (schedule === undefined) {
    warnings.push(
      makeWarning({
        code: "UNKNOWN_DAY_LABEL",
        severity: "warning",
        message: "The CSV row has no recognized weekday or exact date.",
        source: location,
        field: "schedule",
      }),
    );
  }
  const rangeText = valueAt(record, headers, "range");
  const startText = valueAt(record, headers, "start");
  const endText = valueAt(record, headers, "end");
  const range = rangeText.length > 0 ? parseTimeRange(rangeText) : undefined;
  let startTime: string | undefined;
  let endTime: string | undefined;
  let ambiguous = false;
  if (range?.kind === "ok") {
    startTime = range.startTime;
    endTime = range.endTime;
    ambiguous = range.ambiguous;
  } else {
    const start = startText.length > 0 ? parseTime(startText) : undefined;
    const end = endText.length > 0 ? parseTime(endText) : undefined;
    if (start?.kind === "ok") {
      startTime = start.time;
      ambiguous = start.ambiguous;
    } else if (startText.length === 0) {
      warnings.push(
        makeWarning({
          code: "MISSING_START_TIME",
          severity: "error",
          message: "The CSV row has no start time.",
          source: location,
          field: "startTime",
        }),
      );
    } else {
      warnings.push(
        makeWarning({
          code: "INVALID_TIME_RANGE",
          severity: "error",
          message: "The CSV row has an invalid start time.",
          source: location,
          field: "startTime",
        }),
      );
    }
    if (end?.kind === "ok") {
      endTime = end.time;
      ambiguous = ambiguous || end.ambiguous;
    } else if (endText.length === 0) {
      warnings.push(
        makeWarning({
          code: "MISSING_END_TIME",
          severity: "error",
          message: "The CSV row has no end time.",
          source: location,
          field: "endTime",
        }),
      );
    } else {
      warnings.push(
        makeWarning({
          code: "INVALID_TIME_RANGE",
          severity: "error",
          message: "The CSV row has an invalid end time.",
          source: location,
          field: "endTime",
        }),
      );
    }
  }
  if (range?.kind === "missing-end") {
    startTime = range.startTime;
    ambiguous = range.ambiguous;
    warnings.push(
      makeWarning({
        code: "MISSING_END_TIME",
        severity: "error",
        message: "The CSV row has a start time but no end time.",
        source: location,
        field: "endTime",
      }),
    );
  }
  if (range?.kind === "invalid") {
    warnings.push(
      makeWarning({
        code: "INVALID_TIME_RANGE",
        severity: "error",
        message: "The CSV row has an invalid time range.",
        source: location,
        field: "startTime",
      }),
    );
  }
  if (ambiguous) {
    warnings.push(
      makeWarning({
        code: "AMBIGUOUS_TIME",
        severity: "warning",
        message: "A CSV time has no clear 12-hour or 24-hour marker.",
        source: location,
        field: "startTime",
      }),
    );
  }
  if (
    schedule === undefined ||
    startTime === undefined ||
    endTime === undefined ||
    title.length === 0
  ) {
    return { warnings };
  }
  const locationValue = valueAt(record, headers, "location");
  const instructor = valueAt(record, headers, "instructor");
  const notes = valueAt(record, headers, "notes");
  const eventType = valueAt(record, headers, "eventType");
  const candidate: Candidate = {
    title,
    ...(code.length === 0 ? {} : { code }),
    ...(eventType.length === 0 ? {} : { eventType }),
    schedule,
    startTime,
    endTime,
    ...(locationValue.length === 0 ? {} : { location: locationValue }),
    ...(instructor.length === 0 ? {} : { instructor }),
    ...(notes.length === 0 ? {} : { notes }),
    sourceLocation: location,
    fieldLocations: fieldLocations(location),
    fieldText: {
      title,
      ...(code.length === 0 ? {} : { code }),
      schedule: daysText.length > 0 ? daysText : dateText,
      startTime,
      endTime,
    },
    warnings,
  };
  return { candidate, warnings };
}

export function parseCsvCandidates(
  text: string,
  definition: LocaleDefinition,
  delimiter: "," | ";" | "\t" | undefined,
): CsvCandidateParse {
  const parsed = parseCsv(text, delimiter);
  if (parsed.kind === "invalid") {
    return {
      candidates: [],
      warnings: [
        makeWarning({
          code: "UNRECOGNIZED_CSV",
          severity: "error",
          message: "The CSV input could not be read as a complete table.",
        }),
      ],
    };
  }
  const header = parsed.records[0];
  if (header === undefined) {
    return {
      candidates: [],
      warnings: [
        makeWarning({
          code: "UNRECOGNIZED_CSV",
          severity: "error",
          message: "The CSV input has no header row.",
        }),
      ],
    };
  }
  const headers = headerMap(header);
  if (
    headers.title === undefined ||
    (headers.start === undefined && headers.range === undefined) ||
    (headers.end === undefined && headers.range === undefined)
  ) {
    return {
      candidates: [],
      warnings: [
        makeWarning({
          code: "UNRECOGNIZED_CSV",
          severity: "error",
          message: "The CSV header does not describe a timetable.",
        }),
      ],
    };
  }
  const candidates: Candidate[] = [];
  const warnings: ParseWarning[] = [];
  for (const record of parsed.records.slice(1)) {
    const parsedRecord = candidateForRecord(record, headers, definition);
    if (parsedRecord.candidate === undefined) {
      warnings.push(...parsedRecord.warnings);
    } else {
      candidates.push(parsedRecord.candidate);
    }
  }
  return { candidates, warnings };
}

export function parseCsvFallbackLine(
  record: CsvRecord,
  definition: LocaleDefinition,
): Candidate | undefined {
  const line = {
    text: record.values.join(" | "),
    location: {
      line: record.line,
      charStart: record.charStart,
      charEnd: record.charEnd,
    },
  };
  return parseLine(line, definition).candidate;
}
