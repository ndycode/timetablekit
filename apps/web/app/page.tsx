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
            Paste a schedule or choose a text, image, or PDF file. TimetableKit
            turns it into calendar events you can check and download in your
            browser.
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
            <strong>Runs in your browser by default.</strong> No account or API
            key. Your schedule stays in this browser unless you turn on AI help.
          </p>
        </div>

        <div
          className="transform-frame"
          aria-label="Example schedule turned into calendar events"
        >
          <div className="transform-frame-header">
            <span>Input file</span>
            <ArrowRightIcon />
            <span>Calendar events</span>
          </div>
          <div className="transform-grid">
            <div className="sample-input">
              <div className="sample-label">Sample week</div>
              <pre>{`Mon 09:00-11:00 CS101 Algorithms
Mon 10:30-12:00 MATH201 Discrete Math
Mon 14:00-15:30 CS205 Databases

Time zone: Asia/Manila`}</pre>
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

      <section className="workflow-band" aria-label="How TimetableKit works">
        <div className="workflow-step">
          <span className="workflow-number">01</span>
          <div>
            <h2>Add</h2>
            <p>Add a schedule from text, an image, or a PDF.</p>
          </div>
        </div>
        <div className="workflow-step">
          <span className="workflow-number">02</span>
          <div>
            <h2>Check</h2>
            <p>Check and edit the events.</p>
          </div>
        </div>
        <div className="workflow-step">
          <span className="workflow-number">03</span>
          <div>
            <h2>Download</h2>
            <p>Download JSON, CSV, or iCalendar.</p>
          </div>
        </div>
      </section>

      <section className="demo-section" aria-labelledby="demo-title">
        <div className="demo-section-heading">
          <h2 id="demo-title">See how it works</h2>
          <span>sample input · stays here</span>
        </div>
        <TimetableDemo />
      </section>

      <section className="formats-band" aria-labelledby="formats-title">
        <h2 id="formats-title">Files you can use</h2>
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
          <h2 id="sdk-title">Use it in TypeScript</h2>
          <p>A small package for your app.</p>
          <Link href="/docs">
            Read the guide <ArrowRightIcon />
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
          Your data stays here.
          <br />
          No account needed.
        </h2>
        <div>
          <p>
            The app reads schedules in your browser. Files stay in memory while
            you work. AI help is off until you turn it on and agree to the
            outside service&apos;s terms.
          </p>
          <Link href="/privacy">
            See how privacy works <ArrowRightIcon />
          </Link>
        </div>
      </section>

      <section className="roadmap-band" aria-labelledby="roadmap-title">
        <div>
          <h2 id="roadmap-title">What comes next</h2>
          <p className="privacy-note">
            We add small, tested steps to make schedule imports easier.
          </p>
          <Link href="/roadmap">
            See the plan <ArrowRightIcon />
          </Link>
        </div>
        <ul className="roadmap-list">
          <li>
            <strong>Now</strong>Read text and CSV schedules
          </li>
          <li>
            <strong>Now</strong>Fix events and download them
          </li>
          <li>
            <strong>Next</strong>Support more languages
          </li>
          <li>
            <strong>Next</strong>Add more file readers
          </li>
        </ul>
      </section>
    </main>
  );
}
