export const metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <main id="main-content" className="page-shell">
      <div className="page-intro">
        <h1>Security</h1>
        <p>Each boundary limits its input, work, output, and data flow.</p>
      </div>
      <article className="doc-content">
        <section>
          <h2>What the browser accepts</h2>
          <p>
            The playground accepts only pasted text or files you select. It
            rejects remote URLs as input sources, unsupported types, files whose
            names and types do not match, and selected files over 2 MB. Pasted
            URL-shaped text stays text and is not fetched. It does not save
            uploaded bytes.
          </p>
        </section>
        <section>
          <h2>What agent mode accepts</h2>
          <p>
            The agent package uses JSON requests and responses. It bounds
            request and response bytes, checks binary size before base64
            decoding, bounds JSONL lines, and limits request IDs to 256 UTF-8
            bytes. Malformed lines return structured errors and do not stop the
            stream. Agent mode does not read paths or fetch URLs.
          </p>
        </section>
        <section>
          <h2>Browser protections</h2>
          <p>
            The app uses browser rules to limit scripts, referrers, permissions,
            framing, and file types. The health check returns status, service,
            and version only. It does not expose server settings.
          </p>
        </section>
        <section>
          <h2>Rules for file readers</h2>
          <p>
            Image and PDF readers stay separate from the main parser. Each
            reader must stop when asked, follow size limits, limit its output,
            and return clear errors. A host-injected remote recovery provider
            needs <code>allowRemoteRecovery: true</code>, host configuration,
            and request consent.
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
