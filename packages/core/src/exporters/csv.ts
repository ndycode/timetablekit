import { TimetableParseResultSchema } from "../schema/runtime.js";
import type {
  EventSchedule,
  TimetableEvent,
  TimetableParseResult,
} from "../schema/types.js";

export const CSV_HEADERS = [
  "id",
  "title",
  "code",
  "eventType",
  "scheduleKind",
  "weekdays",
  "exactDates",
  "startTime",
  "endTime",
  "timezone",
  "startsOn",
  "endsOn",
  "location",
  "instructor",
  "notes",
  "confidence",
] as const;

function scheduleColumns(
  schedule: EventSchedule,
): readonly [string, string, string, string] {
  switch (schedule.kind) {
    case "weekly":
      return [
        "weekly",
        schedule.weekdays.join(";"),
        "",
        schedule.startsOn ?? "",
      ];
    case "exact":
      return ["exact", "", schedule.exactDates.join(";"), ""];
    default: {
      const exhaustive: never = schedule;
      return exhaustive;
    }
  }
}

function csvSafe(value: string): string {
  const guarded = /^[=+\-@]/u.test(value) ? `'${value}` : value;
  return /[",\r\n]/u.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
}

function eventRow(event: TimetableEvent): readonly string[] {
  const schedule = scheduleColumns(event.schedule);
  const endsOn =
    event.schedule.kind === "weekly" ? (event.schedule.endsOn ?? "") : "";
  return [
    event.id,
    event.title,
    event.code ?? "",
    event.eventType ?? "",
    schedule[0],
    schedule[1],
    schedule[2],
    event.startTime,
    event.endTime,
    event.timezone,
    schedule[3],
    endsOn,
    event.location ?? "",
    event.instructor ?? "",
    event.notes ?? "",
    event.confidence.toFixed(6),
  ];
}

export function escapeCsvField(value: string): string {
  return csvSafe(value);
}

export function toCSV(result: TimetableParseResult): string {
  const valid = TimetableParseResultSchema.parse(result);
  const rows = [CSV_HEADERS, ...valid.events.map(eventRow)];
  return `${rows.map((row) => row.map(csvSafe).join(",")).join("\r\n")}\r\n`;
}
