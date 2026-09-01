# Quality report

Evidence snapshot recorded on 2026-09-01. The implementation validation source
commit was `9f14864293ec256245ae8c69ab6b20fc18560374`. The merged release
commit is `e3aeafc3ebf4e1d3ab9082446b3b42eda1f20b23` with the same tree.

## Local validation

`pnpm validate` exited 0.

- Formatting check passed.
- Lint passed. No forbidden type escapes or credential-like source text were found.
- Typecheck passed for 7 of 7 workspace tasks.
- Core and provider test matrix passed with 15 files and 118 tests in each workspace run.
- CLI tests passed with 1 file and 5 tests.
- React tests passed with 1 file and 3 tests.
- Core coverage passed with 91.85% statements, 87.57% branches, 96.93% functions, and 92.02% lines.
- Fixture validation passed with 63 manifests, 63 inputs, and 63 expected outputs.
- Build passed with 7 of 7 workspace tasks.
- Browser E2E passed with 21 tests across Chromium, Firefox, and WebKit.
- Markdown link validation passed with 77 links in 34 files.
- Secret scan passed with no credential patterns found.
- Dependency audit passed with no known vulnerabilities at the configured high threshold.

The full command output was observed in the local validation run. The Turbo warning that `web#test` has no declared output files was non-failing.

## Live deployment checks

- Production deployment `dpl_5TivqjGfmiNPjgk7q4LQfDJeihCK` is READY for merge commit `e3aeafc3ebf4e1d3ab9082446b3b42eda1f20b23` at https://timetablekit.vercel.app/.
- Release-readiness preview deployment `dpl_EpwYg4jhhtN91xJPbsxwrcqfSYJ9` was READY at https://timetablekit-c0v9prgnt-ndycode.vercel.app/. Vercel metadata binds it to source commit `9f14864293ec256245ae8c69ab6b20fc18560374` on `codex/release-readiness`.
- Preview smoke passed for the exact source deployment. The smoke checked security headers, health, synthetic parsing, and the main routes.
- The final production browser audit returned HTTP 200 for all seven app routes, `/sitemap.xml`, `/robots.txt`, and `/schema/timetable-result.schema.json`.
- Axe returned 0 violations on all seven audited production routes.
- Live production export checks produced valid JSON, CSV, and iCalendar downloads. Observed sizes were 6,291 bytes, 240 bytes, and 370 bytes.
- The live production API parsed 46 synthetic overlapping events and returned the configured 1,000-conflict cap with a limit warning. An oversized request returned HTTP 413.
- The final production browser audit observed 0 console errors, 0 page errors, and 0 failed requests.
- The final production Lighthouse run returned performance 97, accessibility 100, best practices 100, and SEO 100 at `2026-09-01T05:37:06.014Z`.
- The exact preview Lighthouse run returned performance 99, accessibility 100, best practices 100, and SEO 63 at `2026-09-01T05:27:00.899Z`. The lower preview SEO score is expected because Vercel preview deployments are marked noindex.
- The metadata runtime audit confirmed that the production sitemap uses `https://timetablekit.vercel.app/` and contains no `localhost` URL. Robots points to the same public sitemap.
- Vercel runtime error inspection found no runtime errors in the selected one-hour window after the production deployment.

The browser audit and screenshots used only the fictional sample schedule. No personal timetable, account data, or private schedule was used.

## Package and integration checks

- The packed `@ndycode/timetablekit` archive installed into a clean temporary consumer and parsed one synthetic event. The same consumer generated JSON, CSV, and weekly iCalendar output.
- npm publication was attempted with `npm publish --access public --provenance` and returned `ENEEDAUTH`. No npm package URL exists until an authenticated maintainer publishes it.
- The isolated MySched integration branch passed 28 ImportPipeline tests and 32 MySchedObservability tests. The focused proposal is open at https://github.com/ndycode/mysched/pull/1553 and is not merged.
