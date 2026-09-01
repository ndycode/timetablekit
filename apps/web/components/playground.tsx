"use client";

import {
  DEFAULT_MAX_CONFLICTS,
  createTimetableParser,
  detectConflictsBounded,
  parseTimetable,
  toCSV,
  toICS,
  toJSON,
  validateTimetable,
} from "@ndycode/timetablekit";
import type {
  ExtractionArtifact,
  ExtractionProvider,
  OcrProvider,
  ParseOptions,
  ParseWarning,
  SourceDescriptor,
  TimetableEvent,
  TimetableInput,
  TimetableParseResult,
  Weekday,
} from "@ndycode/timetablekit";
import { useEffect, useMemo, useRef, useState } from "react";
import { fileToTimetableInput } from "../lib/input-boundary";
import {
  SAMPLE_INPUT,
  SAMPLE_LABEL,
  SAMPLE_TEXT,
  SAMPLE_TERM,
} from "../lib/samples";

type Tab = "sample" | "paste" | "upload";
type EditableField = "title" | "day" | "startTime" | "endTime" | "location";

const DAY_LABELS: Readonly<Record<Weekday, string>> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday",
};

const DAY_OPTIONS: readonly Weekday[] = [
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
  "SU",
];

function parseOptions(
  locale: string,
  timezone: string,
  termStarts: string,
  termEnds: string,
  signal: AbortSignal,
  onProgress: ParseOptions["onProgress"],
  recoveryEnabled: boolean,
): ParseOptions {
  const term =
    termStarts !== "" && termEnds !== ""
      ? { startsOn: termStarts, endsOn: termEnds }
      : undefined;
  return {
    locale,
    timezone,
    ...(term === undefined ? {} : { term }),
    evidence: "locations",
    signal,
    ...(onProgress === undefined ? {} : { onProgress }),
    recovery: { enabled: recoveryEnabled, consent: recoveryEnabled },
  };
}

function warningFor(
  result: TimetableParseResult,
  event: TimetableEvent,
  field: EditableField,
): ParseWarning | undefined {
  const normalizedField = field === "day" ? "schedule" : field;
  return result.warnings.find(
    (warning) =>
      warning.eventId === event.id && warning.field === normalizedField,
  );
}

function issueTitle(warning: ParseWarning): string {
  return warning.code.replaceAll("_", " ");
}

function warningForConflict(conflictId: string): ParseWarning {
  return {
    code: "SCHEDULE_CONFLICT",
    severity: "error",
    message: "Two events overlap on the same occurrence.",
    details: { conflictId },
  };
}

function warningForConflictLimit(): ParseWarning {
  return {
    code: "CONFLICT_LIMIT",
    severity: "warning",
    message: `Conflict output was limited to ${DEFAULT_MAX_CONFLICTS} entries.`,
    details: { limit: DEFAULT_MAX_CONFLICTS },
  };
}

function mergeValidation(
  result: TimetableParseResult,
  events: readonly TimetableEvent[],
): TimetableParseResult {
  const warnings = result.warnings.filter(
    (warning) =>
      warning.code !== "SCHEDULE_CONFLICT" && warning.code !== "CONFLICT_LIMIT",
  );
  const validationWarnings = validateTimetable(events, {
    timezone: result.timezone,
    ...(result.term === undefined ? {} : { term: result.term }),
  });
  const detected = detectConflictsBounded(
    events,
    result.term === undefined ? {} : { term: result.term },
  );
  const conflicts = detected.conflicts;
  return {
    ...result,
    events,
    warnings: [
      ...warnings,
      ...validationWarnings,
      ...conflicts.map((conflict) => warningForConflict(conflict.id)),
      ...(detected.truncated ? [warningForConflictLimit()] : []),
    ],
    conflicts,
    parse: {
      ...result.parse,
      deterministicConfidence:
        events.length === 0
          ? 0
          : events.reduce((sum, event) => sum + event.confidence, 0) /
            events.length,
    },
  };
}

function updateEvent(
  result: TimetableParseResult,
  eventId: string,
  field: EditableField,
  value: string,
): TimetableParseResult {
  const events = result.events.map((event) => {
    if (event.id !== eventId) return event;
    if (field === "title") return { ...event, title: value };
    if (field === "startTime") return { ...event, startTime: value };
    if (field === "endTime") return { ...event, endTime: value };
    if (field === "location")
      return value === "" ? omitLocation(event) : { ...event, location: value };
    const weekday = DAY_OPTIONS.find((candidate) => candidate === value);
    if (weekday === undefined || event.schedule.kind !== "weekly") return event;
    return { ...event, schedule: { ...event.schedule, weekdays: [weekday] } };
  });
  return mergeValidation(result, events);
}

function omitLocation(event: TimetableEvent): TimetableEvent {
  const { location: _location, ...withoutLocation } = event;
  return withoutLocation;
}

function toDownload(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function imageExtractionProvider(ocrProvider: OcrProvider): ExtractionProvider {
  return {
    id: "tesseract-image",
    supports(input): boolean {
      return input.kind === "image";
    },
    async extract(input, context): Promise<ExtractionArtifact> {
      if (input.kind !== "image")
        throw new Error("Image provider received an unsupported source.");
      const blob = new Blob([new Uint8Array(input.bytes)], {
        type: input.mimeType,
      });
      const bitmap = await createImageBitmap(blob);
      try {
        const recognized = await ocrProvider.recognize(
          {
            bytes: input.bytes,
            mimeType: input.mimeType,
            width: bitmap.width,
            height: bitmap.height,
          },
          context,
        );
        const source: SourceDescriptor = {
          kind: "image",
          mimeType: input.mimeType,
          ...(input.filename === undefined ? {} : { filename: input.filename }),
        };
        return {
          providerId: ocrProvider.id,
          document: { source, pages: [recognized.page] },
          warnings: recognized.warningCodes.map((code) => ({
            code,
            severity: "warning" as const,
            message: "OCR reported a source warning.",
          })),
        };
      } finally {
        bitmap.close();
      }
    },
  };
}

async function parseInputWithProviders(
  input: TimetableInput,
  options: ParseOptions,
): Promise<TimetableParseResult> {
  const [{ createTesseractProvider }, { createPdfJsProvider }] =
    await Promise.all([
      import("@ndycode/timetablekit-provider-tesseract"),
      import("@ndycode/timetablekit-provider-pdfjs"),
    ]);
  const ocr = createTesseractProvider();
  const parser = createTimetableParser({
    providers: [
      imageExtractionProvider(ocr),
      createPdfJsProvider({ ocrProvider: ocr }),
    ],
  });
  return parser.parse(input, options);
}

export default function Playground() {
  const [tab, setTab] = useState<Tab>("sample");
  const [text, setText] = useState(SAMPLE_TEXT);
  const [input, setInput] = useState<TimetableInput>(SAMPLE_INPUT);
  const [fileLabel, setFileLabel] = useState("");
  const [locale, setLocale] = useState("en-PH");
  const [timezone, setTimezone] = useState("Asia/Manila");
  const [termStarts, setTermStarts] = useState(SAMPLE_TERM.startsOn);
  const [termEnds, setTermEnds] = useState(SAMPLE_TERM.endsOn);
  const [aiRecovery, setAiRecovery] = useState(false);
  const [result, setResult] = useState<TimetableParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Ready to parse the fictional sample.");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const initialParseRef = useRef(false);

  const currentInput = useMemo<TimetableInput>(() => {
    if (tab === "paste")
      return { kind: "text", text, filename: "pasted-timetable.txt" };
    return input;
  }, [input, tab, text]);

  const runParse = async (
    nextInput: TimetableInput = currentInput,
  ): Promise<void> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError("");
    setProgress(0);
    setStatus("Parsing locally.");
    const options = parseOptions(
      locale,
      timezone,
      termStarts,
      termEnds,
      controller.signal,
      (value) => {
        const ratio =
          value.total === undefined || value.total === 0
            ? 0.5
            : value.completed / value.total;
        setProgress(Math.round(Math.max(0, Math.min(1, ratio)) * 100));
        setStatus(value.message);
      },
      aiRecovery,
    );
    try {
      const parsed =
        nextInput.kind === "text" || nextInput.kind === "csv"
          ? await parseTimetable(nextInput, options)
          : await parseInputWithProviders(nextInput, options);
      setResult(parsed);
      setProgress(100);
      setStatus(
        `Parsed ${parsed.events.length} event${parsed.events.length === 1 ? "" : "s"}.`,
      );
    } catch (caught) {
      if (controller.signal.aborted) {
        setStatus("Parsing cancelled.");
      } else {
        setError(
          caught instanceof Error
            ? caught.message
            : "The input could not be parsed.",
        );
        setStatus("Parsing failed. Check the input and try again.");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialParseRef.current) return;
    initialParseRef.current = true;
    void runParse(SAMPLE_INPUT);
  }, []);

  const issues = result === null ? [] : result.warnings;
  const days =
    result === null
      ? []
      : result.events.flatMap((event) =>
          event.schedule.kind === "weekly" ? event.schedule.weekdays : [],
        );

  function reset(): void {
    abortRef.current?.abort();
    setTab("sample");
    setText(SAMPLE_TEXT);
    setInput(SAMPLE_INPUT);
    setFileLabel("");
    setLocale("en-PH");
    setTimezone("Asia/Manila");
    setTermStarts(SAMPLE_TERM.startsOn);
    setTermEnds(SAMPLE_TERM.endsOn);
    setAiRecovery(false);
    setResult(null);
    setError("");
    setStatus("Ready to parse the fictional sample.");
    void runParse(SAMPLE_INPUT);
  }

  async function handleFile(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    const boundary = await fileToTimetableInput(file);
    if (!boundary.ok) {
      setError(boundary.message);
      setStatus("File rejected before parsing.");
      return;
    }
    setInput(boundary.input);
    setFileLabel(boundary.label);
    await runParse(boundary.input);
  }

  async function copySdk(): Promise<void> {
    const snippet = `import { parseTimetable, toICS } from "@ndycode/timetablekit"\n\nconst result = await parseTimetable(\n  { kind: "text", text: rawTimetable },\n  { locale: "${locale}", timezone: "${timezone}" },\n)\n\nconst calendar = toICS(result)`;
    await navigator.clipboard.writeText(snippet);
    setStatus("SDK example copied.");
  }

  function exportFormat(format: "json" | "csv" | "ics"): void {
    if (result === null) return;
    try {
      if (format === "json")
        toDownload(
          "timetable.json",
          toJSON(result, { pretty: true }),
          "application/json",
        );
      if (format === "csv")
        toDownload("timetable.csv", toCSV(result), "text/csv;charset=utf-8");
      if (format === "ics")
        toDownload(
          "timetable.ics",
          toICS(result),
          "text/calendar;charset=utf-8",
        );
      setStatus(`${format.toUpperCase()} download prepared.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The export could not be created.",
      );
    }
  }

  return (
    <main className="playground-shell">
      <div className="playground-intro">
        <div>
          <h1>Review your schedule.</h1>
          <p>
            Start with a fictional sample, paste a timetable, or choose a local
            file. Parsing stays in your browser by default.
          </p>
        </div>
        <p className="privacy-note">
          <strong>Local only.</strong> No account. No API key.
        </p>
      </div>

      <div className="playground-layout">
        <section className="source-panel" aria-labelledby="source-title">
          <h2 id="source-title" className="sr-only">
            Import timetable
          </h2>
          <div className="source-tabs" role="tablist" aria-label="Input source">
            {(["sample", "paste", "upload"] as const).map((value) => (
              <button
                key={value}
                className="tab-button"
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
              >
                {value === "sample"
                  ? "Sample"
                  : value === "paste"
                    ? "Paste text"
                    : "Upload"}
              </button>
            ))}
          </div>
          <div className="source-controls">
            <div className="control-grid">
              <div className="control-group">
                <label htmlFor="locale">Locale</label>
                <select
                  id="locale"
                  value={locale}
                  onChange={(event) => setLocale(event.target.value)}
                >
                  <option value="en-PH">
                    English / Filipino · Philippines
                  </option>
                </select>
              </div>
              <div className="control-group">
                <label htmlFor="timezone">Timezone</label>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                >
                  <option value="Asia/Manila">Asia/Manila</option>
                  <option value="UTC">UTC</option>
                  <option value="America/Los_Angeles">
                    America/Los_Angeles
                  </option>
                  <option value="Europe/London">Europe/London</option>
                </select>
              </div>
              <fieldset className="term-grid control-group">
                <legend>Term range</legend>
                <div>
                  <label htmlFor="term-start">Starts</label>
                  <input
                    id="term-start"
                    type="date"
                    value={termStarts}
                    onChange={(event) => setTermStarts(event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="term-end">Ends</label>
                  <input
                    id="term-end"
                    type="date"
                    value={termEnds}
                    onChange={(event) => setTermEnds(event.target.value)}
                  />
                </div>
              </fieldset>
              <div className="toggle-row">
                <label className="toggle-field">
                  <input
                    type="checkbox"
                    checked={aiRecovery}
                    onChange={(event) => setAiRecovery(event.target.checked)}
                  />
                  <span className="toggle-control" aria-hidden="true" />
                  <span className="toggle-copy">
                    <strong>Optional AI recovery</strong>
                    <small>
                      Off by default. Consent is required. Provider terms apply.
                    </small>
                  </span>
                </label>
              </div>
              {tab === "paste" && (
                <div className="control-group source-text-preview">
                  <label htmlFor="timetable-text">Timetable text</label>
                  <textarea
                    id="timetable-text"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    spellCheck={false}
                  />
                </div>
              )}
              {tab === "sample" && (
                <div
                  className="source-text-preview"
                  aria-label="Fictional sample input"
                >
                  {SAMPLE_LABEL}
                  {"\n\n"}
                  {SAMPLE_TEXT}
                </div>
              )}
              {tab === "upload" && (
                <div className="upload-dropzone">
                  <label htmlFor="timetable-file">
                    Choose a local TXT, CSV, PNG, JPEG, WebP, or PDF file
                  </label>
                  <input
                    id="timetable-file"
                    type="file"
                    accept=".txt,.text,.csv,.png,.jpg,.jpeg,.webp,.pdf"
                    onChange={(event) =>
                      void handleFile(event.target.files?.[0])
                    }
                  />
                  <p>
                    {fileLabel === ""
                      ? "Files are checked before parsing and are not persisted."
                      : `Selected ${fileLabel}`}
                  </p>
                </div>
              )}
              <div className="source-actions">
                <button
                  className="compact-button primary"
                  type="button"
                  onClick={() => void runParse()}
                  disabled={busy}
                >
                  {busy ? "Parsing…" : "Parse locally"}
                </button>
                <button
                  className="compact-button"
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  disabled={!busy}
                >
                  Cancel
                </button>
                <button
                  className="compact-button"
                  type="button"
                  onClick={reset}
                >
                  Reset
                </button>
              </div>
              <div className="status-line" role="status" aria-live="polite">
                {status}
                {busy && (
                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                    aria-label={`Parsing ${progress}%`}
                  >
                    <span style={{ width: `${progress}%` }} />
                  </div>
                )}
              </div>
              {error !== "" && (
                <div className="notice error" role="alert">
                  {error}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="result-panel" aria-labelledby="result-title">
          <div className="result-heading">
            <h2 id="result-title">Parsed events</h2>
            <span className="result-meta">
              {result === null ? (
                "No result yet"
              ) : (
                <>
                  <strong>{result.events.length} events</strong> ·{" "}
                  {Math.round(result.parse.deterministicConfidence * 100)}%
                  confidence
                </>
              )}
            </span>
          </div>
          {result === null ? (
            <p className="empty-result">Your parsed events will appear here.</p>
          ) : (
            <div className="table-scroll">
              <table className="event-table">
                <caption className="sr-only">
                  Editable parsed timetable events
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Title</th>
                    <th scope="col">Day</th>
                    <th scope="col">Start</th>
                    <th scope="col">End</th>
                    <th scope="col">Location</th>
                    <th scope="col">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {result.events.map((event) => {
                    const day =
                      event.schedule.kind === "weekly"
                        ? (event.schedule.weekdays[0] ?? "MO")
                        : "MO";
                    return (
                      <tr key={event.id}>
                        <td>
                          <label
                            className="sr-only"
                            htmlFor={`${event.id}-title`}
                          >
                            Title for {event.title}
                          </label>
                          <input
                            className={`event-input${warningFor(result, event, "title") === undefined ? "" : " warning"}`}
                            id={`${event.id}-title`}
                            value={event.title}
                            onChange={(change) =>
                              setResult(
                                updateEvent(
                                  result,
                                  event.id,
                                  "title",
                                  change.target.value,
                                ),
                              )
                            }
                          />
                          {warningFor(result, event, "title") && (
                            <span className="field-warning">Review title</span>
                          )}
                        </td>
                        <td>
                          <label
                            className="sr-only"
                            htmlFor={`${event.id}-day`}
                          >
                            Day for {event.title}
                          </label>
                          <select
                            className={`event-input${warningFor(result, event, "day") === undefined ? "" : " warning"}`}
                            id={`${event.id}-day`}
                            value={day}
                            onChange={(change) =>
                              setResult(
                                updateEvent(
                                  result,
                                  event.id,
                                  "day",
                                  change.target.value,
                                ),
                              )
                            }
                          >
                            {DAY_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {DAY_LABELS[option]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <label
                            className="sr-only"
                            htmlFor={`${event.id}-start`}
                          >
                            Start time for {event.title}
                          </label>
                          <input
                            className={`event-input${warningFor(result, event, "startTime") === undefined ? "" : " warning"}`}
                            id={`${event.id}-start`}
                            value={event.startTime}
                            onChange={(change) =>
                              setResult(
                                updateEvent(
                                  result,
                                  event.id,
                                  "startTime",
                                  change.target.value,
                                ),
                              )
                            }
                          />
                        </td>
                        <td>
                          <label
                            className="sr-only"
                            htmlFor={`${event.id}-end`}
                          >
                            End time for {event.title}
                          </label>
                          <input
                            className={`event-input${warningFor(result, event, "endTime") === undefined ? "" : " warning"}`}
                            id={`${event.id}-end`}
                            value={event.endTime}
                            onChange={(change) =>
                              setResult(
                                updateEvent(
                                  result,
                                  event.id,
                                  "endTime",
                                  change.target.value,
                                ),
                              )
                            }
                          />
                        </td>
                        <td>
                          <label
                            className="sr-only"
                            htmlFor={`${event.id}-location`}
                          >
                            Location for {event.title}
                          </label>
                          <input
                            className="event-input"
                            id={`${event.id}-location`}
                            value={event.location ?? ""}
                            onChange={(change) =>
                              setResult(
                                updateEvent(
                                  result,
                                  event.id,
                                  "location",
                                  change.target.value,
                                ),
                              )
                            }
                            placeholder="Add location"
                          />
                        </td>
                        <td>
                          <span
                            className={`confidence-value${event.confidence < 0.72 ? " low" : ""}`}
                          >
                            {Math.round(event.confidence * 100)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="rail" aria-label="Warnings, conflicts, and agenda">
          <section className="rail-panel">
            <div className="rail-heading">
              <h2>Warnings and conflicts</h2>
              <span>{issues.length + (result?.conflicts.length ?? 0)}</span>
            </div>
            <div className="rail-body">
              {issues.length === 0 && (result?.conflicts.length ?? 0) === 0 ? (
                <p className="empty-result">No warnings. Review is ready.</p>
              ) : (
                <>
                  {issues.map((issue, index) => (
                    <div
                      className={`issue-item${issue.severity === "info" ? " info" : ""}`}
                      key={`${issue.code}-${issue.eventId ?? "global"}-${index}`}
                    >
                      <span className="issue-symbol" aria-hidden="true">
                        {issue.severity === "error" ? "!" : "△"}
                      </span>
                      <div>
                        <strong>{issueTitle(issue)}</strong>
                        <p>{issue.message}</p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </section>
          <section className="rail-panel">
            <div className="rail-heading">
              <h2>Agenda preview</h2>
              <span>{days.length === 0 ? "" : "weekly"}</span>
            </div>
            <div className="rail-body">
              <div className="agenda-preview">
                {DAY_OPTIONS.filter((day) =>
                  result?.events.some(
                    (event) =>
                      event.schedule.kind === "weekly" &&
                      event.schedule.weekdays.includes(day),
                  ),
                ).map((day) => (
                  <div className="agenda-day" key={day}>
                    <h3>{DAY_LABELS[day]}</h3>
                    <ul className="agenda-list">
                      {result?.events
                        .filter(
                          (event) =>
                            event.schedule.kind === "weekly" &&
                            event.schedule.weekdays.includes(day),
                        )
                        .sort((left, right) =>
                          left.startTime.localeCompare(right.startTime),
                        )
                        .map((event) => (
                          <li key={`${day}-${event.id}`}>
                            <time>
                              {event.startTime}–{event.endTime}
                            </time>
                            <span>
                              {event.title}
                              <small>{event.location ?? "No location"}</small>
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </aside>

        <section className="json-panel" aria-labelledby="json-title">
          <div className="json-heading">
            <h2 id="json-title">Normalized JSON</h2>
            <div className="export-actions">
              <button
                type="button"
                onClick={() => exportFormat("json")}
                disabled={result === null}
              >
                Download JSON
              </button>
              <button
                type="button"
                onClick={() => exportFormat("csv")}
                disabled={result === null}
              >
                Download CSV
              </button>
              <button
                type="button"
                onClick={() => exportFormat("ics")}
                disabled={result === null}
              >
                Download ICS
              </button>
              <button type="button" onClick={() => void copySdk()}>
                Copy SDK example
              </button>
            </div>
          </div>
          <div
            className="json-inspector"
            role="region"
            aria-label="Normalized JSON content"
            tabIndex={0}
          >
            <pre>
              {result === null
                ? "Run a parse to inspect the schema-versioned result."
                : toJSON(result, { pretty: true })}
            </pre>
          </div>
        </section>
      </div>
    </main>
  );
}
