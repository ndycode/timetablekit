import type {
  ParseWarning,
  ScheduleConflict,
  TimetableEvent,
  TimetableParseResult,
} from "@ndycode/timetablekit";
import {
  issueMessage,
  issueTitle,
  warningsForResult,
} from "../lib/playground-model";
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon } from "./icons";

export type PlaygroundIssuesProps = {
  readonly result: TimetableParseResult | null;
};

function conflictForWarning(
  result: TimetableParseResult,
  warning: ParseWarning,
): ScheduleConflict | undefined {
  const conflictId = warning.details?.["conflictId"];
  return typeof conflictId === "string"
    ? result.conflicts.find((conflict) => conflict.id === conflictId)
    : undefined;
}

function eventForId(
  result: TimetableParseResult,
  eventId: string,
): TimetableEvent | undefined {
  return result.events.find((event) => event.id === eventId);
}

function eventLabel(event: TimetableEvent | undefined): string {
  return event === undefined || event.title.trim() === ""
    ? "Untitled event"
    : event.title;
}

function conflictDetails(
  result: TimetableParseResult,
  conflict: ScheduleConflict,
): string {
  const [leftId, rightId] = conflict.eventIds;
  const occurrence =
    conflict.occurrence.kind === "weekday"
      ? conflict.occurrence.weekday
      : conflict.occurrence.date;
  return `${eventLabel(eventForId(result, leftId))} and ${eventLabel(eventForId(result, rightId))} overlap ${occurrence} at ${conflict.overlap.startsAt}–${conflict.overlap.endsAt}.`;
}

function IssueIcon({
  severity,
}: {
  readonly severity: ParseWarning["severity"];
}) {
  if (severity === "info") return <InfoIcon aria-hidden="true" />;
  return <AlertTriangleIcon aria-hidden="true" />;
}

export function PlaygroundIssues({ result }: PlaygroundIssuesProps) {
  const issues = result === null ? [] : warningsForResult(result);
  return (
    <section
      className="playground-panel rail-panel issues-panel"
      aria-labelledby="issues-title"
      data-testid="playground-issues"
    >
      <div className="panel-heading rail-heading">
        <div className="panel-title-group">
          <span className="panel-step" aria-hidden="true">
            03
          </span>
          <div>
            <h2 id="issues-title">Issues</h2>
            <p>Review these before you export.</p>
          </div>
        </div>
        <span className="issue-count" data-testid="issue-count">
          {issues.length}
        </span>
      </div>
      <div className="rail-body">
        {issues.length === 0 ? (
          <div className="empty-issues" data-testid="issues-empty">
            <CheckCircleIcon aria-hidden="true" />
            <p>No issues found. The result is ready to export.</p>
          </div>
        ) : (
          <ul className="issue-list">
            {issues.map((issue, index) => {
              const conflict =
                result === null || issue.code !== "SCHEDULE_CONFLICT"
                  ? undefined
                  : conflictForWarning(result, issue);
              return (
                <li
                  className={`issue-item issue-${issue.severity}`}
                  key={`${issue.code}-${issue.eventId ?? "global"}-${index}`}
                  data-testid={`issue-${issue.code.toLowerCase()}`}
                >
                  <span className="issue-symbol">
                    <IssueIcon severity={issue.severity} />
                  </span>
                  <div>
                    <strong>{issueTitle(issue)}</strong>
                    <p>
                      {conflict === undefined || result === null
                        ? issueMessage(issue)
                        : conflictDetails(result, conflict)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
