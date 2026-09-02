import type { ChangeEvent } from "react";
import type { PlaygroundState, PlaygroundTab } from "../lib/playground-model";
import { SAMPLE_LABEL, SAMPLE_TEXT } from "../lib/samples";
import { RotateCcwIcon, ShieldCheckIcon, StopIcon, UploadIcon } from "./icons";

export type PlaygroundSourceProps = {
  readonly state: PlaygroundState;
  readonly onTabChange: (tab: PlaygroundTab) => void;
  readonly onPasteTextChange: (text: string) => void;
  readonly onLocaleChange: (locale: string) => void;
  readonly onTimezoneChange: (timezone: string) => void;
  readonly onTermStartChange: (value: string) => void;
  readonly onTermEndChange: (value: string) => void;
  readonly onAiRecoveryChange: (enabled: boolean) => void;
  readonly onFileSelect: (file: File | undefined) => void;
  readonly onRead: () => void;
  readonly onStop: () => void;
  readonly onReset: () => void;
};

const SOURCE_TABS: readonly PlaygroundTab[] = ["sample", "paste", "upload"];

const TAB_LABELS: Readonly<Record<PlaygroundTab, string>> = {
  sample: "Sample",
  paste: "Paste text",
  upload: "Choose file",
};

export function PlaygroundSource({
  state,
  onTabChange,
  onPasteTextChange,
  onLocaleChange,
  onTimezoneChange,
  onTermStartChange,
  onTermEndChange,
  onAiRecoveryChange,
  onFileSelect,
  onRead,
  onStop,
  onReset,
}: PlaygroundSourceProps) {
  const activeTab = state.source.kind;
  const pasteText = activeTab === "paste" ? state.source.text : "";
  const fileLabel = activeTab === "upload" ? state.source.label : "";

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    onFileSelect(event.currentTarget.files?.[0]);
  }

  return (
    <section
      className="playground-panel source-panel"
      aria-labelledby="source-title"
      data-testid="playground-source"
    >
      <div className="panel-heading source-panel-heading">
        <div className="panel-title-group">
          <span className="panel-step" aria-hidden="true">
            01
          </span>
          <div>
            <h2 id="source-title">Choose an input</h2>
            <p>Pick a source, then read it locally.</p>
          </div>
        </div>
        <span className="panel-note">{TAB_LABELS[activeTab]}</span>
      </div>

      <div className="source-tabs" role="tablist" aria-label="Schedule source">
        {SOURCE_TABS.map((tab) => (
          <button
            key={tab}
            id={`source-tab-${tab}`}
            className="tab-button"
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls="source-tabpanel"
            data-testid={`source-tab-${tab}`}
            onClick={() => onTabChange(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div
        id="source-tabpanel"
        className="source-tabpanel"
        role="tabpanel"
        aria-labelledby={`source-tab-${activeTab}`}
        data-testid={`source-panel-${activeTab}`}
      >
        <div className="source-controls">
          <div className="source-settings">
            <div className="control-group">
              <label htmlFor="locale">Language and region</label>
              <select
                id="locale"
                value={state.locale}
                onChange={(event) => onLocaleChange(event.currentTarget.value)}
              >
                <option value="en-PH">
                  English and Filipino · Philippines
                </option>
              </select>
            </div>
            <div className="control-group">
              <label htmlFor="timezone">Time zone</label>
              <select
                id="timezone"
                value={state.timezone}
                onChange={(event) =>
                  onTimezoneChange(event.currentTarget.value)
                }
              >
                <option value="Asia/Manila">Asia/Manila</option>
                <option value="UTC">UTC</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
                <option value="Europe/London">Europe/London</option>
              </select>
            </div>
            <fieldset className="term-grid control-group">
              <legend>Date range</legend>
              <div>
                <label htmlFor="term-start">Starts</label>
                <input
                  id="term-start"
                  type="date"
                  value={state.termStarts}
                  onChange={(event) =>
                    onTermStartChange(event.currentTarget.value)
                  }
                />
              </div>
              <div>
                <label htmlFor="term-end">Ends</label>
                <input
                  id="term-end"
                  type="date"
                  value={state.termEnds}
                  onChange={(event) =>
                    onTermEndChange(event.currentTarget.value)
                  }
                />
              </div>
            </fieldset>
            <div className="toggle-row">
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={state.aiRecovery}
                  onChange={(event) =>
                    onAiRecoveryChange(event.currentTarget.checked)
                  }
                />
                <span className="toggle-control" aria-hidden="true" />
                <span className="toggle-copy">
                  <strong>Enable optional remote recovery</strong>
                  <small>
                    Off by default. This public playground has no recovery
                    provider, so it makes no remote request.
                  </small>
                </span>
              </label>
            </div>
          </div>

          {activeTab === "sample" ? (
            <div
              className="source-text-preview"
              aria-label="Sample schedule"
              data-testid="sample-input"
            >
              <div className="source-preview-heading">
                <span>{SAMPLE_LABEL}</span>
                <span>fictional data</span>
              </div>
              <pre>{SAMPLE_TEXT}</pre>
            </div>
          ) : null}

          {activeTab === "paste" ? (
            <div className="control-group source-text-editor">
              <div className="field-label-row">
                <label htmlFor="timetable-text">Schedule text</label>
                <span>{pasteText.length} characters</span>
              </div>
              <textarea
                id="timetable-text"
                value={pasteText}
                onChange={(event) =>
                  onPasteTextChange(event.currentTarget.value)
                }
                spellCheck={false}
                data-testid="schedule-text"
              />
              <small className="field-help">
                Use one event per line. Names, days, times, and places can be
                separated by commas, semicolons, or pipes.
              </small>
            </div>
          ) : null}

          {activeTab === "upload" ? (
            <div className="upload-dropzone" data-testid="upload-panel">
              <div className="upload-heading">
                <UploadIcon aria-hidden="true" />
                <div>
                  <label htmlFor="timetable-file">
                    Choose a TXT, CSV, image, or PDF file
                  </label>
                  <p>Up to 2 MB. The file is checked and read locally.</p>
                </div>
              </div>
              <input
                id="timetable-file"
                type="file"
                accept=".txt,.text,.csv,.png,.jpg,.jpeg,.webp,.pdf"
                onChange={handleFileChange}
              />
              <p className="upload-status" role="status">
                {fileLabel === ""
                  ? "No file selected."
                  : `Selected ${fileLabel}.`}
              </p>
            </div>
          ) : null}

          <div className="source-actions" data-testid="source-actions">
            <button
              className="compact-button primary"
              type="button"
              onClick={onRead}
              disabled={state.busy}
              data-testid="read-schedule"
            >
              <ShieldCheckIcon aria-hidden="true" />
              {state.busy ? "Reading…" : "Read schedule"}
            </button>
            <button
              className="compact-button"
              type="button"
              onClick={onStop}
              disabled={!state.busy}
              data-testid="stop-reading"
            >
              <StopIcon aria-hidden="true" />
              Stop
            </button>
            <button
              className="compact-button"
              type="button"
              onClick={onReset}
              data-testid="start-over"
            >
              <RotateCcwIcon aria-hidden="true" />
              Start over
            </button>
          </div>

          <div
            className="status-line"
            role="status"
            aria-live="polite"
            data-testid="parse-status"
          >
            <span>{state.status}</span>
            {state.busy ? (
              <div
                className="progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={state.progress}
                aria-label={`Reading ${state.progress}%`}
              >
                <span style={{ width: `${state.progress}%` }} />
              </div>
            ) : null}
          </div>
          {state.error !== "" ? (
            <div
              className="notice error"
              role="alert"
              data-testid="parse-error"
            >
              {state.error}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
