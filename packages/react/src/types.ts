import type {
  EventField,
  EventId,
  ParseWarning,
  TimetableParseResult,
} from "@ndycode/timetablekit";
export type {
  EventCorrection,
  EventFieldValueMap,
} from "@ndycode/timetablekit";

export type EditableEventField = EventField;

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
