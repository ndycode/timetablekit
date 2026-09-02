import { DEFAULT_MAX_CONFLICTS, detectConflictsBounded } from "./conflicts.js";
import { EventCorrectionSchema } from "./schema/runtime.js";
import type {
  EventCorrection,
  EventField,
  EventSchedule,
  ParseWarning,
  ResultAssessment,
  ResultAssessmentReason,
  TimetableEvent,
  TimetableParseResult,
  WarningCode,
} from "./schema/types.js";
import { WEEKDAYS } from "./schema/types.js";
import { validateTimetable } from "./validation.js";

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

function warningForConflictLimit(): ParseWarning {
  return {
    code: "CONFLICT_LIMIT",
    severity: "warning",
    message: "Conflict detection was limited by resource bounds.",
    details: { limit: DEFAULT_MAX_CONFLICTS },
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
  field: EventField,
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

export function assessTimetableResult(
  result: TimetableParseResult,
): ResultAssessment {
  const reasons: ResultAssessmentReason[] = [];
  if (result.events.length === 0) reasons.push("NO_EVENTS");
  if (
    warningsForResult(result).some((warning) => warning.severity === "error")
  ) {
    reasons.push("ERROR_WARNINGS");
  }
  if (reasons.length === 0) {
    return Object.freeze({
      status: "usable" as const,
      reasons: Object.freeze([]),
    });
  }
  return Object.freeze({
    status: "unusable" as const,
    reasons: Object.freeze(reasons),
  });
}

function canonicalOptionalDate(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function canonicalSchedule(schedule: EventSchedule): EventSchedule {
  switch (schedule.kind) {
    case "weekly": {
      const startsOn = canonicalOptionalDate(schedule.startsOn);
      const endsOn = canonicalOptionalDate(schedule.endsOn);
      return {
        kind: "weekly",
        weekdays: WEEKDAYS.filter((day) => schedule.weekdays.includes(day)),
        ...(startsOn === undefined ? {} : { startsOn }),
        ...(endsOn === undefined ? {} : { endsOn }),
      };
    }
    case "exact":
      return {
        kind: "exact",
        exactDates: [
          ...new Set(
            schedule.exactDates
              .map((date) => date.trim())
              .filter((date) => date.length > 0),
          ),
        ].sort((left, right) => left.localeCompare(right)),
      };
    default: {
      const exhaustive: never = schedule;
      return exhaustive;
    }
  }
}

function schedulesEqual(left: EventSchedule, right: EventSchedule): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "weekly" && right.kind === "weekly") {
    return (
      left.startsOn === right.startsOn &&
      left.endsOn === right.endsOn &&
      left.weekdays.length === right.weekdays.length &&
      left.weekdays.every((day, index) => day === right.weekdays[index])
    );
  }
  if (left.kind === "exact" && right.kind === "exact") {
    return (
      left.exactDates.length === right.exactDates.length &&
      left.exactDates.every((date, index) => date === right.exactDates[index])
    );
  }
  return false;
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
      if (normalized.length === 0) {
        if (event.code === undefined) return event;
        const { code: _code, ...withoutCode } = event;
        return withoutCode;
      }
      return event.code === normalized ? event : { ...event, code: normalized };
    case "eventType":
      if (normalized.length === 0) {
        if (event.eventType === undefined) return event;
        const { eventType: _eventType, ...withoutEventType } = event;
        return withoutEventType;
      }
      return event.eventType === normalized
        ? event
        : { ...event, eventType: normalized };
    case "location":
      if (normalized.length === 0) {
        if (event.location === undefined) return event;
        const { location: _location, ...withoutLocation } = event;
        return withoutLocation;
      }
      return event.location === normalized
        ? event
        : { ...event, location: normalized };
    case "instructor":
      if (normalized.length === 0) {
        if (event.instructor === undefined) return event;
        const { instructor: _instructor, ...withoutInstructor } = event;
        return withoutInstructor;
      }
      return event.instructor === normalized
        ? event
        : { ...event, instructor: normalized };
    case "notes":
      if (normalized.length === 0) {
        if (event.notes === undefined) return event;
        const { notes: _notes, ...withoutNotes } = event;
        return withoutNotes;
      }
      return event.notes === normalized
        ? event
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
    case "title": {
      const value = correction.value.trim();
      return event.title === value ? event : { ...event, title: value };
    }
    case "code":
    case "eventType":
    case "location":
    case "instructor":
    case "notes":
      return updateOptionalTextField(event, correction.field, correction.value);
    case "schedule": {
      const schedule = canonicalSchedule(correction.value);
      return schedulesEqual(canonicalSchedule(event.schedule), schedule)
        ? event
        : { ...event, schedule };
    }
    case "startTime": {
      const value = correction.value.trim();
      return event.startTime === value ? event : { ...event, startTime: value };
    }
    case "endTime": {
      const value = correction.value.trim();
      return event.endTime === value ? event : { ...event, endTime: value };
    }
    case "timezone": {
      const value = correction.value.trim();
      return event.timezone === value ? event : { ...event, timezone: value };
    }
    default: {
      const exhaustive: never = correction;
      return exhaustive;
    }
  }
}

function deterministicConfidence(events: readonly TimetableEvent[]): number {
  if (events.length === 0) return 0;
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

function compareWarnings(left: ParseWarning, right: ParseWarning): number {
  return [
    left.code,
    left.eventId ?? "",
    left.field ?? "",
    left.source?.line ?? 0,
    left.message,
  ]
    .join("\u001f")
    .localeCompare(
      [
        right.code,
        right.eventId ?? "",
        right.field ?? "",
        right.source?.line ?? 0,
        right.message,
      ].join("\u001f"),
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
      !(
        warning.source === undefined &&
        VALIDATION_WARNING_CODES.has(warning.code)
      ) &&
      !warningIsForCorrection(warning, correction),
  );
  const validationWarnings = validateTimetable(events, {
    timezone: result.timezone,
    ...(result.term === undefined ? {} : { term: result.term }),
  });
  const detected = detectConflictsBounded(
    events,
    result.term === undefined
      ? { maxConflicts: DEFAULT_MAX_CONFLICTS }
      : { term: result.term, maxConflicts: DEFAULT_MAX_CONFLICTS },
  );
  return {
    ...result,
    events,
    warnings: [
      ...preservedWarnings,
      ...validationWarnings,
      ...detected.conflicts.map((conflict) => warningForConflict(conflict.id)),
      ...(detected.truncated ? [warningForConflictLimit()] : []),
    ].sort(compareWarnings),
    conflicts: detected.conflicts,
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
  const validatedCorrection = EventCorrectionSchema.parse(correction);
  let changed = false;
  const events = result.events.map((event) => {
    if (event.id !== validatedCorrection.eventId) return event;
    const updated = updateEvent(event, validatedCorrection);
    if (updated !== event) changed = true;
    return updated;
  });
  return changed
    ? recalculateResult(result, events, validatedCorrection)
    : result;
}
