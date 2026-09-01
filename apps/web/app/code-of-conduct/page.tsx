export const metadata = { title: "Community rules" };

export default function CodeOfConductPage() {
  return (
    <main id="main-content" className="page-shell">
      <div className="page-intro">
        <h1>Community rules</h1>
        <p>Keep this project safe and useful for everyone.</p>
      </div>
      <article className="doc-content">
        <section>
          <h2>Be helpful</h2>
          <ul>
            <li>Be respectful and clear.</li>
            <li>Assume good intent. Talk about the impact.</li>
            <li>Talk about the work, not the person.</li>
            <li>Keep schedules, credentials, and personal data private.</li>
          </ul>
        </section>
        <section>
          <h2>What is not allowed</h2>
          <p>
            Do not harass, discriminate, threaten, impersonate others, or make
            sexual comments. Do not publish someone&apos;s private information
            or expose private schedule data.
          </p>
        </section>
        <section>
          <h2>Report a concern</h2>
          <p>
            Use the maintainer contact in <code>SUPPORT.md</code> to report a
            concern privately. Keep schedules and credentials out of your
            report.
          </p>
        </section>
      </article>
    </main>
  );
}
