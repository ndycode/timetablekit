import Link from "next/link";
import { ArrowUpRightIcon } from "./icons";

export const VERIFIED_GITHUB_URL = "https://github.com/ndycode/timetablekit";

export function SiteHeader() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <Link className="wordmark" href="/" aria-label="TimetableKit home">
            <img src="/icon.svg" alt="" aria-hidden="true" />
            <span>TimetableKit</span>
          </Link>
          <nav className="site-nav" aria-label="Main navigation">
            <Link href="/playground">Try it</Link>
            <Link href="/docs">Guide</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/security">Security</Link>
            <Link href="/roadmap">Plans</Link>
            <a href={VERIFIED_GITHUB_URL} target="_blank" rel="noreferrer">
              See the code <ArrowUpRightIcon />
            </a>
          </nav>
          <details className="mobile-nav">
            <summary>Menu</summary>
            <nav aria-label="Mobile navigation">
              <Link href="/playground">Try it</Link>
              <Link href="/docs">Guide</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/security">Security</Link>
              <Link href="/roadmap">Plans</Link>
              <a href={VERIFIED_GITHUB_URL} target="_blank" rel="noreferrer">
                See the code <ArrowUpRightIcon />
              </a>
            </nav>
          </details>
        </div>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-brand">
        <img src="/icon.svg" alt="" aria-hidden="true" />
        <span>© 2026 TimetableKit. MIT License.</span>
      </div>
      <nav aria-label="Footer links">
        <Link href="/security">Security</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/code-of-conduct">Community rules</Link>
        <a href={VERIFIED_GITHUB_URL} target="_blank" rel="noreferrer">
          See the code <ArrowUpRightIcon />
        </a>
      </nav>
    </footer>
  );
}
