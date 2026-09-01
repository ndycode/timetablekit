export const metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <main className="page-shell">
      <div className="page-intro">
        <h1>Security</h1>
        <p>
          Bounded input, explicit providers, and a clear path for vulnerability
          reports.
        </p>
      </div>
      <article className="doc-content">
        <section>
          <h2>Browser boundary</h2>
          <p>
            TimetableKit accepts only local text and selected files. It rejects
            remote URLs, unsupported types, mismatched MIME and extension pairs,
            and files over the configured limit. Uploaded bytes are not
            persisted.
          </p>
        </section>
        <section>
          <h2>Web headers</h2>
          <p>
            The web app sends a restrictive content security policy,
            Referrer-Policy, Permissions-Policy, X-Content-Type-Options, and
            frame protections. The health route exposes status only and no
            environment values.
          </p>
        </section>
        <section>
          <h2>Provider rules</h2>
          <p>
            OCR, PDF, and remote recovery providers are separate from the core
            parser. They must respect cancellation, resource limits, bounded
            output, and structured errors. Remote recovery requires explicit
            consent.
          </p>
        </section>
        <section>
          <h2>Report a vulnerability</h2>
          <p>
            Do not open a public issue with credentials, private schedules,
            exploit details, or personal data. Use the private maintainer
            contact in the repository <code>SECURITY.md</code> and include a
            redacted reproduction with the affected version or commit.
          </p>
        </section>
      </article>
    </main>
  );
}
