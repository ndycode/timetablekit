import { timetableResultJsonSchema } from "@ndycode/timetablekit";
import type { SourceKind } from "@ndycode/timetablekit";
import { AGENT_ERROR_CODES } from "./error-codes.js";

export type AgentInputKind = SourceKind;

export type TimetableAgentInputSchemaOptions = {
  readonly inputKinds: readonly AgentInputKind[];
  readonly allowRemoteRecovery: boolean;
};

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null) return value;
  for (const child of Object.values(value)) {
    if (typeof child === "object" && child !== null) deepFreeze(child);
  }
  return Object.freeze(value);
}

const dateSchema = {
  type: "string",
  pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
} as const;

const termSchema = {
  type: "object",
  additionalProperties: false,
  required: ["startsOn", "endsOn"],
  properties: {
    startsOn: dateSchema,
    endsOn: dateSchema,
  },
} as const;

const recoverySchema = {
  type: "object",
  additionalProperties: false,
  required: ["enabled", "consent"],
  properties: {
    enabled: { type: "boolean" },
    consent: { type: "boolean" },
    maxFields: { type: "integer", minimum: 1, maximum: 32 },
  },
} as const;

const optionsProperties = {
  locale: { type: "string", minLength: 1 },
  timezone: { type: "string", minLength: 1 },
  evidence: { enum: ["none", "locations", "snippets"] },
  term: termSchema,
} as const;

const filename = { type: "string" } as const;

const textInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "text"],
  properties: {
    kind: { const: "text" },
    text: { type: "string" },
    filename,
  },
} as const;

const csvInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "text"],
  properties: {
    kind: { const: "csv" },
    text: { type: "string" },
    delimiter: { enum: [",", ";", "\t"] },
    filename,
  },
} as const;

const imageInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "mimeType", "base64"],
  properties: {
    kind: { const: "image" },
    mimeType: { enum: ["image/png", "image/jpeg", "image/webp"] },
    base64: {
      type: "string",
      minLength: 1,
      pattern:
        "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$",
    },
    filename,
  },
} as const;

const pdfInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "mimeType", "base64"],
  properties: {
    kind: { const: "pdf" },
    mimeType: { const: "application/pdf" },
    base64: {
      type: "string",
      minLength: 1,
      pattern:
        "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$",
    },
    filename,
  },
} as const;

const inputSchemas = {
  text: textInputSchema,
  csv: csvInputSchema,
  image: imageInputSchema,
  pdf: pdfInputSchema,
} as const;

export function createTimetableAgentInputJsonSchema(
  options: TimetableAgentInputSchemaOptions,
) {
  const properties = options.allowRemoteRecovery
    ? { ...optionsProperties, recovery: recoverySchema }
    : optionsProperties;
  return deepFreeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://timetablekit.vercel.app/schema/agent-input.schema.json",
    title: "TimetableAgentRequest",
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "input"],
    properties: {
      schemaVersion: { const: "1" },
      input: {
        oneOf:
          options.inputKinds.length === 0
            ? [{ not: {} }]
            : options.inputKinds.map((kind) => inputSchemas[kind]),
      },
      options: {
        type: "object",
        additionalProperties: false,
        properties,
      },
    },
  } as const);
}

const agentErrorSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "message", "retryable"],
  properties: {
    code: { enum: AGENT_ERROR_CODES },
    message: { type: "string", minLength: 1 },
    retryable: { type: "boolean" },
    details: {
      type: "object",
      additionalProperties: {
        oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }],
      },
    },
  },
} as const;

const assessmentSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["status", "reasons"],
      properties: {
        status: { const: "usable" },
        reasons: { type: "array", maxItems: 0 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["status", "reasons"],
      properties: {
        status: { const: "unusable" },
        reasons: {
          type: "array",
          minItems: 1,
          maxItems: 2,
          uniqueItems: true,
          items: { enum: ["NO_EVENTS", "ERROR_WARNINGS"] },
        },
      },
    },
  ],
} as const;

export const timetableAgentOutputJsonSchema = deepFreeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://timetablekit.vercel.app/schema/agent-output.schema.json",
  title: "TimetableAgentResponse",
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["ok", "result", "assessment"],
      properties: {
        ok: { const: true },
        result: structuredClone(timetableResultJsonSchema),
        assessment: assessmentSchema,
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["ok", "error"],
      properties: {
        ok: { const: false },
        error: { $ref: "#/$defs/error" },
      },
    },
  ],
  $defs: {
    error: agentErrorSchema,
  },
} as const);

const defaultInputKinds = ["text", "csv"] as const;

export const timetableAgentInputJsonSchema =
  createTimetableAgentInputJsonSchema({
    inputKinds: defaultInputKinds,
    allowRemoteRecovery: false,
  });

export const timetableAgentCapabilitiesJsonSchema = deepFreeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://timetablekit.vercel.app/schema/agent-capabilities.schema.json",
  title: "TimetableAgentCapabilities",
  type: "object",
  additionalProperties: false,
  required: [
    "protocolVersion",
    "tools",
    "inputKinds",
    "maxInputBytes",
    "maxOutputBytes",
    "maxRequestBytes",
    "maxResponseBytes",
    "maxProtocolLineBytes",
    "maxInputLines",
    "timeoutMs",
    "maxImagePixels",
    "maxPdfPages",
    "recovery",
  ],
  properties: {
    protocolVersion: { const: "1" },
    tools: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "inputSchema", "outputSchema"],
        properties: {
          name: { const: "timetablekit.parse" },
          description: { type: "string", minLength: 1 },
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
        },
      },
    },
    inputKinds: {
      type: "array",
      uniqueItems: true,
      items: { enum: ["text", "csv", "image", "pdf"] },
    },
    maxInputBytes: { type: "integer", minimum: 1 },
    maxOutputBytes: { type: "integer", minimum: 1 },
    maxRequestBytes: { type: "integer", minimum: 1 },
    maxResponseBytes: { type: "integer", minimum: 1 },
    maxProtocolLineBytes: { type: "integer", minimum: 256 },
    maxInputLines: { type: "integer", minimum: 1 },
    timeoutMs: { type: "integer", minimum: 1 },
    maxImagePixels: { type: "integer", minimum: 1 },
    maxPdfPages: { type: "integer", minimum: 1 },
    recovery: {
      type: "object",
      additionalProperties: false,
      required: ["allowed", "requiresConsent"],
      properties: {
        allowed: { type: "boolean" },
        requiresConsent: { const: true },
      },
    },
  },
} as const);
