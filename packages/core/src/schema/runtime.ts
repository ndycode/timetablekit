import { SchemaValidationError } from "../errors.js";
import { z } from "zod";
import type {
  EventSchedule,
  FieldEvidence,
  FieldValue,
  ParseWarning,
  ScheduleConflict,
  TimetableEvent,
  TimetableInput,
  TimetableParseResult,
  Weekday,
} from "./types.js";

export type SafeParseSuccess<T> = {
  readonly success: true;
  readonly data: T;
};

export type SafeParseFailure = {
  readonly success: false;
  readonly error: SchemaValidationError;
};

export type SafeParseResult<T> = SafeParseSuccess<T> | SafeParseFailure;

export interface RuntimeSchema<T> {
  readonly name: string;
  parse(value: unknown): T;
  safeParse(value: unknown): SafeParseResult<T>;
}

function createSchema<T>(
  name: string,
  guard: (value: unknown) => value is T,
): RuntimeSchema<T> {
  return {
    name,
    parse(value: unknown): T {
      if (!guard(value)) {
        throw new SchemaValidationError(name);
      }
      return value;
    },
    safeParse(value: unknown): SafeParseResult<T> {
      if (guard(value)) {
        return { success: true, data: value };
      }
      return { success: false, error: new SchemaValidationError(name) };
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isString);
}

function isWeekday(value: unknown): value is Weekday {
  return (
    value === "MO" ||
    value === "TU" ||
    value === "WE" ||
    value === "TH" ||
    value === "FR" ||
    value === "SA" ||
    value === "SU"
  );
}

function isSourceLocation(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const bounds = value["bounds"];
  return (
    (value["page"] === undefined || isNumber(value["page"])) &&
    (value["line"] === undefined || isNumber(value["line"])) &&
    (value["charStart"] === undefined || isNumber(value["charStart"])) &&
    (value["charEnd"] === undefined || isNumber(value["charEnd"])) &&
    (bounds === undefined ||
      (isRecord(bounds) &&
        isNumber(bounds["x"]) &&
        isNumber(bounds["y"]) &&
        isNumber(bounds["width"]) &&
        isNumber(bounds["height"])))
  );
}

function isSourceDescriptor(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value["kind"] === "text" ||
      value["kind"] === "csv" ||
      value["kind"] === "image" ||
      value["kind"] === "pdf") &&
    (value["filename"] === undefined || isString(value["filename"])) &&
    (value["mimeType"] === undefined || isString(value["mimeType"])) &&
    (value["pageCount"] === undefined || isNumber(value["pageCount"]))
  );
}

function isEventSchedule(value: unknown): value is EventSchedule {
  if (
    !isRecord(value) ||
    (!isStringArray(value["weekdays"]) && value["kind"] === "weekly")
  ) {
    return false;
  }
  if (value["kind"] === "weekly") {
    const weekdays = value["weekdays"];
    return (
      Array.isArray(weekdays) &&
      weekdays.every(isWeekday) &&
      (value["startsOn"] === undefined || isString(value["startsOn"])) &&
      (value["endsOn"] === undefined || isString(value["endsOn"]))
    );
  }
  if (value["kind"] === "exact") {
    const exactDates = value["exactDates"];
    return Array.isArray(exactDates) && exactDates.every(isString);
  }
  return false;
}

function isFieldEvidence(value: unknown): value is FieldEvidence {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isSourceDescriptor(value["source"]) &&
    isSourceLocation(value["location"]) &&
    (value["excerpt"] === undefined || isString(value["excerpt"]))
  );
}

function isEvidenceMap(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return Object.values(value).every(
    (entry) => Array.isArray(entry) && entry.every(isFieldEvidence),
  );
}

function isFieldConfidence(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return Object.values(value).every(
    (entry) => isNumber(entry) && entry >= 0 && entry <= 1,
  );
}

function isTimetableEvent(value: unknown): value is TimetableEvent {
  if (!isRecord(value)) {
    return false;
  }
  const optionalStrings = [
    "code",
    "eventType",
    "location",
    "instructor",
    "notes",
  ];
  return (
    isString(value["id"]) &&
    isString(value["title"]) &&
    isEventSchedule(value["schedule"]) &&
    isString(value["startTime"]) &&
    isString(value["endTime"]) &&
    isString(value["timezone"]) &&
    isNumber(value["confidence"]) &&
    value["confidence"] >= 0 &&
    value["confidence"] <= 1 &&
    isFieldConfidence(value["fieldConfidence"]) &&
    isEvidenceMap(value["evidence"]) &&
    optionalStrings.every(
      (key) => value[key] === undefined || isString(value[key]),
    )
  );
}

function isWarning(value: unknown): value is ParseWarning {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isString(value["code"]) &&
    isString(value["severity"]) &&
    isString(value["message"]) &&
    (value["eventId"] === undefined || isString(value["eventId"])) &&
    (value["field"] === undefined || isString(value["field"])) &&
    (value["source"] === undefined || isSourceLocation(value["source"]))
  );
}

function isConflict(value: unknown): value is ScheduleConflict {
  if (!isRecord(value) || value["code"] !== "SCHEDULE_CONFLICT") {
    return false;
  }
  const eventIds = value["eventIds"];
  const occurrence = value["occurrence"];
  const overlap = value["overlap"];
  return (
    isString(value["id"]) &&
    Array.isArray(eventIds) &&
    eventIds.length === 2 &&
    eventIds.every(isString) &&
    isRecord(occurrence) &&
    ((occurrence["kind"] === "weekday" && isWeekday(occurrence["weekday"])) ||
      (occurrence["kind"] === "date" && isString(occurrence["date"]))) &&
    isRecord(overlap) &&
    isString(overlap["startsAt"]) &&
    isString(overlap["endsAt"])
  );
}

function isInput(value: unknown): value is TimetableInput {
  if (!isRecord(value) || !isString(value["kind"])) {
    return false;
  }
  if (value["kind"] === "text" || value["kind"] === "csv") {
    return (
      isString(value["text"]) &&
      (value["filename"] === undefined || isString(value["filename"])) &&
      (value["delimiter"] === undefined ||
        value["delimiter"] === "," ||
        value["delimiter"] === ";" ||
        value["delimiter"] === "\t")
    );
  }
  if (value["kind"] === "image") {
    return (
      value["bytes"] instanceof Uint8Array &&
      (value["mimeType"] === "image/png" ||
        value["mimeType"] === "image/jpeg" ||
        value["mimeType"] === "image/webp")
    );
  }
  if (value["kind"] === "pdf") {
    return (
      value["bytes"] instanceof Uint8Array &&
      value["mimeType"] === "application/pdf"
    );
  }
  return false;
}

function isFieldValue(value: unknown): value is FieldValue {
  return (
    isString(value) ||
    isEventSchedule(value) ||
    (Array.isArray(value) && value.every(isString))
  );
}

function isParseResult(value: unknown): value is TimetableParseResult {
  if (!isRecord(value)) {
    return false;
  }
  const parse = value["parse"];
  return (
    value["schemaVersion"] === "1.0" &&
    isSourceDescriptor(value["source"]) &&
    isString(value["timezone"]) &&
    isString(value["locale"]) &&
    (value["term"] === undefined ||
      (isRecord(value["term"]) &&
        isString(value["term"]["startsOn"]) &&
        isString(value["term"]["endsOn"]))) &&
    Array.isArray(value["events"]) &&
    value["events"].every(isTimetableEvent) &&
    Array.isArray(value["warnings"]) &&
    value["warnings"].every(isWarning) &&
    Array.isArray(value["conflicts"]) &&
    value["conflicts"].every(isConflict) &&
    isRecord(parse) &&
    isNumber(parse["durationMs"]) &&
    isNumber(parse["deterministicConfidence"]) &&
    parse["deterministicConfidence"] >= 0 &&
    parse["deterministicConfidence"] <= 1 &&
    typeof parse["aiRecoveryUsed"] === "boolean" &&
    isStringArray(parse["providersUsed"]) &&
    Array.isArray(parse["stageReports"])
  );
}

export const TimetableInputSchema = createSchema<TimetableInput>(
  "TimetableInput",
  isInput,
);
export const TimetableEventSchema = createSchema<TimetableEvent>(
  "TimetableEvent",
  isTimetableEvent,
);
export const TimetableParseResultSchema = createSchema<TimetableParseResult>(
  "TimetableParseResult",
  isParseResult,
);
export const FieldValueSchema = createSchema<FieldValue>(
  "FieldValue",
  isFieldValue,
);

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const localTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u);
const weekdaySchema = z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);
const sourceLocationSchema = z
  .object({
    page: z.number().int().nonnegative().optional(),
    line: z.number().int().nonnegative().optional(),
    charStart: z.number().int().nonnegative().optional(),
    charEnd: z.number().int().nonnegative().optional(),
    bounds: z
      .object({
        x: z.number(),
        y: z.number(),
        width: z.number().nonnegative(),
        height: z.number().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict();
const sourceDescriptorSchema = z
  .object({
    kind: z.enum(["text", "csv", "image", "pdf"]),
    filename: z.string().optional(),
    mimeType: z.string().optional(),
    pageCount: z.number().int().nonnegative().optional(),
  })
  .strict();
const termRangeSchema = z
  .object({ startsOn: isoDateSchema, endsOn: isoDateSchema })
  .strict();
const scheduleSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("weekly"),
      weekdays: z.array(weekdaySchema).min(1),
      startsOn: isoDateSchema.optional(),
      endsOn: isoDateSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("exact"),
      exactDates: z.array(isoDateSchema).min(1),
    })
    .strict(),
]);
const eventFieldSchema = z.enum([
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
]);
const evidenceSchema = z
  .object({
    source: sourceDescriptorSchema,
    location: sourceLocationSchema,
    excerpt: z.string().optional(),
  })
  .strict();
const evidenceMapSchema = z.record(z.string(), z.array(evidenceSchema));
const fieldConfidenceSchema = z.record(z.string(), z.number().min(0).max(1));
const eventSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    code: z.string().optional(),
    eventType: z.string().optional(),
    schedule: scheduleSchema,
    startTime: localTimeSchema,
    endTime: localTimeSchema,
    timezone: z.string().min(1),
    location: z.string().optional(),
    instructor: z.string().optional(),
    notes: z.string().optional(),
    confidence: z.number().min(0).max(1),
    fieldConfidence: fieldConfidenceSchema,
    evidence: evidenceMapSchema,
  })
  .strict();
const warningSchema = z
  .object({
    code: z.string().min(1),
    severity: z.enum(["info", "warning", "error"]),
    message: z.string().min(1),
    eventId: z.string().optional(),
    field: eventFieldSchema.optional(),
    source: sourceLocationSchema.optional(),
    details: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
  })
  .strict();
const conflictSchema = z
  .object({
    code: z.literal("SCHEDULE_CONFLICT"),
    id: z.string().min(1),
    eventIds: z.tuple([z.string(), z.string()]),
    occurrence: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("weekday"), weekday: weekdaySchema }).strict(),
      z.object({ kind: z.literal("date"), date: isoDateSchema }).strict(),
    ]),
    overlap: z
      .object({ startsAt: localTimeSchema, endsAt: localTimeSchema })
      .strict(),
  })
  .strict();
const stageSchema = z
  .object({
    stage: z.string().min(1),
    status: z.enum(["completed", "skipped", "failed"]),
    durationMs: z.number().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    providerId: z.string().optional(),
  })
  .strict();
const inputTextSchema = z
  .object({
    kind: z.literal("text"),
    text: z.string(),
    filename: z.string().optional(),
  })
  .strict();
const inputCsvSchema = z
  .object({
    kind: z.literal("csv"),
    text: z.string(),
    delimiter: z.enum([",", ";", "\t"]).optional(),
    filename: z.string().optional(),
  })
  .strict();
const inputImageSchema = z
  .object({
    kind: z.literal("image"),
    bytes: z.instanceof(Uint8Array),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    filename: z.string().optional(),
  })
  .strict();
const inputPdfSchema = z
  .object({
    kind: z.literal("pdf"),
    bytes: z.instanceof(Uint8Array),
    mimeType: z.literal("application/pdf"),
    filename: z.string().optional(),
  })
  .strict();

export const timetableInputSchema = z.discriminatedUnion("kind", [
  inputTextSchema,
  inputCsvSchema,
  inputImageSchema,
  inputPdfSchema,
]);
export const timetableEventSchema = eventSchema;
export const timetableParseResultSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    source: sourceDescriptorSchema,
    timezone: z.string().min(1),
    locale: z.string().min(1),
    term: termRangeSchema.optional(),
    events: z.array(eventSchema),
    warnings: z.array(warningSchema),
    conflicts: z.array(conflictSchema),
    parse: z
      .object({
        durationMs: z.number().nonnegative(),
        deterministicConfidence: z.number().min(0).max(1),
        aiRecoveryUsed: z.boolean(),
        providersUsed: z.array(z.string()),
        stageReports: z.array(stageSchema),
      })
      .strict(),
  })
  .strict();
export const fieldValueSchema = z.union([
  z.string(),
  scheduleSchema,
  z.array(weekdaySchema),
  z.array(isoDateSchema),
]);
