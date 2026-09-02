import { ClipboardIcon, DownloadIcon } from "./icons";

export type ExportFormat = "json" | "csv" | "ics";

export type PlaygroundJsonProps = {
  readonly jsonText: string;
  readonly hasResult: boolean;
  readonly copyStatus: string;
  readonly onExport: (format: ExportFormat) => void;
  readonly onCopy: () => void;
};

const EXPORTS: readonly {
  readonly format: ExportFormat;
  readonly label: string;
}[] = [
  { format: "json", label: "Download JSON" },
  { format: "csv", label: "Download CSV" },
  { format: "ics", label: "Download ICS" },
];

export function PlaygroundJson({
  jsonText,
  hasResult,
  copyStatus,
  onExport,
  onCopy,
}: PlaygroundJsonProps) {
  return (
    <section
      className="playground-panel json-panel"
      aria-labelledby="json-title"
      data-testid="playground-json"
    >
      <div className="panel-heading json-heading">
        <div className="panel-title-group">
          <span className="panel-step" aria-hidden="true">
            05
          </span>
          <div>
            <h2 id="json-title">Export result</h2>
            <p>
              Download JSON, CSV, or iCalendar, or copy the TypeScript example.
            </p>
          </div>
        </div>
        <div className="export-actions">
          {EXPORTS.map(({ format, label }) => (
            <button
              key={format}
              type="button"
              onClick={() => onExport(format)}
              disabled={!hasResult}
              data-testid={`download-${format}`}
            >
              <DownloadIcon aria-hidden="true" />
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={onCopy}
            disabled={!hasResult}
            data-testid="copy-example"
          >
            <ClipboardIcon aria-hidden="true" />
            Copy TypeScript example
          </button>
        </div>
      </div>
      <div
        className="json-inspector"
        role="region"
        aria-label="JSON data"
        tabIndex={0}
        data-testid="json-result"
      >
        <pre>{jsonText}</pre>
      </div>
      {copyStatus !== "" ? (
        <p className="copy-status" role="status" aria-live="polite">
          {copyStatus}
        </p>
      ) : null}
    </section>
  );
}
