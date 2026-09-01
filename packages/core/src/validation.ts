import { parseDate } from "./parser/date.js";
import { makeWarning } from "./parser/warnings.js";
import { timeToMinutes } from "./parser/time.js";
import type {
  EventSchedule,
  ParseWarning,
  TermRange,
  TimeZone,
  TimetableEvent,
  Weekday,
} from "./schema/types.js";

type ValidationContext = {
  readonly timezone: TimeZone;
  readonly term?: TermRange;
};

function validTimezone(timezone: string): boolean {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return formatter.resolvedOptions().timeZone.length > 0;
  } catch (error) {
    if (error instanceof RangeError) {
      return false;
    }
    throw error;
  }
}

function validDate(value: string): boolean {
  return (
    parseDate(value, { id: "iso", dayAliases: {}, dateOrder: "YMD" }).kind ===
    "ok"
  );
}

function validWeekday(value: Weekday): boolean {
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

function scheduleWarnings(
  event: TimetableEvent,
  term: TermRange | undefined,
): readonly ParseWarning[] {
  const warnings: ParseWarning[] = [];
  const schedule: EventSchedule = event.schedule;
  switch (schedule.kind) {
    case "weekly":
      if (
        schedule.weekdays.length === 0 ||
        schedule.weekdays.some((day) => !validWeekday(day))
      ) {
        warnings.push(
          makeWarning({
            code: "UNKNOWN_DAY_LABEL",
            severity: "error",
            message: "The event has no valid weekday schedule.",
            eventId: event.id,
            field: "schedule",
          }),
        );
      }
      if (schedule.startsOn !== undefined && !validDate(schedule.startsOn)) {
        warnings.push(
          makeWarning({
            code: "INVALID_DATE",
            severity: "error",
            message: "The weekly schedule has an invalid start date.",
            eventId: event.id,
            field: "schedule",
          }),
        );
      }
      if (schedule.endsOn !== undefined && !validDate(schedule.endsOn)) {
        warnings.push(
          makeWarning({
            code: "INVALID_DATE",
            severity: "error",
            message: "The weekly schedule has an invalid end date.",
            eventId: event.id,
            field: "schedule",
          }),
        );
      }
      if (
        schedule.startsOn !== undefined &&
        schedule.endsOn !== undefined &&
        schedule.startsOn > schedule.endsOn
      ) {
        warnings.push(
          makeWarning({
            code: "INVALID_TERM_RANGE",
            severity: "error",
            message: "The weekly schedule ends before it starts.",
            eventId: event.id,
            field: "schedule",
          }),
        );
      }
      if (
        term !== undefined &&
        ((schedule.startsOn !== undefined &&
          schedule.startsOn < term.startsOn) ||
          (schedule.endsOn !== undefined && schedule.endsOn > term.endsOn))
      ) {
        warnings.push(
          makeWarning({
            code: "OUTSIDE_TERM_RANGE",
            severity: "warning",
            message: "The weekly schedule extends outside the selected term.",
            eventId: event.id,
            field: "schedule",
          }),
        );
      }
      return warnings;
    case "exact":
      if (schedule.exactDates.length === 0) {
        warnings.push(
          makeWarning({
            code: "INVALID_DATE",
            severity: "error",
            message: "The exact-date schedule is empty.",
            eventId: event.id,
            field: "schedule",
          }),
        );
      }
      for (const date of schedule.exactDates) {
        if (!validDate(date)) {
          warnings.push(
            makeWarning({
              code: "INVALID_DATE",
              severity: "error",
              message: "The event has an invalid exact date.",
              eventId: event.id,
              field: "schedule",
            }),
          );
        } else if (
          term !== undefined &&
          (date < term.startsOn || date > term.endsOn)
        ) {
          warnings.push(
            makeWarning({
              code: "OUTSIDE_TERM_RANGE",
              severity: "warning",
              message: "The event date is outside the selected term.",
              eventId: event.id,
              field: "schedule",
            }),
          );
        }
      }
      return warnings;
    default: {
      const exhaustive: never = schedule;
      return exhaustive;
    }
  }
}

export function validateTimetable(
  events: readonly TimetableEvent[],
  context: ValidationContext,
): readonly ParseWarning[] {
  const warnings: ParseWarning[] = [];
  if (!validTimezone(context.timezone)) {
    warnings.push(
      makeWarning({
        code: "INVALID_TIMEZONE",
        severity: "error",
        message: "The selected timezone is not a valid IANA timezone.",
        field: "timezone",
      }),
    );
  }
  if (context.term !== undefined) {
    if (!validDate(context.term.startsOn) || !validDate(context.term.endsOn)) {
      warnings.push(
        makeWarning({
          code: "INVALID_TERM_RANGE",
          severity: "error",
          message: "The term contains an invalid date.",
          field: "schedule",
        }),
      );
    } else if (context.term.startsOn > context.term.endsOn) {
      warnings.push(
        makeWarning({
          code: "INVALID_TERM_RANGE",
          severity: "error",
          message: "The term ends before it starts.",
          field: "schedule",
        }),
      );
    }
  }
  for (const event of events) {
    if (event.title.trim().length === 0) {
      warnings.push(
        makeWarning({
          code: "MISSING_TITLE",
          severity: "error",
          message: "The event has no title.",
          eventId: event.id,
          field: "title",
        }),
      );
    }
    const start = timeToMinutes(event.startTime);
    const end = timeToMinutes(event.endTime);
    if (start === undefined) {
      warnings.push(
        makeWarning({
          code: "MISSING_START_TIME",
          severity: "error",
          message: "The event has no valid start time.",
          eventId: event.id,
          field: "startTime",
        }),
      );
    }
    if (end === undefined) {
      warnings.push(
        makeWarning({
          code: "MISSING_END_TIME",
          severity: "error",
          message: "The event has no valid end time.",
          eventId: event.id,
          field: "endTime",
        }),
      );
    }
    if (start !== undefined && end !== undefined && end <= start) {
      warnings.push(
        makeWarning({
          code: "INVALID_TIME_RANGE",
          severity: "error",
          message: "The event ends at or before its start time.",
          eventId: event.id,
          field: "endTime",
        }),
      );
    }
    if (!validTimezone(event.timezone)) {
      warnings.push(
        makeWarning({
          code: "INVALID_TIMEZONE",
          severity: "error",
          message: "The event timezone is not a valid IANA timezone.",
          eventId: event.id,
          field: "timezone",
        }),
      );
    }
    if (
      event.confidence < 0 ||
      event.confidence > 1 ||
      !Number.isFinite(event.confidence)
    ) {
      warnings.push(
        makeWarning({
          code: "LOW_CONFIDENCE",
          severity: "warning",
          message: "The event confidence is outside the supported range.",
          eventId: event.id,
        }),
      );
    } else if (event.confidence < 0.72) {
      warnings.push(
        makeWarning({
          code: "LOW_CONFIDENCE",
          severity: "warning",
          message: "The event has low deterministic confidence.",
          eventId: event.id,
        }),
      );
    }
    warnings.push(...scheduleWarnings(event, context.term));
  }
  return warnings;
}
