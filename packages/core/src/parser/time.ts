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
  /(?<![\p{L}\p{N}_])(\d{1,2}(?::\d{2})?|\d{3,4})\s*([ap]\.?m\.?)?(?![\p{L}\p{N}_])/giu;

function isLikelyYear(value: string): boolean {
  return /^(?:19|20)\d{2}$/u.test(value);
}

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
    hour > 12 || hourText.length >= 2 || minuteText !== undefined;
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
  const scrubbed = value
    .replace(
      /\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/gu,
      (date) => " ".repeat(date.length),
    )
    .replace(
      /\b(?:academic\s+year|school\s+year|ay|sy|term|room|rm\.?|location|loc\.?|venue|course|subject|section)\s*(?:[:#-]\s*)?\d{1,4}\s*[-–—]\s*\d{1,4}\b/giu,
      (metadata) => " ".repeat(metadata.length),
    );
  let match = TIME_TOKEN_PATTERN.exec(scrubbed);
  while (match !== null) {
    const raw = match[0];
    const numeric = match[1];
    const meridiem = normalizeMeridiem(match[2]);
    if (numeric !== undefined && match.index !== undefined) {
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

function isRangeSeparator(value: string): boolean {
  const separator = value.trim().toLocaleLowerCase();
  return (
    separator === "-" ||
    separator === "–" ||
    separator === "—" ||
    separator === "to"
  );
}

function isStandaloneToken(token: TimeToken): boolean {
  if (token.meridiem === undefined && isLikelyYear(token.raw)) {
    return false;
  }
  return (
    token.meridiem !== undefined ||
    token.raw.includes(":") ||
    token.raw.length <= 2 ||
    token.raw.length === 4
  );
}

function isUnmarkedCompactToken(token: TimeToken): boolean {
  return (
    token.meridiem === undefined &&
    !token.raw.includes(":") &&
    token.raw.length >= 3
  );
}

function invalidExtraToken(): TimeRangeParse {
  return { kind: "invalid", reason: "format" };
}

export function parseTimeRange(value: string): TimeRangeParse {
  const tokens = extractTimeTokens(value);
  let compactCandidate: TimeRangeParse | undefined;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const first = tokens[index];
    const second = tokens[index + 1];
    if (
      first === undefined ||
      second === undefined ||
      !isRangeSeparator(value.slice(first.end, second.index))
    ) {
      continue;
    }
    const compactPair =
      isUnmarkedCompactToken(first) && isUnmarkedCompactToken(second);
    const firstParsed = parseTime(first.raw, first.meridiem ?? second.meridiem);
    if (firstParsed.kind === "invalid") {
      if (compactPair) continue;
      return firstParsed;
    }
    const secondParsed = parseTime(
      second.raw,
      second.meridiem ?? first.meridiem,
    );
    if (secondParsed.kind === "invalid") {
      if (compactPair) continue;
      return secondParsed;
    }
    const third = tokens[index + 2];
    if (
      third !== undefined &&
      isRangeSeparator(value.slice(second.end, third.index))
    ) {
      return invalidExtraToken();
    }
    const candidate: TimeRangeParse = {
      kind: "ok",
      startTime: firstParsed.time,
      endTime: secondParsed.time,
      ambiguous: firstParsed.ambiguous || secondParsed.ambiguous,
      startIndex: first.index,
      endIndex: second.index,
      sourceEnd: second.end,
    };
    if (!compactPair) return candidate;
    compactCandidate ??= candidate;
  }

  if (compactCandidate !== undefined) return compactCandidate;

  for (const token of tokens) {
    if (!isStandaloneToken(token)) {
      continue;
    }
    const parsed = parseTime(token.raw, token.meridiem);
    if (parsed.kind === "invalid") {
      return parsed;
    }
    return {
      kind: "missing-end",
      startTime: parsed.time,
      ambiguous: parsed.ambiguous,
      startIndex: token.index,
      sourceEnd: token.end,
    };
  }
  return { kind: "none" };
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
