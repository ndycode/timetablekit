import Link from "next/link";

export const metadata = { title: "Guide" };

export default function DocsPage() {
  return (
    <main id="main-content" className="page-shell">
      <div className="page-intro">
        <h1>Guide</h1>
        <p>One normalized result for browsers, apps, CLIs, and agent hosts.</p>
      </div>
      <div className="doc-layout">
        <nav className="doc-index" aria-label="On this page">
          <a href="#quickstart">Start here</a>
          <a href="#pipeline">How parsing works</a>
          <a href="#schema">Result format</a>
          <a href="#agents">Agent integrations</a>
          <a href="#providers">File readers</a>
          <a href="#exports">Downloads</a>
          <Link href="/privacy">Privacy</Link>
        </nav>
        <article className="doc-content">
          <section id="quickstart">
            <h2>Start here</h2>
            <p>
              Install <code>@ndycode/timetablekit</code>. Give it text or CSV
              data. Check the warnings before you export. The browser playground
              and the CLI use the same core parser. You do not need an account,
              database, or AI key.
            </p>
            <pre
              tabIndex={0}
              aria-label="TypeScript parser example"
            >{`import { parseTimetable, toJSON } from "@ndycode/timetablekit"

const result = await parseTimetable(
  { kind: "text", text: rawTimetable },
  { locale: "en-PH", timezone: "Asia/Manila" },
)

const normalized = toJSON(result)`}</pre>
          </section>
          <section id="pipeline">
            <h2>How parsing works</h2>
            <p>
              TimetableKit checks the input and its size. It reads each row,
              finds days and times, and builds events. It then checks each
              event, finds time conflicts, and gives each event a confidence
              score.
            </p>
            <ol>
              <li>Check the input and options.</li>
              <li>Use the selected file reader to get text.</li>
              <li>
                Put the events in one format and keep where each value came
                from.
              </li>
              <li>
                Check dates, times, time zones, duplicates, and conflicts.
              </li>
              <li>Review and fix the result before you export it.</li>
            </ol>
          </section>
          <section id="schema">
            <h2>Result format</h2>
            <p>
              The result uses format version <code>1.0</code>. Dates use{" "}
              <code>YYYY-MM-DD</code>. Times use <code>HH:mm</code>. Weekdays
              use two-letter RFC 5545 codes. Time zones use IANA names.
            </p>
            <p>
              Each event has a confidence score. You can also ask for a score
              for each field and the source of each value.
            </p>
            <p>
              The public{" "}
              <a href="/schema/timetable-result.schema.json">JSON Schema</a>{" "}
              describes the result fields. You can use it in the package or at
              this public URL.
            </p>
          </section>
          <section id="agents">
            <h2>Agent integrations</h2>
            <p>
              The current main branch includes{" "}
              <code>@ndycode/timetablekit-agent</code> for agent hosts that need
              a JSON-only tool. Its npm publication is a separate release step.
              The tool is named <code>timetablekit.parse</code> and returns the
              same versioned result, warnings, conflicts, confidence, and source
              evidence.
            </p>
            <pre
              tabIndex={0}
              aria-label="TypeScript agent tool example"
            >{`import { createTimetableAgentTool } from "@ndycode/timetablekit-agent"

const tool = createTimetableAgentTool()
const response = await tool.invoke({
  schemaVersion: "1",
  input: { kind: "text", text: rawTimetable },
})`}</pre>
            <p>
              Text and CSV are sent as text. Images and PDFs use bounded base64.
              The default tool handles text and CSV; a host must inject PDF or
              OCR providers for binary input. Remote recovery is off unless the
              host sets <code>allowRemoteRecovery: true</code> when constructing
              the tool, injects a parser with a recovery provider, and the
              request sets <code>recovery.enabled</code> and{" "}
              <code>recovery.consent</code> to true. Use the public{" "}
              <a href="/schema/timetable-result.schema.json">JSON Schema</a> to
              validate <code>response.result</code>. The agent package exports{" "}
              <code>timetableAgentOutputJsonSchema</code> for the full{" "}
              <code>{"{ ok, result }"}</code> wrapper.
            </p>
            <p>
              The <code>timetablekit agent</code> command uses JSONL. It reads
              one request per line and writes one response per line. Agent mode
              does not read paths or fetch URLs.
            </p>
          </section>
          <section id="providers">
            <h2>File readers</h2>
            <p>
              The core package does not depend on React, Next.js, OCR libraries,
              PDF.js, or network clients. The browser uses separate local image
              and PDF readers. Host applications can inject other providers.
              Each reader reports progress, can stop, checks size limits, and
              returns clear errors.
            </p>
            <p>
              The public playground reads its sample, pasted text, and selected
              files locally. Its recovery control is off by default, and no
              recovery provider is configured there.
            </p>
          </section>
          <section id="exports">
            <h2>Download your schedule</h2>
            <p>
              After you fix the result, use <code>toJSON</code>,{" "}
              <code>toCSV</code>, or <code>toICS</code>. Weekly events need a
              concrete start and end date before <code>toICS</code> can make a
              repeating event. It reports an error instead of guessing a
              recurrence range.
            </p>
            <p>
              Open the <Link href="/playground">demo</Link> to see the JSON
              result and try each download.
            </p>
          </section>
        </article>
      </div>
    </main>
  );
}
