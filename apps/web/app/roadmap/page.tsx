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
            <li>Read text and CSV files.</li>
            <li>Read local images and PDFs.</li>
            <li>Fix results and download JSON, CSV, or calendar files.</li>
            <li>Sample test data and public docs.</li>
          </ul>
        </section>
        <section>
          <h2>Next steps</h2>
          <ul>
            <li>Support more languages and file types.</li>
            <li>Examples for more apps.</li>
            <li>Optional AI help with clear results.</li>
            <li>Community test data and easier keyboard access.</li>
          </ul>
        </section>
        <section>
          <h2>How we choose work</h2>
          <p>
            Parser bugs need sample test data or data we can share. Reader
            changes need clear notes about where data goes. We report dates and
            usage only after someone else checks them.
          </p>
        </section>
      </article>
    </main>
  );
}
