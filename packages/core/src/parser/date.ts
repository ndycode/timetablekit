import type {
  IsoDate,
  LocaleDefinition,
  SourceLocation,
  Weekday,
} from "../schema/types.js";

export type DateParse =
  | { readonly kind: "ok"; readonly date: IsoDate }
  | { readonly kind: "invalid" };

const WEEKDAY_BY_UTC_INDEX: readonly Weekday[] = [
  "SU",
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
];

function validDate(
  year: number,
  month: number,
  day: number,
): IsoDate | undefined {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1
  ) {
    return undefined;
  }
  const date = utcDate(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function utcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export function parseDate(
  value: string,
  definition: LocaleDefinition,
): DateParse {
  const trimmed = value.trim();
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(trimmed);
  if (
    iso !== null &&
    iso[1] !== undefined &&
    iso[2] !== undefined &&
    iso[3] !== undefined
  ) {
    const date = validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return date === undefined ? { kind: "invalid" } : { kind: "ok", date };
  }
  const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (
    local === null ||
    local[1] === undefined ||
    local[2] === undefined ||
    local[3] === undefined
  ) {
    return { kind: "invalid" };
  }
  const first = Number(local[1]);
  const second = Number(local[2]);
  const year = Number(local[3]);
  const month = definition.dateOrder === "DMY" ? second : first;
  const day = definition.dateOrder === "DMY" ? first : second;
  const date = validDate(year, month, day);
  return date === undefined ? { kind: "invalid" } : { kind: "ok", date };
}

export type DateMatch = {
  readonly date: IsoDate;
  readonly location: SourceLocation;
};

export function findDates(
  text: string,
  definition: LocaleDefinition,
): readonly DateMatch[] {
  const pattern =
    /\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/g;
  const matches: DateMatch[] = [];
  let match = pattern.exec(text);
  while (match !== null) {
    const value = match[0];
    const parsed = parseDate(value, definition);
    if (parsed.kind === "ok" && match.index !== undefined) {
      matches.push({
        date: parsed.date,
        location: {
          charStart: match.index,
          charEnd: match.index + value.length,
        },
      });
    }
    match = pattern.exec(text);
  }
  return matches;
}

export function weekdayForDate(date: IsoDate): Weekday | undefined {
  const parsed = parseDate(date, {
    id: "iso",
    dayAliases: {},
    dateOrder: "YMD",
  });
  if (parsed.kind === "invalid") {
    return undefined;
  }
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(parsed.date);
  if (
    parts === null ||
    parts[1] === undefined ||
    parts[2] === undefined ||
    parts[3] === undefined
  ) {
    return undefined;
  }
  const dayIndex = utcDate(
    Number(parts[1]),
    Number(parts[2]) - 1,
    Number(parts[3]),
  ).getUTCDay();
  return WEEKDAY_BY_UTC_INDEX[dayIndex];
}

export function dateWithin(
  date: IsoDate,
  range: { readonly startsOn: IsoDate; readonly endsOn: IsoDate },
): boolean {
  return date >= range.startsOn && date <= range.endsOn;
}

export function addDays(date: IsoDate, amount: number): IsoDate | undefined {
  const parsed = parseDate(date, {
    id: "iso",
    dayAliases: {},
    dateOrder: "YMD",
  });
  if (parsed.kind === "invalid") {
    return undefined;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(parsed.date);
  if (
    match === null ||
    match[1] === undefined ||
    match[2] === undefined ||
    match[3] === undefined
  ) {
    return undefined;
  }
  const result = utcDate(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  result.setUTCDate(result.getUTCDate() + amount);
  return validDate(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    result.getUTCDate(),
  );
}
