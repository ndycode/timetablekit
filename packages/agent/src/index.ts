import {
  DEFAULT_RESOURCE_LIMITS,
  SchemaValidationError,
  TimetableError,
  assessTimetableResult,
  createTimetableParser,
  resolveLimits,
  timetableParseResultSchema,
} from "@ndycode/timetablekit";
import type {
  ParseOptions,
  ParseProgress,
  ResourceLimits,
  ResultAssessment,
  TimetableErrorCode,
  TimetableParser,
  TimetableParseResult,
} from "@ndycode/timetablekit";
import { z } from "zod";
import { AGENT_ERROR_CODES } from "./error-codes.js";
import type { AgentErrorCode } from "./error-codes.js";
import {
  createTimetableAgentInputJsonSchema,
  timetableAgentCapabilitiesJsonSchema,
  timetableAgentInputJsonSchema,
  timetableAgentOutputJsonSchema,
} from "./json-schema.js";
import type { AgentInputKind } from "./json-schema.js";

export type { AgentInputKind } from "./json-schema.js";
export type { TimetableAgentInputSchemaOptions } from "./json-schema.js";

export const AGENT_PROTOCOL_VERSION = "1" as const;
export const TIMETABLE_AGENT_TOOL_NAME = "timetablekit.parse" as const;
export const DEFAULT_AGENT_REQUEST_BYTES = 3_000_000;
export const MAX_AGENT_REQUEST_ID_BYTES = 256;
export const DEFAULT_AGENT_MAX_INPUT_LINES = 5_000;
export const MIN_AGENT_PROTOCOL_LINE_BYTES = 256;

const AGENT_PROTOCOL_ENVELOPE_BYTES = 2_048;

export type JsonSchema = Readonly<Record<string, unknown>>;

const AGENT_INPUT_KIND_ORDER: readonly AgentInputKind[] = [
  "text",
  "csv",
  "image",
  "pdf",
];
const DEFAULT_AGENT_INPUT_KINDS = ["text", "csv"] as const;

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null) return value;
  for (const child of Object.values(value as object)) {
    if (typeof child === "object" && child !== null) deepFreeze(child);
  }
  return Object.freeze(value);
}

const textInputSchema = z
  .object({
    kind: z.literal("text"),
    text: z.string(),
    filename: z.string().optional(),
  })
  .strict();

const csvInputSchema = z
  .object({
    kind: z.literal("csv"),
    text: z.string(),
    delimiter: z.enum([",", ";", "\t"]).optional(),
    filename: z.string().optional(),
  })
  .strict();

const imageInputSchema = z
  .object({
    kind: z.literal("image"),
    base64: z
      .string()
      .min(1)
      .regex(
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u,
      ),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    filename: z.string().optional(),
  })
  .strict();

const pdfInputSchema = z
  .object({
    kind: z.literal("pdf"),
    base64: z
      .string()
      .min(1)
      .regex(
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u,
      ),
    mimeType: z.literal("application/pdf"),
    filename: z.string().optional(),
  })
  .strict();

const baseTimetableAgentRequestSchema = z
  .object({
    schemaVersion: z.literal(AGENT_PROTOCOL_VERSION),
    input: z.discriminatedUnion("kind", [
      textInputSchema,
      csvInputSchema,
      imageInputSchema,
      pdfInputSchema,
    ]),
    options: z
      .object({
        locale: z.string().min(1).optional(),
        timezone: z.string().min(1).optional(),
        evidence: z.enum(["none", "locations", "snippets"]).optional(),
        term: z
          .object({
            startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
            endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
          })
          .strict()
          .optional(),
        recovery: z
          .object({
            enabled: z.boolean(),
            consent: z.boolean(),
            maxFields: z.number().int().min(1).max(32).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type TimetableAgentRequest = z.infer<
  typeof baseTimetableAgentRequestSchema
>;
export type TimetableAgentInput = TimetableAgentRequest["input"];

function createTimetableAgentRequestSchema(
  inputKinds: readonly AgentInputKind[],
  allowRemoteRecovery: boolean,
): z.ZodType<TimetableAgentRequest> {
  return baseTimetableAgentRequestSchema.superRefine((request, context) => {
    if (!inputKinds.includes(request.input.kind)) {
      context.addIssue({
        code: "custom",
        path: ["input", "kind"],
        message: "The configured tool does not support this input kind.",
      });
    }
    if (!allowRemoteRecovery && request.options?.recovery !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["options", "recovery"],
        message: "Remote recovery is not enabled for this tool.",
      });
    }
  });
}

export const timetableAgentRequestSchema = createTimetableAgentRequestSchema(
  DEFAULT_AGENT_INPUT_KINDS,
  false,
);

export type { AgentErrorCode } from "./error-codes.js";

export type AgentErrorDetails = Readonly<
  Record<string, string | number | boolean>
>;

export type TimetableAgentError = {
  readonly code: AgentErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: AgentErrorDetails;
};

export type TimetableAgentResponse =
  | {
      readonly ok: true;
      readonly result: TimetableParseResult;
      readonly assessment: ResultAssessment;
    }
  | { readonly ok: false; readonly error: TimetableAgentError };

export type TimetableAgentToolDefinition = {
  readonly name: typeof TIMETABLE_AGENT_TOOL_NAME;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly outputSchema: JsonSchema;
};

export type TimetableAgentRecoveryCapabilities = {
  readonly allowed: boolean;
  readonly requiresConsent: true;
};

export type TimetableAgentCapabilities = {
  readonly protocolVersion: typeof AGENT_PROTOCOL_VERSION;
  readonly tools: readonly TimetableAgentToolDefinition[];
  readonly inputKinds: readonly AgentInputKind[];
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
  readonly maxRequestBytes: number;
  readonly maxResponseBytes: number;
  readonly maxProtocolLineBytes: number;
  readonly maxInputLines: number;
  readonly timeoutMs: number;
  readonly maxImagePixels: number;
  readonly maxPdfPages: number;
  readonly recovery: TimetableAgentRecoveryCapabilities;
};

export const timetableParseToolDefinition: TimetableAgentToolDefinition =
  deepFreeze({
    name: TIMETABLE_AGENT_TOOL_NAME,
    description:
      "Parse a timetable into validated events, warnings, conflicts, confidence, source metadata, and a typed usability assessment. Supported input kinds are text and csv. Remote recovery is not enabled unless the host explicitly allows it. Remote URLs are never fetched.",
    inputSchema: timetableAgentInputJsonSchema,
    outputSchema: timetableAgentOutputJsonSchema,
  });

export const timetableAgentCapabilities: TimetableAgentCapabilities =
  deepFreeze({
    protocolVersion: AGENT_PROTOCOL_VERSION,
    tools: [timetableParseToolDefinition],
    inputKinds: DEFAULT_AGENT_INPUT_KINDS,
    maxInputBytes: DEFAULT_RESOURCE_LIMITS.maxInputBytes,
    maxOutputBytes: DEFAULT_RESOURCE_LIMITS.maxOutputBytes,
    maxRequestBytes: DEFAULT_AGENT_REQUEST_BYTES,
    maxResponseBytes: DEFAULT_RESOURCE_LIMITS.maxOutputBytes,
    maxProtocolLineBytes: defaultProtocolLineLimit(
      DEFAULT_AGENT_REQUEST_BYTES,
      DEFAULT_RESOURCE_LIMITS.maxOutputBytes,
    ),
    maxInputLines: DEFAULT_AGENT_MAX_INPUT_LINES,
    timeoutMs: DEFAULT_RESOURCE_LIMITS.timeoutMs,
    maxImagePixels: DEFAULT_RESOURCE_LIMITS.maxImagePixels,
    maxPdfPages: DEFAULT_RESOURCE_LIMITS.maxPdfPages,
    recovery: { allowed: false, requiresConsent: true },
  });

export function getTimetableAgentCapabilities(): TimetableAgentCapabilities {
  return timetableAgentCapabilities;
}

export type TimetableAgentInvocationContext = {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ParseProgress) => void;
};

export type TimetableAgentToolOptions = {
  readonly parser?: TimetableParser;
  readonly inputKinds?: readonly AgentInputKind[];
  readonly limits?: Partial<ResourceLimits>;
  readonly maxRequestBytes?: number;
  readonly maxResponseBytes?: number;
  readonly maxInputLines?: number;
  readonly allowRemoteRecovery?: boolean;
};

export type TimetableAgentTool = {
  readonly capabilities: TimetableAgentCapabilities;
  readonly definition: TimetableAgentToolDefinition;
  invoke(
    request: unknown,
    context?: TimetableAgentInvocationContext,
  ): Promise<TimetableAgentResponse>;
};

class AgentBoundaryError extends Error {
  override readonly name = "AgentBoundaryError";

  constructor(
    readonly code: "INVALID_REQUEST" | "INPUT_TOO_LARGE",
    message: string,
    readonly details: AgentErrorDetails = {},
  ) {
    super(message);
  }
}

function positiveLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError("Agent limits must be positive safe integers.");
  }
  return value;
}

function defaultRequestLimit(limits: ResourceLimits): number {
  return Math.max(
    DEFAULT_AGENT_REQUEST_BYTES,
    Math.ceil(limits.maxInputBytes / 3) * 4 + 1_024,
  );
}

function defaultProtocolLineLimit(
  maxRequestBytes: number,
  maxResponseBytes: number,
): number {
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.max(maxRequestBytes, maxResponseBytes) + AGENT_PROTOCOL_ENVELOPE_BYTES,
  );
}

function normalizedInputKinds(
  options: TimetableAgentToolOptions,
): readonly AgentInputKind[] {
  const declared =
    options.inputKinds ??
    (options.parser === undefined ? DEFAULT_AGENT_INPUT_KINDS : []);
  if (new Set(declared).size !== declared.length) {
    throw new RangeError("Agent input kinds must not contain duplicates.");
  }
  for (const kind of declared) {
    if (!AGENT_INPUT_KIND_ORDER.includes(kind)) {
      throw new RangeError("Agent input kinds contain an unknown kind.");
    }
  }
  return Object.freeze(
    AGENT_INPUT_KIND_ORDER.filter((kind) => declared.includes(kind)),
  );
}

function serializedByteLength(value: unknown): number | undefined {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined
      ? undefined
      : new TextEncoder().encode(serialized).byteLength;
  } catch {
    return undefined;
  }
}

function base64ByteLength(value: string): number | undefined {
  if (
    value.length < 4 ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value,
    )
  ) {
    return undefined;
  }
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

function decodeBase64(
  value: string,
  maxBytes: number,
  field: string,
): Uint8Array {
  const byteLength = base64ByteLength(value);
  if (byteLength === undefined) {
    throw new AgentBoundaryError(
      "INVALID_REQUEST",
      "Binary input must contain valid base64 data.",
      { field },
    );
  }
  if (byteLength > maxBytes) {
    throw new AgentBoundaryError(
      "INPUT_TOO_LARGE",
      "Binary input exceeds the configured input limit.",
      { field, maxInputBytes: maxBytes },
    );
  }
  let decoded: string;
  try {
    decoded = atob(value);
  } catch {
    throw new AgentBoundaryError(
      "INVALID_REQUEST",
      "Binary input must contain valid base64 data.",
      { field },
    );
  }
  if (decoded.length !== byteLength) {
    throw new AgentBoundaryError(
      "INVALID_REQUEST",
      "Binary input must contain valid base64 data.",
      { field },
    );
  }
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function decodeInput(
  input: TimetableAgentInput,
  maxInputBytes: number,
):
  | { readonly kind: "text"; readonly text: string; readonly filename?: string }
  | {
      readonly kind: "csv";
      readonly text: string;
      readonly delimiter?: "," | ";" | "\t";
      readonly filename?: string;
    }
  | {
      readonly kind: "image";
      readonly bytes: Readonly<Uint8Array>;
      readonly mimeType: "image/png" | "image/jpeg" | "image/webp";
      readonly filename?: string;
    }
  | {
      readonly kind: "pdf";
      readonly bytes: Readonly<Uint8Array>;
      readonly mimeType: "application/pdf";
      readonly filename?: string;
    } {
  switch (input.kind) {
    case "text":
      return input.filename === undefined
        ? { kind: "text", text: input.text }
        : { kind: "text", text: input.text, filename: input.filename };
    case "csv":
      return {
        kind: "csv",
        text: input.text,
        ...(input.delimiter === undefined
          ? {}
          : { delimiter: input.delimiter }),
        ...(input.filename === undefined ? {} : { filename: input.filename }),
      };
    case "image":
      return {
        kind: "image",
        bytes: decodeBase64(input.base64, maxInputBytes, "input.base64"),
        mimeType: input.mimeType,
        ...(input.filename === undefined ? {} : { filename: input.filename }),
      };
    case "pdf":
      return {
        kind: "pdf",
        bytes: decodeBase64(input.base64, maxInputBytes, "input.base64"),
        mimeType: input.mimeType,
        ...(input.filename === undefined ? {} : { filename: input.filename }),
      };
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}

function inputByteLength(input: ReturnType<typeof decodeInput>): number {
  return input.kind === "text" || input.kind === "csv"
    ? new TextEncoder().encode(input.text).byteLength
    : input.bytes.byteLength;
}

function inputLineCount(input: ReturnType<typeof decodeInput>): number {
  if (input.kind !== "text" && input.kind !== "csv") return 0;
  let count = 1;
  for (let index = 0; index < input.text.length; index += 1) {
    const character = input.text[index];
    if (character === "\r") {
      count += 1;
      if (input.text[index + 1] === "\n") index += 1;
    } else if (character === "\n") {
      count += 1;
    }
  }
  return count;
}

function parseOptions(
  request: TimetableAgentRequest,
  limits: ResourceLimits,
  context: TimetableAgentInvocationContext | undefined,
): ParseOptions {
  const supplied = request.options;
  const recovery = supplied?.recovery;
  const recoveryOptions =
    recovery === undefined
      ? undefined
      : {
          enabled: recovery.enabled,
          consent: recovery.consent,
          ...(recovery.maxFields === undefined
            ? {}
            : { maxFields: recovery.maxFields }),
        };
  return {
    locale: supplied?.locale ?? "en-PH",
    timezone: supplied?.timezone ?? "UTC",
    evidence: supplied?.evidence ?? "none",
    limits,
    ...(supplied?.term === undefined ? {} : { term: supplied.term }),
    ...(recoveryOptions === undefined ? {} : { recovery: recoveryOptions }),
    ...(context?.signal === undefined ? {} : { signal: context.signal }),
    ...(context?.onProgress === undefined
      ? {}
      : { onProgress: context.onProgress }),
  };
}

type TimetableErrorLike = {
  readonly code: TimetableErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;
};

function isRetryable(error: TimetableErrorLike): boolean {
  if (error.code === "PROVIDER_TIMEOUT") return true;
  if (error.code !== "PROVIDER_FAILED") return false;
  const reason = error.details?.["reason"];
  return reason === "TIMEOUT" || reason === "UNAVAILABLE";
}

const TIMETABLE_ERROR_CODES: readonly TimetableErrorCode[] = [
  "ABORTED",
  "INVALID_INPUT",
  "INVALID_OPTIONS",
  "UNSUPPORTED_PROVIDER",
  "PROVIDER_FAILED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_OUTPUT_INVALID",
  "EXPORT_REQUIRES_TERM",
  "EXPORT_INVALID_RESULT",
];

function isTimetableErrorLike(error: unknown): error is TimetableErrorLike {
  if (error instanceof TimetableError) return true;
  if (typeof error !== "object" || error === null || Array.isArray(error)) {
    return false;
  }
  const record = error as Record<string, unknown>;
  const code = record["code"];
  const details = record["details"];
  return (
    typeof code === "string" &&
    TIMETABLE_ERROR_CODES.includes(code as TimetableErrorCode) &&
    (details === undefined ||
      (typeof details === "object" &&
        details !== null &&
        !Array.isArray(details)))
  );
}

function safeTimetableErrorMessage(code: TimetableErrorCode): string {
  switch (code) {
    case "ABORTED":
      return "Parsing was aborted.";
    case "INVALID_INPUT":
      return "The input is invalid.";
    case "INVALID_OPTIONS":
      return "The parser options are invalid.";
    case "UNSUPPORTED_PROVIDER":
      return "No configured provider supports this input.";
    case "PROVIDER_FAILED":
      return "A provider failed while processing the input.";
    case "PROVIDER_TIMEOUT":
      return "A provider timed out.";
    case "PROVIDER_OUTPUT_INVALID":
      return "A provider returned invalid output.";
    case "EXPORT_REQUIRES_TERM":
      return "The requested operation requires a term range.";
    case "EXPORT_INVALID_RESULT":
      return "The parser returned an invalid result.";
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

function detailsIfPresent(details: AgentErrorDetails): {
  readonly details?: AgentErrorDetails;
} {
  return Object.keys(details).length === 0 ? {} : { details };
}

function failure(
  code: AgentErrorCode,
  message: string,
  retryable: boolean,
  details: AgentErrorDetails = {},
): TimetableAgentResponse {
  return {
    ok: false,
    error: {
      code,
      message,
      retryable,
      ...detailsIfPresent(details),
    },
  };
}

function mapError(error: unknown): TimetableAgentResponse {
  if (error instanceof AgentBoundaryError) {
    return failure(error.code, error.message, false, error.details);
  }
  if (isTimetableErrorLike(error)) {
    return failure(
      error.code,
      safeTimetableErrorMessage(error.code),
      isRetryable(error),
    );
  }
  return failure("INTERNAL", "The timetable tool failed unexpectedly.", false);
}

function sortedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedValue);
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = sortedValue(record[key]);
  }
  return sorted;
}

export function serializeTimetableAgentResponse(
  response: TimetableAgentResponse,
  options: { readonly pretty?: boolean } = {},
): string {
  if (!timetableAgentResponseSchema.safeParse(response).success) {
    throw new SchemaValidationError("TimetableAgentResponse");
  }
  return (
    JSON.stringify(
      sortedValue(response),
      null,
      options.pretty === true ? 2 : undefined,
    ) ?? "null"
  );
}

const assessmentRuntimeSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("usable"),
      reasons: z.array(z.never()).length(0),
    })
    .strict(),
  z
    .object({
      status: z.literal("unusable"),
      reasons: z
        .array(z.enum(["NO_EVENTS", "ERROR_WARNINGS"]))
        .min(1)
        .max(2)
        .refine((reasons) => new Set(reasons).size === reasons.length),
    })
    .strict(),
]);

export const timetableAgentResponseSchema = z
  .union([
    z
      .object({
        ok: z.literal(true),
        result: timetableParseResultSchema,
        assessment: assessmentRuntimeSchema,
      })
      .strict(),
    z
      .object({
        ok: z.literal(false),
        error: z
          .object({
            code: z.enum(AGENT_ERROR_CODES),
            message: z.string().min(1),
            retryable: z.boolean(),
            details: z
              .record(
                z.string(),
                z.union([z.string(), z.number(), z.boolean()]),
              )
              .optional(),
          })
          .strict(),
      })
      .strict(),
  ])
  .superRefine((response, context) => {
    if (!response.ok) return;
    const expected = assessTimetableResult(response.result);
    if (
      response.assessment.status !== expected.status ||
      response.assessment.reasons.length !== expected.reasons.length ||
      response.assessment.reasons.some(
        (reason, index) => reason !== expected.reasons[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["assessment"],
        message: "Assessment does not match the timetable result.",
      });
    }
  });

function descriptionFor(
  inputKinds: readonly AgentInputKind[],
  allowRemoteRecovery: boolean,
): string {
  const kinds = inputKinds.length === 0 ? "none" : inputKinds.join(", ");
  const recovery = allowRemoteRecovery
    ? "The host allows remote recovery only when the request sets enabled and consent to true. Provider health is checked during invocation."
    : "Remote recovery is not enabled for this tool.";
  return `Parse a timetable into validated events, warnings, conflicts, confidence, source metadata, and a typed usability assessment. Supported input kinds are ${kinds}. ${recovery} Remote URLs are never fetched.`;
}

function createDefinition(
  inputKinds: readonly AgentInputKind[],
  allowRemoteRecovery: boolean,
): TimetableAgentToolDefinition {
  const isDefault =
    !allowRemoteRecovery &&
    inputKinds.length === DEFAULT_AGENT_INPUT_KINDS.length &&
    inputKinds.every(
      (kind, index) => kind === DEFAULT_AGENT_INPUT_KINDS[index],
    );
  return isDefault
    ? timetableParseToolDefinition
    : deepFreeze({
        name: TIMETABLE_AGENT_TOOL_NAME,
        description: descriptionFor(inputKinds, allowRemoteRecovery),
        inputSchema: createTimetableAgentInputJsonSchema({
          inputKinds,
          allowRemoteRecovery,
        }),
        outputSchema: timetableAgentOutputJsonSchema,
      });
}

function createCapabilities(
  definition: TimetableAgentToolDefinition,
  inputKinds: readonly AgentInputKind[],
  limits: ResourceLimits,
  maxRequestBytes: number,
  maxResponseBytes: number,
  maxInputLines: number,
  allowRemoteRecovery: boolean,
): TimetableAgentCapabilities {
  const isDefault =
    definition === timetableParseToolDefinition &&
    maxRequestBytes === DEFAULT_AGENT_REQUEST_BYTES &&
    maxResponseBytes === limits.maxOutputBytes &&
    maxInputLines === DEFAULT_AGENT_MAX_INPUT_LINES &&
    limits.maxInputBytes === DEFAULT_RESOURCE_LIMITS.maxInputBytes &&
    limits.maxOutputBytes === DEFAULT_RESOURCE_LIMITS.maxOutputBytes &&
    limits.timeoutMs === DEFAULT_RESOURCE_LIMITS.timeoutMs &&
    limits.maxImagePixels === DEFAULT_RESOURCE_LIMITS.maxImagePixels &&
    limits.maxPdfPages === DEFAULT_RESOURCE_LIMITS.maxPdfPages &&
    !allowRemoteRecovery;
  return isDefault
    ? timetableAgentCapabilities
    : deepFreeze({
        protocolVersion: AGENT_PROTOCOL_VERSION,
        tools: [definition],
        inputKinds,
        maxInputBytes: limits.maxInputBytes,
        maxOutputBytes: limits.maxOutputBytes,
        maxRequestBytes,
        maxResponseBytes,
        maxProtocolLineBytes: defaultProtocolLineLimit(
          maxRequestBytes,
          maxResponseBytes,
        ),
        maxInputLines,
        timeoutMs: limits.timeoutMs,
        maxImagePixels: limits.maxImagePixels,
        maxPdfPages: limits.maxPdfPages,
        recovery: {
          allowed: allowRemoteRecovery,
          requiresConsent: true,
        },
      });
}

export function createTimetableAgentTool(
  options: TimetableAgentToolOptions = {},
): TimetableAgentTool {
  if (options.allowRemoteRecovery === true && options.parser === undefined) {
    throw new RangeError(
      "Remote recovery requires a host-injected parser with a recovery provider.",
    );
  }
  const inputKinds = normalizedInputKinds(options);
  if (
    options.parser === undefined &&
    inputKinds.some((kind) => kind === "image" || kind === "pdf")
  ) {
    throw new RangeError(
      "Binary input kinds require a host-injected parser with binary providers.",
    );
  }
  const parser = options.parser ?? createTimetableParser();
  const limits = resolveLimits(options.limits);
  const maxRequestBytes = positiveLimit(
    options.maxRequestBytes,
    defaultRequestLimit(limits),
  );
  const maxResponseBytes = positiveLimit(
    options.maxResponseBytes,
    limits.maxOutputBytes,
  );
  const maxInputLines = positiveLimit(
    options.maxInputLines,
    DEFAULT_AGENT_MAX_INPUT_LINES,
  );
  const allowRemoteRecovery = options.allowRemoteRecovery === true;
  const definition =
    options.parser === undefined &&
    options.inputKinds === undefined &&
    options.limits === undefined &&
    options.maxRequestBytes === undefined &&
    options.maxResponseBytes === undefined &&
    options.maxInputLines === undefined &&
    options.allowRemoteRecovery === undefined
      ? timetableParseToolDefinition
      : createDefinition(inputKinds, allowRemoteRecovery);
  const capabilities =
    definition === timetableParseToolDefinition &&
    options.parser === undefined &&
    options.inputKinds === undefined &&
    options.limits === undefined &&
    options.maxRequestBytes === undefined &&
    options.maxResponseBytes === undefined &&
    options.maxInputLines === undefined &&
    options.allowRemoteRecovery === undefined
      ? timetableAgentCapabilities
      : createCapabilities(
          definition,
          inputKinds,
          limits,
          maxRequestBytes,
          maxResponseBytes,
          maxInputLines,
          allowRemoteRecovery,
        );
  const requestSchema = createTimetableAgentRequestSchema(
    inputKinds,
    allowRemoteRecovery,
  );

  return {
    capabilities,
    definition,
    async invoke(
      request: unknown,
      context?: TimetableAgentInvocationContext,
    ): Promise<TimetableAgentResponse> {
      const requestBytes = serializedByteLength(request);
      if (requestBytes === undefined) {
        return failure(
          "INVALID_REQUEST",
          "The request must be JSON-serializable.",
          false,
        );
      }
      if (requestBytes > maxRequestBytes) {
        return failure(
          "INPUT_TOO_LARGE",
          "The agent request exceeds the configured request limit.",
          false,
          { maxRequestBytes },
        );
      }
      const parsed = requestSchema.safeParse(request);
      if (!parsed.success) {
        return failure(
          "INVALID_REQUEST",
          "The request does not match the TimetableKit agent schema.",
          false,
          { schema: "TimetableAgentRequest" },
        );
      }
      try {
        const input = decodeInput(parsed.data.input, limits.maxInputBytes);
        if (inputByteLength(input) > limits.maxInputBytes) {
          throw new AgentBoundaryError(
            "INPUT_TOO_LARGE",
            "Input exceeds the configured input limit.",
            { maxInputBytes: limits.maxInputBytes },
          );
        }
        if (inputLineCount(input) > maxInputLines) {
          throw new AgentBoundaryError(
            "INPUT_TOO_LARGE",
            "Input contains too many lines for the configured limit.",
            { maxInputLines },
          );
        }
        const result = await parser.parse(
          input,
          parseOptions(parsed.data, limits, context),
        );
        const parsedResult = timetableParseResultSchema.safeParse(result);
        if (!parsedResult.success) {
          return failure(
            "INTERNAL",
            "The parser returned an invalid result.",
            false,
            { schema: "TimetableParseResult" },
          );
        }
        const response: TimetableAgentResponse = {
          ok: true,
          result: parsedResult.data,
          assessment: assessTimetableResult(parsedResult.data),
        };
        if (!timetableAgentResponseSchema.safeParse(response).success) {
          return failure(
            "INTERNAL",
            "The parser returned an invalid result.",
            false,
            { schema: "TimetableAgentResponse" },
          );
        }
        const responseBytes = serializedByteLength(response);
        if (responseBytes === undefined || responseBytes > maxResponseBytes) {
          return failure(
            "OUTPUT_TOO_LARGE",
            "The parsed result exceeds the configured output limit.",
            false,
            { maxResponseBytes },
          );
        }
        return response;
      } catch (error) {
        return mapError(error);
      }
    },
  };
}

export type AgentRequestId = string | number | null;

export type AgentProtocolRequest =
  | { readonly id?: AgentRequestId; readonly op: "capabilities" }
  | {
      readonly id?: AgentRequestId;
      readonly op: "parse";
      readonly request: unknown;
    };

export type AgentProtocolResponse =
  | {
      readonly protocolVersion: typeof AGENT_PROTOCOL_VERSION;
      readonly id: AgentRequestId;
      readonly ok: true;
      readonly result: TimetableAgentCapabilities;
    }
  | {
      readonly protocolVersion: typeof AGENT_PROTOCOL_VERSION;
      readonly id: AgentRequestId;
      readonly ok: true;
      readonly result: TimetableParseResult;
      readonly assessment: ResultAssessment;
    }
  | {
      readonly protocolVersion: typeof AGENT_PROTOCOL_VERSION;
      readonly id: AgentRequestId;
      readonly ok: false;
      readonly error: TimetableAgentError;
    };

export type TimetableAgentProtocolIO = {
  readonly input: AsyncIterable<Uint8Array | string>;
  readonly output: (value: string) => void;
  readonly signal?: AbortSignal;
  readonly tool?: TimetableAgentTool;
  readonly maxLineBytes?: number;
};

const agentRequestIdSchema = z
  .union([
    z
      .string()
      .refine(
        (value) =>
          new TextEncoder().encode(value).byteLength <=
          MAX_AGENT_REQUEST_ID_BYTES,
        { message: "Request ID exceeds the byte limit." },
      ),
    z
      .number()
      .refine((value) => Number.isSafeInteger(value) && !Object.is(value, -0), {
        message: "Request ID must be a safe integer.",
      }),
    z.null(),
  ])
  .optional();

const agentProtocolRequestSchema = z.union([
  z
    .object({
      id: agentRequestIdSchema,
      op: z.literal("capabilities"),
    })
    .strict(),
  z
    .object({
      id: agentRequestIdSchema,
      op: z.literal("parse"),
      request: z.unknown(),
    })
    .strict(),
]);

function protocolFailure(
  id: AgentRequestId,
  code: AgentErrorCode,
  message: string,
): AgentProtocolResponse {
  return {
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id,
    ok: false,
    error: {
      code,
      message,
      retryable: false,
    },
  };
}

function protocolError(
  id: AgentRequestId,
  message: string,
): AgentProtocolResponse {
  return protocolFailure(id, "INVALID_REQUEST", message);
}

function requestId(value: unknown): AgentRequestId {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const id = (value as Record<string, unknown>)["id"];
  if (
    typeof id === "string" &&
    new TextEncoder().encode(id).byteLength <= MAX_AGENT_REQUEST_ID_BYTES
  ) {
    return id;
  }
  if (
    typeof id === "number" &&
    Number.isSafeInteger(id) &&
    !Object.is(id, -0)
  ) {
    return id;
  }
  return null;
}

function serializeProtocolResponse(response: AgentProtocolResponse): string {
  const serialized = JSON.stringify(sortedValue(response));
  if (serialized === undefined) {
    throw new Error("Protocol response is not JSON-serializable.");
  }
  return serialized;
}

class ProtocolOutputError extends Error {
  override readonly name = "ProtocolOutputError";

  constructor(override readonly cause: unknown) {
    super("The protocol output sink failed.");
  }
}

function protocolLineByteLength(serialized: string): number {
  return new TextEncoder().encode(`${serialized}\n`).byteLength;
}

function emitProtocolOutput(
  io: TimetableAgentProtocolIO,
  serialized: string,
): void {
  try {
    io.output(`${serialized}\n`);
  } catch (error) {
    throw new ProtocolOutputError(error);
  }
}

function validateMinimumProtocolLineBytes(): void {
  const fallback = serializeProtocolResponse(
    protocolFailure(
      null,
      "OUTPUT_TOO_LARGE",
      "The protocol response exceeds the configured size limit.",
    ),
  );
  if (protocolLineByteLength(fallback) > MIN_AGENT_PROTOCOL_LINE_BYTES) {
    throw new RangeError(
      "The minimum protocol line limit is too small for an error response.",
    );
  }
}

validateMinimumProtocolLineBytes();

function writeProtocolResponse(
  io: TimetableAgentProtocolIO,
  response: AgentProtocolResponse,
  maxLineBytes: number,
): void {
  const serialized = serializeProtocolResponse(response);
  if (protocolLineByteLength(serialized) <= maxLineBytes) {
    emitProtocolOutput(io, serialized);
    return;
  }
  const fallback = protocolFailure(
    response.id,
    "OUTPUT_TOO_LARGE",
    "The protocol response exceeds the configured size limit.",
  );
  const fallbackSerialized = serializeProtocolResponse(fallback);
  if (protocolLineByteLength(fallbackSerialized) <= maxLineBytes) {
    emitProtocolOutput(io, fallbackSerialized);
    return;
  }
  const nullFallbackSerialized = serializeProtocolResponse(
    protocolFailure(
      null,
      "OUTPUT_TOO_LARGE",
      "The protocol response exceeds the configured size limit.",
    ),
  );
  if (protocolLineByteLength(nullFallbackSerialized) > maxLineBytes) {
    throw new RangeError(
      "The protocol line limit is too small for an error response.",
    );
  }
  emitProtocolOutput(io, nullFallbackSerialized);
}

async function handleProtocolLine(
  line: string,
  io: TimetableAgentProtocolIO,
  tool: TimetableAgentTool,
  capabilities: TimetableAgentCapabilities,
  maxLineBytes: number,
): Promise<void> {
  if (line.trim().length === 0) return;
  let value: unknown;
  try {
    value = JSON.parse(line) as unknown;
  } catch {
    writeProtocolResponse(
      io,
      protocolError(null, "Each line must be valid JSON."),
      maxLineBytes,
    );
    return;
  }
  const parsed = agentProtocolRequestSchema.safeParse(value);
  if (!parsed.success) {
    writeProtocolResponse(
      io,
      protocolError(requestId(value), "The protocol request is invalid."),
      maxLineBytes,
    );
    return;
  }
  const id = parsed.data.id ?? null;
  if (parsed.data.op === "capabilities") {
    writeProtocolResponse(
      io,
      {
        protocolVersion: AGENT_PROTOCOL_VERSION,
        id,
        ok: true,
        result: capabilities,
      },
      maxLineBytes,
    );
    return;
  }
  let result: TimetableAgentResponse;
  try {
    result = await tool.invoke(parsed.data.request, {
      ...(io.signal === undefined ? {} : { signal: io.signal }),
    });
  } catch (error) {
    result = mapError(error);
  }
  writeProtocolResponse(
    io,
    result.ok
      ? {
          protocolVersion: AGENT_PROTOCOL_VERSION,
          id,
          ok: true,
          result: result.result,
          assessment: result.assessment,
        }
      : {
          protocolVersion: AGENT_PROTOCOL_VERSION,
          id,
          ok: false,
          error: result.error,
        },
    maxLineBytes,
  );
}

async function handleProtocolBytes(
  bytes: Uint8Array,
  io: TimetableAgentProtocolIO,
  tool: TimetableAgentTool,
  capabilities: TimetableAgentCapabilities,
  maxLineBytes: number,
): Promise<void> {
  const lineBytes =
    bytes[bytes.length - 1] === 0x0d
      ? bytes.subarray(0, bytes.length - 1)
      : bytes;
  let line: string;
  try {
    line = new TextDecoder("utf-8", { fatal: true }).decode(lineBytes);
  } catch {
    writeProtocolResponse(
      io,
      protocolError(null, "Each line must be valid UTF-8."),
      maxLineBytes,
    );
    return;
  }
  await handleProtocolLine(line, io, tool, capabilities, maxLineBytes);
}

function effectiveProtocolCapabilities(
  capabilities: TimetableAgentCapabilities,
  maxProtocolLineBytes: number,
): TimetableAgentCapabilities {
  return capabilities.maxProtocolLineBytes === maxProtocolLineBytes
    ? capabilities
    : deepFreeze({ ...capabilities, maxProtocolLineBytes });
}

export async function runTimetableAgentProtocol(
  io: TimetableAgentProtocolIO,
): Promise<void> {
  const tool = io.tool ?? createTimetableAgentTool();
  const maxLineBytes = positiveLimit(
    io.maxLineBytes,
    tool.capabilities.maxProtocolLineBytes,
  );
  if (maxLineBytes < MIN_AGENT_PROTOCOL_LINE_BYTES) {
    throw new RangeError(
      `The protocol line limit must be at least ${MIN_AGENT_PROTOCOL_LINE_BYTES} bytes.`,
    );
  }
  const capabilities = effectiveProtocolCapabilities(
    tool.capabilities,
    maxLineBytes,
  );
  const encoder = new TextEncoder();
  let lineBuffer: Uint8Array | undefined;
  let lineLength = 0;
  let oversized = false;

  const resetLine = (): void => {
    lineBuffer = undefined;
    lineLength = 0;
    oversized = false;
  };

  const appendLinePart = (part: Uint8Array): void => {
    if (oversized || part.byteLength === 0) return;
    if (part.byteLength > maxLineBytes - lineLength) {
      lineBuffer = undefined;
      oversized = true;
      return;
    }
    const required = lineLength + part.byteLength;
    if (lineBuffer === undefined) {
      lineBuffer = new Uint8Array(Math.min(8_192, maxLineBytes));
    }
    if (lineBuffer.byteLength < required) {
      let capacity = lineBuffer.byteLength;
      while (capacity < required) {
        capacity = Math.min(maxLineBytes, Math.max(required, capacity * 2));
      }
      const expanded = new Uint8Array(capacity);
      expanded.set(lineBuffer.subarray(0, lineLength));
      lineBuffer = expanded;
    }
    lineBuffer.set(part, lineLength);
    lineLength = required;
  };

  const flushLine = async (terminated: boolean): Promise<void> => {
    try {
      if (!oversized && terminated && lineLength >= maxLineBytes) {
        oversized = true;
      }
      if (oversized) {
        writeProtocolResponse(
          io,
          protocolError(
            null,
            "The protocol line exceeds the configured size limit.",
          ),
          maxLineBytes,
        );
      } else {
        await handleProtocolBytes(
          lineBuffer?.subarray(0, lineLength) ?? new Uint8Array(),
          io,
          tool,
          capabilities,
          maxLineBytes,
        );
      }
    } catch (error) {
      if (error instanceof ProtocolOutputError) throw error;
      writeProtocolResponse(
        io,
        protocolFailure(null, "INTERNAL", "The protocol line failed."),
        maxLineBytes,
      );
    } finally {
      resetLine();
    }
  };

  const processChunk = async (chunk: Uint8Array): Promise<void> => {
    let start = 0;
    for (let index = 0; index < chunk.length; index += 1) {
      if (chunk[index] !== 0x0a) continue;
      appendLinePart(chunk.subarray(start, index));
      await flushLine(true);
      start = index + 1;
    }
    appendLinePart(chunk.subarray(start));
  };

  try {
    for await (const chunk of io.input) {
      await processChunk(
        typeof chunk === "string" ? encoder.encode(chunk) : chunk,
      );
    }
    if (oversized || lineLength > 0) await flushLine(false);
  } catch (error) {
    if (error instanceof ProtocolOutputError) throw error.cause;
    writeProtocolResponse(
      io,
      protocolFailure(
        null,
        "INTERNAL",
        "The protocol input could not be read.",
      ),
      maxLineBytes,
    );
  }
}

export {
  timetableAgentCapabilitiesJsonSchema,
  timetableAgentInputJsonSchema,
  timetableAgentOutputJsonSchema,
};
