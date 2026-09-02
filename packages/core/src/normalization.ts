import { stableEventId } from "./hash.js";
import {
  evidenceForCandidate,
  candidateHasRequiredFields,
  type Candidate,
} from "./parser/row.js";
import { makeWarning } from "./parser/warnings.js";
import type {
  EventField,
  EventSchedule,
  FieldEvidence,
  ParseWarning,
  SourceDescriptor,
  TermRange,
  TimetableEvent,
  TimeZone,
} from "./schema/types.js";

type NormalizationResult = {
  readonly events: readonly TimetableEvent[];
  readonly warnings: readonly ParseWarning[];
};

const OPTIONAL_FIELDS: readonly EventField[] = [
  "code",
  "eventType",
  "location",
  "instructor",
  "notes",
];

function normalizedValue(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function canonicalExactDates(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function canonicalSchedule(schedule: EventSchedule): EventSchedule {
  return schedule.kind === "exact"
    ? { kind: "exact", exactDates: canonicalExactDates(schedule.exactDates) }
    : schedule;
}

function scheduleKey(schedule: EventSchedule): string {
  switch (schedule.kind) {
    case "weekly":
      return [
        schedule.kind,
        ...schedule.weekdays,
        schedule.startsOn ?? "",
        schedule.endsOn ?? "",
      ].join(",");
    case "exact":
      return [schedule.kind, ...canonicalExactDates(schedule.exactDates)].join(
        ",",
      );
    default: {
      const exhaustive: never = schedule;
      return exhaustive;
    }
  }
}

function withTerm(
  schedule: EventSchedule,
  term: TermRange | undefined,
): EventSchedule {
  if (schedule.kind === "exact") {
    return canonicalSchedule(schedule);
  }
  if (term === undefined) {
    return schedule;
  }
  return {
    kind: "weekly",
    weekdays: schedule.weekdays,
    startsOn: schedule.startsOn ?? term.startsOn,
    endsOn: schedule.endsOn ?? term.endsOn,
  };
}

function candidateKey(
  candidate: Candidate & {
    readonly title: string;
    readonly schedule: EventSchedule;
    readonly startTime: string;
    readonly endTime: string;
  },
  timezone: TimeZone,
  term: TermRange | undefined,
): string {
  const schedule = withTerm(candidate.schedule, term);
  return [
    normalizedValue(candidate.title).toLocaleLowerCase(),
    candidate.code === undefined
      ? ""
      : normalizedValue(candidate.code).toLocaleLowerCase(),
    candidate.eventType === undefined
      ? ""
      : normalizedValue(candidate.eventType).toLocaleLowerCase(),
    scheduleKey(schedule),
    candidate.startTime,
    candidate.endTime,
    timezone,
    candidate.location === undefined
      ? ""
      : normalizedValue(candidate.location).toLocaleLowerCase(),
    candidate.instructor === undefined
      ? ""
      : normalizedValue(candidate.instructor).toLocaleLowerCase(),
    candidate.notes === undefined
      ? ""
      : normalizedValue(candidate.notes).toLocaleLowerCase(),
  ].join("\u001f");
}

function likelyKey(event: TimetableEvent): string {
  return [
    normalizedValue(event.title).toLocaleLowerCase(),
    event.code ?? "",
    scheduleKey(event.schedule),
    event.startTime,
    event.endTime,
    event.timezone,
  ].join("\u001f");
}

function candidateConfidence(candidate: Candidate, ambiguous: boolean): number {
  const values = [
    0.94,
    0.95,
    0.95,
    candidate.location === undefined ? 0.8 : 0.88,
  ];
  if (candidate.code !== undefined) values.push(0.9);
  if (candidate.instructor !== undefined) values.push(0.84);
  if (candidate.notes !== undefined) values.push(0.82);
  if (ambiguous) values.push(0.62);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function eventFromCandidate(
  candidate: Candidate & {
    readonly title: string;
    readonly schedule: EventSchedule;
    readonly startTime: string;
    readonly endTime: string;
  },
  source: SourceDescriptor,
  evidenceMode: "none" | "locations" | "snippets",
  term: TermRange | undefined,
  timezone: TimeZone,
): TimetableEvent {
  const schedule = withTerm(candidate.schedule, term);
  const ambiguous = candidate.warnings.some(
    (warning) => warning.code === "AMBIGUOUS_TIME",
  );
  const confidence = candidateConfidence(candidate, ambiguous);
  const fieldConfidence: Partial<Record<EventField, number>> = {
    title: 0.94,
    schedule: 0.95,
    startTime: ambiguous ? 0.62 : 0.95,
    endTime: ambiguous ? 0.62 : 0.95,
    timezone: 1,
  };
  if (candidate.code !== undefined) fieldConfidence.code = 0.9;
  if (candidate.eventType !== undefined) fieldConfidence.eventType = 0.84;
  if (candidate.location !== undefined) fieldConfidence.location = 0.88;
  if (candidate.instructor !== undefined) fieldConfidence.instructor = 0.84;
  if (candidate.notes !== undefined) fieldConfidence.notes = 0.82;
  const evidence = evidenceForCandidate(
    candidate,
    source,
    evidenceMode,
    candidate.fieldText.title ?? "",
  );
  const key = candidateKey(candidate, timezone, term);
  return {
    id: stableEventId(key),
    title: normalizedValue(candidate.title),
    ...(candidate.code === undefined
      ? {}
      : { code: normalizedValue(candidate.code) }),
    ...(candidate.eventType === undefined
      ? {}
      : { eventType: normalizedValue(candidate.eventType) }),
    schedule,
    startTime: candidate.startTime,
    endTime: candidate.endTime,
    timezone,
    ...(candidate.location === undefined
      ? {}
      : { location: normalizedValue(candidate.location) }),
    ...(candidate.instructor === undefined
      ? {}
      : { instructor: normalizedValue(candidate.instructor) }),
    ...(candidate.notes === undefined
      ? {}
      : { notes: normalizedValue(candidate.notes) }),
    confidence,
    fieldConfidence,
    evidence,
  };
}

function mergeEvidence(
  left: Partial<Record<EventField, readonly FieldEvidence[]>>,
  right: Partial<Record<EventField, readonly FieldEvidence[]>>,
): Partial<Record<EventField, readonly FieldEvidence[]>> {
  const merged: Partial<Record<EventField, readonly FieldEvidence[]>> = {
    ...left,
  };
  for (const field of OPTIONAL_FIELDS.concat([
    "title",
    "schedule",
    "startTime",
    "endTime",
    "timezone",
  ])) {
    const values = [...(left[field] ?? []), ...(right[field] ?? [])];
    if (values.length > 0) {
      merged[field] = values;
    }
  }
  return merged;
}

function mergeEvents(
  left: TimetableEvent,
  right: TimetableEvent,
): TimetableEvent {
  const fieldConfidence: Partial<Record<EventField, number>> = {
    ...left.fieldConfidence,
  };
  for (const field of OPTIONAL_FIELDS.concat([
    "title",
    "schedule",
    "startTime",
    "endTime",
    "timezone",
  ])) {
    const value = right.fieldConfidence[field];
    if (
      value !== undefined &&
      (fieldConfidence[field] === undefined || value > fieldConfidence[field])
    ) {
      fieldConfidence[field] = value;
    }
  }
  return {
    ...left,
    confidence: Math.max(left.confidence, right.confidence),
    fieldConfidence,
    evidence: mergeEvidence(left.evidence, right.evidence),
  };
}

function duplicateWarnings(
  events: readonly TimetableEvent[],
): readonly ParseWarning[] {
  const warnings: ParseWarning[] = [];
  const seen = new Map<string, TimetableEvent>();
  for (const event of events) {
    const key = likelyKey(event);
    const previous = seen.get(key);
    if (previous !== undefined && previous.id !== event.id) {
      warnings.push(
        makeWarning({
          code: "POSSIBLE_DUPLICATE",
          severity: "warning",
          message:
            "Two events have the same title, schedule, and time but different details.",
          eventId: event.id,
          details: { relatedEvent: previous.id },
        }),
      );
    } else {
      seen.set(key, event);
    }
  }
  return warnings;
}

export function normalizeCandidates(
  candidates: readonly Candidate[],
  source: SourceDescriptor,
  evidenceMode: "none" | "locations" | "snippets",
  term: TermRange | undefined,
  timezone: TimeZone,
): NormalizationResult {
  const eventsByKey = new Map<string, TimetableEvent>();
  const warnings: ParseWarning[] = [];
  for (const candidate of candidates) {
    if (!candidateHasRequiredFields(candidate)) {
      warnings.push(...candidate.warnings);
      continue;
    }
    const event = eventFromCandidate(
      candidate,
      source,
      evidenceMode,
      term,
      timezone,
    );
    const key = candidateKey(candidate, timezone, term);
    const previous = eventsByKey.get(key);
    if (previous === undefined) {
      eventsByKey.set(key, event);
    } else {
      eventsByKey.set(key, mergeEvents(previous, event));
      warnings.push(
        makeWarning({
          code: "DUPLICATE_EVENT",
          severity: "info",
          message: "An exact duplicate event was merged.",
          eventId: event.id,
          details: { duplicateOf: previous.id },
        }),
      );
    }
    for (const warning of candidate.warnings) {
      warnings.push(
        warning.eventId === undefined
          ? { ...warning, eventId: event.id }
          : warning,
      );
    }
  }
  const events = [...eventsByKey.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  warnings.push(...duplicateWarnings(events));
  return { events, warnings };
}
