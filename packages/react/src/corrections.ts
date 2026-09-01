import { detectConflicts, validateTimetable } from "@ndycode/timetablekit";
import type {
  EventField,
  ParseWarning,
  TimetableEvent,
  TimetableParseResult,
  WarningCode,
} from "@ndycode/timetablekit";
import type { EditableEventField, EventCorrection } from "./types.js";

const VALIDATION_WARNING_CODES: ReadonlySet<WarningCode> = new Set([
  "INVALID_TIMEZONE",
  "INVALID_TERM_RANGE",
  "MISSING_TITLE",
  "MISSING_START_TIME",
  "MISSING_END_TIME",
  "INVALID_TIME_RANGE",
  "LOW_CONFIDENCE",
  "CONFLICT_LIMIT",
  "UNKNOWN_DAY_LABEL",
  "INVALID_DATE",
  "OUTSIDE_TERM_RANGE",
]);

function warningForConflict(conflictId: string): ParseWarning {
  return {
    code: "SCHEDULE_CONFLICT",
    severity: "error",
    message: "Two events overlap on the same occurrence.",
    details: { conflictId },
  };
}

function hasConflictWarning(
  warnings: readonly ParseWarning[],
  conflictId: string,
): boolean {
  return warnings.some(
    (warning) =>
      warning.code === "SCHEDULE_CONFLICT" &&
      warning.details?.["conflictId"] === conflictId,
  );
}

export function warningsForResult(
  result: TimetableParseResult,
): readonly ParseWarning[] {
  const missingConflictWarnings = result.conflicts
    .filter((conflict) => !hasConflictWarning(result.warnings, conflict.id))
    .map((conflict) => warningForConflict(conflict.id));
  return [...result.warnings, ...missingConflictWarnings];
}

export function warningForEventField(
  result: TimetableParseResult,
  eventId: string,
  field: EditableEventField,
): ParseWarning | undefined {
  return warningsForResult(result).find(
    (warning) => warning.eventId === eventId && warning.field === field,
  );
}

export function warningsForEvent(
  result: TimetableParseResult,
  eventId: string,
): readonly ParseWarning[] {
  return warningsForResult(result).filter(
    (warning) => warning.eventId === eventId,
  );
}

export function formatWarningCode(warning: ParseWarning): string {
  return warning.code.replaceAll("_", " ");
}

type OptionalTextField = Exclude<
  EventField,
  "title" | "schedule" | "startTime" | "endTime" | "timezone"
>;

function updateOptionalTextField(
  event: TimetableEvent,
  field: OptionalTextField,
  value: string,
): TimetableEvent {
  const normalized = value.trim();
  switch (field) {
    case "code":
      return normalized.length === 0
        ? (() => {
            const { code: _code, ...withoutCode } = event;
            return withoutCode;
          })()
        : { ...event, code: normalized };
    case "eventType":
      return normalized.length === 0
        ? (() => {
            const { eventType: _eventType, ...withoutEventType } = event;
            return withoutEventType;
          })()
        : { ...event, eventType: normalized };
    case "location":
      return normalized.length === 0
        ? (() => {
            const { location: _location, ...withoutLocation } = event;
            return withoutLocation;
          })()
        : { ...event, location: normalized };
    case "instructor":
      return normalized.length === 0
        ? (() => {
            const { instructor: _instructor, ...withoutInstructor } = event;
            return withoutInstructor;
          })()
        : { ...event, instructor: normalized };
    case "notes":
      return normalized.length === 0
        ? (() => {
            const { notes: _notes, ...withoutNotes } = event;
            return withoutNotes;
          })()
        : { ...event, notes: normalized };
    default: {
      const exhaustive: never = field;
      return exhaustive;
    }
  }
}

function updateEvent(
  event: TimetableEvent,
  correction: EventCorrection,
): TimetableEvent {
  switch (correction.field) {
    case "title":
      return { ...event, title: correction.value };
    case "code":
    case "eventType":
    case "location":
    case "instructor":
    case "notes":
      return updateOptionalTextField(event, correction.field, correction.value);
    case "schedule":
      return { ...event, schedule: correction.value };
    case "startTime":
      return { ...event, startTime: correction.value.trim() };
    case "endTime":
      return { ...event, endTime: correction.value.trim() };
    case "timezone":
      return { ...event, timezone: correction.value.trim() };
    default: {
      const exhaustive: never = correction;
      return exhaustive;
    }
  }
}

function deterministicConfidence(events: readonly TimetableEvent[]): number {
  if (events.length === 0) {
    return 0;
  }
  return (
    events.reduce((sum, event) => sum + event.confidence, 0) / events.length
  );
}

function warningIsForCorrection(
  warning: ParseWarning,
  correction: EventCorrection,
): boolean {
  return (
    warning.eventId === correction.eventId && warning.field === correction.field
  );
}

function recalculateResult(
  result: TimetableParseResult,
  events: readonly TimetableEvent[],
  correction: EventCorrection,
): TimetableParseResult {
  const preservedWarnings = result.warnings.filter(
    (warning) =>
      warning.code !== "SCHEDULE_CONFLICT" &&
      !VALIDATION_WARNING_CODES.has(warning.code) &&
      !warningIsForCorrection(warning, correction),
  );
  const validationWarnings = validateTimetable(events, {
    timezone: result.timezone,
    ...(result.term === undefined ? {} : { term: result.term }),
  });
  const conflicts = detectConflicts(
    events,
    result.term === undefined ? {} : { term: result.term },
  );
  return {
    ...result,
    events,
    warnings: [
      ...preservedWarnings,
      ...validationWarnings,
      ...conflicts.map((conflict) => warningForConflict(conflict.id)),
    ],
    conflicts,
    parse: {
      ...result.parse,
      deterministicConfidence: deterministicConfidence(events),
    },
  };
}

export function applyEventCorrection(
  result: TimetableParseResult,
  correction: EventCorrection,
): TimetableParseResult {
  let found = false;
  const events = result.events.map((event) => {
    if (event.id !== correction.eventId) {
      return event;
    }
    found = true;
    return updateEvent(event, correction);
  });
  return found ? recalculateResult(result, events, correction) : result;
}
