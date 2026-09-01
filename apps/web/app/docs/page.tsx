import Link from "next/link";

export const metadata = { title: "Guide" };

export default function DocsPage() {
  return (
    <main id="main-content" className="page-shell">
      <div className="page-intro">
        <h1>Guide</h1>
        <p>Turn a schedule into events you can check and export.</p>
      </div>
      <div className="doc-layout">
        <nav className="doc-index" aria-label="On this page">
          <a href="#quickstart">Start here</a>
          <a href="#pipeline">How parsing works</a>
          <a href="#schema">Result format</a>
          <a href="#providers">File readers</a>
          <a href="#exports">Downloads</a>
          <Link href="/privacy">Privacy</Link>
        </nav>
        <article className="doc-content">
          <section id="quickstart">
            <h2>Start here</h2>
            <p>
              Install <code>@ndycode/timetablekit</code>. Give it text or CSV
              data. Check the warnings before you export. You do not need an
              account, database, or AI key.
            </p>
            <pre>{`import { parseTimetable, toICS } from "@ndycode/timetablekit"

const result = await parseTimetable(
  { kind: "text", text: rawTimetable },
  { locale: "en-PH", timezone: "Asia/Manila" },
)

const calendar = toICS(result)`}</pre>
          </section>
          <section id="pipeline">
            <h2>How parsing works</h2>
            <p>
              TimetableKit checks the input and its size. It reads each row,
              finds days and times, and builds events. It then checks each
              event, finds time conflicts, and gives each event a match score.
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
              Each event has a match score. You can also ask for a score for
              each field and the source of each value.
            </p>
            <p>
              The public{" "}
              <a href="/schema/timetable-result.schema.json">JSON Schema</a>{" "}
              describes the result fields. You can use it in the package or at
              this public URL.
            </p>
          </section>
          <section id="providers">
            <h2>File readers</h2>
            <p>
              The core package does not depend on React, Next.js, OCR libraries,
              PDF.js, or network clients. Separate readers handle images, PDFs,
              and optional AI help. Each reader reports progress, can stop,
              checks size limits, and returns clear errors.
            </p>
            <p>
              The demo uses a fixed sample and pasted text locally. It never
              turns on AI help without telling you.
            </p>
          </section>
          <section id="exports">
            <h2>Download your schedule</h2>
            <p>
              After you fix the result, use <code>toJSON</code>,{" "}
              <code>toCSV</code>, or <code>toICS</code>. Weekly events need a
              start and end date before <code>toICS</code> can make a repeating
              event.
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
