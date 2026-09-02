import { parseTime } from "./parser/time.js";
import { utf8ByteLength } from "./parser/text.js";
import {
  RecoveryResponseSchema,
  recoveryPatchSchema,
  scheduleSchema,
} from "./schema/runtime.js";
import type {
  EventSchedule,
  FieldValue,
  RecoveryPatch,
  RecoveryResponse,
  TimetableEvent,
} from "./schema/types.js";

function isSchedule(value: unknown): value is EventSchedule {
  return scheduleSchema.safeParse(value).success;
}

export function isRecoveryResponse(value: unknown): value is RecoveryResponse {
  return RecoveryResponseSchema.safeParse(value).success;
}

export function recoveryResponseByteLength(
  response: RecoveryResponse,
): number | undefined {
  try {
    const serialized = JSON.stringify(response);
    return serialized === undefined ? undefined : utf8ByteLength(serialized);
  } catch {
    return undefined;
  }
}

function sameSchedule(left: EventSchedule, right: EventSchedule): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "weekly" && right.kind === "weekly") {
    return (
      left.weekdays.length === right.weekdays.length &&
      left.weekdays.every((day, index) => day === right.weekdays[index]) &&
      left.startsOn === right.startsOn &&
      left.endsOn === right.endsOn
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

function sameFieldValue(
  left: TimetableEvent,
  right: TimetableEvent,
  field: RecoveryPatch["field"],
): boolean {
  switch (field) {
    case "title":
      return left.title === right.title;
    case "code":
      return left.code === right.code;
    case "eventType":
      return left.eventType === right.eventType;
    case "schedule":
      return sameSchedule(left.schedule, right.schedule);
    case "startTime":
      return left.startTime === right.startTime;
    case "endTime":
      return left.endTime === right.endTime;
    case "timezone":
      return left.timezone === right.timezone;
    case "location":
      return left.location === right.location;
    case "instructor":
      return left.instructor === right.instructor;
    case "notes":
      return left.notes === right.notes;
  }
}

function withFieldConfidence(
  original: TimetableEvent,
  candidate: TimetableEvent,
  field: RecoveryPatch["field"],
  confidence: number,
): TimetableEvent | null {
  const currentFieldConfidence = original.fieldConfidence[field];
  const nextFieldConfidence = Math.max(currentFieldConfidence ?? 0, confidence);
  const fieldConfidenceChanged =
    currentFieldConfidence === undefined
      ? confidence > original.confidence
      : nextFieldConfidence !== currentFieldConfidence;
  const nextEventConfidence = Math.max(original.confidence, confidence);
  const eventConfidenceChanged = nextEventConfidence !== original.confidence;
  const valueChanged = !sameFieldValue(original, candidate, field);
  if (!valueChanged && !fieldConfidenceChanged && !eventConfidenceChanged) {
    return null;
  }
  return {
    ...candidate,
    confidence: nextEventConfidence,
    fieldConfidence: fieldConfidenceChanged
      ? { ...original.fieldConfidence, [field]: nextFieldConfidence }
      : original.fieldConfidence,
  };
}

function applyPatch(
  event: TimetableEvent,
  patch: RecoveryPatch,
): TimetableEvent | null | undefined {
  const value: FieldValue = patch.value;
  switch (patch.field) {
    case "title":
      return typeof value === "string" && value.trim().length > 0
        ? withFieldConfidence(
            event,
            { ...event, title: value.trim() },
            patch.field,
            patch.confidence,
          )
        : undefined;
    case "code":
      return typeof value === "string" && value.trim().length > 0
        ? withFieldConfidence(
            event,
            { ...event, code: value.trim() },
            patch.field,
            patch.confidence,
          )
        : undefined;
    case "eventType":
      return typeof value === "string" && value.trim().length > 0
        ? withFieldConfidence(
            event,
            {
              ...event,
              eventType: value.trim(),
            },
            patch.field,
            patch.confidence,
          )
        : undefined;
    case "schedule":
      return isSchedule(value)
        ? withFieldConfidence(
            event,
            { ...event, schedule: value },
            patch.field,
            patch.confidence,
          )
        : undefined;
    case "startTime": {
      if (typeof value !== "string") return undefined;
      const parsed = parseTime(value);
      return parsed.kind === "ok"
        ? withFieldConfidence(
            event,
            { ...event, startTime: parsed.time },
            patch.field,
            patch.confidence,
          )
        : undefined;
    }
    case "endTime": {
      if (typeof value !== "string") return undefined;
      const parsed = parseTime(value);
      return parsed.kind === "ok"
        ? withFieldConfidence(
            event,
            { ...event, endTime: parsed.time },
            patch.field,
            patch.confidence,
          )
        : undefined;
    }
    case "timezone":
      return typeof value === "string" && value.length > 0
        ? withFieldConfidence(
            event,
            { ...event, timezone: value },
            patch.field,
            patch.confidence,
          )
        : undefined;
    case "location":
      return typeof value === "string" && value.trim().length > 0
        ? withFieldConfidence(
            event,
            {
              ...event,
              location: value.trim(),
            },
            patch.field,
            patch.confidence,
          )
        : undefined;
    case "instructor":
      return typeof value === "string" && value.trim().length > 0
        ? withFieldConfidence(
            event,
            {
              ...event,
              instructor: value.trim(),
            },
            patch.field,
            patch.confidence,
          )
        : undefined;
    case "notes":
      return typeof value === "string" && value.trim().length > 0
        ? withFieldConfidence(
            event,
            {
              ...event,
              notes: value.trim(),
            },
            patch.field,
            patch.confidence,
          )
        : undefined;
  }
  return undefined;
}

export type RecoveryApplyResult = {
  readonly events: readonly TimetableEvent[];
  readonly applied: number;
  readonly appliedPatches: readonly RecoveryPatch[];
  readonly invalid: number;
};

export function applyRecoveryPatches(
  events: readonly TimetableEvent[],
  response: RecoveryResponse,
): RecoveryApplyResult {
  let rawPatches: readonly unknown[];
  const validated = RecoveryResponseSchema.safeParse(response);
  if (validated.success) {
    rawPatches = validated.data.patches;
  } else {
    try {
      if (
        typeof response !== "object" ||
        response === null ||
        !Array.isArray(response.patches)
      ) {
        throw new Error();
      }
      rawPatches = response.patches;
    } catch {
      return {
        events,
        applied: 0,
        appliedPatches: [],
        invalid: 1,
      };
    }
  }
  if (rawPatches.length > 32) {
    return {
      events,
      applied: 0,
      appliedPatches: [],
      invalid: 1,
    };
  }
  const byId = new Map(events.map((event) => [event.id, event]));
  const appliedPatches: RecoveryPatch[] = [];
  let applied = 0;
  let invalid = 0;
  for (const rawPatch of rawPatches) {
    const parsedPatch = recoveryPatchSchema.safeParse(rawPatch);
    if (!parsedPatch.success) {
      invalid += 1;
      continue;
    }
    const patch = parsedPatch.data;
    const event = byId.get(patch.eventId);
    const updated = event === undefined ? undefined : applyPatch(event, patch);
    if (updated === undefined) {
      invalid += 1;
    } else if (updated === null) {
      continue;
    } else {
      byId.set(updated.id, updated);
      appliedPatches.push(patch);
      applied += 1;
    }
  }
  return {
    events: [...byId.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    applied,
    appliedPatches,
    invalid,
  };
}

export function eventFieldValue(
  event: TimetableEvent,
  field: RecoveryPatch["field"],
): string {
  switch (field) {
    case "title":
      return event.title;
    case "code":
      return event.code ?? "";
    case "eventType":
      return event.eventType ?? "";
    case "schedule":
      return event.schedule.kind === "weekly"
        ? event.schedule.weekdays.join(",")
        : event.schedule.exactDates.join(",");
    case "startTime":
      return event.startTime;
    case "endTime":
      return event.endTime;
    case "timezone":
      return event.timezone;
    case "location":
      return event.location ?? "";
    case "instructor":
      return event.instructor ?? "";
    case "notes":
      return event.notes ?? "";
    default: {
      const exhaustive: never = field;
      return exhaustive;
    }
  }
}
