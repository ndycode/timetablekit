import type { LocalTime } from "../schema/types.js";

export type TimeParse =
  | {
      readonly kind: "ok";
      readonly time: LocalTime;
      readonly ambiguous: boolean;
    }
  | { readonly kind: "invalid"; readonly reason: "format" | "range" };

export type TimeRangeParse =
  | {
      readonly kind: "ok";
      readonly startTime: LocalTime;
      readonly endTime: LocalTime;
      readonly ambiguous: boolean;
      readonly startIndex: number;
      readonly endIndex: number;
      readonly sourceEnd: number;
    }
  | {
      readonly kind: "missing-end";
      readonly startTime: LocalTime;
      readonly ambiguous: boolean;
      readonly startIndex: number;
      readonly sourceEnd: number;
    }
  | { readonly kind: "none" }
  | { readonly kind: "invalid"; readonly reason: "format" | "range" };

type TimeToken = {
  readonly raw: string;
  readonly index: number;
  readonly end: number;
  readonly meridiem?: "AM" | "PM";
};

const TIME_TOKEN_PATTERN =
  /\b(\d{1,2}(?::\d{2})?|\d{3,4})\s*([ap]\.?m\.?)?\b/giu;

function normalizeMeridiem(value: string | undefined): "AM" | "PM" | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value.toLocaleUpperCase().startsWith("A") ? "AM" : "PM";
}

function parseClockParts(
  hourText: string,
  minuteText: string | undefined,
  meridiem: "AM" | "PM" | undefined,
): TimeParse {
  let hour: number;
  let minute: number;
  if (hourText.length > 2 && minuteText === undefined) {
    const splitAt = hourText.length - 2;
    hour = Number(hourText.slice(0, splitAt));
    minute = Number(hourText.slice(splitAt));
  } else {
    hour = Number(hourText);
    minute = minuteText === undefined ? 0 : Number(minuteText);
  }
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    return { kind: "invalid", reason: "format" };
  }
  if (meridiem !== undefined) {
    if (hour < 1 || hour > 12) {
      return { kind: "invalid", reason: "range" };
    }
    if (meridiem === "AM" && hour === 12) {
      hour = 0;
    }
    if (meridiem === "PM" && hour !== 12) {
      hour += 12;
    }
    return {
      kind: "ok",
      time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      ambiguous: false,
    };
  }
  if (hour < 0 || hour > 23) {
    return { kind: "invalid", reason: "range" };
  }
  const hasExplicit24HourShape =
    hour > 12 || hourText.length === 2 || minuteText !== undefined;
  return {
    kind: "ok",
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    ambiguous: !hasExplicit24HourShape && hour > 0,
  };
}

export function parseTime(
  value: string,
  meridiemOverride?: "AM" | "PM",
): TimeParse {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const match = /^(\d{1,4})(?::([0-5]\d))?\s*([ap]\.?m\.?)?$/iu.exec(trimmed);
  if (match === null || match[1] === undefined) {
    return { kind: "invalid", reason: "format" };
  }
  return parseClockParts(
    match[1],
    match[2],
    meridiemOverride ?? normalizeMeridiem(match[3]),
  );
}

function extractTimeTokens(value: string): readonly TimeToken[] {
  const tokens: TimeToken[] = [];
  const scrubbed = value.replace(
    /\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/gu,
    (date) => " ".repeat(date.length),
  );
  let match = TIME_TOKEN_PATTERN.exec(scrubbed);
  while (match !== null) {
    const raw = match[0];
    const numeric = match[1];
    const meridiem = normalizeMeridiem(match[2]);
    const compactIsTime =
      numeric !== undefined && numeric.length > 2 && !numeric.includes(":")
        ? Number(numeric.slice(0, numeric.length - 2)) <= 23 &&
          Number(numeric.slice(-2)) <= 59
        : true;
    if (numeric !== undefined && compactIsTime && match.index !== undefined) {
      const token = {
        raw: numeric,
        index: match.index,
        end: match.index + raw.length,
      };
      tokens.push(meridiem === undefined ? token : { ...token, meridiem });
    }
    match = TIME_TOKEN_PATTERN.exec(scrubbed);
  }
  return tokens;
}

export function parseTimeRange(value: string): TimeRangeParse {
  const tokens = extractTimeTokens(value);
  const first = tokens[0];
  if (first === undefined) {
    return { kind: "none" };
  }
  const second = tokens[1];
  const firstParsed = parseTime(first.raw, first.meridiem ?? second?.meridiem);
  if (firstParsed.kind === "invalid") {
    return firstParsed;
  }
  if (second === undefined) {
    return {
      kind: "missing-end",
      startTime: firstParsed.time,
      ambiguous: firstParsed.ambiguous,
      startIndex: first.index,
      sourceEnd: first.end,
    };
  }
  const separator = value
    .slice(first.end, second.index)
    .trim()
    .toLocaleLowerCase();
  if (
    separator !== "-" &&
    separator !== "–" &&
    separator !== "—" &&
    separator !== "to"
  ) {
    return {
      kind: "missing-end",
      startTime: firstParsed.time,
      ambiguous: firstParsed.ambiguous,
      startIndex: first.index,
      sourceEnd: first.end,
    };
  }
  const secondParsed = parseTime(second.raw, second.meridiem ?? first.meridiem);
  if (secondParsed.kind === "invalid") {
    return secondParsed;
  }
  return {
    kind: "ok",
    startTime: firstParsed.time,
    endTime: secondParsed.time,
    ambiguous: firstParsed.ambiguous || secondParsed.ambiguous,
    startIndex: first.index,
    endIndex: second.index,
    sourceEnd: second.end,
  };
}

export function formatTime(
  hour: number,
  minute: number,
): LocalTime | undefined {
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return undefined;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function timeToMinutes(value: LocalTime): number | undefined {
  const match = /^(\d{2}):([0-5]\d)$/.exec(value);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    return undefined;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 ? hour * 60 + minute : undefined;
}
