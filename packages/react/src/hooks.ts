import { useCallback, useMemo } from "react";
import type {
  EventId,
  ParseWarning,
  TimetableParseResult,
} from "@ndycode/timetablekit";
import {
  applyEventCorrection,
  warningForEventField,
  warningsForResult,
} from "./corrections.js";
import type {
  EditableEventField,
  EventCorrection,
  EventWarningLookup,
  TimetableResultChangeHandler,
} from "./types.js";

export type TimetableCorrectionActions = {
  readonly result: TimetableParseResult;
  readonly warnings: readonly ParseWarning[];
  readonly update: (correction: EventCorrection) => TimetableParseResult;
  readonly warningFor: EventWarningLookup;
};

export function useTimetableCorrection(
  result: TimetableParseResult,
  onChange: TimetableResultChangeHandler,
): TimetableCorrectionActions {
  const update = useCallback(
    (correction: EventCorrection): TimetableParseResult => {
      const nextResult = applyEventCorrection(result, correction);
      if (nextResult !== result) {
        onChange(nextResult);
      }
      return nextResult;
    },
    [onChange, result],
  );
  const warningFor = useCallback(
    (eventId: EventId, field: EditableEventField): ParseWarning | undefined =>
      warningForEventField(result, eventId, field),
    [result],
  );
  const warnings = useMemo(() => warningsForResult(result), [result]);
  return useMemo(
    () => ({ result, warnings, update, warningFor }),
    [result, update, warningFor, warnings],
  );
}
