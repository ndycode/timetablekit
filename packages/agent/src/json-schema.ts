import { timetableResultJsonSchema } from "@ndycode/timetablekit";
import { AGENT_ERROR_CODES } from "./error-codes.js";

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

const optionsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    locale: { type: "string", minLength: 1 },
    timezone: { type: "string", minLength: 1 },
    evidence: { enum: ["none", "locations", "snippets"] },
    term: termSchema,
    recovery: recoverySchema,
  },
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

export const timetableAgentInputJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://timetablekit.vercel.app/schema/agent-input.schema.json",
  title: "TimetableAgentRequest",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "input"],
  properties: {
    schemaVersion: { const: "1" },
    input: {
      oneOf: [
        textInputSchema,
        csvInputSchema,
        imageInputSchema,
        pdfInputSchema,
      ],
    },
    options: optionsSchema,
  },
} as const;

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

export const timetableAgentOutputJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://timetablekit.vercel.app/schema/agent-output.schema.json",
  title: "TimetableAgentResponse",
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["ok", "result"],
      properties: {
        ok: { const: true },
        result: timetableResultJsonSchema,
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
} as const;

export const timetableAgentCapabilitiesJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://timetablekit.vercel.app/schema/agent-capabilities.schema.json",
  title: "TimetableAgentCapabilities",
  type: "object",
  additionalProperties: false,
  required: ["protocolVersion", "tools"],
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
  },
} as const;
