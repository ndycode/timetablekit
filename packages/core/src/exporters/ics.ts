import { TimetableError } from "../errors.js";
import { addDays, weekdayForDate } from "../parser/date.js";
import { timeToMinutes } from "../parser/time.js";
import { utf8ByteLength } from "../parser/text.js";
import { TimetableParseResultSchema } from "../schema/runtime.js";
import type {
  EventSchedule,
  IsoDate,
  IsoInstant,
  TimetableEvent,
  TimetableParseResult,
  TimeZone,
  Weekday,
} from "../schema/types.js";

type IcsOptions = {
  readonly dtstamp?: IsoInstant;
  readonly timezoneMode?: "TZID" | "UTC";
  readonly weeklyStartsOn?: IsoDate;
};

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldLine(line: string): string {
  let result = "";
  let current = "";
  let bytes = 0;
  for (const character of line) {
    const characterBytes = utf8ByteLength(character);
    const limit = current.startsWith(" ") ? 75 : 75;
    if (current.length > 0 && bytes + characterBytes > limit) {
      result += `${current}\r\n `;
      current = "";
      bytes = 1;
    }
    current += character;
    bytes += characterBytes;
  }
  return result + current;
}

function validTimezone(timezone: TimeZone): boolean {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).resolvedOptions()
        .timeZone.length > 0
    );
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

function dateParts(
  date: IsoDate,
):
  | { readonly year: number; readonly month: number; readonly day: number }
  | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (
    match === null ||
    match[1] === undefined ||
    match[2] === undefined ||
    match[3] === undefined
  )
    return undefined;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function localStamp(date: IsoDate, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

function utcStamp(date: IsoDate, time: string, timezone: TimeZone): string {
  const parts = dateParts(date);
  const minutes = timeToMinutes(time);
  if (parts === undefined || minutes === undefined)
    throw new TimetableError(
      "EXPORT_INVALID_RESULT",
      "An event has an invalid date or time.",
    );
  const localEpoch = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    Math.floor(minutes / 60),
    minutes % 60,
  );
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(new Date(localEpoch))
      .map((part) => [part.type, part.value]),
  );
  const represented = Date.UTC(
    Number(values["year"]),
    Number(values["month"]) - 1,
    Number(values["day"]),
    Number(values["hour"]),
    Number(values["minute"]),
  );
  const adjusted = new Date(localEpoch - (represented - localEpoch));
  return adjusted
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/u, "Z");
}

function stamp(
  date: IsoDate,
  time: string,
  timezone: TimeZone,
  mode: "TZID" | "UTC",
): string {
  return mode === "UTC"
    ? utcStamp(date, time, timezone)
    : localStamp(date, time);
}

function dateRange(
  schedule: EventSchedule,
  result: TimetableParseResult,
  options: IcsOptions,
): { readonly startsOn: IsoDate; readonly endsOn: IsoDate } {
  if (schedule.kind !== "weekly")
    throw new TimetableError(
      "EXPORT_INVALID_RESULT",
      "An exact schedule cannot use a weekly range.",
    );
  const startsOn =
    schedule.startsOn ?? options.weeklyStartsOn ?? result.term?.startsOn;
  const endsOn = schedule.endsOn ?? result.term?.endsOn;
  if (startsOn === undefined || endsOn === undefined || startsOn > endsOn)
    throw new TimetableError(
      "EXPORT_REQUIRES_TERM",
      "Weekly events require a concrete recurrence range.",
    );
  return { startsOn, endsOn };
}

function firstMatchingDate(start: IsoDate, weekday: Weekday): IsoDate {
  let current: IsoDate | undefined = start;
  for (let count = 0; count < 7 && current !== undefined; count += 1) {
    if (weekdayForDate(current) === weekday) return current;
    current = addDays(current, 1);
  }
  throw new TimetableError(
    "EXPORT_INVALID_RESULT",
    "The weekly recurrence range has no matching date.",
  );
}

function description(event: TimetableEvent): string | undefined {
  const parts = [
    event.code === undefined ? "" : `Code: ${event.code}`,
    event.eventType === undefined ? "" : `Type: ${event.eventType}`,
    event.instructor === undefined ? "" : `Instructor: ${event.instructor}`,
    event.notes === undefined ? "" : event.notes,
  ].filter((part) => part.length > 0);
  return parts.length === 0 ? undefined : parts.join("\n");
}

function commonLines(event: TimetableEvent, dtstamp: IsoInstant): string[] {
  const lines = ["DTSTAMP:" + dtstamp, `SUMMARY:${escapeIcs(event.title)}`];
  if (event.location !== undefined)
    lines.push(`LOCATION:${escapeIcs(event.location)}`);
  const eventDescription = description(event);
  if (eventDescription !== undefined)
    lines.push(`DESCRIPTION:${escapeIcs(eventDescription)}`);
  return lines;
}

function eventLines(
  event: TimetableEvent,
  result: TimetableParseResult,
  options: IcsOptions,
  dtstamp: IsoInstant,
): readonly string[] {
  const mode = options.timezoneMode ?? "TZID";
  const timezoneParameter = mode === "TZID" ? `;TZID=${event.timezone}` : "";
  const common = commonLines(event, dtstamp);
  if (event.schedule.kind === "weekly") {
    const range = dateRange(event.schedule, result, options);
    const firstDate = firstMatchingDate(
      range.startsOn,
      event.schedule.weekdays[0] ?? "MO",
    );
    const start = stamp(firstDate, event.startTime, event.timezone, mode);
    const end = stamp(firstDate, event.endTime, event.timezone, mode);
    return [
      "BEGIN:VEVENT",
      `UID:${escapeIcs(event.id)}@timetablekit`,
      ...common,
      `DTSTART${timezoneParameter}:${start}`,
      `DTEND${timezoneParameter}:${end}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${event.schedule.weekdays.join(",")};UNTIL=${range.endsOn.replace(/-/g, "")}T235959`,
      "END:VEVENT",
    ];
  } else {
    return event.schedule.exactDates.flatMap((date) => {
      const uid = `${escapeIcs(event.id)}-${date}@timetablekit`;
      const start = stamp(date, event.startTime, event.timezone, mode);
      const end = stamp(date, event.endTime, event.timezone, mode);
      return [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        ...common,
        `DTSTART${timezoneParameter}:${start}`,
        `DTEND${timezoneParameter}:${end}`,
        "END:VEVENT",
      ];
    });
  }
}

export function escapeIcsText(value: string): string {
  return escapeIcs(value);
}

export function foldIcsLine(line: string): string {
  return foldLine(line);
}

export function toICS(
  result: TimetableParseResult,
  options: IcsOptions = {},
): string {
  const valid = TimetableParseResultSchema.parse(result);
  if (!validTimezone(valid.timezone))
    throw new TimetableError(
      "EXPORT_INVALID_RESULT",
      "The result timezone is not valid.",
    );
  const dtstamp = options.dtstamp ?? "19700101T000000Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ndycode//TimetableKit//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-TIMEZONE:${valid.timezone}`,
  ];
  for (const event of valid.events)
    lines.push(...eventLines(event, valid, options, dtstamp));
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
