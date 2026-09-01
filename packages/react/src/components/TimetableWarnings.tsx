import type { ParseWarning, TimetableParseResult } from "@ndycode/timetablekit";
import { formatWarningCode, warningsForResult } from "../corrections.js";

export type TimetableWarningsProps = {
  readonly result: TimetableParseResult;
  readonly heading?: string;
  readonly emptyMessage?: string;
  readonly className?: string;
};

function eventTitle(
  result: TimetableParseResult,
  warning: ParseWarning,
): string | undefined {
  if (warning.eventId === undefined) {
    return undefined;
  }
  return result.events.find((event) => event.id === warning.eventId)?.title;
}

function warningSymbol(severity: ParseWarning["severity"]): string {
  switch (severity) {
    case "error":
      return "!";
    case "warning":
      return "△";
    case "info":
      return "i";
    default: {
      const exhaustive: never = severity;
      return exhaustive;
    }
  }
}

export function TimetableWarnings({
  result,
  heading = "Warnings",
  emptyMessage = "No warnings. Review is ready.",
  className,
}: TimetableWarningsProps) {
  const warnings = warningsForResult(result);
  return (
    <section className={className} aria-label={heading}>
      <h2>{heading}</h2>
      {warnings.length === 0 ? (
        <p role="status">{emptyMessage}</p>
      ) : (
        <ul className="timetable-warnings" aria-live="polite">
          {warnings.map((warning, index) => {
            const title = eventTitle(result, warning);
            const target =
              title === undefined
                ? ""
                : ` for ${title.trim().length === 0 ? "Untitled event" : title}`;
            return (
              <li
                className={`timetable-warning timetable-warning-${warning.severity}`}
                key={`${warning.code}-${warning.eventId ?? "global"}-${warning.field ?? "result"}-${index}`}
                role={warning.severity === "error" ? "alert" : undefined}
              >
                <span aria-hidden="true">
                  {warningSymbol(warning.severity)}
                </span>
                <div>
                  <strong>{`${formatWarningCode(warning)}${target}`}</strong>
                  <p>{warning.message}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
