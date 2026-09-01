import { ProviderError, TimetableError } from "./errors.js";
import { sanitizeFilename, utf8ByteLength } from "./parser/text.js";
import { TimetableInputSchema } from "./schema/runtime.js";
import type {
  ExtractionArtifact,
  ExtractionProvider,
  ParseProgress,
  ParseStage,
  ProviderContext,
  ResourceLimits,
  SourceDescriptor,
  TextLine,
  TextPage,
  TimetableInput,
} from "./schema/types.js";

export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxInputBytes: 2_000_000,
  maxImagePixels: 25_000_000,
  maxPdfPages: 100,
  timeoutMs: 30_000,
  maxOutputBytes: 5_000_000,
};

export function resolveLimits(
  overrides: Partial<ResourceLimits> | undefined,
): ResourceLimits {
  return {
    maxInputBytes:
      overrides?.maxInputBytes ?? DEFAULT_RESOURCE_LIMITS.maxInputBytes,
    maxImagePixels:
      overrides?.maxImagePixels ?? DEFAULT_RESOURCE_LIMITS.maxImagePixels,
    maxPdfPages: overrides?.maxPdfPages ?? DEFAULT_RESOURCE_LIMITS.maxPdfPages,
    timeoutMs: overrides?.timeoutMs ?? DEFAULT_RESOURCE_LIMITS.timeoutMs,
    maxOutputBytes:
      overrides?.maxOutputBytes ?? DEFAULT_RESOURCE_LIMITS.maxOutputBytes,
  };
}

export function sourceDescriptor(input: TimetableInput): SourceDescriptor {
  const filename = sanitizeFilename(input.filename);
  switch (input.kind) {
    case "text":
      return filename === undefined
        ? { kind: "text" }
        : { kind: "text", filename };
    case "csv":
      return filename === undefined
        ? { kind: "csv" }
        : { kind: "csv", filename };
    case "image":
      return filename === undefined
        ? { kind: "image", mimeType: input.mimeType }
        : { kind: "image", filename, mimeType: input.mimeType };
    case "pdf":
      return filename === undefined
        ? { kind: "pdf", mimeType: input.mimeType }
        : { kind: "pdf", filename, mimeType: input.mimeType };
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}

export function inputByteLength(input: TimetableInput): number {
  switch (input.kind) {
    case "text":
    case "csv":
      return utf8ByteLength(input.text);
    case "image":
    case "pdf":
      return input.bytes.byteLength;
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}

export function createProviderContext(
  signal: AbortSignal,
  limits: ResourceLimits,
  reportProgress: (progress: ParseProgress) => void,
): ProviderContext {
  return { signal, limits, reportProgress };
}

function checkAbort(signal: AbortSignal, providerId: string): void {
  if (signal.aborted) {
    throw new ProviderError(
      providerId,
      "ABORTED",
      "Provider processing was aborted.",
    );
  }
}

function textLines(text: string): readonly TextLine[] {
  const lines: TextLine[] = [];
  const chunks = text.split("\n");
  let offset = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index] ?? "";
    lines.push({
      text: chunk,
      location: {
        line: index + 1,
        charStart: offset,
        charEnd: offset + chunk.length,
      },
    });
    offset += chunk.length + 1;
  }
  return lines;
}

function deterministicDocument(
  input: Extract<TimetableInput, { readonly kind: "text" | "csv" }>,
): ExtractionArtifact {
  const source = sourceDescriptor(input);
  const page: TextPage = { pageNumber: 1, lines: textLines(input.text) };
  return {
    providerId: "deterministic",
    document: { source, pages: [page] },
    warnings: [],
  };
}

export function deterministicProvider(): ExtractionProvider {
  return {
    id: "deterministic",
    supports(input: TimetableInput): boolean {
      return input.kind === "text" || input.kind === "csv";
    },
    async extract(
      input: TimetableInput,
      context: ProviderContext,
    ): Promise<ExtractionArtifact> {
      TimetableInputSchema.parse(input);
      checkAbort(context.signal, "deterministic");
      if (inputByteLength(input) > context.limits.maxInputBytes) {
        throw new ProviderError(
          "deterministic",
          "RESOURCE_LIMIT",
          "Input exceeds the configured size limit.",
        );
      }
      context.reportProgress({
        stage: "extract",
        completed: 1,
        total: 1,
        message: "Text extracted locally.",
      });
      if (input.kind !== "text" && input.kind !== "csv") {
        throw new ProviderError(
          "deterministic",
          "UNSUPPORTED_INPUT",
          "Provider does not support this source.",
        );
      }
      return deterministicDocument(input);
    },
  };
}

export function isExtractionArtifact(
  value: unknown,
): value is ExtractionArtifact {
  if (!isRecord(value)) {
    return false;
  }
  const record = value;
  const document = record["document"];
  if (typeof record["providerId"] !== "string" || !isRecord(document)) {
    return false;
  }
  const pages = document["pages"];
  return (
    isRecord(document["source"]) &&
    Array.isArray(pages) &&
    pages.every((page) => isTextPage(page)) &&
    Array.isArray(record["warnings"])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTextPage(value: unknown): value is TextPage {
  if (!isRecord(value)) {
    return false;
  }
  const page = value;
  const lines = page["lines"];
  return (
    Array.isArray(lines) &&
    lines.every((line) => {
      if (!isRecord(line)) {
        return false;
      }
      return typeof line["text"] === "string" && isRecord(line["location"]);
    })
  );
}

export function providerWarning(
  error: unknown,
  providerId: string,
): {
  readonly code:
    | "PROVIDER_FAILED"
    | "PROVIDER_ABORTED"
    | "PROVIDER_TIMEOUT"
    | "PROVIDER_OUTPUT_INVALID";
  readonly message: string;
} {
  if (error instanceof ProviderError) {
    switch (error.providerCode) {
      case "ABORTED":
        return {
          code: "PROVIDER_ABORTED",
          message: "The extraction provider was aborted.",
        };
      case "TIMEOUT":
        return {
          code: "PROVIDER_TIMEOUT",
          message: "The extraction provider timed out.",
        };
      case "INVALID_OUTPUT":
        return {
          code: "PROVIDER_OUTPUT_INVALID",
          message: "The extraction provider returned invalid output.",
        };
      case "UNSUPPORTED_INPUT":
      case "RESOURCE_LIMIT":
      case "UNAVAILABLE":
      case "FAILED":
        return {
          code: "PROVIDER_FAILED",
          message: "The extraction provider could not process this source.",
        };
      default: {
        const exhaustive: never = error.providerCode;
        return exhaustive;
      }
    }
  }
  if (error instanceof TimetableError && error.code === "ABORTED") {
    return {
      code: "PROVIDER_ABORTED",
      message: "The extraction provider was aborted.",
    };
  }
  return {
    code: "PROVIDER_FAILED",
    message: `The ${providerId} provider could not process this source.`,
  };
}

export function stageProgress(
  stage: ParseStage,
  message: string,
  completed: number,
  total?: number,
): ParseProgress {
  return total === undefined
    ? { stage, completed, message }
    : { stage, completed, total, message };
}
