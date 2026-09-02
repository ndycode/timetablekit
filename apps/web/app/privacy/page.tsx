export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <main id="main-content" className="page-shell">
      <div className="page-intro">
        <h1>Privacy</h1>
        <p>The public playground reads your schedule in browser memory.</p>
      </div>
      <article className="doc-content">
        <section>
          <h2>What the public playground does</h2>
          <p>
            The public playground needs no account or API key. Selected files
            and pasted text stay in memory while you read, fix, and export them.
            It does not save data in the browser, track you, read data from the
            URL, or log your schedule.
          </p>
        </section>
        <section>
          <h2>Remote recovery is opt-in</h2>
          <p>
            The public playground has no recovery provider configured. If you
            enable its recovery control, it reports that recovery is unavailable
            and makes no remote request. In another host, a provider must be
            configured and the host must set{" "}
            <code>allowRemoteRecovery: true</code>. The request must also
            include explicit recovery consent before content can leave the local
            process.
          </p>
        </section>
        <section>
          <h2>What each boundary accepts</h2>
          <ul>
            <li>
              The browser playground accepts TXT, CSV, PNG, JPEG, WebP, and PDF
              files. It limits selected files to 2 MB and checks the file name
              and type before reading.
            </li>
            <li>
              The agent contract accepts text and CSV directly, plus bounded
              base64 for binary input. Remote URLs are not accepted or fetched.
            </li>
            <li>
              Exports use fixed names: <code>timetable.json</code>,{" "}
              <code>timetable.csv</code>, and <code>timetable.ics</code>.
            </li>
            <li>
              Schedule text and extracted file content are treated as data. The
              app never runs imported content as code.
            </li>
          </ul>
        </section>
        <section>
          <h2>Read the full privacy policy</h2>
          <p>
            The full privacy rules are in <code>docs/privacy.md</code>. Outside
            services may keep data for different lengths of time. Check their
            terms before a host enables a remote provider.
          </p>
        </section>
      </article>
    </main>
  );
}
