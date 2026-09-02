import Link from "next/link";
import { VERIFIED_GITHUB_URL } from "../components/site-header";
import { ArrowRightIcon, ArrowUpRightIcon } from "../components/icons";
import { TimetableDemo } from "../components/timetable-demo";

const sampleEvents = [
  { time: "09:00", title: "Algorithms", detail: "CS101 · Room 204" },
  { time: "10:30", title: "Discrete Math", detail: "MATH201 · Room 204" },
  { time: "14:00", title: "Databases", detail: "CS205 · Room 305" },
];

export default function HomePage() {
  return (
    <main id="main-content" className="landing">
      <section className="hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <h1 id="home-title">Turn schedules into calendar events.</h1>
          <p>
            Paste text or CSV, or choose an image or PDF. TimetableKit reads it
            locally, shows warnings and conflicts, and lets you edit the result
            before you export JSON, CSV, or iCalendar.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/playground">
              Try it <ArrowRightIcon />
            </Link>
            <a
              className="button-secondary"
              href={VERIFIED_GITHUB_URL}
              target="_blank"
              rel="noreferrer"
            >
              See the code <ArrowUpRightIcon />
            </a>
          </div>
          <p className="privacy-note">
            <strong>Local by default.</strong> No account or API key. The public
            playground has no remote provider configured.
          </p>
        </div>

        <div
          className="transform-frame"
          aria-label="Example schedule turned into a reviewable calendar result"
        >
          <div className="transform-frame-header">
            <span>Schedule input</span>
            <ArrowRightIcon />
            <span>Reviewable result</span>
          </div>
          <div className="transform-grid">
            <div className="sample-input">
              <div className="sample-label">Fictional week</div>
              <pre>{`Mon 09:00-11:00 CS101 Algorithms
Mon 10:30-12:00 MATH201 Discrete Math
Mon 14:00-15:30 CS205 Databases

Tue 09:00-10:30 CS101 Algorithms
Tue 13:00-14:30 MATH201 Discrete Math

Time zone: Asia/Manila`}</pre>
            </div>
            <div className="sample-output">
              <div className="agenda-date">Monday · fictional week</div>
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
              <div className="agenda-date">Tuesday · fictional week</div>
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

      <section className="workflow-band" aria-label="How TimetableKit works">
        <div className="workflow-step">
          <span className="workflow-number">01</span>
          <div>
            <h2>Read</h2>
            <p>Read text, CSV, image, or PDF input locally.</p>
          </div>
        </div>
        <div className="workflow-step">
          <span className="workflow-number">02</span>
          <div>
            <h2>Review</h2>
            <p>Edit events and resolve warnings or conflicts.</p>
          </div>
        </div>
        <div className="workflow-step">
          <span className="workflow-number">03</span>
          <div>
            <h2>Export</h2>
            <p>Download JSON, CSV, or iCalendar.</p>
          </div>
        </div>
      </section>

      <section className="demo-section" aria-labelledby="demo-title">
        <div className="demo-section-heading">
          <h2 id="demo-title">See the review flow</h2>
          <span>fictional input · local by default</span>
        </div>
        <TimetableDemo />
      </section>

      <section className="formats-band" aria-labelledby="formats-title">
        <h2 id="formats-title">Accepted input formats</h2>
        <ul className="format-list">
          <li>Text · .txt, .text</li>
          <li>CSV · .csv</li>
          <li>Images · PNG, JPEG, WebP</li>
          <li>PDF · .pdf</li>
        </ul>
      </section>

      <section className="sdk-band" aria-labelledby="sdk-title">
        <div className="sdk-copy">
          <h2 id="sdk-title">Use it in TypeScript or an agent host</h2>
          <p>
            <code>@ndycode/timetablekit</code> parses schedules. The current
            main branch also includes <code>@ndycode/timetablekit-agent</code>,
            which exposes <code>timetablekit.parse</code> over JSON.
          </p>
          <Link href="/docs">
            Read the guide <ArrowRightIcon />
          </Link>
        </div>
        <pre className="sdk-code" tabIndex={0} aria-label="TypeScript example">
          <code>
            <span className="code-keyword">import</span> &#123; parseTimetable,
            toJSON &#125; <span className="code-keyword">from</span>{" "}
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
            <span className="code-keyword">const</span> normalized =
            toJSON(result);
          </code>
        </pre>
      </section>

      <section className="privacy-band" aria-labelledby="privacy-title">
        <h2 id="privacy-title">
          Local by default.
          <br />
          No account needed.
        </h2>
        <div>
          <p>
            The public playground keeps selected files and pasted text in
            browser memory. No remote provider is configured here. Agent hosts
            can opt into remote recovery only with{" "}
            <code>allowRemoteRecovery: true</code>, provider setup, and explicit
            request consent.
          </p>
          <Link href="/privacy">
            See how privacy works <ArrowRightIcon />
          </Link>
        </div>
      </section>

      <section className="roadmap-band" aria-labelledby="roadmap-title">
        <div>
          <h2 id="roadmap-title">Shipped and next</h2>
          <p className="privacy-note">
            Small, tested steps keep the parser and its boundaries predictable.
          </p>
          <Link href="/roadmap">
            See the plan <ArrowRightIcon />
          </Link>
        </div>
        <ul className="roadmap-list">
          <li>
            <strong>Shipped</strong>Local text, CSV, image, and PDF readers
          </li>
          <li>
            <strong>Shipped</strong>Review events, warnings, conflicts, and
            evidence
          </li>
          <li>
            <strong>Shipped</strong>JSON, CSV, and iCalendar exports
          </li>
          <li>
            <strong>Current main</strong>Agent tool and JSONL transport
          </li>
          <li>
            <strong>Next</strong>More languages, file types, and host examples
          </li>
        </ul>
      </section>
    </main>
  );
}
