export const metadata = { title: "Roadmap" };

export default function RoadmapPage() {
  return (
    <main className="page-shell">
      <div className="page-intro">
        <h1>Roadmap</h1>
        <p>Small, verifiable steps for a reusable timetable import toolkit.</p>
      </div>
      <article className="doc-content">
        <section>
          <h2>0.1</h2>
          <ul>
            <li>Deterministic text and CSV parsing.</li>
            <li>Local image and PDF provider boundaries.</li>
            <li>Correction UI and JSON, CSV, and iCalendar exports.</li>
            <li>Synthetic fixture suite and public documentation.</li>
          </ul>
        </section>
        <section>
          <h2>Next</h2>
          <ul>
            <li>More locale registries and parser dialects.</li>
            <li>Additional framework examples.</li>
            <li>Optional structured recovery providers.</li>
            <li>
              Community-maintained fixtures and accessibility improvements.
            </li>
          </ul>
        </section>
        <section>
          <h2>How work is prioritized</h2>
          <p>
            Parser regressions need synthetic or redistributable fixtures.
            Provider changes need explicit data-flow notes. Dates and traction
            are reported only when independently verified.
          </p>
        </section>
      </article>
    </main>
  );
}
