export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <main className="page-shell">
      <div className="page-intro">
        <h1>Privacy model</h1>
        <p>
          The default path keeps timetable content in the browser for the
          duration of the task.
        </p>
      </div>
      <article className="doc-content">
        <section>
          <h2>Local by default</h2>
          <p>
            The playground does not require an account or API key. A selected
            file and pasted text remain in memory while you parse, correct, and
            export. The app does not use localStorage, analytics, raw query
            parameters, or timetable-content logging.
          </p>
        </section>
        <section>
          <h2>Remote recovery is opt in</h2>
          <p>
            AI recovery is off by default. The control explains that enabling it
            can send unresolved fields to a remote provider and that provider
            terms apply. Nothing is sent when consent is missing.
          </p>
        </section>
        <section>
          <h2>Input boundaries</h2>
          <ul>
            <li>Remote URLs are not accepted.</li>
            <li>
              Files are checked against supported MIME types, extensions, and a
              2 MB size limit.
            </li>
            <li>
              File names are sanitized before they are used in a local download.
            </li>
            <li>
              Imported text is treated as data, not as executable instructions.
            </li>
          </ul>
        </section>
        <section>
          <h2>Read the repository policy</h2>
          <p>
            The full privacy boundary is documented in{" "}
            <code>docs/privacy.md</code>. Provider retention terms can differ,
            so review them before enabling remote recovery.
          </p>
        </section>
      </article>
    </main>
  );
}
