export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <main id="main-content" className="page-shell">
      <div className="page-intro">
        <h1>Privacy</h1>
        <p>Your schedule stays in this browser while you work.</p>
      </div>
      <article className="doc-content">
        <section>
          <h2>Your schedule stays here</h2>
          <p>
            The demo needs no account or API key. Selected files and pasted text
            stay in memory while you read, fix, and export them. The app does
            not save data in the browser, track you, read data from the URL, or
            log your schedule.
          </p>
        </section>
        <section>
          <h2>AI help is optional</h2>
          <p>
            AI help is off. If you turn it on, the app can send unclear fields
            to an outside service. That service&apos;s terms apply. The app
            sends nothing without your consent.
          </p>
        </section>
        <section>
          <h2>What the app accepts</h2>
          <ul>
            <li>You cannot use a URL.</li>
            <li>
              Files must have a supported type and matching name. Files must be
              2 MB or smaller.
            </li>
            <li>The app cleans file names before it downloads a file.</li>
            <li>
              The app treats schedule text as data. It never runs the text as
              code.
            </li>
          </ul>
        </section>
        <section>
          <h2>Read the full privacy policy</h2>
          <p>
            The full privacy rules are in <code>docs/privacy.md</code>. Outside
            services may keep data for different lengths of time. Check their
            terms before you turn on AI help.
          </p>
        </section>
      </article>
    </main>
  );
}
