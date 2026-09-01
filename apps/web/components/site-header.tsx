import Link from "next/link";

export const VERIFIED_GITHUB_URL = "https://github.com/ndycode/timetablekit";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="wordmark" href="/" aria-label="TimetableKit home">
          TimetableKit
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link href="/playground">Playground</Link>
          <Link href="/docs">Docs</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/security">Security</Link>
          <Link href="/roadmap">Roadmap</Link>
          <a href={VERIFIED_GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>© 2026 TimetableKit. MIT License.</span>
      <nav aria-label="Footer navigation">
        <Link href="/security">Security</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/code-of-conduct">Code of Conduct</Link>
        <a href={VERIFIED_GITHUB_URL} target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
      </nav>
    </footer>
  );
}
