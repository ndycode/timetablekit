export const metadata = { title: "Plans" };

export default function RoadmapPage() {
  return (
    <main id="main-content" className="page-shell">
      <div className="page-intro">
        <h1>What comes next</h1>
        <p>Small steps to make schedule imports easier.</p>
      </div>
      <article className="doc-content">
        <section>
          <h2>Version 0.1</h2>
          <ul>
            <li>Deterministic text and CSV parsing.</li>
            <li>Local browser readers for images and PDFs.</li>
            <li>
              Editable results with warnings, conflicts, confidence, and source
              evidence.
            </li>
            <li>JSON, CSV, and iCalendar exports.</li>
          </ul>
        </section>
        <section>
          <h2>Current main</h2>
          <ul>
            <li>Framework-neutral agent tool with capability discovery.</li>
            <li>JSON Schema input and output contracts.</li>
            <li>
              JSONL transport through <code>timetablekit agent</code>.
            </li>
          </ul>
        </section>
        <section>
          <h2>Next steps</h2>
          <ul>
            <li>Support more languages and file types.</li>
            <li>Examples for MCP, function-calling, and process hosts.</li>
            <li>
              Broader browser coverage for binary readers and keyboard access.
            </li>
            <li>More synthetic community fixtures.</li>
          </ul>
        </section>
        <section>
          <h2>How we choose work</h2>
          <p>
            Parser bugs need sample test data or data we can share. Reader
            changes need clear notes about where data goes. Provider changes
            need limits, cancellation, and failure behavior. We report dates and
            usage only after someone else checks them.
          </p>
        </section>
      </article>
    </main>
  );
}
