export type TimetableErrorCode =
  | "ABORTED"
  | "INVALID_INPUT"
  | "INVALID_OPTIONS"
  | "UNSUPPORTED_PROVIDER"
  | "PROVIDER_FAILED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_OUTPUT_INVALID"
  | "EXPORT_REQUIRES_TERM"
  | "EXPORT_INVALID_RESULT";

export type ProviderFailureCode =
  | "UNSUPPORTED_INPUT"
  | "ABORTED"
  | "TIMEOUT"
  | "RESOURCE_LIMIT"
  | "UNAVAILABLE"
  | "INVALID_OUTPUT"
  | "FAILED";

export type ErrorDetails = Readonly<Record<string, string | number | boolean>>;

export class TimetableError extends Error {
  override readonly name: string = "TimetableError";

  constructor(
    readonly code: TimetableErrorCode,
    message: string,
    readonly details: ErrorDetails = {},
  ) {
    super(message);
  }
}

export class SchemaValidationError extends TimetableError {
  override readonly name: string = "SchemaValidationError";

  constructor(readonly schemaName: string) {
    super("INVALID_INPUT", `Value does not match ${schemaName}.`, {
      schema: schemaName,
    });
  }
}

export class ProviderError extends TimetableError {
  override readonly name: string = "ProviderError";

  constructor(
    readonly providerId: string,
    readonly providerCode: ProviderFailureCode,
    message = "Provider failed while processing the input.",
  ) {
    super(providerCode === "ABORTED" ? "ABORTED" : "PROVIDER_FAILED", message, {
      provider: providerId,
      reason: providerCode,
    });
  }
}

export function isAbortError(error: unknown): error is TimetableError {
  return error instanceof TimetableError && error.code === "ABORTED";
}
