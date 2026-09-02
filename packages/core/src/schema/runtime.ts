import {
  OptionsValidationError,
  SchemaValidationError,
  TimetableError,
} from "../errors.js";
import { z } from "zod";
import type {
  EventCorrection,
  ExtractionArtifact,
  FieldEvidence,
  FieldValue,
  ParseOptions,
  RecoveryRequest,
  RecoveryResponse,
  ResourceLimits,
  ResourceLimitsOverrides,
  TimetableEvent,
  TimetableInput,
  TimetableParseResult,
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
  schema: z.ZodType<T>,
  createError: () => SchemaValidationError = () =>
    new SchemaValidationError(name),
): RuntimeSchema<T> {
  return {
    name,
    parse(value: unknown): T {
      try {
        const parsed = schema.safeParse(value);
        if (parsed.success) return parsed.data;
      } catch (error) {
        if (error instanceof SchemaValidationError) throw error;
      }
      throw createError();
    },
    safeParse(value: unknown): SafeParseResult<T> {
      try {
        const parsed = schema.safeParse(value);
        return parsed.success
          ? { success: true, data: parsed.data }
          : { success: false, error: createError() };
      } catch {
        return { success: false, error: createError() };
      }
    },
  };
}

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const localTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u);
const weekdaySchema = z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);
const sourceLocationSchema = z
  .object({
    page: z.number().int().positive().optional(),
    line: z.number().int().positive().optional(),
    charStart: z.number().int().nonnegative().optional(),
    charEnd: z.number().int().nonnegative().optional(),
    bounds: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
        width: z.number().nonnegative().finite(),
        height: z.number().nonnegative().finite(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((location, context) => {
    if (
      location.charStart !== undefined &&
      location.charEnd !== undefined &&
      location.charEnd < location.charStart
    ) {
      context.addIssue({
        code: "custom",
        message: "charEnd must not be before charStart.",
      });
    }
  });

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

const correctionDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/u);

const correctionOptionalDateSchema = z
  .string()
  .trim()
  .refine((value) => value.length === 0 || /^\d{4}-\d{2}-\d{2}$/u.test(value));

const correctionScheduleSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("weekly"),
      weekdays: z.array(weekdaySchema).min(1),
      startsOn: correctionOptionalDateSchema.optional(),
      endsOn: correctionOptionalDateSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("exact"),
      exactDates: z.array(correctionDateSchema).min(1),
    })
    .strict(),
]);

const correctionOptionalStringFieldSchema = z.enum([
  "code",
  "eventType",
  "location",
  "instructor",
  "notes",
]);

export const eventCorrectionSchema = z.union([
  z
    .object({
      eventId: z.string().min(1),
      field: correctionOptionalStringFieldSchema,
      value: z.string(),
    })
    .strict(),
  z
    .object({
      eventId: z.string().min(1),
      field: z.literal("title"),
      value: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      eventId: z.string().min(1),
      field: z.enum(["startTime", "endTime"]),
      value: z
        .string()
        .trim()
        .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u),
    })
    .strict(),
  z
    .object({
      eventId: z.string().min(1),
      field: z.literal("timezone"),
      value: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      eventId: z.string().min(1),
      field: z.literal("schedule"),
      value: correctionScheduleSchema,
    })
    .strict(),
]);

const warningCodeSchema = z.enum([
  "UNSUPPORTED_FILE_TYPE",
  "UNRECOGNIZED_CSV",
  "FILE_TOO_LARGE",
  "TOO_MANY_PAGES",
  "NO_TEXT_FOUND",
  "NO_EVENTS_FOUND",
  "LOW_CONFIDENCE",
  "UNKNOWN_DAY_LABEL",
  "UNKNOWN_LOCALE",
  "AMBIGUOUS_TIME",
  "MISSING_TITLE",
  "MISSING_START_TIME",
  "MISSING_END_TIME",
  "INVALID_TIME_RANGE",
  "INVALID_DATE",
  "INVALID_TERM_RANGE",
  "INVALID_TIMEZONE",
  "DUPLICATE_EVENT",
  "POSSIBLE_DUPLICATE",
  "SCHEDULE_CONFLICT",
  "CONFLICT_LIMIT",
  "OUTSIDE_TERM_RANGE",
  "OCR_PARTIAL",
  "UNSUPPORTED_PROVIDER",
  "PROVIDER_FAILED",
  "PROVIDER_ABORTED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_OUTPUT_INVALID",
  "AI_PROVIDER_UNAVAILABLE",
  "AI_RECOVERY_SKIPPED",
  "AI_OUTPUT_INVALID",
]);

const evidenceSchema = z
  .object({
    source: sourceDescriptorSchema,
    location: sourceLocationSchema,
    excerpt: z.string().optional(),
  })
  .strict();

const evidenceMapSchema = z
  .object({
    title: z.array(evidenceSchema).optional(),
    code: z.array(evidenceSchema).optional(),
    eventType: z.array(evidenceSchema).optional(),
    schedule: z.array(evidenceSchema).optional(),
    startTime: z.array(evidenceSchema).optional(),
    endTime: z.array(evidenceSchema).optional(),
    timezone: z.array(evidenceSchema).optional(),
    location: z.array(evidenceSchema).optional(),
    instructor: z.array(evidenceSchema).optional(),
    notes: z.array(evidenceSchema).optional(),
  })
  .strict()
  .transform((value) => {
    const result: Record<string, readonly FieldEvidence[]> = {};
    for (const [field, evidence] of Object.entries(value)) {
      if (evidence !== undefined) result[field] = evidence;
    }
    return result;
  });

const fieldConfidenceSchema = z
  .object({
    title: z.number().min(0).max(1).optional(),
    code: z.number().min(0).max(1).optional(),
    eventType: z.number().min(0).max(1).optional(),
    schedule: z.number().min(0).max(1).optional(),
    startTime: z.number().min(0).max(1).optional(),
    endTime: z.number().min(0).max(1).optional(),
    timezone: z.number().min(0).max(1).optional(),
    location: z.number().min(0).max(1).optional(),
    instructor: z.number().min(0).max(1).optional(),
    notes: z.number().min(0).max(1).optional(),
  })
  .strict()
  .transform((value) => {
    const result: Record<string, number> = {};
    for (const [field, confidence] of Object.entries(value)) {
      if (confidence !== undefined) result[field] = confidence;
    }
    return result;
  });

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
    confidence: z.number().finite().min(0).max(1),
    fieldConfidence: fieldConfidenceSchema,
    evidence: evidenceMapSchema,
  })
  .strict();

const warningSchema = z
  .object({
    code: warningCodeSchema,
    severity: z.enum(["info", "warning", "error"]),
    message: z.string().min(1),
    eventId: z.string().min(1).optional(),
    field: eventFieldSchema.optional(),
    source: sourceLocationSchema.optional(),
    details: z
      .record(
        z.string(),
        z.union([z.string(), z.number().finite(), z.boolean()]),
      )
      .optional(),
  })
  .strict();

const conflictSchema = z
  .object({
    code: z.literal("SCHEDULE_CONFLICT"),
    id: z.string().min(1),
    eventIds: z.tuple([z.string().min(1), z.string().min(1)]),
    occurrence: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("weekday"), weekday: weekdaySchema }).strict(),
      z.object({ kind: z.literal("date"), date: isoDateSchema }).strict(),
    ]),
    overlap: z
      .object({ startsAt: localTimeSchema, endsAt: localTimeSchema })
      .strict(),
  })
  .strict();

const parseStageSchema = z.enum([
  "preflight",
  "extract",
  "normalize",
  "segment",
  "recognize",
  "assemble",
  "locale",
  "deduplicate",
  "validate",
  "conflicts",
  "confidence",
  "recovery",
  "finalize",
]);

const stageSchema = z
  .object({
    stage: parseStageSchema,
    status: z.enum(["completed", "skipped", "failed"]),
    durationMs: z.number().nonnegative().finite(),
    warningCount: z.number().int().nonnegative().finite(),
    providerId: z.string().min(1).optional(),
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
        durationMs: z.number().nonnegative().finite(),
        deterministicConfidence: z.number().min(0).max(1),
        aiRecoveryUsed: z.boolean(),
        providersUsed: z.array(z.string().min(1)),
        stageReports: z.array(stageSchema),
      })
      .strict(),
  })
  .strict();

const resourceLimitNumber = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

export const resourceLimitsSchema = z
  .object({
    maxInputBytes: resourceLimitNumber,
    maxImagePixels: resourceLimitNumber,
    maxPdfPages: resourceLimitNumber,
    timeoutMs: resourceLimitNumber,
    maxOutputBytes: resourceLimitNumber,
  })
  .strict();

export const resourceLimitsOverridesSchema = z
  .object({
    maxInputBytes: resourceLimitNumber.optional(),
    maxImagePixels: resourceLimitNumber.optional(),
    maxPdfPages: resourceLimitNumber.optional(),
    timeoutMs: resourceLimitNumber.optional(),
    maxOutputBytes: resourceLimitNumber.optional(),
  })
  .strict();

function isAbortSignal(value: unknown): value is AbortSignal {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    readonly aborted?: unknown;
    readonly addEventListener?: unknown;
    readonly removeEventListener?: unknown;
  };
  return (
    typeof candidate.aborted === "boolean" &&
    typeof candidate.addEventListener === "function" &&
    typeof candidate.removeEventListener === "function"
  );
}

const recoveryOptionsSchema = z
  .object({
    enabled: z.boolean(),
    consent: z.boolean(),
    maxFields: resourceLimitNumber.max(32).optional(),
  })
  .strict();

export const parseOptionsSchema = z
  .object({
    locale: z.string().min(1),
    timezone: z.string().min(1),
    term: termRangeSchema.optional(),
    evidence: z.enum(["none", "locations", "snippets"]).optional(),
    limits: resourceLimitsOverridesSchema.optional(),
    signal: z.custom<AbortSignal>(isAbortSignal).optional(),
    onProgress: z
      .custom<NonNullable<ParseOptions["onProgress"]>>(
        (value) => typeof value === "function",
      )
      .optional(),
    recovery: recoveryOptionsSchema.optional(),
  })
  .strict();

const textLineSchema = z
  .object({ text: z.string(), location: sourceLocationSchema })
  .strict();
const textPageSchema = z
  .object({
    pageNumber: z.number().int().positive().optional(),
    lines: z.array(textLineSchema),
  })
  .strict();
const textDocumentSchema = z
  .object({ source: sourceDescriptorSchema, pages: z.array(textPageSchema) })
  .strict();

export const extractionArtifactSchema = z
  .object({
    providerId: z.string().min(1),
    document: textDocumentSchema,
    warnings: z.array(warningSchema),
  })
  .strict();

const recoveryStringFieldSchema = z.enum([
  "title",
  "code",
  "eventType",
  "startTime",
  "endTime",
  "timezone",
  "location",
  "instructor",
  "notes",
]);

export const recoveryPatchSchema = z.union([
  z
    .object({
      eventId: z.string().min(1),
      field: recoveryStringFieldSchema,
      value: z.string(),
      confidence: z.number().finite().min(0).max(1),
    })
    .strict(),
  z
    .object({
      eventId: z.string().min(1),
      field: z.literal("schedule"),
      value: scheduleSchema,
      confidence: z.number().finite().min(0).max(1),
    })
    .strict(),
]);

export const recoveryResponseSchema = z
  .object({ patches: z.array(recoveryPatchSchema).max(32) })
  .strict();

const unresolvedFieldSchema = z
  .object({
    eventId: z.string().min(1),
    field: eventFieldSchema,
    candidateText: z.string(),
    evidence: z.array(evidenceSchema),
  })
  .strict();

export const recoveryRequestSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    locale: z.string().min(1),
    timezone: z.string().min(1),
    unresolved: z.array(unresolvedFieldSchema).max(32),
  })
  .strict();

const fieldValueSchema = z.union([
  z.string(),
  scheduleSchema,
  z.array(weekdaySchema),
  z.array(isoDateSchema),
]);

export {
  fieldValueSchema,
  sourceLocationSchema,
  sourceDescriptorSchema,
  termRangeSchema,
  scheduleSchema,
};
export const fieldEvidenceSchema = evidenceSchema;
export { textLineSchema, textPageSchema, textDocumentSchema };

export const TimetableInputSchema = createSchema<TimetableInput>(
  "TimetableInput",
  timetableInputSchema,
);
export const TimetableEventSchema = createSchema<TimetableEvent>(
  "TimetableEvent",
  timetableEventSchema,
);
export const EventCorrectionSchema = createSchema<EventCorrection>(
  "EventCorrection",
  eventCorrectionSchema,
);
export const TimetableParseResultSchema = createSchema<TimetableParseResult>(
  "TimetableParseResult",
  timetableParseResultSchema,
);

export function parseExportResult(value: unknown): TimetableParseResult {
  try {
    return TimetableParseResultSchema.parse(value);
  } catch (error) {
    if (error instanceof SchemaValidationError) {
      throw new TimetableError(
        "EXPORT_INVALID_RESULT",
        "The timetable result is invalid for export.",
      );
    }
    throw error;
  }
}

export const FieldValueSchema = createSchema<FieldValue>(
  "FieldValue",
  fieldValueSchema,
);
export const ParseOptionsSchema = createSchema<ParseOptions>(
  "ParseOptions",
  parseOptionsSchema,
  () => new OptionsValidationError(),
);
export const ResourceLimitsOverridesSchema =
  createSchema<ResourceLimitsOverrides>(
    "ResourceLimitsOverrides",
    resourceLimitsOverridesSchema,
    () => new OptionsValidationError("ResourceLimits"),
  );
export const ResourceLimitsSchema = createSchema<ResourceLimits>(
  "ResourceLimits",
  resourceLimitsSchema,
);
export const ExtractionArtifactSchema = createSchema<ExtractionArtifact>(
  "ExtractionArtifact",
  extractionArtifactSchema,
);
export const RecoveryRequestSchema = createSchema<RecoveryRequest>(
  "RecoveryRequest",
  recoveryRequestSchema,
);
export const RecoveryResponseSchema = createSchema<RecoveryResponse>(
  "RecoveryResponse",
  recoveryResponseSchema,
);
