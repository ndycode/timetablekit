import { findDates } from "./date.js";
import { parseTimeRange } from "./time.js";
import { cleanCell, normalizeText } from "./text.js";
import { makeWarning } from "./warnings.js";
import { parseWeekdays, type DayRecognition } from "../locale/registry.js";
import type {
  EventField,
  EventSchedule,
  FieldEvidence,
  LocaleDefinition,
  ParseWarning,
  SourceDescriptor,
  SourceLocation,
  TimetableEvent,
} from "../schema/types.js";

const EVENT_FIELDS: readonly EventField[] = [
  "title",
  "code",
  "eventType",
  "schedule",
  "startTime",
  "endTime",
  "timezone",
  "location",
  "instructor",
  "notes",
];

function isEventField(value: string): value is EventField {
  for (const field of EVENT_FIELDS) {
    if (field === value) {
      return true;
    }
  }
  return false;
}

export type Candidate = {
  readonly title?: string;
  readonly code?: string;
  readonly eventType?: string;
  readonly schedule?: EventSchedule;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly location?: string;
  readonly instructor?: string;
  readonly notes?: string;
  readonly sourceLocation: SourceLocation;
  readonly fieldLocations: Partial<Record<EventField, SourceLocation>>;
  readonly fieldText: Partial<Record<EventField, string>>;
  readonly warnings: readonly ParseWarning[];
};

export type ParsedLine = {
  readonly candidate?: Candidate;
  readonly warnings: readonly ParseWarning[];
};

function splitCells(text: string): readonly string[] {
  const cells = text.split(/\s*\|\s*|\t+|\s*;\s*|,\s*/u).map(cleanCell);
  return cells.filter((cell) => cell.length > 0);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeDayWords(text: string, definition: LocaleDefinition): string {
  const aliases = Object.keys(definition.dayAliases)
    .filter((alias) => alias.length > 1)
    .sort((left, right) => right.length - left.length)
    .map(escapeRegex);
  if (aliases.length === 0) {
    return text;
  }
  return text.replace(new RegExp(`\\b(?:${aliases.join("|")})\\b`, "giu"), " ");
}

function removeTimeAndDates(
  text: string,
  timeStart: number,
  timeEnd: number,
): string {
  const withoutTime = `${text.slice(0, timeStart)} ${text.slice(timeEnd)}`;
  return withoutTime.replace(
    /\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/gu,
    " ",
  );
}

function readLabeledValue(
  text: string,
  labels: readonly string[],
): string | undefined {
  const label = labels.join("|");
  const match = new RegExp(
    `(?:${label})\\s*(?:[:#-]\\s*)?([^|,;]+)`,
    "iu",
  ).exec(text);
  return match?.[1] === undefined ? undefined : cleanCell(match[1]);
}

function readLocation(text: string): string | undefined {
  return readLabeledValue(text, [
    "room",
    "rm\\.?",
    "location",
    "loc\\.?",
    "venue",
  ]);
}

function readInstructor(text: string): string | undefined {
  return readLabeledValue(text, [
    "instructor",
    "teacher",
    "professor",
    "prof\\.?",
    "lecturer",
  ]);
}

function readNotes(text: string): string | undefined {
  return readLabeledValue(text, ["notes?", "remarks?"]);
}

function readEventType(text: string): string | undefined {
  return readLabeledValue(text, ["event\\s*type", "type"]);
}

function readCode(text: string): {
  readonly code?: string;
  readonly remainder: string;
} {
  const match = /\b[A-Z]{2,}(?:[- ]?\d{2,4}[A-Z]?)\b/iu.exec(text);
  if (match?.[0] === undefined || match.index === undefined) {
    return { remainder: text };
  }
  return {
    code: match[0].replace(/\s+/g, " ").toUpperCase(),
    remainder: `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`,
  };
}

function isTimeCell(value: string): boolean {
  const parsed = parseTimeRange(value);
  return parsed.kind === "ok" || parsed.kind === "missing-end";
}

function isMetadataCell(value: string): boolean {
  return /^(?:room|rm\.?|location|loc\.?|venue|instructor|teacher|professor|prof\.?|lecturer|notes?|remarks?|event\s*type|type)\b/iu.test(
    value,
  );
}

function isScheduleCell(value: string, definition: LocaleDefinition): boolean {
  return (
    parseWeekdays(value, definition).weekdays.length > 0 ||
    findDates(value, definition).length > 0
  );
}

function candidateTitle(
  text: string,
  cells: readonly string[],
  definition: LocaleDefinition,
  timeStart: number,
  timeEnd: number,
): { readonly title?: string; readonly code?: string } {
  const residual = removeDayWords(
    removeTimeAndDates(text, timeStart, timeEnd),
    definition,
  ).replace(
    /(?:room|rm\.?|location|loc\.?|venue|instructor|teacher|professor|prof\.?|lecturer|notes?|remarks?|event\s*type|type)\s*[:#-]?[^|,;]*/giu,
    " ",
  );
  const residualCells = cells.filter(
    (cell) =>
      !isTimeCell(cell) &&
      !isScheduleCell(cell, definition) &&
      !isMetadataCell(cell) &&
      !/^\d+$/.test(cell),
  );
  const combined =
    residualCells.length > 0 ? residualCells.join(" ") : residual;
  const codeResult = readCode(combined);
  const title = cleanCell(
    codeResult.remainder.replace(
      /^(?:course|subject|class|title)\s*[:#-]?/iu,
      "",
    ),
  )
    .replace(/^(?:[|,;]\s*)+|(?:[|,;]\s*)+$/gu, "")
    .trim();
  if (title.length === 0) {
    return codeResult.code === undefined ? {} : { code: codeResult.code };
  }
  return codeResult.code === undefined
    ? { title }
    : { title, code: codeResult.code };
}

function lineFieldLocations(
  location: SourceLocation,
): Partial<Record<EventField, SourceLocation>> {
  return {
    title: location,
    code: location,
    eventType: location,
    schedule: location,
    startTime: location,
    endTime: location,
    timezone: location,
    location,
    instructor: location,
    notes: location,
  };
}

function lineFieldText(
  text: string,
  candidate: Candidate,
): Partial<Record<EventField, string>> {
  const result: Partial<Record<EventField, string>> = {};
  if (candidate.title !== undefined) result.title = candidate.title;
  if (candidate.code !== undefined) result.code = candidate.code;
  if (candidate.eventType !== undefined) result.eventType = candidate.eventType;
  if (candidate.startTime !== undefined) result.startTime = candidate.startTime;
  if (candidate.endTime !== undefined) result.endTime = candidate.endTime;
  if (candidate.location !== undefined) result.location = candidate.location;
  if (candidate.instructor !== undefined)
    result.instructor = candidate.instructor;
  if (candidate.notes !== undefined) result.notes = candidate.notes;
  result.schedule = text;
  return result;
}

export function parseLine(
  line: { readonly text: string; readonly location: SourceLocation },
  definition: LocaleDefinition,
): ParsedLine {
  const normalized = normalizeText(line.text);
  const text = cleanCell(normalized);
  if (text.length === 0) {
    return { warnings: [] };
  }
  if (/^(?:#|\/\/)/u.test(text)) {
    return { warnings: [] };
  }
  const location = line.location;
  const time = parseTimeRange(text);
  const dates = findDates(text, definition);
  const days: DayRecognition = parseWeekdays(text, definition);
  const hasSignal =
    time.kind !== "none" || dates.length > 0 || days.weekdays.length > 0;
  if (!hasSignal) {
    return { warnings: [] };
  }
  if (time.kind === "invalid") {
    return {
      warnings: [
        makeWarning({
          code: "INVALID_TIME_RANGE",
          severity: "error",
          message: "The row has an invalid time range.",
          source: location,
        }),
      ],
    };
  }
  const warnings: ParseWarning[] = [];
  if (time.kind !== "none" && time.ambiguous) {
    warnings.push(
      makeWarning({
        code: "AMBIGUOUS_TIME",
        severity: "warning",
        message: "A time has no clear 12-hour or 24-hour marker.",
        source: location,
        field: "startTime",
      }),
    );
  }
  if (time.kind === "missing-end") {
    warnings.push(
      makeWarning({
        code: "MISSING_END_TIME",
        severity: "error",
        message: "The row has a start time but no end time.",
        source: location,
        field: "endTime",
      }),
    );
  }
  const schedule: EventSchedule | undefined =
    dates.length > 0
      ? { kind: "exact", exactDates: dates.map((entry) => entry.date) }
      : days.weekdays.length > 0
        ? { kind: "weekly", weekdays: days.weekdays }
        : undefined;
  if (schedule === undefined) {
    warnings.push(
      makeWarning({
        code: "UNKNOWN_DAY_LABEL",
        severity: "warning",
        message: "The row has no recognized weekday or exact date.",
        source: location,
        field: "schedule",
      }),
    );
  }
  if (time.kind === "none") {
    const hasRowDelimiter = /[|,;\t]/u.test(text);
    if (!hasRowDelimiter) {
      return { warnings: [] };
    }
    warnings.push(
      makeWarning({
        code: "MISSING_START_TIME",
        severity: "error",
        message: "The row has no start time.",
        source: location,
        field: "startTime",
      }),
    );
    return { warnings };
  }
  if (time.kind === "missing-end" || schedule === undefined) {
    if (schedule !== undefined && time.kind === "missing-end") {
      const partial: Candidate = {
        schedule,
        startTime: time.startTime,
        sourceLocation: location,
        fieldLocations: lineFieldLocations(location),
        fieldText: { startTime: time.startTime, schedule: text },
        warnings,
      };
      return { candidate: partial, warnings };
    }
    return { warnings };
  }
  const cells = splitCells(text);
  const titleResult = candidateTitle(
    text,
    cells,
    definition,
    time.startIndex,
    time.sourceEnd,
  );
  const locationValue = readLocation(text);
  const instructor = readInstructor(text);
  const notes = readNotes(text);
  const eventType = readEventType(text);
  const candidate: Candidate = {
    ...(titleResult.title === undefined ? {} : { title: titleResult.title }),
    ...(titleResult.code === undefined ? {} : { code: titleResult.code }),
    ...(eventType === undefined ? {} : { eventType }),
    schedule,
    startTime: time.startTime,
    endTime: time.endTime,
    ...(locationValue === undefined ? {} : { location: locationValue }),
    ...(instructor === undefined ? {} : { instructor }),
    ...(notes === undefined ? {} : { notes }),
    sourceLocation: location,
    fieldLocations: lineFieldLocations(location),
    fieldText: {},
    warnings,
  };
  const fieldText = lineFieldText(text, candidate);
  const completeCandidate: Candidate = { ...candidate, fieldText };
  if (completeCandidate.title === undefined) {
    warnings.push(
      makeWarning({
        code: "MISSING_TITLE",
        severity: "error",
        message: "The row has no event title.",
        source: location,
        field: "title",
      }),
    );
  }
  return { candidate: completeCandidate, warnings };
}

export function evidenceForCandidate(
  candidate: Candidate,
  source: SourceDescriptor,
  mode: "none" | "locations" | "snippets",
  sourceText: string,
): Partial<Record<EventField, readonly FieldEvidence[]>> {
  if (mode === "none") {
    return {};
  }
  const evidence: Partial<Record<EventField, readonly FieldEvidence[]>> = {};
  for (const fieldName of Object.keys(candidate.fieldLocations)) {
    if (!isEventField(fieldName)) {
      continue;
    }
    const field = fieldName;
    const location = candidate.fieldLocations[field];
    if (location === undefined) {
      continue;
    }
    evidence[field] =
      mode === "snippets"
        ? [{ source, location, excerpt: sourceText.slice(0, 160) }]
        : [{ source, location }];
  }
  return evidence;
}

export function candidateHasRequiredFields(
  candidate: Candidate,
): candidate is Candidate & {
  readonly title: string;
  readonly schedule: EventSchedule;
  readonly startTime: string;
  readonly endTime: string;
} {
  return (
    candidate.title !== undefined &&
    candidate.schedule !== undefined &&
    candidate.startTime !== undefined &&
    candidate.endTime !== undefined
  );
}

export function candidateToUnresolvedText(
  candidate: Candidate,
  field: EventField,
): string {
  return candidate.fieldText[field] ?? "";
}

export type CandidateEventShape = Pick<
  TimetableEvent,
  "title" | "schedule" | "startTime" | "endTime"
>;
