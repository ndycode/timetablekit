import {
  OptionsValidationError,
  ProviderError,
  TimetableError,
} from "./errors.js";
import { sanitizeFilename, utf8ByteLength } from "./parser/text.js";
import {
  ExtractionArtifactSchema,
  ResourceLimitsOverridesSchema,
  ResourceLimitsSchema,
  TimetableInputSchema,
} from "./schema/runtime.js";
import type {
  ExtractionArtifact,
  ExtractionProvider,
  ParseProgress,
  ParseStage,
  ProviderContext,
  ResourceLimits,
  ResourceLimitsOverrides,
  SourceKind,
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
  overrides: ResourceLimitsOverrides | undefined,
): ResourceLimits {
  const parsed = ResourceLimitsOverridesSchema.safeParse(
    overrides === undefined ? {} : overrides,
  );
  if (!parsed.success) {
    throw new OptionsValidationError("ResourceLimits");
  }
  const values = parsed.data;
  return {
    maxInputBytes:
      values.maxInputBytes ?? DEFAULT_RESOURCE_LIMITS.maxInputBytes,
    maxImagePixels:
      values.maxImagePixels ?? DEFAULT_RESOURCE_LIMITS.maxImagePixels,
    maxPdfPages: values.maxPdfPages ?? DEFAULT_RESOURCE_LIMITS.maxPdfPages,
    timeoutMs: values.timeoutMs ?? DEFAULT_RESOURCE_LIMITS.timeoutMs,
    maxOutputBytes:
      values.maxOutputBytes ?? DEFAULT_RESOURCE_LIMITS.maxOutputBytes,
  };
}

export function sourceDescriptor(input: TimetableInput): SourceDescriptor {
  const validated = TimetableInputSchema.parse(input);
  const filename = sanitizeFilename(validated.filename);
  switch (validated.kind) {
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
        ? { kind: "image", mimeType: validated.mimeType }
        : { kind: "image", filename, mimeType: validated.mimeType };
    case "pdf":
      return filename === undefined
        ? { kind: "pdf", mimeType: validated.mimeType }
        : { kind: "pdf", filename, mimeType: validated.mimeType };
    default: {
      const exhaustive: never = validated;
      return exhaustive;
    }
  }
}

export function inputByteLength(input: TimetableInput): number {
  const validated = TimetableInputSchema.parse(input);
  switch (validated.kind) {
    case "text":
    case "csv":
      return utf8ByteLength(validated.text);
    case "image":
    case "pdf":
      return validated.bytes.byteLength;
    default: {
      const exhaustive: never = validated;
      return exhaustive;
    }
  }
}

export function createProviderContext(
  signal: AbortSignal,
  limits: ResourceLimits,
  reportProgress: (progress: ParseProgress) => void,
): ProviderContext {
  const parsed = ResourceLimitsSchema.safeParse(limits);
  if (!parsed.success) {
    throw new OptionsValidationError("ResourceLimits");
  }
  return { signal, limits: parsed.data, reportProgress };
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
      const validatedInput = TimetableInputSchema.parse(input);
      checkAbort(context.signal, "deterministic");
      if (inputByteLength(validatedInput) > context.limits.maxInputBytes) {
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
      if (validatedInput.kind !== "text" && validatedInput.kind !== "csv") {
        throw new ProviderError(
          "deterministic",
          "UNSUPPORTED_INPUT",
          "Provider does not support this source.",
        );
      }
      return deterministicDocument(validatedInput);
    },
  };
}

export function isExtractionArtifact(
  value: unknown,
): value is ExtractionArtifact {
  return ExtractionArtifactSchema.safeParse(value).success;
}

export function parseExtractionArtifact(
  value: unknown,
  expectedProviderId?: string,
  expectedSourceKind?: SourceKind,
): ExtractionArtifact | undefined {
  const parsed = ExtractionArtifactSchema.safeParse(value);
  if (!parsed.success) return undefined;
  if (
    (expectedProviderId !== undefined &&
      parsed.data.providerId !== expectedProviderId) ||
    (expectedSourceKind !== undefined &&
      parsed.data.document.source.kind !== expectedSourceKind)
  ) {
    return undefined;
  }
  return parsed.data;
}

export function extractionArtifactByteLength(
  value: ExtractionArtifact,
): number | undefined {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? undefined : utf8ByteLength(serialized);
  } catch {
    return undefined;
  }
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
