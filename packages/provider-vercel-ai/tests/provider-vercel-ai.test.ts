import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateObject } from "ai";
import { SchemaValidationError } from "@ndycode/timetablekit";
import type {
  ParseProgress,
  ProviderContext,
  RecoveryRequest,
  ResourceLimits,
} from "@ndycode/timetablekit";
import { createVercelAIProvider, type RecoveryOutput } from "../src/index.js";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

const generateObjectMock = vi.mocked(generateObject);

const defaultLimits: ResourceLimits = {
  maxInputBytes: 10_000,
  maxImagePixels: 10_000,
  maxPdfPages: 10,
  timeoutMs: 1_000,
  maxOutputBytes: 10_000,
};

function contextFor(
  options: {
    readonly signal?: AbortSignal;
    readonly limits?: Partial<ResourceLimits>;
  } = {},
): { readonly context: ProviderContext; readonly progress: ParseProgress[] } {
  const progress: ParseProgress[] = [];
  return {
    context: {
      signal: options.signal ?? new AbortController().signal,
      limits: { ...defaultLimits, ...options.limits },
      reportProgress: (value) => progress.push(value),
    },
    progress,
  };
}

const request: RecoveryRequest = {
  schemaVersion: "1.0",
  locale: "en-PH",
  timezone: "Asia/Manila",
  unresolved: [
    {
      eventId: "event-1",
      field: "title",
      candidateText: "First candidate",
      evidence: [
        {
          source: { kind: "text" },
          location: { line: 1 },
          excerpt: "First candidate",
        },
      ],
    },
    {
      eventId: "event-2",
      field: "location",
      candidateText: "Second candidate",
      evidence: [
        {
          source: { kind: "text" },
          location: { line: 2 },
          excerpt: "Second candidate",
        },
      ],
    },
  ],
};

function validOutput(): RecoveryOutput {
  return {
    patches: [
      {
        eventId: "event-1",
        field: "title",
        value: "Recovered title",
        confidence: 0.9,
      },
    ],
  };
}

function generatedResult(
  object: unknown,
): Awaited<ReturnType<typeof generateObject>> {
  return {
    object,
    reasoning: undefined,
    finishReason: "stop",
    usage: {
      inputTokens: 0,
      inputTokenDetails: {
        noCacheTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      outputTokens: 0,
      outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
      totalTokens: 0,
    },
    warnings: undefined,
    request: {},
    response: {
      id: "mock-response",
      timestamp: new Date(0),
      modelId: "mock/model",
    },
    providerMetadata: undefined,
    toJsonResponse: () => new Response(),
  };
}

function mockGenerated(object: unknown): void {
  generateObjectMock.mockReturnValue(Promise.resolve(generatedResult(object)));
}

beforeEach(() => {
  generateObjectMock.mockReset();
});

describe("Vercel AI recovery provider contract", () => {
  it("returns schema-validated patches through a mocked AI SDK call", async () => {
    const output = validOutput();
    mockGenerated(output);
    const { context } = contextFor();
    const provider = createVercelAIProvider({
      model: "mock/model",
      consent: true,
    });

    const response = await provider.recover(request, context);

    expect(response).toEqual(output);
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "mock/model",
        temperature: 0,
        maxOutputTokens: 2_000,
        prompt: expect.stringContaining("First candidate"),
      }),
    );
    const firstCall = generateObjectMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (firstCall === undefined) return;
    expect(firstCall[0].abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("requires consent and respects an already-aborted request", async () => {
    const consentedProvider = createVercelAIProvider({
      model: "mock/model",
      consent: true,
    });
    const controller = new AbortController();
    controller.abort();

    const disabledProvider = createVercelAIProvider({
      model: "mock/model",
      consent: false,
    });
    await expect(
      disabledProvider.recover(request, contextFor().context),
    ).rejects.toMatchObject({
      providerCode: "UNAVAILABLE",
    });
    await expect(
      consentedProvider.recover(
        request,
        contextFor({ signal: controller.signal }).context,
      ),
    ).rejects.toMatchObject({
      providerCode: "ABORTED",
    });
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("returns a structured validation error for malformed direct input", async () => {
    const provider = createVercelAIProvider({
      model: "mock/model",
      consent: true,
    });
    const malformedRequest: unknown = {
      ...request,
      unresolved: null,
    };

    const error = await provider
      .recover(malformedRequest as RecoveryRequest, contextFor().context)
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );

    expect(error).toBeInstanceOf(SchemaValidationError);
    expect(error).toMatchObject({
      name: "SchemaValidationError",
      code: "INVALID_INPUT",
      schemaName: "RecoveryRequest",
    });
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("rejects malformed model output", async () => {
    mockGenerated({
      patches: [
        {
          eventId: "event-1",
          field: "title",
          value: "Bad confidence",
          confidence: 1.1,
        },
      ],
    });
    const provider = createVercelAIProvider({
      model: "mock/model",
      consent: true,
    });

    await expect(
      provider.recover(request, contextFor().context),
    ).rejects.toMatchObject({
      providerCode: "INVALID_OUTPUT",
    });
  });

  it("bounds fields and request and response bytes", async () => {
    mockGenerated({ patches: [] });
    const fieldLimitedProvider = createVercelAIProvider({
      model: "mock/model",
      consent: true,
      maxFields: 1,
    });
    await fieldLimitedProvider.recover(request, contextFor().context);
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.not.stringContaining("Second candidate"),
      }),
    );

    generateObjectMock.mockReset();
    const requestLimitedProvider = createVercelAIProvider({
      model: "mock/model",
      consent: true,
      maxRequestBytes: 1,
    });
    await expect(
      requestLimitedProvider.recover(request, contextFor().context),
    ).rejects.toMatchObject({
      providerCode: "RESOURCE_LIMIT",
    });
    expect(generateObjectMock).not.toHaveBeenCalled();

    generateObjectMock.mockReset();
    const largeOutput: RecoveryOutput = {
      patches: [
        {
          eventId: "event-1",
          field: "title",
          value: "x".repeat(100),
          confidence: 0.9,
        },
      ],
    };
    mockGenerated(largeOutput);
    const responseLimitedProvider = createVercelAIProvider({
      model: "mock/model",
      consent: true,
      maxResponseBytes: 20,
    });
    await expect(
      responseLimitedProvider.recover(request, contextFor().context),
    ).rejects.toMatchObject({
      providerCode: "RESOURCE_LIMIT",
    });
  });

  it("validates provider limits before making a request", () => {
    expect(() =>
      createVercelAIProvider({
        model: "mock/model",
        consent: true,
        maxFields: 0,
      }),
    ).toThrow(RangeError);
    expect(() =>
      createVercelAIProvider({
        model: "mock/model",
        consent: true,
        maxRequestBytes: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(RangeError);
    expect(() =>
      createVercelAIProvider({
        model: "mock/model",
        consent: true,
        timeoutMs: -1,
      }),
    ).toThrow(RangeError);
  });

  it("rejects timeout values above the Node timer maximum", () => {
    expect(() =>
      createVercelAIProvider({
        model: "mock/model",
        consent: true,
        timeoutMs: 2_147_483_648,
      }),
    ).toThrow(/timeoutMs must not exceed 2147483647/);
  });

  it("classifies its bounded timeout separately from caller abort", async () => {
    generateObjectMock.mockReturnValue(
      new Promise<Awaited<ReturnType<typeof generateObject>>>(() => undefined),
    );
    const provider = createVercelAIProvider({
      model: "mock/model",
      consent: true,
      timeoutMs: 1_000,
    });

    await expect(
      provider.recover(
        request,
        contextFor({ limits: { timeoutMs: 10 } }).context,
      ),
    ).rejects.toMatchObject({ providerCode: "TIMEOUT" });
  });
});
