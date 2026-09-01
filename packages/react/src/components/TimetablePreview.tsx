import type { ReactNode } from "react";
import type {
  TimetableEvent,
  TimetableParseResult,
  Weekday,
} from "@ndycode/timetablekit";
import { WEEKDAY_LABELS, WEEKDAY_OPTIONS } from "../weekday.js";

type PreviewGroup = {
  readonly key: string;
  readonly label: string;
  readonly events: readonly TimetableEvent[];
};

type TimetablePreviewBaseProps = {
  readonly result: TimetableParseResult;
  readonly heading?: string | undefined;
  readonly emptyMessage?: string | undefined;
  readonly className?: string | undefined;
};

export type TimetableAgendaProps = TimetablePreviewBaseProps;
export type TimetableCalendarProps = TimetablePreviewBaseProps;

export type TimetablePreviewView = "agenda" | "calendar";

export type TimetablePreviewProps = TimetablePreviewBaseProps & {
  readonly view?: TimetablePreviewView;
};

function sortEvents(
  events: readonly TimetableEvent[],
): readonly TimetableEvent[] {
  return [...events].sort((left, right) => {
    const byStart = left.startTime.localeCompare(right.startTime);
    if (byStart !== 0) {
      return byStart;
    }
    const byEnd = left.endTime.localeCompare(right.endTime);
    if (byEnd !== 0) {
      return byEnd;
    }
    return left.id.localeCompare(right.id);
  });
}

function weeklyEventsForDay(
  events: readonly TimetableEvent[],
  day: Weekday,
): readonly TimetableEvent[] {
  return sortEvents(
    events.filter(
      (event) =>
        event.schedule.kind === "weekly" &&
        event.schedule.weekdays.includes(day),
    ),
  );
}

function exactDateGroups(
  events: readonly TimetableEvent[],
): readonly PreviewGroup[] {
  const grouped = new Map<string, TimetableEvent[]>();
  for (const event of events) {
    if (event.schedule.kind !== "exact") {
      continue;
    }
    for (const date of event.schedule.exactDates) {
      const current = grouped.get(date);
      if (current === undefined) {
        grouped.set(date, [event]);
      } else {
        current.push(event);
      }
    }
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, groupedEvents]) => ({
      key: `date-${date}`,
      label: date,
      events: sortEvents(groupedEvents),
    }));
}

function weeklyGroups(
  events: readonly TimetableEvent[],
): readonly PreviewGroup[] {
  return WEEKDAY_OPTIONS.flatMap((day) => {
    const dayEvents = weeklyEventsForDay(events, day);
    return dayEvents.length === 0
      ? []
      : [
          {
            key: `weekday-${day}`,
            label: WEEKDAY_LABELS[day],
            events: dayEvents,
          },
        ];
  });
}

function unscheduledEvents(
  events: readonly TimetableEvent[],
): readonly TimetableEvent[] {
  return events.filter((event) => {
    if (event.schedule.kind === "weekly") {
      return event.schedule.weekdays.length === 0;
    }
    return event.schedule.exactDates.length === 0;
  });
}

function eventTitle(event: TimetableEvent): string {
  return event.title.trim().length === 0 ? "Untitled event" : event.title;
}

function eventDetails(event: TimetableEvent): ReactNode {
  const details = [event.location, event.instructor].filter(
    (value): value is string => value !== undefined && value.trim().length > 0,
  );
  return details.length === 0 ? null : <small>{details.join(" · ")}</small>;
}

function EventSummary({
  event,
  date,
}: {
  readonly event: TimetableEvent;
  readonly date: string | undefined;
}) {
  const dateTime =
    date === undefined ? undefined : `${date}T${event.startTime}`;
  return (
    <>
      <time dateTime={dateTime}>{`${event.startTime}–${event.endTime}`}</time>
      <span>
        <strong>{eventTitle(event)}</strong>
        {eventDetails(event)}
      </span>
    </>
  );
}

function previewGroups(result: TimetableParseResult): readonly PreviewGroup[] {
  const groups = [
    ...weeklyGroups(result.events),
    ...exactDateGroups(result.events),
  ];
  const scheduledEventIds = new Set(
    groups.flatMap((group) => group.events.map((event) => event.id)),
  );
  const unscheduled = unscheduledEvents(result.events).filter(
    (event) => !scheduledEventIds.has(event.id),
  );
  return unscheduled.length === 0
    ? groups
    : [
        ...groups,
        {
          key: "unscheduled",
          label: "Unscheduled",
          events: sortEvents(unscheduled),
        },
      ];
}

export function TimetableAgenda({
  result,
  heading = "Agenda preview",
  emptyMessage = "No events to preview.",
  className,
}: TimetableAgendaProps) {
  const groups = previewGroups(result);
  return (
    <section className={className} aria-label={heading}>
      <h2>{heading}</h2>
      {groups.length === 0 ? (
        <p role="status">{emptyMessage}</p>
      ) : (
        <div className="timetable-agenda">
          {groups.map((group) => (
            <section
              className="timetable-agenda-group"
              key={group.key}
              aria-label={group.label}
            >
              <h3>{group.label}</h3>
              <ul>
                {group.events.map((event) => (
                  <li key={`${group.key}-${event.id}`}>
                    <EventSummary
                      event={event}
                      date={
                        group.key.startsWith("date-") ? group.label : undefined
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

export function TimetableCalendar({
  result,
  heading = "Calendar preview",
  emptyMessage = "No events to preview.",
  className,
}: TimetableCalendarProps) {
  const dayEvents = WEEKDAY_OPTIONS.map((day) =>
    weeklyEventsForDay(result.events, day),
  );
  const dateGroups = exactDateGroups(result.events);
  const unscheduled = unscheduledEvents(result.events);
  const hasEvents =
    dayEvents.some((events) => events.length > 0) ||
    dateGroups.length > 0 ||
    unscheduled.length > 0;
  return (
    <section className={className} aria-label={heading}>
      <h2>{heading}</h2>
      {!hasEvents ? (
        <p role="status">{emptyMessage}</p>
      ) : (
        <>
          <table className="timetable-calendar">
            <caption>Weekly events by day</caption>
            <thead>
              <tr>
                {WEEKDAY_OPTIONS.map((day) => (
                  <th scope="col" key={day}>
                    {WEEKDAY_LABELS[day]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {dayEvents.map((events, index) => {
                  const day = WEEKDAY_OPTIONS[index];
                  if (day === undefined) {
                    return <td key={`empty-${index}`} />;
                  }
                  return (
                    <td key={day} aria-label={`${WEEKDAY_LABELS[day]} events`}>
                      {events.length === 0 ? (
                        <span>None</span>
                      ) : (
                        <ul>
                          {events.map((event) => (
                            <li key={`${day}-${event.id}`}>
                              <EventSummary event={event} date={undefined} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
          {dateGroups.length === 0 ? null : (
            <section
              className="timetable-calendar-dates"
              aria-label="Date-specific events"
            >
              <h3>Date-specific events</h3>
              <ul>
                {dateGroups.flatMap((group) =>
                  group.events.map((event) => (
                    <li key={`${group.key}-${event.id}`}>
                      <time dateTime={`${group.label}T${event.startTime}`}>
                        {group.label}
                      </time>
                      <span>
                        <EventSummary event={event} date={undefined} />
                      </span>
                    </li>
                  )),
                )}
              </ul>
            </section>
          )}
          {unscheduled.length === 0 ? null : (
            <section
              className="timetable-calendar-unscheduled"
              aria-label="Unscheduled events"
            >
              <h3>Unscheduled events</h3>
              <ul>
                {unscheduled.map((event) => (
                  <li key={event.id}>
                    <EventSummary event={event} date={undefined} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </section>
  );
}

export function TimetablePreview({
  result,
  view = "agenda",
  heading,
  emptyMessage,
  className,
}: TimetablePreviewProps) {
  switch (view) {
    case "agenda":
      return (
        <TimetableAgenda
          result={result}
          heading={heading}
          emptyMessage={emptyMessage}
          className={className}
        />
      );
    case "calendar":
      return (
        <TimetableCalendar
          result={result}
          heading={heading}
          emptyMessage={emptyMessage}
          className={className}
        />
      );
    default: {
      const exhaustive: never = view;
      return exhaustive;
    }
  }
}
