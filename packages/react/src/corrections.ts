import type { ParseWarning } from "@ndycode/timetablekit";

export {
  applyEventCorrection,
  warningForEventField,
  warningsForEvent,
  warningsForResult,
} from "@ndycode/timetablekit";

export function formatWarningCode(warning: ParseWarning): string {
  return warning.code.replaceAll("_", " ");
}
