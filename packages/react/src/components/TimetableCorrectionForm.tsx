import type { ChangeEvent } from "react";
import type {
  EventSchedule,
  ParseWarning,
  TimetableEvent,
  TimetableParseResult,
} from "@ndycode/timetablekit";
import {
  applyEventCorrection,
  formatWarningCode,
  warningForEventField,
} from "../corrections.js";
import {
  DEFAULT_EDITABLE_FIELDS,
  type EditableEventField,
  type EventCorrection,
  type TimetableResultChangeHandler,
} from "../types.js";
import { WEEKDAY_LABELS, WEEKDAY_OPTIONS } from "../weekday.js";

export type TimetableCorrectionFormProps = {
  readonly result: TimetableParseResult;
  readonly onChange: TimetableResultChangeHandler;
  readonly fields?: readonly EditableEventField[];
  readonly heading?: string;
  readonly emptyMessage?: string;
  readonly className?: string;
};

type TextCorrectionFieldProps = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly warning: ParseWarning | undefined;
  readonly type?: "text" | "time";
  readonly multiline?: boolean;
  readonly placeholder?: string;
  readonly onValueChange: (value: string) => void;
};

const FIELD_LABELS: Readonly<Record<EditableEventField, string>> = {
  title: "Title",
  code: "Code",
  eventType: "Event type",
  schedule: "Schedule",
  startTime: "Start time",
  endTime: "End time",
  timezone: "Timezone",
  location: "Location",
  instructor: "Instructor",
  notes: "Notes",
};

function warningIdFor(controlId: string): string {
  return `${controlId}-warning`;
}

function TextCorrectionField({
  id,
  label,
  value,
  warning,
  type = "text",
  multiline = false,
  placeholder,
  onValueChange,
}: TextCorrectionFieldProps) {
  const warningId = warningIdFor(id);
  const describedBy = warning === undefined ? undefined : warningId;
  return (
    <div className="timetable-correction-field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          placeholder={placeholder}
          aria-describedby={describedBy}
          aria-invalid={warning !== undefined}
          onChange={(change: ChangeEvent<HTMLTextAreaElement>) =>
            onValueChange(change.currentTarget.value)
          }
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          aria-describedby={describedBy}
          aria-invalid={warning !== undefined}
          onChange={(change: ChangeEvent<HTMLInputElement>) =>
            onValueChange(change.currentTarget.value)
          }
        />
      )}
      {warning === undefined ? null : (
        <WarningMessage id={warningId} warning={warning} />
      )}
    </div>
  );
}

function WarningMessage({
  id,
  warning,
}: {
  readonly id: string;
  readonly warning: ParseWarning;
}) {
  return (
    <p
      id={id}
      className={`timetable-field-warning timetable-field-warning-${warning.severity}`}
      role={warning.severity === "error" ? "alert" : undefined}
    >
      <strong>{formatWarningCode(warning)}</strong>
      {`: ${warning.message}`}
    </p>
  );
}

function parseDateList(value: string): readonly string[] {
  return value
    .split(",")
    .map((date) => date.trim())
    .filter((date) => date.length > 0);
}

function ScheduleCorrectionField({
  event,
  warning,
  onScheduleChange,
}: {
  readonly event: TimetableEvent;
  readonly warning: ParseWarning | undefined;
  readonly onScheduleChange: (schedule: EventSchedule) => void;
}) {
  const controlId = `timetablekit-${encodeURIComponent(event.id)}-schedule`;
  const warningId = warningIdFor(controlId);
  const describedBy = warning === undefined ? undefined : warningId;
  if (event.schedule.kind === "exact") {
    const schedule = event.schedule;
    return (
      <TextCorrectionField
        id={controlId}
        label="Dates (YYYY-MM-DD, comma separated)"
        value={schedule.exactDates.join(", ")}
        warning={warning}
        onValueChange={(value) =>
          onScheduleChange({ ...schedule, exactDates: parseDateList(value) })
        }
      />
    );
  }
  const schedule = event.schedule;
  return (
    <fieldset
      className="timetable-correction-field timetable-schedule-field"
      aria-describedby={describedBy}
      aria-invalid={warning !== undefined}
    >
      <legend>{FIELD_LABELS.schedule}</legend>
      <div
        role="group"
        aria-label={`Days for ${event.title || "untitled event"}`}
      >
        {WEEKDAY_OPTIONS.map((day) => (
          <label key={day}>
            <input
              type="checkbox"
              name={`${controlId}-${day}`}
              checked={schedule.weekdays.includes(day)}
              onChange={(change: ChangeEvent<HTMLInputElement>) => {
                const selected = new Set(schedule.weekdays);
                if (change.currentTarget.checked) {
                  selected.add(day);
                } else {
                  selected.delete(day);
                }
                onScheduleChange({
                  ...schedule,
                  weekdays: WEEKDAY_OPTIONS.filter((candidate) =>
                    selected.has(candidate),
                  ),
                });
              }}
            />
            {WEEKDAY_LABELS[day]}
          </label>
        ))}
      </div>
      {warning === undefined ? null : (
        <WarningMessage id={warningId} warning={warning} />
      )}
    </fieldset>
  );
}

function eventControlId(
  event: TimetableEvent,
  field: EditableEventField,
): string {
  return `timetablekit-${encodeURIComponent(event.id)}-${field}`;
}

function EventFieldControl({
  result,
  event,
  field,
  onCorrection,
}: {
  readonly result: TimetableParseResult;
  readonly event: TimetableEvent;
  readonly field: EditableEventField;
  readonly onCorrection: (correction: EventCorrection) => void;
}) {
  const warning = warningForEventField(result, event.id, field);
  switch (field) {
    case "title":
      return (
        <TextCorrectionField
          id={eventControlId(event, field)}
          label={FIELD_LABELS[field]}
          value={event.title}
          warning={warning}
          onValueChange={(value) =>
            onCorrection({ eventId: event.id, field: "title", value })
          }
        />
      );
    case "code":
      return (
        <TextCorrectionField
          id={eventControlId(event, field)}
          label={FIELD_LABELS[field]}
          value={event.code ?? ""}
          warning={warning}
          onValueChange={(value) =>
            onCorrection({ eventId: event.id, field: "code", value })
          }
        />
      );
    case "eventType":
      return (
        <TextCorrectionField
          id={eventControlId(event, field)}
          label={FIELD_LABELS[field]}
          value={event.eventType ?? ""}
          warning={warning}
          onValueChange={(value) =>
            onCorrection({ eventId: event.id, field: "eventType", value })
          }
        />
      );
    case "schedule":
      return (
        <ScheduleCorrectionField
          event={event}
          warning={warning}
          onScheduleChange={(schedule) =>
            onCorrection({
              eventId: event.id,
              field: "schedule",
              value: schedule,
            })
          }
        />
      );
    case "startTime":
      return (
        <TextCorrectionField
          id={eventControlId(event, field)}
          label={FIELD_LABELS[field]}
          value={event.startTime}
          warning={warning}
          type="time"
          onValueChange={(value) =>
            onCorrection({ eventId: event.id, field: "startTime", value })
          }
        />
      );
    case "endTime":
      return (
        <TextCorrectionField
          id={eventControlId(event, field)}
          label={FIELD_LABELS[field]}
          value={event.endTime}
          warning={warning}
          type="time"
          onValueChange={(value) =>
            onCorrection({ eventId: event.id, field: "endTime", value })
          }
        />
      );
    case "timezone":
      return (
        <TextCorrectionField
          id={eventControlId(event, field)}
          label={FIELD_LABELS[field]}
          value={event.timezone}
          warning={warning}
          onValueChange={(value) =>
            onCorrection({ eventId: event.id, field: "timezone", value })
          }
        />
      );
    case "location":
      return (
        <TextCorrectionField
          id={eventControlId(event, field)}
          label={FIELD_LABELS[field]}
          value={event.location ?? ""}
          warning={warning}
          placeholder="Add location"
          onValueChange={(value) =>
            onCorrection({ eventId: event.id, field: "location", value })
          }
        />
      );
    case "instructor":
      return (
        <TextCorrectionField
          id={eventControlId(event, field)}
          label={FIELD_LABELS[field]}
          value={event.instructor ?? ""}
          warning={warning}
          onValueChange={(value) =>
            onCorrection({ eventId: event.id, field: "instructor", value })
          }
        />
      );
    case "notes":
      return (
        <TextCorrectionField
          id={eventControlId(event, field)}
          label={FIELD_LABELS[field]}
          value={event.notes ?? ""}
          warning={warning}
          multiline
          onValueChange={(value) =>
            onCorrection({ eventId: event.id, field: "notes", value })
          }
        />
      );
    default: {
      const exhaustive: never = field;
      return exhaustive;
    }
  }
}

function eventLabel(event: TimetableEvent): string {
  return event.title.trim().length === 0 ? "Untitled event" : event.title;
}

export function TimetableCorrectionForm({
  result,
  onChange,
  fields = DEFAULT_EDITABLE_FIELDS,
  heading = "Correct events",
  emptyMessage = "No events to correct.",
  className,
}: TimetableCorrectionFormProps) {
  const handleCorrection = (correction: EventCorrection): void => {
    const nextResult = applyEventCorrection(result, correction);
    if (nextResult !== result) {
      onChange(nextResult);
    }
  };
  return (
    <section className={className} aria-label={heading}>
      <h2>{heading}</h2>
      {result.events.length === 0 ? (
        <p role="status">{emptyMessage}</p>
      ) : (
        <div className="timetable-correction-events">
          {result.events.map((event) => (
            <fieldset className="timetable-correction-event" key={event.id}>
              <legend>{eventLabel(event)}</legend>
              <div className="timetable-correction-fields">
                {fields.map((field) => (
                  <EventFieldControl
                    key={`${event.id}-${field}`}
                    result={result}
                    event={event}
                    field={field}
                    onCorrection={handleCorrection}
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}
    </section>
  );
}
