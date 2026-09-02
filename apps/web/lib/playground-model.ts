export {
  applyEventCorrection,
  warningForEventField,
  warningsForEvent,
  warningsForResult,
} from "@ndycode/timetablekit";
import type {
  EventCorrection,
  ParseOptions,
  ParseStage,
  ParseWarning,
  TermRange,
  TimetableEvent,
  TimetableInput,
  TimetableParseResult,
  WarningCode,
  Weekday,
} from "@ndycode/timetablekit";
import { SAMPLE_INPUT, SAMPLE_TEXT, SAMPLE_TERM } from "./samples";

export type PlaygroundTab = "sample" | "paste" | "upload";

export type EditableField =
  "title" | "schedule" | "startTime" | "endTime" | "location";

export type PlaygroundSource =
  | { readonly kind: "sample" }
  | { readonly kind: "paste"; readonly text: string }
  | {
      readonly kind: "upload";
      readonly input: TimetableInput | null;
      readonly label: string;
    };

export type PlaygroundSettings = {
  readonly locale: string;
  readonly timezone: string;
  readonly termStarts: string;
  readonly termEnds: string;
  readonly aiRecovery: boolean;
};

export type PlaygroundState = PlaygroundSettings & {
  readonly source: PlaygroundSource;
  readonly result: TimetableParseResult | null;
  readonly busy: boolean;
  readonly fileReading: boolean;
  readonly progress: number;
  readonly status: string;
  readonly error: string;
};

export type PlaygroundCorrection = Extract<
  EventCorrection,
  { readonly field: EditableField }
>;

export type AgendaGroup = {
  readonly key: string;
  readonly label: string;
  readonly date?: string;
  readonly events: readonly TimetableEvent[];
};

export type PlaygroundAction =
  | { readonly type: "tab-changed"; readonly tab: PlaygroundTab }
  | { readonly type: "paste-text-changed"; readonly text: string }
  | {
      readonly type: "file-selected";
      readonly input: TimetableInput;
      readonly label: string;
    }
  | { readonly type: "locale-changed"; readonly locale: string }
  | { readonly type: "timezone-changed"; readonly timezone: string }
  | { readonly type: "term-start-changed"; readonly value: string }
  | { readonly type: "term-end-changed"; readonly value: string }
  | { readonly type: "ai-recovery-changed"; readonly enabled: boolean }
  | { readonly type: "file-read-started" }
  | { readonly type: "parse-started" }
  | {
      readonly type: "parse-progressed";
      readonly progress: number;
      readonly status: string;
    }
  | { readonly type: "parse-succeeded"; readonly result: TimetableParseResult }
  | {
      readonly type: "parse-failed";
      readonly message: string;
      readonly status?: string;
    }
  | { readonly type: "parse-stopped" }
  | { readonly type: "result-updated"; readonly result: TimetableParseResult }
  | {
      readonly type: "notice-set";
      readonly status: string;
      readonly error?: string;
    }
  | { readonly type: "file-rejected"; readonly message: string }
  | { readonly type: "reset" };

export const DAY_LABELS: Readonly<Record<Weekday, string>> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday",
};

export const DAY_OPTIONS: readonly Weekday[] = [
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
  "SU",
];

export const PROGRESS_LABELS: Readonly<Record<ParseStage, string>> = {
  assemble: "Building events.",
  confidence: "Checking confidence.",
  conflicts: "Checking for time conflicts.",
  deduplicate: "Removing duplicates.",
  extract: "Reading the schedule.",
  finalize: "Finishing.",
  locale: "Applying language settings.",
  normalize: "Preparing events.",
  preflight: "Checking the input.",
  recognize: "Finding days and times.",
  recovery: "Running optional recovery.",
  segment: "Reading rows.",
  validate: "Checking events.",
};

const ISSUE_TITLES: Partial<Record<WarningCode, string>> = {
  AMBIGUOUS_TIME: "Unclear time",
  AI_OUTPUT_INVALID: "Recovery returned an unusable result",
  AI_PROVIDER_UNAVAILABLE: "Recovery unavailable",
  CONFLICT_LIMIT: "Conflict check stopped",
  DUPLICATE_EVENT: "Duplicate event",
  INVALID_DATE: "Invalid date",
  INVALID_TERM_RANGE: "Invalid date range",
  INVALID_TIME_RANGE: "Invalid time range",
  MISSING_END_TIME: "Missing end time",
  MISSING_START_TIME: "Missing start time",
  MISSING_TITLE: "Missing event name",
  OUTSIDE_TERM_RANGE: "Outside date range",
  SCHEDULE_CONFLICT: "Time conflict",
  UNKNOWN_DAY_LABEL: "Unknown day",
};

const ISSUE_MESSAGES: Partial<Record<WarningCode, string>> = {
  AI_OUTPUT_INVALID: "Recovery returned a result we could not use.",
  AI_PROVIDER_UNAVAILABLE:
    "No recovery provider is available in this playground.",
  AI_RECOVERY_SKIPPED: "Recovery was skipped because consent was not provided.",
  AMBIGUOUS_TIME: "We could not tell which time this means.",
  CONFLICT_LIMIT: "We could not check every time conflict.",
  DUPLICATE_EVENT: "We found the same event twice. One copy was removed.",
  FILE_TOO_LARGE: "This file is too large.",
  INVALID_DATE: "This date is not valid.",
  INVALID_TERM_RANGE: "The date range is not valid.",
  INVALID_TIME_RANGE: "The start and end times do not work.",
  INVALID_TIMEZONE: "This time zone is not valid.",
  LOW_CONFIDENCE: "We are not sure about this event.",
  MISSING_END_TIME: "This event has no end time.",
  MISSING_START_TIME: "This event has no start time.",
  MISSING_TITLE: "This event has no name.",
  NO_TEXT_FOUND: "We could not find text.",
  OCR_PARTIAL: "The image reader found only part of the text.",
  OUTSIDE_TERM_RANGE: "This event is outside the selected dates.",
  POSSIBLE_DUPLICATE: "This event may be a duplicate.",
  PROVIDER_ABORTED: "The file read was stopped.",
  PROVIDER_FAILED: "The file could not be read.",
  PROVIDER_OUTPUT_INVALID: "The file reader returned data we could not use.",
  PROVIDER_TIMEOUT: "The file reader took too long.",
  SCHEDULE_CONFLICT: "Two events happen at the same time.",
  UNKNOWN_DAY_LABEL: "We could not recognize the day.",
  UNKNOWN_LOCALE: "We do not support that language yet.",
  UNRECOGNIZED_CSV: "We could not read this CSV file.",
  UNSUPPORTED_PROVIDER: "We cannot read this file type yet.",
};

export function createInitialPlaygroundState(): PlaygroundState {
  return {
    source: { kind: "sample" },
    locale: "en-PH",
    timezone: "Asia/Manila",
    termStarts: SAMPLE_TERM.startsOn,
    termEnds: SAMPLE_TERM.endsOn,
    aiRecovery: false,
    result: null,
    busy: false,
    fileReading: false,
    progress: 0,
    status: "Sample ready.",
    error: "",
  };
}

export function settingsFromState(state: PlaygroundState): PlaygroundSettings {
  return {
    locale: state.locale,
    timezone: state.timezone,
    termStarts: state.termStarts,
    termEnds: state.termEnds,
    aiRecovery: state.aiRecovery,
  };
}

export function currentInputForSource(
  source: PlaygroundSource,
): TimetableInput | undefined {
  switch (source.kind) {
    case "sample":
      return SAMPLE_INPUT;
    case "paste":
      return {
        kind: "text",
        text: source.text,
        filename: "pasted-timetable.txt",
      };
    case "upload":
      return source.input ?? undefined;
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}

export function parseOptionsFor(
  settings: PlaygroundSettings,
  signal: AbortSignal,
  onProgress: ParseOptions["onProgress"],
): ParseOptions {
  const term = termFromDraft(settings.termStarts, settings.termEnds);
  return {
    locale: settings.locale,
    timezone: settings.timezone,
    ...(term === undefined ? {} : { term }),
    evidence: "locations",
    signal,
    ...(onProgress === undefined ? {} : { onProgress }),
    recovery: {
      enabled: settings.aiRecovery,
      consent: settings.aiRecovery,
    },
  };
}

export function termFromDraft(
  startsOn: string,
  endsOn: string,
): TermRange | undefined {
  return startsOn !== "" && endsOn !== "" ? { startsOn, endsOn } : undefined;
}

export function draftSettingsError(
  settings: PlaygroundSettings,
): string | undefined {
  const hasStart = settings.termStarts !== "";
  const hasEnd = settings.termEnds !== "";
  return hasStart === hasEnd
    ? undefined
    : "Add both dates for a range, or clear both dates.";
}

export function issueTitle(warning: ParseWarning): string {
  return (
    ISSUE_TITLES[warning.code] ??
    warning.code
      .replaceAll("_", " ")
      .toLocaleLowerCase()
      .replace(
        /(^| )([a-z])/g,
        (_match, prefix: string, letter: string) =>
          `${prefix}${letter.toUpperCase()}`,
      )
  );
}

export function issueMessage(warning: ParseWarning): string {
  return ISSUE_MESSAGES[warning.code] ?? warning.message;
}

function sortEvents(
  events: readonly TimetableEvent[],
): readonly TimetableEvent[] {
  return [...events].sort((left, right) => {
    const byStart = left.startTime.localeCompare(right.startTime);
    if (byStart !== 0) return byStart;
    const byEnd = left.endTime.localeCompare(right.endTime);
    if (byEnd !== 0) return byEnd;
    return left.id.localeCompare(right.id);
  });
}

function eventHasWeekday(event: TimetableEvent, day: Weekday): boolean {
  return (
    event.schedule.kind === "weekly" && event.schedule.weekdays.includes(day)
  );
}

export function agendaGroupsForResult(
  result: TimetableParseResult,
): readonly AgendaGroup[] {
  const groups: AgendaGroup[] = DAY_OPTIONS.flatMap((day) => {
    const events = sortEvents(
      result.events.filter((event) => eventHasWeekday(event, day)),
    );
    return events.length === 0
      ? []
      : [{ key: `weekday-${day}`, label: DAY_LABELS[day], events }];
  });
  const exactGroups = new Map<string, TimetableEvent[]>();
  for (const event of result.events) {
    if (event.schedule.kind !== "exact") continue;
    for (const date of event.schedule.exactDates) {
      const existing = exactGroups.get(date);
      if (existing === undefined) exactGroups.set(date, [event]);
      else existing.push(event);
    }
  }
  for (const [date, events] of [...exactGroups.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    groups.push({
      key: `date-${date}`,
      label: date,
      date,
      events: sortEvents(events),
    });
  }
  const scheduledIds = new Set(
    groups.flatMap((group) => group.events.map((event) => event.id)),
  );
  const unscheduled = sortEvents(
    result.events.filter((event) => {
      if (scheduledIds.has(event.id)) return false;
      return event.schedule.kind === "weekly"
        ? event.schedule.weekdays.length === 0
        : event.schedule.exactDates.length === 0;
    }),
  );
  if (unscheduled.length > 0) {
    groups.push({
      key: "unscheduled",
      label: "Unscheduled",
      events: unscheduled,
    });
  }
  return groups;
}

export function playgroundReducer(
  state: PlaygroundState,
  action: PlaygroundAction,
): PlaygroundState {
  switch (action.type) {
    case "tab-changed":
      return {
        ...state,
        result: null,
        error: "",
        status:
          action.tab === "sample"
            ? "Sample ready."
            : action.tab === "paste"
              ? "Paste text ready."
              : "Choose a file.",
        source:
          action.tab === "sample"
            ? { kind: "sample" }
            : action.tab === "paste"
              ? {
                  kind: "paste",
                  text:
                    state.source.kind === "paste"
                      ? state.source.text
                      : SAMPLE_TEXT,
                }
              : {
                  kind: "upload",
                  input:
                    state.source.kind === "upload" ? state.source.input : null,
                  label:
                    state.source.kind === "upload" ? state.source.label : "",
                },
      };
    case "paste-text-changed":
      return {
        ...state,
        source: { kind: "paste", text: action.text },
        result: null,
        status: "Text changed. Ready to read.",
        error: "",
      };
    case "file-selected":
      return {
        ...state,
        source: { kind: "upload", input: action.input, label: action.label },
        result: null,
        fileReading: false,
        status: `Selected ${action.label}. Ready to read.`,
        error: "",
      };
    case "locale-changed":
      return {
        ...state,
        locale: action.locale,
        result: null,
        status: "Settings changed. Ready to read.",
        error: "",
      };
    case "timezone-changed":
      return {
        ...state,
        timezone: action.timezone,
        result: null,
        status: "Settings changed. Ready to read.",
        error: "",
      };
    case "term-start-changed":
      return {
        ...state,
        termStarts: action.value,
        result: null,
        status: "Settings changed. Ready to read.",
        error: "",
      };
    case "term-end-changed":
      return {
        ...state,
        termEnds: action.value,
        result: null,
        status: "Settings changed. Ready to read.",
        error: "",
      };
    case "ai-recovery-changed":
      return {
        ...state,
        aiRecovery: action.enabled,
        result: null,
        status: "Settings changed. Ready to read.",
        error: "",
      };
    case "file-read-started":
      return {
        ...state,
        result: null,
        fileReading: true,
        status: "Checking file.",
        error: "",
      };
    case "parse-started":
      return {
        ...state,
        result: null,
        busy: true,
        fileReading: false,
        progress: 0,
        status: "Reading it here.",
        error: "",
      };
    case "parse-progressed":
      return {
        ...state,
        busy: true,
        progress: action.progress,
        status: action.status,
        error: "",
      };
    case "parse-succeeded":
      return {
        ...state,
        result: action.result,
        busy: false,
        fileReading: false,
        progress: 100,
        status: `Found ${action.result.events.length} event${action.result.events.length === 1 ? "" : "s"}.`,
        error: "",
      };
    case "parse-failed":
      return {
        ...state,
        result: null,
        busy: false,
        fileReading: false,
        progress: 0,
        status:
          action.status ??
          "We could not read it. Check the schedule and try again.",
        error: action.message,
      };
    case "parse-stopped":
      return {
        ...state,
        busy: false,
        fileReading: false,
        progress: 0,
        status: "Reading stopped.",
      };
    case "result-updated":
      return {
        ...state,
        result: action.result,
        status: "Events updated.",
        error: "",
      };
    case "notice-set":
      return {
        ...state,
        status: action.status,
        error: action.error ?? "",
      };
    case "file-rejected":
      return {
        ...state,
        source: { kind: "upload", input: null, label: "" },
        result: null,
        fileReading: false,
        status: "File rejected before reading.",
        error: action.message,
      };
    case "reset":
      return createInitialPlaygroundState();
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
