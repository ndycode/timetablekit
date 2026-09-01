import { describe, expect, it } from "vitest";
import {
  AGENT_PROTOCOL_VERSION,
  MIN_AGENT_PROTOCOL_LINE_BYTES,
  MAX_AGENT_REQUEST_ID_BYTES,
  createTimetableAgentTool,
  getTimetableAgentCapabilities,
  runTimetableAgentProtocol,
  serializeTimetableAgentResponse,
  timetableAgentInputJsonSchema,
  timetableAgentOutputJsonSchema,
  timetableAgentResponseSchema,
  timetableParseToolDefinition,
} from "../src/index.js";
import { ProviderError } from "@ndycode/timetablekit";
import type {
  ParseOptions,
  TimetableParseResult,
  TimetableParser,
} from "@ndycode/timetablekit";
import type { TimetableAgentTool } from "../src/index.js";

async function* chunks(values: readonly string[]): AsyncIterable<string> {
  for (const value of values) yield value;
}

describe("TimetableKit agent tool", () => {
  it("returns a deterministic structured result for a JSON request", async () => {
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
    expect(JSON.parse(serializeTimetableAgentResponse(response))).toEqual(
      response,
    );
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
  });

  it("exposes schemas and handles capabilities and parse requests over JSONL", async () => {
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

    expect(timetableAgentInputJsonSchema.$id).toContain("agent-input");
    expect(timetableAgentOutputJsonSchema.$id).toContain("agent-output");
    expect(output).toHaveLength(2);
    expect(JSON.parse(output[0] ?? ("{}" as string))).toMatchObject({
      protocolVersion: AGENT_PROTOCOL_VERSION,
      id: "cap",
      ok: true,
      result: { tools: [{ name: "timetablekit.parse" }] },
    });
    expect(JSON.parse(output[1] ?? ("{}" as string))).toMatchObject({
      protocolVersion: AGENT_PROTOCOL_VERSION,
      id: "parse",
      ok: true,
      result: { events: [{ title: "Agent Protocol" }] },
    });
    expect(getTimetableAgentCapabilities().protocolVersion).toBe(
      AGENT_PROTOCOL_VERSION,
    );
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

  it("decodes bounded binary input only at the agent boundary", async () => {
    const parsedResult = {
      schemaVersion: "1.0",
      source: { kind: "image", mimeType: "image/png" },
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
    } satisfies TimetableParseResult;
    let receivedInput: unknown;
    let receivedOptions: ParseOptions | undefined;
    const parser: TimetableParser = {
      parse: async (input, options) => {
        receivedInput = input;
        receivedOptions = options;
        return parsedResult;
      },
    };
    const tool = createTimetableAgentTool({ parser });

    const response = await tool.invoke({
      schemaVersion: "1",
      input: {
        kind: "image",
        mimeType: "image/png",
        base64: "AAEC",
      },
    });

    expect(response).toEqual({ ok: true, result: parsedResult });
    expect(receivedInput).toMatchObject({
      kind: "image",
      mimeType: "image/png",
      bytes: new Uint8Array([0, 1, 2]),
    });
    expect(receivedOptions?.recovery).toBeUndefined();

    const allowedTool = createTimetableAgentTool({
      parser,
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
    });
    await expect(transientTool.invoke(request)).resolves.toMatchObject({
      ok: false,
      error: { code: "PROVIDER_FAILED", retryable: true },
    });
  });

  it("keeps invalid protocol IDs bounded and continues the JSONL stream", async () => {
    const output: string[] = [];
    const oversizedId = "x".repeat(MAX_AGENT_REQUEST_ID_BYTES + 1);
    const oversizedUtf8Id = "é".repeat(
      Math.floor(MAX_AGENT_REQUEST_ID_BYTES / 2) + 1,
    );
    await runTimetableAgentProtocol({
      input: chunks([
        JSON.stringify({ id: oversizedId, op: "capabilities" }) + "\n",
        JSON.stringify({ id: oversizedUtf8Id, op: "capabilities" }) + "\n",
        JSON.stringify({ id: "valid", op: "capabilities" }) + "\n",
      ]),
      output: (value) => output.push(value),
    });

    expect(output).toHaveLength(3);
    expect(JSON.parse(output[0] ?? ("{}" as string))).toMatchObject({
      id: null,
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    expect(JSON.parse(output[1] ?? ("{}" as string))).toMatchObject({
      id: null,
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    expect(JSON.parse(output[2] ?? ("{}" as string))).toMatchObject({
      id: "valid",
      ok: true,
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
    expect(JSON.parse(utf8Output[0] ?? ("{}" as string))).toMatchObject({
      ok: false,
      error: { message: "Each line must be valid UTF-8." },
    });
    expect(JSON.parse(utf8Output[1] ?? ("{}" as string))).toMatchObject({
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
    expect(JSON.parse(oversizedOutput[0] ?? ("{}" as string))).toMatchObject({
      ok: false,
      error: {
        message: "The protocol line exceeds the configured size limit.",
      },
    });
    expect(JSON.parse(oversizedOutput[1] ?? ("{}" as string))).toMatchObject({
      ok: false,
      error: { message: "Each line must be valid JSON." },
    });
  });

  it("maps thrown tool errors and continues the JSONL stream", async () => {
    const output: string[] = [];
    const throwingTool: TimetableAgentTool = {
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
    expect(JSON.parse(output[0] ?? ("{}" as string))).toMatchObject({
      id: "failed",
      ok: false,
      error: { code: "INTERNAL" },
    });
    expect(output[0]).not.toContain("private adapter detail");
    expect(JSON.parse(output[1] ?? ("{}" as string))).toMatchObject({
      id: "after",
      ok: true,
    });
  });

  it("bounds oversized JSONL responses with a structured error", async () => {
    const output: string[] = [];
    await runTimetableAgentProtocol({
      maxLineBytes: MIN_AGENT_PROTOCOL_LINE_BYTES,
      input: chunks([JSON.stringify({ id: "cap", op: "capabilities" }) + "\n"]),
      output: (value) => output.push(value),
    });

    const line = output[0] ?? "";
    expect(
      new TextEncoder().encode(line.trim()).byteLength,
    ).toBeLessThanOrEqual(MIN_AGENT_PROTOCOL_LINE_BYTES);
    expect(JSON.parse(line)).toMatchObject({
      id: "cap",
      ok: false,
      error: { code: "OUTPUT_TOO_LARGE" },
    });
  });
});
