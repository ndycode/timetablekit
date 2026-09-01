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

function datesForTerm(term: TermRange): readonly string[] {
  const dates: string[] = [];
  let current: string | undefined = term.startsOn;
  while (current !== undefined && current <= term.endsOn) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

function exactDates(schedule: EventSchedule): readonly string[] {
  return schedule.kind === "exact" ? schedule.exactDates : [];
}

function occurrencesForEvent(
  event: TimetableEvent,
  term: TermRange | undefined,
): readonly Occurrence[] {
  if (event.schedule.kind === "exact") {
    return event.schedule.exactDates.map((date) => ({
      key: `d:${date}`,
      kind: "date",
      date,
    }));
  }
  if (term === undefined) {
    return event.schedule.weekdays.map((weekday) => ({
      key: `w:${weekday}`,
      kind: "weekday",
      weekday,
    }));
  }
  return datesForTerm(term)
    .filter((date) => dateIsInWeeklySchedule(event.schedule, date))
    .map((date) => ({ key: `d:${date}`, kind: "date", date }));
}

function sharedOccurrences(
  left: TimetableEvent,
  right: TimetableEvent,
  term: TermRange | undefined,
): readonly Occurrence[] {
  const leftOccurrences = occurrencesForEvent(left, term);
  const rightOccurrences = occurrencesForEvent(right, term);
  const rightKeys = new Set(rightOccurrences.map((entry) => entry.key));
  const shared = leftOccurrences.filter((entry) => rightKeys.has(entry.key));
  if (shared.length > 0) {
    return shared;
  }
  if (term !== undefined) {
    return [];
  }
  if (left.schedule.kind === "exact" && right.schedule.kind === "weekly") {
    return exactDates(left.schedule)
      .filter((date) => dateIsInWeeklySchedule(right.schedule, date))
      .map((date) => ({ key: `d:${date}`, kind: "date", date }));
  }
  if (left.schedule.kind === "weekly" && right.schedule.kind === "exact") {
    return exactDates(right.schedule)
      .filter((date) => dateIsInWeeklySchedule(left.schedule, date))
      .map((date) => ({ key: `d:${date}`, kind: "date", date }));
  }
  if (left.schedule.kind === "weekly" && right.schedule.kind === "weekly") {
    return left.schedule.weekdays
      .filter((weekday) => scheduleHasWeekday(right.schedule, weekday))
      .map((weekday) => ({ key: `w:${weekday}`, kind: "weekday", weekday }));
  }
  return [];
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

export function detectConflicts(
  events: readonly TimetableEvent[],
  context: { readonly term?: TermRange } = {},
): readonly ScheduleConflict[] {
  const ordered = [...events].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const conflicts: ScheduleConflict[] = [];
  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
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
        conflicts.push(conflictFor(left, right, occurrence, overlapRange));
      }
    }
  }
  return conflicts.sort((left, right) => left.id.localeCompare(right.id));
}
