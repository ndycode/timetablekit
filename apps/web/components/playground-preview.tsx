import type {
  TimetableEvent,
  TimetableParseResult,
} from "@ndycode/timetablekit";
import { agendaGroupsForResult } from "../lib/playground-model";

export type PlaygroundPreviewProps = {
  readonly result: TimetableParseResult | null;
};

function eventTitle(event: TimetableEvent): string {
  return event.title.trim() === "" ? "Untitled event" : event.title;
}

function eventDetails(event: TimetableEvent): string | undefined {
  const details = [event.location, event.instructor].filter(
    (value): value is string => value !== undefined && value.trim() !== "",
  );
  return details.length === 0 ? undefined : details.join(" · ");
}

export function PlaygroundPreview({ result }: PlaygroundPreviewProps) {
  const groups = result === null ? [] : agendaGroupsForResult(result);
  return (
    <section
      className="playground-panel rail-panel preview-panel"
      aria-labelledby="preview-title"
      data-testid="playground-preview"
    >
      <div className="panel-heading rail-heading">
        <div className="panel-title-group">
          <span className="panel-step" aria-hidden="true">
            04
          </span>
          <div>
            <h2 id="preview-title">Schedule preview</h2>
            <p>See the days and dates that will be exported.</p>
          </div>
        </div>
        <span className="panel-note">
          {result === null ? "Waiting" : `${result.events.length} events`}
        </span>
      </div>
      <div className="rail-body">
        {groups.length === 0 ? (
          <p className="empty-result" data-testid="preview-empty">
            Read a schedule to see its weekly preview.
          </p>
        ) : (
          <div className="agenda-preview">
            {groups.map((group) => (
              <section
                className="agenda-day"
                key={group.key}
                aria-label={group.label}
              >
                <h3>{group.label}</h3>
                <ul className="agenda-list">
                  {group.events.map((event) => (
                    <li
                      key={`${group.key}-${event.id}`}
                      data-event-id={event.id}
                    >
                      <time
                        dateTime={
                          group.date === undefined
                            ? undefined
                            : `${group.date}T${event.startTime}`
                        }
                      >
                        {event.startTime}–{event.endTime}
                      </time>
                      <span>
                        <strong>{eventTitle(event)}</strong>
                        {eventDetails(event) === undefined ? null : (
                          <small>{eventDetails(event)}</small>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
