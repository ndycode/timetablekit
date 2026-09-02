import { useEffect, useState, type ChangeEvent } from "react";
import type {
  EventSchedule,
  TimetableEvent,
  TimetableParseResult,
  Weekday,
} from "@ndycode/timetablekit";
import {
  DAY_LABELS,
  DAY_OPTIONS,
  warningForEventField,
  type EditableField,
  type PlaygroundCorrection,
} from "../lib/playground-model";
import { ChevronDownIcon } from "./icons";

export type PlaygroundEventsProps = {
  readonly result: TimetableParseResult | null;
  readonly onCorrection: (correction: PlaygroundCorrection) => void;
};

const EDITABLE_FIELDS: readonly EditableField[] = [
  "title",
  "schedule",
  "startTime",
  "endTime",
  "location",
];

function warningId(event: TimetableEvent, field: string): string {
  return `${event.id}-${field}-warning`;
}

function scheduleSummary(schedule: EventSchedule): string {
  if (schedule.kind === "exact") {
    return schedule.exactDates.length === 0
      ? "No dates"
      : `${schedule.exactDates.length} date${schedule.exactDates.length === 1 ? "" : "s"}`;
  }
  if (schedule.weekdays.length === 0) return "No days";
  if (schedule.weekdays.length === DAY_OPTIONS.length) return "Every day";
  return schedule.weekdays.map((day) => DAY_LABELS[day].slice(0, 3)).join(", ");
}

function parseDateList(value: string): readonly string[] {
  return value
    .split(",")
    .map((date) => date.trim())
    .filter((date) => date.length > 0);
}

function FieldWarning({
  id,
  text,
}: {
  readonly id: string;
  readonly text: string;
}) {
  return (
    <span className="field-warning" id={id}>
      {text}
    </span>
  );
}

function ScheduleEditor({
  event,
  result,
  onCorrection,
}: {
  readonly event: TimetableEvent;
  readonly result: TimetableParseResult;
  readonly onCorrection: (correction: PlaygroundCorrection) => void;
}) {
  const schedule = event.schedule;
  const exactValue =
    schedule.kind === "exact" ? schedule.exactDates.join(", ") : "";
  const [exactDraft, setExactDraft] = useState(exactValue);
  useEffect(() => setExactDraft(exactValue), [exactValue]);
  const warning = warningForEventField(result, event.id, "schedule");
  const warningDescription =
    warning === undefined ? undefined : warningId(event, "schedule");
  if (schedule.kind === "exact") {
    const inputId = `${event.id}-dates`;
    return (
      <div className="schedule-editor">
        <label className="sr-only" htmlFor={inputId}>
          Dates for {event.title || "untitled event"}
        </label>
        <input
          className={`event-input${warning === undefined ? "" : " warning"}`}
          id={inputId}
          value={exactDraft}
          required
          aria-invalid={warning !== undefined}
          aria-describedby={warningDescription}
          data-testid={`event-schedule-${event.id}`}
          onChange={(change: ChangeEvent<HTMLInputElement>) =>
            setExactDraft(change.currentTarget.value)
          }
          onBlur={() =>
            onCorrection({
              eventId: event.id,
              field: "schedule",
              value: {
                ...schedule,
                exactDates: parseDateList(exactDraft),
              },
            })
          }
        />
        {warning === undefined ? null : (
          <FieldWarning id={warningDescription ?? inputId} text="Check dates" />
        )}
      </div>
    );
  }

  const weeklySchedule = schedule;

  function toggleDay(day: Weekday, checked: boolean): void {
    const selected = new Set(weeklySchedule.weekdays);
    if (checked) selected.add(day);
    else selected.delete(day);
    onCorrection({
      eventId: event.id,
      field: "schedule",
      value: {
        ...weeklySchedule,
        weekdays: DAY_OPTIONS.filter((candidate) => selected.has(candidate)),
      },
    });
  }

  return (
    <div className="schedule-editor">
      <details className="schedule-details">
        <summary
          className={`schedule-summary${warning === undefined ? "" : " warning"}`}
          aria-label={`Days for ${event.title || "untitled event"}`}
          aria-invalid={warning !== undefined}
          aria-describedby={warningDescription}
          data-testid={`event-schedule-${event.id}`}
        >
          <span>{scheduleSummary(weeklySchedule)}</span>
          <ChevronDownIcon aria-hidden="true" />
        </summary>
        <div
          className="schedule-options"
          role="group"
          aria-label={`Days for ${event.title || "untitled event"}`}
        >
          {DAY_OPTIONS.map((day) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={weeklySchedule.weekdays.includes(day)}
                data-testid={`event-day-${event.id}-${day}`}
                onChange={(change) =>
                  toggleDay(day, change.currentTarget.checked)
                }
              />
              {DAY_LABELS[day]}
            </label>
          ))}
        </div>
      </details>
      {warning === undefined ? null : (
        <FieldWarning
          id={warningDescription ?? `${event.id}-schedule-warning`}
          text="Check days"
        />
      )}
    </div>
  );
}

function EventTextInput({
  event,
  result,
  field,
  label,
  value,
  placeholder,
  onChange,
}: {
  readonly event: TimetableEvent;
  readonly result: TimetableParseResult;
  readonly field: "title" | "startTime" | "endTime" | "location";
  readonly label: string;
  readonly value: string;
  readonly placeholder?: string;
  readonly onChange: (value: string) => void;
}) {
  const warning = warningForEventField(result, event.id, field);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const inputId = `${event.id}-${field}`;
  const warningDescription =
    warning === undefined ? undefined : warningId(event, field);
  const warningText =
    field === "title"
      ? "Check name"
      : field === "startTime" || field === "endTime"
        ? "Check time"
        : "Check place";
  return (
    <>
      <label className="sr-only" htmlFor={inputId}>
        {label} for {event.title || "untitled event"}
      </label>
      <input
        className={`event-input${warning === undefined ? "" : " warning"}`}
        id={inputId}
        value={draft}
        placeholder={placeholder}
        inputMode={
          field === "startTime" || field === "endTime" ? "numeric" : undefined
        }
        aria-invalid={warning !== undefined}
        aria-describedby={warningDescription}
        data-testid={`event-${field}-${event.id}`}
        required={field !== "location"}
        onChange={(change: ChangeEvent<HTMLInputElement>) =>
          setDraft(change.currentTarget.value)
        }
        onBlur={() => onChange(draft)}
      />
      {warning === undefined ? null : (
        <FieldWarning
          id={warningDescription ?? `${inputId}-warning`}
          text={warningText}
        />
      )}
    </>
  );
}

export function PlaygroundEvents({
  result,
  onCorrection,
}: PlaygroundEventsProps) {
  return (
    <section
      className="playground-panel result-panel"
      aria-labelledby="result-title"
      data-testid="playground-events"
    >
      <div className="panel-heading result-heading">
        <div className="panel-title-group">
          <span className="panel-step" aria-hidden="true">
            02
          </span>
          <div>
            <h2 id="result-title">Review events</h2>
            <p>Edit the result, then review warnings before you export.</p>
          </div>
        </div>
        <span className="result-meta">
          {result === null ? (
            "Nothing here yet"
          ) : (
            <>
              <strong>{result.events.length} events</strong> ·{" "}
              {Math.round(result.parse.deterministicConfidence * 100)}% overall
              confidence
            </>
          )}
        </span>
      </div>
      {result === null ? (
        <p className="empty-result" data-testid="events-empty">
          Read a schedule to see editable events.
        </p>
      ) : result.events.length === 0 ? (
        <p className="empty-result" data-testid="events-empty">
          No events were found. Try a different source.
        </p>
      ) : (
        <div
          className="table-scroll"
          role="region"
          aria-label="Editable schedule events"
          tabIndex={0}
        >
          <table className="event-table" data-testid="event-table">
            <caption className="sr-only">
              Editable schedule events with confidence scores
            </caption>
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Days</th>
                <th scope="col">Start</th>
                <th scope="col">End</th>
                <th scope="col">Place</th>
                <th scope="col">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {result.events.map((event) => {
                const hasIssue = EDITABLE_FIELDS.some(
                  (field) =>
                    warningForEventField(result, event.id, field) !== undefined,
                );
                return (
                  <tr
                    key={event.id}
                    className={hasIssue ? "event-row has-issue" : "event-row"}
                    data-event-id={event.id}
                    data-has-issue={hasIssue ? "true" : "false"}
                    data-testid={`event-row-${event.id}`}
                  >
                    <td>
                      <EventTextInput
                        event={event}
                        result={result}
                        field="title"
                        label="Name"
                        value={event.title}
                        onChange={(value) =>
                          onCorrection({
                            eventId: event.id,
                            field: "title",
                            value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <ScheduleEditor
                        event={event}
                        result={result}
                        onCorrection={onCorrection}
                      />
                    </td>
                    <td>
                      <EventTextInput
                        event={event}
                        result={result}
                        field="startTime"
                        label="Start time"
                        value={event.startTime}
                        onChange={(value) =>
                          onCorrection({
                            eventId: event.id,
                            field: "startTime",
                            value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <EventTextInput
                        event={event}
                        result={result}
                        field="endTime"
                        label="End time"
                        value={event.endTime}
                        onChange={(value) =>
                          onCorrection({
                            eventId: event.id,
                            field: "endTime",
                            value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <EventTextInput
                        event={event}
                        result={result}
                        field="location"
                        label="Place"
                        value={event.location ?? ""}
                        placeholder="Add place"
                        onChange={(value) =>
                          onCorrection({
                            eventId: event.id,
                            field: "location",
                            value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <span
                        className={`confidence-value${event.confidence < 0.72 ? " low" : ""}`}
                        data-testid={`event-confidence-${event.id}`}
                      >
                        {Math.round(event.confidence * 100)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="table-help">Scroll sideways to edit every field.</p>
        </div>
      )}
    </section>
  );
}
