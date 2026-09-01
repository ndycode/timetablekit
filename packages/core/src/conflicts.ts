import { stableConflictId } from "./hash.js";
import { addDays, weekdayForDate } from "./parser/date.js";
import { timeToMinutes } from "./parser/time.js";
import type {
  EventSchedule,
  ScheduleConflict,
  TermRange,
  TimetableEvent,
  Weekday,
} from "./schema/types.js";

type Occurrence =
  | {
      readonly key: string;
      readonly kind: "weekday";
      readonly weekday: Weekday;
    }
  | { readonly key: string; readonly kind: "date"; readonly date: string };

export const DEFAULT_MAX_CONFLICTS = 1_000;

export type ConflictDetectionResult = {
  readonly conflicts: readonly ScheduleConflict[];
  readonly truncated: boolean;
};

function scheduleHasWeekday(
  schedule: EventSchedule,
  weekday: Weekday,
): boolean {
  return schedule.kind === "weekly" && schedule.weekdays.includes(weekday);
}

function dateIsInWeeklySchedule(
  schedule: EventSchedule,
  date: string,
): boolean {
  if (schedule.kind !== "weekly") {
    return false;
  }
  const weekday = weekdayForDate(date);
  if (weekday === undefined || !schedule.weekdays.includes(weekday)) {
    return false;
  }
  return (
    (schedule.startsOn === undefined || date >= schedule.startsOn) &&
    (schedule.endsOn === undefined || date <= schedule.endsOn)
  );
}

function* datesForTerm(term: TermRange): Iterable<string> {
  let current: string | undefined = term.startsOn;
  while (current !== undefined && current <= term.endsOn) {
    yield current;
    current = addDays(current, 1);
  }
}

function exactDates(schedule: EventSchedule): readonly string[] {
  return schedule.kind === "exact" ? schedule.exactDates : [];
}

function latestDate(
  values: readonly (string | undefined)[],
): string | undefined {
  const defined = values.filter(
    (value): value is string => value !== undefined,
  );
  defined.sort((left, right) => left.localeCompare(right));
  return defined[defined.length - 1];
}

function earliestDate(
  values: readonly (string | undefined)[],
): string | undefined {
  const defined = values.filter(
    (value): value is string => value !== undefined,
  );
  defined.sort((left, right) => left.localeCompare(right));
  return defined[0];
}

function* sharedOccurrences(
  left: TimetableEvent,
  right: TimetableEvent,
  term: TermRange | undefined,
): Iterable<Occurrence> {
  if (left.schedule.kind === "exact" && right.schedule.kind === "exact") {
    const rightDates = new Set(exactDates(right.schedule));
    for (const date of exactDates(left.schedule)) {
      if (rightDates.has(date)) yield { key: `d:${date}`, kind: "date", date };
    }
    return;
  }
  if (left.schedule.kind === "exact" && right.schedule.kind === "weekly") {
    for (const date of exactDates(left.schedule)) {
      if (
        (term === undefined ||
          (date >= term.startsOn && date <= term.endsOn)) &&
        dateIsInWeeklySchedule(right.schedule, date)
      ) {
        yield { key: `d:${date}`, kind: "date", date };
      }
    }
    return;
  }
  if (left.schedule.kind === "weekly" && right.schedule.kind === "exact") {
    for (const date of exactDates(right.schedule)) {
      if (
        (term === undefined ||
          (date >= term.startsOn && date <= term.endsOn)) &&
        dateIsInWeeklySchedule(left.schedule, date)
      ) {
        yield { key: `d:${date}`, kind: "date", date };
      }
    }
    return;
  }
  if (left.schedule.kind !== "weekly" || right.schedule.kind !== "weekly") {
    return;
  }
  if (term === undefined) {
    for (const weekday of left.schedule.weekdays) {
      if (scheduleHasWeekday(right.schedule, weekday)) {
        yield { key: `w:${weekday}`, kind: "weekday", weekday };
      }
    }
    return;
  }
  const sharedWeekdays = left.schedule.weekdays.filter((weekday) =>
    scheduleHasWeekday(right.schedule, weekday),
  );
  if (sharedWeekdays.length === 0) return;
  const startsOn = latestDate([
    term.startsOn,
    left.schedule.startsOn,
    right.schedule.startsOn,
  ]);
  const endsOn = earliestDate([
    term.endsOn,
    left.schedule.endsOn,
    right.schedule.endsOn,
  ]);
  if (startsOn === undefined || endsOn === undefined || startsOn > endsOn)
    return;
  for (const date of datesForTerm({ startsOn, endsOn })) {
    if (
      dateIsInWeeklySchedule(left.schedule, date) &&
      dateIsInWeeklySchedule(right.schedule, date)
    ) {
      yield { key: `d:${date}`, kind: "date", date };
    }
  }
}

function overlap(
  left: TimetableEvent,
  right: TimetableEvent,
): { readonly startsAt: string; readonly endsAt: string } | undefined {
  const leftStart = timeToMinutes(left.startTime);
  const leftEnd = timeToMinutes(left.endTime);
  const rightStart = timeToMinutes(right.startTime);
  const rightEnd = timeToMinutes(right.endTime);
  if (
    leftStart === undefined ||
    leftEnd === undefined ||
    rightStart === undefined ||
    rightEnd === undefined
  ) {
    return undefined;
  }
  const startsAt = Math.max(leftStart, rightStart);
  const endsAt = Math.min(leftEnd, rightEnd);
  if (endsAt <= startsAt) {
    return undefined;
  }
  return {
    startsAt: `${String(Math.floor(startsAt / 60)).padStart(2, "0")}:${String(startsAt % 60).padStart(2, "0")}`,
    endsAt: `${String(Math.floor(endsAt / 60)).padStart(2, "0")}:${String(endsAt % 60).padStart(2, "0")}`,
  };
}

function occurrenceValue(
  occurrence: Occurrence,
): ScheduleConflict["occurrence"] {
  switch (occurrence.kind) {
    case "weekday":
      return { kind: "weekday", weekday: occurrence.weekday };
    case "date":
      return { kind: "date", date: occurrence.date };
    default: {
      const exhaustive: never = occurrence;
      return exhaustive;
    }
  }
}

function conflictFor(
  left: TimetableEvent,
  right: TimetableEvent,
  occurrence: Occurrence,
  overlapRange: { readonly startsAt: string; readonly endsAt: string },
): ScheduleConflict {
  const eventIds: readonly [string, string] =
    left.id < right.id ? [left.id, right.id] : [right.id, left.id];
  const occurrenceValueForId =
    occurrence.kind === "weekday" ? occurrence.weekday : occurrence.date;
  const key = [
    eventIds[0],
    eventIds[1],
    occurrence.kind,
    occurrenceValueForId,
    overlapRange.startsAt,
    overlapRange.endsAt,
  ].join("\u001f");
  return {
    code: "SCHEDULE_CONFLICT",
    id: stableConflictId(key),
    eventIds,
    occurrence: occurrenceValue(occurrence),
    overlap: overlapRange,
  };
}

export function detectConflictsBounded(
  events: readonly TimetableEvent[],
  context: { readonly term?: TermRange; readonly maxConflicts?: number } = {},
): ConflictDetectionResult {
  const maxConflicts =
    context.maxConflicts === undefined ||
    !Number.isSafeInteger(context.maxConflicts) ||
    context.maxConflicts < 0
      ? DEFAULT_MAX_CONFLICTS
      : context.maxConflicts;
  const ordered = [...events].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const conflicts: ScheduleConflict[] = [];
  let truncated = false;
  outer: for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    const left = ordered[leftIndex];
    if (left === undefined) continue;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < ordered.length;
      rightIndex += 1
    ) {
      const right = ordered[rightIndex];
      if (right === undefined || left.timezone !== right.timezone) continue;
      const overlapRange = overlap(left, right);
      if (overlapRange === undefined) continue;
      const occurrences = sharedOccurrences(left, right, context.term);
      for (const occurrence of occurrences) {
        if (conflicts.length >= maxConflicts) {
          truncated = true;
          break outer;
        }
        conflicts.push(conflictFor(left, right, occurrence, overlapRange));
      }
    }
  }
  return {
    conflicts: conflicts.sort((left, right) => left.id.localeCompare(right.id)),
    truncated,
  };
}

export function detectConflicts(
  events: readonly TimetableEvent[],
  context: { readonly term?: TermRange } = {},
): readonly ScheduleConflict[] {
  return detectConflictsBounded(events, {
    ...context,
    maxConflicts: Number.MAX_SAFE_INTEGER,
  }).conflicts;
}
