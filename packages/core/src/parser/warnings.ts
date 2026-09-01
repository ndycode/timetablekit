import type {
  EventField,
  ParseWarning,
  SourceLocation,
  WarningCode,
  WarningSeverity,
} from "../schema/types.js";

export function makeWarning(input: {
  readonly code: WarningCode;
  readonly severity: WarningSeverity;
  readonly message: string;
  readonly source?: SourceLocation;
  readonly eventId?: string;
  readonly field?: EventField;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}): ParseWarning {
  const warning: ParseWarning = {
    code: input.code,
    severity: input.severity,
    message: input.message,
  };
  return {
    ...warning,
    ...(input.source === undefined ? {} : { source: input.source }),
    ...(input.eventId === undefined ? {} : { eventId: input.eventId }),
    ...(input.field === undefined ? {} : { field: input.field }),
    ...(input.details === undefined ? {} : { details: input.details }),
  };
}
