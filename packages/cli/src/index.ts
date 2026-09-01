import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import {
  stdin as processStdin,
  stderr as processStderr,
  stdout as processStdout,
} from "node:process";
import {
  DEFAULT_RESOURCE_LIMITS,
  EN_PH_LOCALE,
  TimetableError,
  createLocaleRegistry,
  parseDate,
  parseTimetable,
  toCSV,
  toICS,
  toJSON,
} from "@ndycode/timetablekit";
import { runTimetableAgentProtocol } from "@ndycode/timetablekit-agent";
import type {
  IsoDate,
  ParseOptions,
  ParseWarning,
  TermRange,
  TimetableInput,
  TimetableParseResult,
} from "@ndycode/timetablekit";

export type OutputFormat = "json" | "csv" | "ics";
export type InputKind = "text" | "csv";

export type TermOption =
  | { readonly kind: "none" }
  | {
      readonly kind: "range";
      readonly startsOn: IsoDate;
      readonly endsOn: IsoDate;
    };

export type OutputTarget =
  | { readonly kind: "stdout" }
  | { readonly kind: "file"; readonly path: string };

export type CliOptions = {
  readonly inputPath: string;
  readonly inputKind: InputKind;
  readonly timezone: string;
  readonly locale: string;
  readonly format: OutputFormat;
  readonly output: OutputTarget;
  readonly term: TermOption;
};

export type CliCommand =
  | { readonly kind: "help"; readonly text: string }
  | { readonly kind: "agent" }
  | { readonly kind: "parse"; readonly options: CliOptions };

export type CliInputStream = AsyncIterable<Uint8Array | string>;

export type CliIO = {
  readonly stdout?: (value: string) => void;
  readonly stderr?: (value: string) => void;
  readonly cwd?: string;
  readonly stdin?: CliInputStream;
};

export class CliError extends Error {
  override readonly name = "CliError";

  constructor(message: string) {
    super(message);
  }
}

const HELP_TEXT = `Usage: timetablekit <command> [arguments]

Commands:
  parse [path]            Parse a local text or CSV file. Use - for stdin.
  agent                   Read JSONL agent requests from stdin.

Parse a local text or CSV timetable and write a normalized export.

Options:
  --timezone <iana>       Timezone for the parsed events. Default: UTC.
  --locale <id>           Parser locale. Default: en-PH.
  --format <format>       Output format: json, csv, or ics. Default: json.
  --output <path>         Write to a local file instead of stdout. Use - for stdout.
                          --out is accepted as an alias.
  --term-start <date>     ISO start date for weekly ICS recurrence.
  --term-end <date>       ISO end date for weekly ICS recurrence.
  -h, --help              Show this help.

Only local paths and stdin (-) are accepted. Remote URLs are not fetched.
Agent mode accepts JSONL only and does not read paths or fetch URLs.
`;

type OptionValue = {
  readonly value: string;
  readonly index: number;
};

type ResolvedCliIO = {
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
  readonly cwd: string;
  readonly stdin: CliInputStream;
};

function resolvedIO(io: CliIO): ResolvedCliIO {
  return {
    stdout:
      io.stdout ??
      ((value) => {
        processStdout.write(value);
      }),
    stderr:
      io.stderr ??
      ((value) => {
        processStderr.write(value);
      }),
    cwd: io.cwd ?? process.cwd(),
    stdin: io.stdin ?? processStdin,
  };
}

function isRemotePath(value: string): boolean {
  return (
    value.startsWith("//") ||
    value.startsWith("\\\\") ||
    /^(?:https?|ftp):\/\//iu.test(value)
  );
}

function assertLocalPath(value: string, label: string): void {
  if (isRemotePath(value)) {
    throw new CliError(
      `${label} must be a local path. Remote URLs are not accepted.`,
    );
  }
  if (/^[a-z][a-z\d+.-]*:/iu.test(value) && !/^[a-z]:[\\/]/iu.test(value)) {
    throw new CliError(
      `${label} must be a local path. URI inputs are not accepted.`,
    );
  }
}

function inputKindForPath(inputPath: string): InputKind {
  assertLocalPath(inputPath, "Input");
  if (inputPath === "-") {
    return "text";
  }
  const extension = extname(inputPath).toLocaleLowerCase();
  if (extension === ".csv" || extension === ".tsv") {
    return "csv";
  }
  if (
    [
      ".pdf",
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".gif",
      ".doc",
      ".docx",
    ].includes(extension)
  ) {
    throw new CliError(
      `Unsupported input file type "${extension}". Use a text or CSV file.`,
    );
  }
  return "text";
}

function outputFormat(value: string): OutputFormat | undefined {
  switch (value.toLocaleLowerCase()) {
    case "json":
      return "json";
    case "csv":
      return "csv";
    case "ics":
      return "ics";
    default:
      return undefined;
  }
}

function optionValue(
  argv: readonly string[],
  index: number,
  name: string,
  inline: string | undefined,
): OptionValue {
  if (inline !== undefined) {
    if (inline.length === 0) {
      throw new CliError(`${name} requires a value.`);
    }
    return { value: inline, index };
  }
  const next = argv[index + 1];
  if (next === undefined || (next.startsWith("-") && next !== "-")) {
    throw new CliError(`${name} requires a value.`);
  }
  return { value: next, index: index + 1 };
}

function isoDateOption(name: string, value: string): IsoDate {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new CliError(`${name} must be a valid ISO date in YYYY-MM-DD form.`);
  }
  const parsed = parseDate(value, EN_PH_LOCALE);
  if (parsed.kind === "invalid") {
    throw new CliError(`${name} must be a valid ISO date in YYYY-MM-DD form.`);
  }
  return parsed.date;
}

function termOption(
  start: string | undefined,
  end: string | undefined,
): TermOption {
  if (start === undefined && end === undefined) {
    return { kind: "none" };
  }
  if (start === undefined || end === undefined) {
    throw new CliError(
      "--term-start and --term-end must be provided together.",
    );
  }
  const startsOn = isoDateOption("--term-start", start);
  const endsOn = isoDateOption("--term-end", end);
  if (startsOn > endsOn) {
    throw new CliError("--term-end must not be before --term-start.");
  }
  return { kind: "range", startsOn, endsOn };
}

export function parseArguments(argv: readonly string[]): CliCommand {
  if (argv[0] === "agent") {
    if (argv.length === 1) return { kind: "agent" };
    if (argv.length === 2 && argv[1] === "--help") {
      return { kind: "help", text: HELP_TEXT };
    }
    throw new CliError(
      "The agent command reads JSONL from stdin and accepts no options.",
    );
  }
  let inputPath: string | undefined;
  let timezone = "UTC";
  let locale = "en-PH";
  let format: OutputFormat = "json";
  let output: OutputTarget = { kind: "stdout" };
  let termStart: string | undefined;
  let termEnd: string | undefined;
  let help = false;
  let commandSeen = false;
  let endOptions = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) {
      continue;
    }
    if (!endOptions && argument === "--") {
      endOptions = true;
      continue;
    }
    if (!endOptions && (argument === "-h" || argument === "--help")) {
      help = true;
      continue;
    }
    if (!endOptions && argument.startsWith("--")) {
      const separator = argument.indexOf("=");
      const name = separator < 0 ? argument : argument.slice(0, separator);
      const inline = separator < 0 ? undefined : argument.slice(separator + 1);
      switch (name) {
        case "--timezone": {
          const selected = optionValue(argv, index, name, inline);
          timezone = selected.value;
          index = selected.index;
          break;
        }
        case "--locale": {
          const selected = optionValue(argv, index, name, inline);
          locale = selected.value;
          index = selected.index;
          break;
        }
        case "--format": {
          const selected = optionValue(argv, index, name, inline);
          const selectedFormat = outputFormat(selected.value);
          if (selectedFormat === undefined) {
            throw new CliError(
              `Unsupported output format "${selected.value}". Use json, csv, or ics.`,
            );
          }
          format = selectedFormat;
          index = selected.index;
          break;
        }
        case "--out":
        case "--output": {
          const selected = optionValue(argv, index, name, inline);
          if (selected.value === "-") {
            output = { kind: "stdout" };
          } else {
            assertLocalPath(selected.value, "Output");
            output = { kind: "file", path: selected.value };
          }
          index = selected.index;
          break;
        }
        case "--term-start": {
          const selected = optionValue(argv, index, name, inline);
          termStart = selected.value;
          index = selected.index;
          break;
        }
        case "--term-end": {
          const selected = optionValue(argv, index, name, inline);
          termEnd = selected.value;
          index = selected.index;
          break;
        }
        default:
          throw new CliError(`Unknown option "${name}". Use --help for usage.`);
      }
      continue;
    }
    if (!commandSeen && inputPath === undefined && argument === "parse") {
      commandSeen = true;
      continue;
    }
    if (inputPath !== undefined) {
      throw new CliError(`Unexpected extra argument "${argument}".`);
    }
    inputPath = argument;
  }

  if (help) {
    return { kind: "help", text: HELP_TEXT };
  }
  if (inputPath === undefined || inputPath.length === 0) {
    throw new CliError("An input path is required. Use --help for usage.");
  }
  return {
    kind: "parse",
    options: {
      inputPath,
      inputKind: inputKindForPath(inputPath),
      timezone,
      locale,
      format,
      output,
      term: termOption(termStart, termEnd),
    },
  };
}

function validTimezone(timezone: string): boolean {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).resolvedOptions()
        .timeZone.length > 0
    );
  } catch (error) {
    if (error instanceof RangeError) {
      return false;
    }
    throw error;
  }
}

function validateOptions(options: CliOptions): void {
  if (!validTimezone(options.timezone)) {
    throw new CliError(
      `Invalid timezone "${options.timezone}". Use an IANA timezone such as Asia/Manila.`,
    );
  }
  if (options.locale.trim().length === 0) {
    throw new CliError("Locale must not be empty.");
  }
  try {
    createLocaleRegistry().get(options.locale);
  } catch (error) {
    if (error instanceof TimetableError && error.code === "INVALID_OPTIONS") {
      throw new CliError(
        `Unknown locale "${options.locale}". The available locale is en-PH.`,
      );
    }
    throw error;
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CliError("Input is not valid UTF-8 text.");
  }
}

async function readBoundedStream(stream: CliInputStream): Promise<string> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const bytes =
      typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
    total += bytes.byteLength;
    if (total > DEFAULT_RESOURCE_LIMITS.maxInputBytes) {
      throw new CliError(
        `Input exceeds the ${DEFAULT_RESOURCE_LIMITS.maxInputBytes}-byte limit.`,
      );
    }
    chunks.push(bytes);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decodeUtf8(combined);
}

async function readLocalInput(
  inputPath: string,
  io: ResolvedCliIO,
): Promise<string> {
  if (inputPath === "-") {
    return readBoundedStream(io.stdin);
  }
  const absolutePath = resolve(io.cwd, inputPath);
  let fileStats: Awaited<ReturnType<typeof stat>>;
  try {
    fileStats = await stat(absolutePath);
  } catch {
    throw new CliError(`Could not read input file "${inputPath}".`);
  }
  if (!fileStats.isFile()) {
    throw new CliError(`Input path "${inputPath}" is not a file.`);
  }
  if (fileStats.size > DEFAULT_RESOURCE_LIMITS.maxInputBytes) {
    throw new CliError(
      `Input exceeds the ${DEFAULT_RESOURCE_LIMITS.maxInputBytes}-byte limit.`,
    );
  }
  let bytes: Uint8Array;
  try {
    bytes = await readFile(absolutePath);
  } catch {
    throw new CliError(`Could not read input file "${inputPath}".`);
  }
  if (bytes.byteLength > DEFAULT_RESOURCE_LIMITS.maxInputBytes) {
    throw new CliError(
      `Input exceeds the ${DEFAULT_RESOURCE_LIMITS.maxInputBytes}-byte limit.`,
    );
  }
  return decodeUtf8(bytes);
}

function parseInput(options: CliOptions, text: string): TimetableInput {
  const filename =
    options.inputPath === "-" ? undefined : basename(options.inputPath);
  if (options.inputKind === "csv") {
    return filename === undefined
      ? { kind: "csv", text }
      : { kind: "csv", text, filename };
  }
  return filename === undefined
    ? { kind: "text", text }
    : { kind: "text", text, filename };
}

function parseOptions(options: CliOptions): ParseOptions {
  const term: TermRange | undefined =
    options.term.kind === "none"
      ? undefined
      : { startsOn: options.term.startsOn, endsOn: options.term.endsOn };
  return term === undefined
    ? {
        locale: options.locale,
        timezone: options.timezone,
        evidence: "locations",
      }
    : {
        locale: options.locale,
        timezone: options.timezone,
        evidence: "locations",
        term,
      };
}

function warningSummary(warning: ParseWarning): string {
  const line =
    warning.source?.line === undefined ? "" : ` at line ${warning.source.line}`;
  return `${warning.message}${line}`;
}

function assertUsableResult(result: TimetableParseResult): void {
  const errors = result.warnings.filter(
    (warning) => warning.severity === "error",
  );
  if (errors.length > 0) {
    const shown = errors.slice(0, 3).map(warningSummary).join(" ");
    const remaining = errors.length > 3 ? ` (+${errors.length - 3} more)` : "";
    throw new CliError(`Input is invalid. ${shown}${remaining}`);
  }
  if (result.events.length === 0) {
    throw new CliError("No timetable events were recognized in the input.");
  }
}

function serializeResult(
  result: TimetableParseResult,
  format: OutputFormat,
): string {
  switch (format) {
    case "json":
      return toJSON(result, { pretty: true });
    case "csv":
      return toCSV(result);
    case "ics":
      return toICS(result);
    default: {
      const exhaustive: never = format;
      return exhaustive;
    }
  }
}

async function writeOutput(
  content: string,
  options: CliOptions,
  io: ResolvedCliIO,
): Promise<void> {
  const outputBytes = new TextEncoder().encode(content).byteLength;
  if (outputBytes > DEFAULT_RESOURCE_LIMITS.maxOutputBytes) {
    throw new CliError(
      `Output exceeds the ${DEFAULT_RESOURCE_LIMITS.maxOutputBytes}-byte limit.`,
    );
  }
  if (options.output.kind === "stdout") {
    io.stdout(content);
    return;
  }
  const absolutePath = resolve(io.cwd, options.output.path);
  try {
    await writeFile(absolutePath, content, "utf8");
  } catch {
    throw new CliError(`Could not write output file "${options.output.path}".`);
  }
}

async function executeParse(
  options: CliOptions,
  io: ResolvedCliIO,
): Promise<void> {
  validateOptions(options);
  const text = await readLocalInput(options.inputPath, io);
  const result = await parseTimetable(
    parseInput(options, text),
    parseOptions(options),
  );
  assertUsableResult(result);
  await writeOutput(serializeResult(result, options.format), options, io);
}

async function executeAgent(io: ResolvedCliIO): Promise<void> {
  await runTimetableAgentProtocol({
    input: io.stdin,
    output: io.stdout,
  });
}

function errorMessage(error: unknown): string {
  if (
    error instanceof CliError ||
    error instanceof TimetableError ||
    error instanceof Error
  ) {
    return error.message;
  }
  return "The command failed for an unknown reason.";
}

export async function runCli(
  argv: readonly string[],
  io: CliIO = {},
): Promise<number> {
  const output = resolvedIO(io);
  try {
    const command = parseArguments(argv);
    switch (command.kind) {
      case "help":
        output.stdout(command.text);
        return 0;
      case "agent":
        await executeAgent(output);
        return 0;
      case "parse":
        await executeParse(command.options, output);
        return 0;
      default: {
        const exhaustive: never = command;
        return exhaustive;
      }
    }
  } catch (error) {
    output.stderr(`timetablekit: ${errorMessage(error)}\n`);
    return 1;
  }
}

export { HELP_TEXT };
