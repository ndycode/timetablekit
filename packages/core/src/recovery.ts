import { parseTime } from "./parser/time.js";
import type {
  EventSchedule,
  FieldValue,
  RecoveryPatch,
  RecoveryResponse,
  TimetableEvent,
} from "./schema/types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSchedule(value: unknown): value is EventSchedule {
  if (!isRecord(value)) {
    return false;
  }
  if (value["kind"] === "weekly") {
    const weekdays = value["weekdays"];
    return (
      Array.isArray(weekdays) &&
      weekdays.every((day) => typeof day === "string")
    );
  }
  if (value["kind"] === "exact") {
    const exactDates = value["exactDates"];
    return (
      Array.isArray(exactDates) &&
      exactDates.every((date) => typeof date === "string")
    );
  }
  return false;
}

function isPatch(value: unknown): value is RecoveryPatch {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value["eventId"] === "string" &&
    typeof value["field"] === "string" &&
    typeof value["confidence"] === "number" &&
    value["confidence"] >= 0 &&
    value["confidence"] <= 1 &&
    (typeof value["value"] === "string" ||
      isSchedule(value["value"]) ||
      Array.isArray(value["value"]))
  );
}

export function isRecoveryResponse(value: unknown): value is RecoveryResponse {
  return (
    isRecord(value) &&
    Array.isArray(value["patches"]) &&
    value["patches"].every(isPatch)
  );
}

function withFieldConfidence(
  event: TimetableEvent,
  field: RecoveryPatch["field"],
  confidence: number,
): TimetableEvent {
  return {
    ...event,
    confidence: Math.max(event.confidence, confidence),
    fieldConfidence: { ...event.fieldConfidence, [field]: confidence },
  };
}

function applyPatch(
  event: TimetableEvent,
  patch: RecoveryPatch,
): TimetableEvent | undefined {
  const value: FieldValue = patch.value;
  switch (patch.field) {
    case "title":
      return typeof value === "string" && value.trim().length > 0
        ? withFieldConfidence(
            { ...event, title: value.trim() },
            patch.field,
            patch.confidence,
          )
        : undefined;
    case "code":
      return typeof value === "string"
        ? withFieldConfidence(
            { ...event, ...(value.length === 0 ? {} : { code: value.trim() }) },
            patch.field,
            patch.confidence,
          )
        : undefined;
    case "eventType":
      return typeof value === "string"
        ? withFieldConfidence(
            {
              ...event,
              ...(value.length === 0 ? {} : { eventType: value.trim() }),
            },
            patch.field,
            patch.confidence,
          )
        : undefined;
    case "schedule":
      return isSchedule(value)
        ? withFieldConfidence(
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
            { ...event, endTime: parsed.time },
            patch.field,
            patch.confidence,
          )
        : undefined;
    }
    case "timezone":
      return typeof value === "string" && value.length > 0
        ? withFieldConfidence(
            { ...event, timezone: value },
            patch.field,
            patch.confidence,
          )
        : undefined;
    case "location":
      return typeof value === "string"
        ? withFieldConfidence(
            {
              ...event,
              ...(value.length === 0 ? {} : { location: value.trim() }),
            },
            patch.field,
            patch.confidence,
          )
        : undefined;
    case "instructor":
      return typeof value === "string"
        ? withFieldConfidence(
            {
              ...event,
              ...(value.length === 0 ? {} : { instructor: value.trim() }),
            },
            patch.field,
            patch.confidence,
          )
        : undefined;
    case "notes":
      return typeof value === "string"
        ? withFieldConfidence(
            {
              ...event,
              ...(value.length === 0 ? {} : { notes: value.trim() }),
            },
            patch.field,
            patch.confidence,
          )
        : undefined;
    default: {
      const exhaustive: never = patch.field;
      return exhaustive;
    }
  }
}

export type RecoveryApplyResult = {
  readonly events: readonly TimetableEvent[];
  readonly applied: number;
  readonly invalid: number;
};

export function applyRecoveryPatches(
  events: readonly TimetableEvent[],
  response: RecoveryResponse,
): RecoveryApplyResult {
  const byId = new Map(events.map((event) => [event.id, event]));
  let applied = 0;
  let invalid = 0;
  for (const patch of response.patches) {
    const event = byId.get(patch.eventId);
    const updated = event === undefined ? undefined : applyPatch(event, patch);
    if (updated === undefined) {
      invalid += 1;
    } else {
      byId.set(updated.id, updated);
      applied += 1;
    }
  }
  return {
    events: [...byId.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    applied,
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
