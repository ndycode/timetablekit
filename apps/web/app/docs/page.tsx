import Link from "next/link";

export const metadata = { title: "Docs" };

export default function DocsPage() {
  return (
    <main className="page-shell">
      <div className="page-intro">
        <h1>Documentation</h1>
        <p>
          A short path from a timetable source to a validated, exportable
          schedule.
        </p>
      </div>
      <div className="doc-layout">
        <nav className="doc-index" aria-label="Documentation sections">
          <a href="#quickstart">Quick start</a>
          <a href="#pipeline">Pipeline</a>
          <a href="#schema">Schema</a>
          <a href="#providers">Providers</a>
          <a href="#exports">Exports</a>
          <Link href="/privacy">Privacy</Link>
        </nav>
        <article className="doc-content">
          <section id="quickstart">
            <h2>Quick start</h2>
            <p>
              Install <code>@ndycode/timetablekit</code>, pass a text or CSV
              input, then inspect warnings before exporting. The parser does not
              need an account, database, or AI key.
            </p>
            <pre>{`import { parseTimetable, toICS } from "@ndycode/timetablekit"

const result = await parseTimetable(
  { kind: "text", text: rawTimetable },
  { locale: "en-PH", timezone: "Asia/Manila" },
)

const calendar = toICS(result)`}</pre>
          </section>
          <section id="pipeline">
            <h2>Parser pipeline</h2>
            <p>
              The input boundary checks the source kind and resource limits.
              Deterministic extraction then segments rows, recognizes days and
              times, assembles events, validates fields, detects conflicts, and
              reports confidence.
            </p>
            <ol>
              <li>Preflight input and options.</li>
              <li>Extract text through the configured provider.</li>
              <li>Normalize events and attach source locations.</li>
              <li>
                Validate dates, times, timezones, duplicates, and conflicts.
              </li>
              <li>Let a person correct the result before export.</li>
            </ol>
          </section>
          <section id="schema">
            <h2>Normalized schema</h2>
            <p>
              Results use schema version <code>1.0</code>. Dates use{" "}
              <code>YYYY-MM-DD</code>, local times use <code>HH:mm</code>,
              weekdays use RFC 5545 two-letter values, and timezone values use
              IANA names.
            </p>
            <p>
              Every event carries an overall confidence score, field-level
              confidence, and source evidence when the caller requests it.
            </p>
          </section>
          <section id="providers">
            <h2>Provider boundary</h2>
            <p>
              The core package stays independent of React, Next.js, OCR
              libraries, PDF.js, and network clients. Image OCR, PDF extraction,
              and remote recovery are separate adapters with explicit progress,
              cancellation, limits, and structured errors.
            </p>
            <p>
              The playground keeps its deterministic sample and pasted text path
              light. Remote recovery is never selected silently.
            </p>
          </section>
          <section id="exports">
            <h2>Exports</h2>
            <p>
              Use <code>toJSON</code>, <code>toCSV</code>, and{" "}
              <code>toICS</code> after correction. Weekly events need a concrete
              term range before iCalendar output can create a recurrence rule.
            </p>
            <p>
              See the <Link href="/playground">playground</Link> to inspect the
              exact normalized JSON and try each download action.
            </p>
          </section>
        </article>
      </div>
    </main>
  );
}
