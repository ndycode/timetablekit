export const metadata = { title: "Code of Conduct" };

export default function CodeOfConductPage() {
  return (
    <main className="page-shell">
      <div className="page-intro">
        <h1>Code of Conduct</h1>
        <p>
          TimetableKit is a welcoming, harassment-free community for everyone.
        </p>
      </div>
      <article className="doc-content">
        <section>
          <h2>Expected behavior</h2>
          <ul>
            <li>Be respectful and specific.</li>
            <li>Assume good intent while addressing impact.</li>
            <li>Give feedback about the work, not the person.</li>
            <li>
              Protect private schedules, credentials, and personal information.
            </li>
          </ul>
        </section>
        <section>
          <h2>Unacceptable behavior</h2>
          <p>
            Harassment, discrimination, threats, doxxing, sexualized conduct,
            impersonation, and deliberate exposure of private timetable data are
            not allowed.
          </p>
        </section>
        <section>
          <h2>Reporting</h2>
          <p>
            Report a concern privately through the maintainer contact listed in
            the repository <code>SUPPORT.md</code>. Do not include private
            schedules or credentials in a report.
          </p>
        </section>
      </article>
    </main>
  );
}
