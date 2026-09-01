import type {
  EventField,
  EventId,
  EventSchedule,
  ParseWarning,
  TimetableParseResult,
} from "@ndycode/timetablekit";

export type EditableEventField = EventField;

export type EventFieldValueMap = {
  readonly [Field in EventField]: Field extends "schedule"
    ? EventSchedule
    : string;
};

type EventCorrectionFor<Field extends EventField> = {
  readonly eventId: EventId;
  readonly field: Field;
  readonly value: EventFieldValueMap[Field];
};

export type EventCorrection =
  | EventCorrectionFor<"title">
  | EventCorrectionFor<"code">
  | EventCorrectionFor<"eventType">
  | EventCorrectionFor<"schedule">
  | EventCorrectionFor<"startTime">
  | EventCorrectionFor<"endTime">
  | EventCorrectionFor<"timezone">
  | EventCorrectionFor<"location">
  | EventCorrectionFor<"instructor">
  | EventCorrectionFor<"notes">;

export type TimetableResultChangeHandler = (
  result: TimetableParseResult,
) => void;

export type EventWarningLookup = (
  eventId: EventId,
  field: EditableEventField,
) => ParseWarning | undefined;

export const DEFAULT_EDITABLE_FIELDS: readonly EditableEventField[] = [
  "title",
  "schedule",
  "startTime",
  "endTime",
  "location",
];
