import Link from "next/link";
import { VERIFIED_GITHUB_URL } from "../components/site-header";

const sampleEvents = [
  { time: "09:00", title: "Algorithms", detail: "CS101 · Room 204" },
  { time: "10:30", title: "Discrete Math", detail: "MATH201 · Room 204" },
  { time: "14:00", title: "Databases", detail: "CS205 · Room 305" },
];

export default function HomePage() {
  return (
    <main className="landing">
      <section className="hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <h1 id="home-title">Turn timetables into calendar events.</h1>
          <p>
            TimetableKit converts timetable text, images, and PDFs into
            validated events you can review and export, locally and privately.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/playground">
              Try a sample <span aria-hidden="true">→</span>
            </Link>
            <a
              className="button-secondary"
              href={VERIFIED_GITHUB_URL}
              target="_blank"
              rel="noreferrer"
            >
              View GitHub <span aria-hidden="true">↗</span>
            </a>
          </div>
          <p className="privacy-note">
            <strong>Local by default.</strong> No account. No API key. No
            timetable content leaves this page unless you opt in to recovery.
          </p>
        </div>

        <div
          className="transform-frame"
          aria-label="Example timetable transformation"
        >
          <div className="transform-frame-header">
            <span>Input · timetable.txt</span>
            <span aria-hidden="true">→</span>
            <span>Output · validated events</span>
          </div>
          <div className="transform-grid">
            <div className="sample-input">
              <div className="sample-label">Fictional campus week</div>
              <pre>{`Mon 09:00-11:00 CS101 Algorithms
Mon 10:30-12:00 MATH201 Discrete Math
Mon 14:00-15:30 CS205 Databases

Timezone: Asia/Manila`}</pre>
            </div>
            <div className="sample-output">
              <div className="agenda-date">Monday · 12 May 2025</div>
              <ul className="sample-event-list">
                {sampleEvents.map((event) => (
                  <li key={event.time}>
                    <time>{event.time}</time>
                    <span>
                      {event.title}
                      <small>{event.detail}</small>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="agenda-date">Tuesday · 13 May 2025</div>
              <ul className="sample-event-list">
                <li>
                  <time>09:00</time>
                  <span>
                    Algorithms<small>CS101 · Room 204</small>
                  </span>
                </li>
                <li>
                  <time>13:00</time>
                  <span>
                    Discrete Math<small>MATH201 · Room 204</small>
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="workflow-band" aria-label="TimetableKit workflow">
        <div className="workflow-step">
          <span className="workflow-number">01</span>
          <div>
            <h2>Import</h2>
            <p>Bring in timetables from text, images, or PDFs.</p>
          </div>
        </div>
        <div className="workflow-step">
          <span className="workflow-number">02</span>
          <div>
            <h2>Review</h2>
            <p>Validate and edit parsed events in a clean preview.</p>
          </div>
        </div>
        <div className="workflow-step">
          <span className="workflow-number">03</span>
          <div>
            <h2>Export</h2>
            <p>Download JSON, CSV, or iCalendar after correction.</p>
          </div>
        </div>
      </section>

      <section className="formats-band" aria-labelledby="formats-title">
        <h2 id="formats-title">Supported formats</h2>
        <ul className="format-list">
          <li>Text · .txt</li>
          <li>CSV · .csv</li>
          <li>PNG</li>
          <li>JPEG</li>
          <li>WebP</li>
          <li>PDF</li>
        </ul>
      </section>

      <section className="sdk-band" aria-labelledby="sdk-title">
        <div className="sdk-copy">
          <h2 id="sdk-title">TypeScript SDK</h2>
          <p>Small, typed, and framework-independent.</p>
          <Link href="/docs">
            Read the API docs <span aria-hidden="true">→</span>
          </Link>
        </div>
        <pre className="sdk-code">
          <code>
            <span className="code-keyword">import</span> &#123; parseTimetable,
            toICS &#125; <span className="code-keyword">from</span>{" "}
            <span className="code-string">
              &quot;@ndycode/timetablekit&quot;
            </span>
            ;<span className="code-keyword">const</span> result ={" "}
            <span className="code-keyword">await</span> parseTimetable( &#123;
            kind: <span className="code-string">&quot;text&quot;</span>, text:
            rawTimetable &#125;, &#123; locale:{" "}
            <span className="code-string">&quot;en-PH&quot;</span>, timezone:{" "}
            <span className="code-string">&quot;Asia/Manila&quot;</span> &#125;,
            );
            <span className="code-keyword">const</span> ics = toICS(result);
          </code>
        </pre>
      </section>

      <section className="privacy-band" aria-labelledby="privacy-title">
        <h2 id="privacy-title">
          Privacy by design.
          <br />
          Local by default.
        </h2>
        <div>
          <p>
            Parsing happens in the browser for the default path. Files stay in
            memory for the current task. Optional AI recovery is off until you
            turn it on and agree that remote provider terms apply.
          </p>
          <Link href="/privacy">
            Read the privacy model <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="roadmap-band" aria-labelledby="roadmap-title">
        <div>
          <h2 id="roadmap-title">Roadmap</h2>
          <p className="privacy-note">
            A small, fixture-driven toolkit that grows through verified parser
            behavior.
          </p>
          <Link href="/roadmap">
            See what is next <span aria-hidden="true">→</span>
          </Link>
        </div>
        <ul className="roadmap-list">
          <li>
            <strong>Now</strong>Text and CSV parsing
          </li>
          <li>
            <strong>Now</strong>Correction and exports
          </li>
          <li>
            <strong>Next</strong>More locales
          </li>
          <li>
            <strong>Next</strong>Provider adapters
          </li>
        </ul>
      </section>
    </main>
  );
}
