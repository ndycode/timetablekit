export const metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <main id="main-content" className="page-shell">
      <div className="page-intro">
        <h1>Security</h1>
        <p>The app limits what it reads and how outside services work.</p>
      </div>
      <article className="doc-content">
        <section>
          <h2>What the browser accepts</h2>
          <p>
            TimetableKit accepts only local text and files you select. It
            rejects URLs, unsupported types, files whose names and types do not
            match, and files over the size limit. It does not save uploaded
            bytes.
          </p>
        </section>
        <section>
          <h2>Browser protections</h2>
          <p>
            The app uses browser rules to limit scripts, referrers, permissions,
            framing, and file types. The health check returns status only. It
            does not expose server settings.
          </p>
        </section>
        <section>
          <h2>Rules for file readers</h2>
          <p>
            Image, PDF, and remote AI readers stay separate from the main
            parser. Each reader must stop when asked, follow size limits, limit
            its output, and return clear errors. Remote AI needs your consent.
          </p>
        </section>
        <section>
          <h2>Report a security problem</h2>
          <p>
            Do not post credentials, private schedules, attack details, or
            personal data in a public issue. Use the private maintainer contact
            in <code>SECURITY.md</code>. Include an example with private details
            removed and the affected version or commit.
          </p>
        </section>
      </article>
    </main>
  );
}
