import { describe, expect, it } from "vitest";
import {
  AGENT_PROTOCOL_VERSION,
  DEFAULT_AGENT_MAX_INPUT_LINES,
  MAX_AGENT_REQUEST_ID_BYTES,
  MIN_AGENT_PROTOCOL_LINE_BYTES,
  createTimetableAgentTool,
  getTimetableAgentCapabilities,
  runTimetableAgentProtocol,
  serializeTimetableAgentResponse,
  timetableAgentInputJsonSchema,
  timetableAgentOutputJsonSchema,
  timetableAgentResponseSchema,
  timetableParseToolDefinition,
} from "../src/index.js";
import {
  ProviderError,
  assessTimetableResult,
  timetableResultJsonSchema,
} from "@ndycode/timetablekit";
import type {
  ParseOptions,
  TimetableParseResult,
  TimetableParser,
} from "@ndycode/timetablekit";
import type { TimetableAgentTool } from "../src/index.js";

async function* chunks(values: readonly string[]): AsyncIterable<string> {
  for (const value of values) yield value;
}

function parsedResult(
  overrides: Partial<TimetableParseResult> = {},
): TimetableParseResult {
  return {
    schemaVersion: "1.0",
    source: { kind: "text" },
    timezone: "UTC",
    locale: "en-PH",
    events: [],
    warnings: [],
    conflicts: [],
    parse: {
      durationMs: 0,
      deterministicConfidence: 0,
      aiRecoveryUsed: false,
      providersUsed: [],
      stageReports: [],
    },
    ...overrides,
  };
}

const event = {
  id: "event-1",
  title: "Agent Math",
  schedule: { kind: "weekly", weekdays: ["MO"] },
  startTime: "09:00",
  endTime: "10:00",
  timezone: "UTC",
  confidence: 1,
  fieldConfidence: {},
  evidence: {},
} as const;

describe("TimetableKit agent tool", () => {
  it("returns a structured result and the shared assessment", async () => {
    const tool = createTimetableAgentTool();
    const response = await tool.invoke({
      schemaVersion: "1",
      input: {
        kind: "text",
        text: "Agent Math Monday 09:00-10:00",
      },
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.result.events[0]).toMatchObject({ title: "Agent Math" });
    expect(response.assessment).toEqual(assessTimetableResult(response.result));
    expect(JSON.parse(serializeTimetableAgentResponse(response))).toEqual(
      response,
    );
  });

  it("preserves the core unusable assessment reasons", async () => {
    const result = parsedResult({
      events: [event],
      warnings: [
        {
          code: "INVALID_TIME_RANGE",
          severity: "error",
          message: "The event time range is invalid.",
        },
      ],
    });
    const tool = createTimetableAgentTool({
      parser: { parse: async () => result },
      inputKinds: ["text"],
    });
    const response = await tool.invoke({
      schemaVersion: "1",
      input: { kind: "text", text: "invalid" },
    });
    expect(response).toMatchObject({
      ok: true,
      assessment: { status: "unusable", reasons: ["ERROR_WARNINGS"] },
    });
    expect(response.ok && response.assessment).toEqual(
      assessTimetableResult(result),
    );
  });

  it("rejects an assessment that does not match its result", () => {
    const result = parsedResult();

    expect(
      timetableAgentResponseSchema.safeParse({
        ok: true,
        result,
        assessment: { status: "usable", reasons: [] },
      }).success,
    ).toBe(false);
  });

  it("exposes frozen default and effective custom capabilities", () => {
    const defaults = getTimetableAgentCapabilities();
    expect(Object.isFrozen(defaults)).toBe(true);
    expect(Object.isFrozen(defaults.tools)).toBe(true);
    expect(Object.isFrozen(defaults.tools[0])).toBe(true);
    expect(defaults.inputKinds).toEqual(["text", "csv"]);
    expect(defaults.maxInputLines).toBeLessThanOrEqual(5_000);
    expect(defaults.maxProtocolLineBytes).toBeGreaterThan(
      defaults.maxResponseBytes,
    );
    expect(defaults.recovery).toEqual({
      allowed: false,
      requiresConsent: true,
    });
    expect(Object.isFrozen(timetableParseToolDefinition)).toBe(true);
    expect(Object.isFrozen(timetableAgentInputJsonSchema)).toBe(true);
    expect(Object.isFrozen(timetableAgentOutputJsonSchema)).toBe(true);
    expect(Object.isFrozen(timetableResultJsonSchema)).toBe(false);

    const custom = createTimetableAgentTool({
      parser: { parse: async () => parsedResult() },
      inputKinds: ["image", "pdf"],
      limits: {
        maxInputBytes: 1234,
        maxOutputBytes: 2345,
        maxImagePixels: 3456,
        maxPdfPages: 7,
        timeoutMs: 890,
      },
      maxRequestBytes: 4567,
      maxResponseBytes: 5678,
      maxInputLines: 99,
      allowRemoteRecovery: true,
    });
    expect(custom.capabilities.inputKinds).toEqual(["image", "pdf"]);
    expect(custom.capabilities.maxInputBytes).toBe(1234);
    expect(custom.capabilities.maxOutputBytes).toBe(2345);
    expect(custom.capabilities.maxRequestBytes).toBe(4567);
    expect(custom.capabilities.maxResponseBytes).toBe(5678);
    expect(custom.capabilities.maxProtocolLineBytes).toBeGreaterThan(5678);
    expect(custom.capabilities.maxInputLines).toBe(99);
    expect(custom.capabilities.timeoutMs).toBe(890);
    expect(custom.capabilities.maxImagePixels).toBe(3456);
    expect(custom.capabilities.maxPdfPages).toBe(7);
    expect(custom.capabilities.recovery).toEqual({
      allowed: true,
      requiresConsent: true,
    });
    expect(Object.isFrozen(custom.capabilities)).toBe(true);
    expect(Object.isFrozen(custom.capabilities.inputKinds)).toBe(true);
    expect(Object.isFrozen(custom.capabilities.recovery)).toBe(true);
    expect(custom.capabilities.tools[0]).toBe(custom.definition);
    expect(custom.definition.inputSchema).not.toBe(
      timetableAgentInputJsonSchema,
    );
  });

  it("rejects recovery capability claims without an injected parser", () => {
    expect(() =>
      createTimetableAgentTool({ allowRemoteRecovery: true }),
    ).toThrow("Remote recovery requires a host-injected parser");
  });

  it("rejects binary input claims without an injected parser", () => {
    expect(() => createTimetableAgentTool({ inputKinds: ["image"] })).toThrow(
      "Binary input kinds require a host-injected parser",
    );
    expect(() =>
      createTimetableAgentTool({ inputKinds: ["text", "pdf"] }),
    ).toThrow("Binary input kinds require a host-injected parser");
  });

  it("does not guess input kinds for an injected parser", async () => {
    let calls = 0;
    const parser: TimetableParser = {
      parse: async () => {
        calls += 1;
        return parsedResult();
      },
    };
    const tool = createTimetableAgentTool({ parser });

    expect(tool.capabilities.inputKinds).toEqual([]);
    expect(
      (
        tool.definition.inputSchema.properties as {
          input: { oneOf: unknown[] };
        }
      ).input.oneOf,
    ).toEqual([{ not: {} }]);
    await expect(
      tool.invoke({
        schemaVersion: "1",
        input: { kind: "text", text: "not advertised" },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    expect(calls).toBe(0);
  });

  it("accepts a declared binary kind and applies recovery policy", async () => {
    const parsed = parsedResult({
      source: { kind: "image", mimeType: "image/png" },
    });
    let receivedInput: unknown;
    let receivedOptions: ParseOptions | undefined;
    const parser: TimetableParser = {
      parse: async (input, options) => {
        receivedInput = input;
        receivedOptions = options;
        return parsed;
      },
    };
    const tool = createTimetableAgentTool({
      parser,
      inputKinds: ["image"],
    });

    const response = await tool.invoke({
      schemaVersion: "1",
      input: {
        kind: "image",
        mimeType: "image/png",
        base64: "AAEC",
      },
    });

    expect(response).toMatchObject({
      ok: true,
      result: parsed,
      assessment: { status: "unusable", reasons: ["NO_EVENTS"] },
    });
    expect(receivedInput).toMatchObject({
      kind: "image",
      mimeType: "image/png",
      bytes: new Uint8Array([0, 1, 2]),
    });
    expect(receivedOptions?.recovery).toBeUndefined();

    const rejectedRecovery = await tool.invoke({
      schemaVersion: "1",
      input: {
        kind: "image",
        mimeType: "image/png",
        base64: "AAEC",
      },
      options: { recovery: { enabled: true, consent: true } },
    });
    expect(rejectedRecovery).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });

    const allowedTool = createTimetableAgentTool({
      parser,
      inputKinds: ["image"],
      allowRemoteRecovery: true,
    });
    await allowedTool.invoke({
      schemaVersion: "1",
      input: {
        kind: "image",
        mimeType: "image/png",
        base64: "AAEC",
      },
      options: {
        recovery: { enabled: true, consent: true, maxFields: 4 },
      },
    });
    expect(receivedOptions?.recovery).toEqual({
      enabled: true,
      consent: true,
      maxFields: 4,
    });
  });

  it("keeps runtime and JSON Schema policy aligned", async () => {
    const defaultTool = createTimetableAgentTool();
    const inputVariants = (
      defaultTool.definition.inputSchema.properties as {
        input: {
          oneOf: readonly { properties: { kind: { const: string } } }[];
        };
      }
    ).input.oneOf;
    expect(
      inputVariants.map((variant) => variant.properties.kind.const),
    ).toEqual(["text", "csv"]);
    expect(
      await defaultTool.invoke({
        schemaVersion: "1",
        input: { kind: "image", mimeType: "image/png", base64: "AAEC" },
      }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });

    const recoverySchema = defaultTool.definition.inputSchema.properties as {
      options: { properties: Record<string, unknown> };
    };
    expect(recoverySchema.options.properties).not.toHaveProperty("recovery");

    const recoveryTool = createTimetableAgentTool({
      parser: {
        parse: async () => parsedResult(),
      },
      inputKinds: ["text"],
      allowRemoteRecovery: true,
    });
    const recoveryToolOptions = recoveryTool.definition.inputSchema
      .properties as {
      options: { properties: Record<string, unknown> };
    };
    expect(recoveryToolOptions.options.properties).toHaveProperty("recovery");
    await expect(
      recoveryTool.invoke({
        schemaVersion: "1",
        input: { kind: "text", text: "recover" },
        options: { recovery: { enabled: true, consent: true } },
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("rejects malformed, oversized, and invalid binary requests without throwing", async () => {
    const tool = createTimetableAgentTool({
      maxRequestBytes: 64,
      maxInputLines: 1,
    });
    await expect(
      tool.invoke({
        schemaVersion: "1",
        input: { kind: "text", text: "x".repeat(80) },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INPUT_TOO_LARGE", retryable: false },
    });

    const normalTool = createTimetableAgentTool();
    await expect(
      normalTool.invoke({ schemaVersion: "1", input: { kind: "text" } }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST", retryable: false },
    });
    await expect(
      normalTool.invoke({
        schemaVersion: "1",
        input: {
          kind: "image",
          mimeType: "image/png",
          base64: "not-base64",
        },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST", retryable: false },
    });
    await expect(
      createTimetableAgentTool({ maxInputLines: 1 }).invoke({
        schemaVersion: "1",
        input: { kind: "text", text: "first\nsecond" },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INPUT_TOO_LARGE", retryable: false },
    });
    await expect(
      createTimetableAgentTool({ maxInputLines: 1 }).invoke({
        schemaVersion: "1",
        input: { kind: "text", text: "first\rsecond" },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INPUT_TOO_LARGE", retryable: false },
    });
  });

  it("rejects the default high-line input before parser invocation", async () => {
    let calls = 0;
    const parser: TimetableParser = {
      parse: async () => {
        calls += 1;
        return parsedResult();
      },
    };
    const tool = createTimetableAgentTool({ parser, inputKinds: ["text"] });
    const text = Array.from(
      { length: DEFAULT_AGENT_MAX_INPUT_LINES + 1 },
      () => "x",
    ).join("\n");
    await expect(
      tool.invoke({ schemaVersion: "1", input: { kind: "text", text } }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "INPUT_TOO_LARGE",
        details: { maxInputLines: DEFAULT_AGENT_MAX_INPUT_LINES },
      },
    });
    expect(calls).toBe(0);
  });

  it("redacts parser errors and retries only transient provider failures", async () => {
    const request = {
      schemaVersion: "1",
      input: { kind: "text", text: "Agent Error Monday 09:00-10:00" },
    } as const;
    const permanentTool = createTimetableAgentTool({
      parser: {
        parse: async () => {
          throw new ProviderError(
            "fixture",
            "RESOURCE_LIMIT",
            "secret parser detail",
          );
        },
      },
      inputKinds: ["text"],
    });
    const permanent = await permanentTool.invoke(request);
    expect(permanent).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_FAILED",
        retryable: false,
        message: "A provider failed while processing the input.",
      },
    });
    expect(JSON.stringify(permanent)).not.toContain("secret parser detail");

    const transientTool = createTimetableAgentTool({
      parser: {
        parse: async () => {
          throw new ProviderError("fixture", "UNAVAILABLE", "secret");
        },
      },
      inputKinds: ["text"],
    });
    await expect(transientTool.invoke(request)).resolves.toMatchObject({
      ok: false,
      error: { code: "PROVIDER_FAILED", retryable: true },
    });
  });
});

describe("TimetableKit JSONL agent protocol", () => {
  it("exposes capabilities and adds assessment beside parse results", async () => {
    const output: string[] = [];
    const tool = createTimetableAgentTool();
    await runTimetableAgentProtocol({
      input: chunks([
        JSON.stringify({ id: "cap", op: "capabilities" }) + "\n",
        JSON.stringify({
          id: "parse",
          op: "parse",
          request: {
            schemaVersion: "1",
            input: {
              kind: "text",
              text: "Agent Protocol Tuesday 10:00-11:00",
            },
          },
        }) + "\n",
      ]),
      output: (value) => output.push(value),
      tool,
    });

    expect(output).toHaveLength(2);
    expect(JSON.parse(output[0] ?? "{}")).toMatchObject({
      protocolVersion: AGENT_PROTOCOL_VERSION,
      id: "cap",
      ok: true,
      result: {
        inputKinds: ["text", "csv"],
        tools: [{ name: "timetablekit.parse" }],
      },
    });
    const parseResponse = JSON.parse(output[1] ?? "{}");
    expect(parseResponse).toMatchObject({
      protocolVersion: AGENT_PROTOCOL_VERSION,
      id: "parse",
      ok: true,
      result: { events: [{ title: "Agent Protocol" }] },
      assessment: { status: "usable", reasons: [] },
    });
    expect(parseResponse.result).not.toHaveProperty("assessment");
    expect(
      timetableAgentResponseSchema.safeParse({
        ok: false,
        error: {
          code: "NOT_A_TIMETABLEKIT_ERROR",
          message: "bad",
          retryable: false,
        },
      }).success,
    ).toBe(false);
    expect(timetableAgentOutputJsonSchema.$defs.error.properties.code).toEqual(
      expect.objectContaining({
        enum: expect.arrayContaining(["PROVIDER_FAILED"]),
      }),
    );
  });

  it("preserves missing, null, safe numeric, and bounded string IDs", async () => {
    const output: string[] = [];
    const maxId = "x".repeat(MAX_AGENT_REQUEST_ID_BYTES);
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    await runTimetableAgentProtocol({
      input: chunks([
        JSON.stringify({ op: "capabilities" }) + "\n",
        JSON.stringify({ id: null, op: "capabilities" }) + "\n",
        JSON.stringify({ id: 42, op: "capabilities" }) + "\n",
        JSON.stringify({ id: uuid, op: "capabilities" }) + "\n",
        JSON.stringify({ id: maxId, op: "capabilities" }) + "\n",
      ]),
      output: (value) => output.push(value),
    });
    expect(output).toHaveLength(5);
    expect(JSON.parse(output[0] ?? "{}")).toMatchObject({ id: null, ok: true });
    expect(JSON.parse(output[1] ?? "{}")).toMatchObject({ id: null, ok: true });
    expect(JSON.parse(output[2] ?? "{}")).toMatchObject({ id: 42, ok: true });
    expect(JSON.parse(output[3] ?? "{}")).toMatchObject({
      id: uuid,
      ok: true,
    });
    expect(JSON.parse(output[4] ?? "{}")).toMatchObject({
      id: maxId,
      ok: true,
    });
  });

  it("reports the effective JSONL line limit", async () => {
    const output: string[] = [];
    const maxLineBytes = 100_000;
    await runTimetableAgentProtocol({
      input: chunks([
        JSON.stringify({ id: "limits", op: "capabilities" }) + "\n",
      ]),
      output: (value) => output.push(value),
      maxLineBytes,
    });

    expect(JSON.parse(output[0] ?? "{}")).toMatchObject({
      id: "limits",
      ok: true,
      result: { maxProtocolLineBytes: maxLineBytes },
    });
  });

  it("counts LF in terminated lines but permits a full-size EOF payload", async () => {
    const maxLineBytes = 1_024;
    const output: string[] = [];
    let parseCalls = 0;
    const tool = createTimetableAgentTool({
      parser: {
        parse: async () => {
          parseCalls += 1;
          return parsedResult({ events: [event] });
        },
      },
      inputKinds: ["text"],
    });
    const encoder = new TextEncoder();
    const requestForText = (text: string): string =>
      JSON.stringify({
        id: "line",
        op: "parse",
        request: {
          schemaVersion: "1",
          input: { kind: "text", text },
        },
      });
    const emptyPayload = requestForText("");
    const padding = maxLineBytes - 1 - encoder.encode(emptyPayload).byteLength;
    const exactPayload = requestForText("x".repeat(padding));
    const fullPayload = requestForText("x".repeat(padding + 1));
    expect(encoder.encode(exactPayload).byteLength + 1).toBe(maxLineBytes);
    expect(encoder.encode(fullPayload).byteLength + 1).toBe(maxLineBytes + 1);

    await runTimetableAgentProtocol({
      maxLineBytes,
      input: chunks([`${exactPayload}\n`]),
      output: (value) => output.push(value),
      tool,
    });
    expect(JSON.parse(output[0] ?? "{}")).toMatchObject({
      id: "line",
      ok: true,
    });

    await runTimetableAgentProtocol({
      maxLineBytes,
      input: chunks([`${fullPayload}\n`]),
      output: (value) => output.push(value),
      tool,
    });
    expect(JSON.parse(output[1] ?? "{}")).toMatchObject({
      id: null,
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "The protocol line exceeds the configured size limit.",
      },
    });

    await runTimetableAgentProtocol({
      maxLineBytes,
      input: chunks([fullPayload]),
      output: (value) => output.push(value),
      tool,
    });
    expect(JSON.parse(output[2] ?? "{}")).toMatchObject({
      id: "line",
      ok: true,
    });
    expect(parseCalls).toBe(2);
  });

  it("rejects every unsafe ID form with a null ID", async () => {
    const output: string[] = [];
    const oversized = "x".repeat(MAX_AGENT_REQUEST_ID_BYTES + 1);
    const oversizedUtf8 = "é".repeat(
      Math.floor(MAX_AGENT_REQUEST_ID_BYTES / 2) + 1,
    );
    const lines = [
      JSON.stringify({ id: oversized, op: "capabilities" }),
      JSON.stringify({ id: oversizedUtf8, op: "capabilities" }),
      JSON.stringify({ id: 1.5, op: "capabilities" }),
      JSON.stringify({ id: 9007199254740992, op: "capabilities" }),
      '{"id":1e999,"op":"capabilities"}',
      '{"id":-0,"op":"capabilities"}',
      JSON.stringify({ id: {}, op: "capabilities" }),
      JSON.stringify({ id: [], op: "capabilities" }),
    ];
    await runTimetableAgentProtocol({
      input: chunks(lines.map((line) => `${line}\n`)),
      output: (value) => output.push(value),
    });
    expect(output).toHaveLength(lines.length);
    for (const value of output) {
      expect(JSON.parse(value)).toMatchObject({
        id: null,
        ok: false,
        error: { code: "INVALID_REQUEST" },
      });
    }
  });

  it("uses the same-ID fallback and continues after oversized responses", async () => {
    const output: string[] = [];
    const result = parsedResult({
      events: [{ ...event, notes: "large output ".repeat(10_000) }],
    });
    const tool = createTimetableAgentTool({
      parser: { parse: async () => result },
      inputKinds: ["text"],
    });
    const id = "large";
    const capabilityResponse = {
      protocolVersion: AGENT_PROTOCOL_VERSION,
      id: "after",
      ok: true,
      result: tool.capabilities,
    } as const;
    const maxLineBytes = Math.max(
      MIN_AGENT_PROTOCOL_LINE_BYTES,
      new TextEncoder().encode(JSON.stringify(capabilityResponse) + "\n")
        .byteLength + 64,
    );
    await runTimetableAgentProtocol({
      maxLineBytes,
      input: chunks([
        JSON.stringify({
          id,
          op: "parse",
          request: {
            schemaVersion: "1",
            input: { kind: "text", text: "large" },
          },
        }) + "\n",
        JSON.stringify({ id: "after", op: "capabilities" }) + "\n",
      ]),
      output: (value) => output.push(value),
      tool,
    });
    expect(output).toHaveLength(2);
    expect(
      new TextEncoder().encode(output[0] ?? "").byteLength,
    ).toBeLessThanOrEqual(MIN_AGENT_PROTOCOL_LINE_BYTES);
    expect(JSON.parse(output[0] ?? "{}")).toMatchObject({
      id,
      ok: false,
      error: { code: "OUTPUT_TOO_LARGE" },
    });
    expect(JSON.parse(output[1] ?? "{}")).toMatchObject({
      id: "after",
      ok: true,
      result: { inputKinds: ["text"] },
    });
  });

  it("uses a null fallback when an escaped ID cannot fit and continues", async () => {
    const output: string[] = [];
    const id = "\0".repeat(MAX_AGENT_REQUEST_ID_BYTES);
    const requestLine = JSON.stringify({ id, op: "capabilities" });
    const maxLineBytes =
      new TextEncoder().encode(`${requestLine}\n`).byteLength + 16;

    await runTimetableAgentProtocol({
      maxLineBytes,
      input: chunks([`${requestLine}\n`, "not-json\n"]),
      output: (value) => output.push(value),
    });

    expect(output).toHaveLength(2);
    expect(JSON.parse(output[0] ?? "{}")).toMatchObject({
      id: null,
      ok: false,
      error: { code: "OUTPUT_TOO_LARGE" },
    });
    expect(JSON.parse(output[1] ?? "{}")).toMatchObject({
      id: null,
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
  });

  it("continues after invalid UTF-8 and fragmented oversized lines", async () => {
    const utf8Output: string[] = [];
    await runTimetableAgentProtocol({
      input: (async function* () {
        yield new Uint8Array([0xff, 0x0a]);
        yield new TextEncoder().encode(
          JSON.stringify({ id: "valid", op: "capabilities" }) + "\n",
        );
      })(),
      output: (value) => utf8Output.push(value),
    });
    expect(utf8Output).toHaveLength(2);
    expect(JSON.parse(utf8Output[0] ?? "{}")).toMatchObject({
      ok: false,
      error: { message: "Each line must be valid UTF-8." },
    });
    expect(JSON.parse(utf8Output[1] ?? "{}")).toMatchObject({
      id: "valid",
      ok: true,
    });

    const oversizedOutput: string[] = [];
    await runTimetableAgentProtocol({
      maxLineBytes: MIN_AGENT_PROTOCOL_LINE_BYTES,
      input: (async function* () {
        yield new TextEncoder().encode("x".repeat(200));
        yield new TextEncoder().encode("y".repeat(200) + "\nnot-json\n");
      })(),
      output: (value) => oversizedOutput.push(value),
    });
    expect(oversizedOutput).toHaveLength(2);
    expect(JSON.parse(oversizedOutput[0] ?? "{}")).toMatchObject({
      ok: false,
      error: {
        message: "The protocol line exceeds the configured size limit.",
      },
    });
    expect(JSON.parse(oversizedOutput[1] ?? "{}")).toMatchObject({
      ok: false,
      error: { message: "Each line must be valid JSON." },
    });
  });

  it("maps thrown tool errors and propagates output sink failures", async () => {
    const output: string[] = [];
    const throwingTool: TimetableAgentTool = {
      capabilities: getTimetableAgentCapabilities(),
      definition: timetableParseToolDefinition,
      invoke: async () => {
        throw new Error("private adapter detail");
      },
    };
    await runTimetableAgentProtocol({
      input: chunks([
        JSON.stringify({
          id: "failed",
          op: "parse",
          request: { schemaVersion: "1", input: { kind: "text", text: "x" } },
        }) + "\n",
        JSON.stringify({ id: "after", op: "capabilities" }) + "\n",
      ]),
      output: (value) => output.push(value),
      tool: throwingTool,
    });

    expect(output).toHaveLength(2);
    expect(JSON.parse(output[0] ?? "{}")).toMatchObject({
      id: "failed",
      ok: false,
      error: { code: "INTERNAL" },
    });
    expect(output[0]).not.toContain("private adapter detail");

    const sinkError = new Error("sink failed");
    await expect(
      runTimetableAgentProtocol({
        input: chunks([JSON.stringify({ op: "capabilities" }) + "\n"]),
        output: () => {
          throw sinkError;
        },
      }),
    ).rejects.toBe(sinkError);
  });
});
