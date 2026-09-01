# Quality report

Evidence snapshot recorded on 2026-09-01 for release-readiness commit `690bd7098ea64c9b5012b17bc86cb273c86c0627`.

## Local validation

`pnpm validate` exited 0.

- Formatting check passed.
- Lint passed. No forbidden type escapes or credential-like source text were found.
- Typecheck passed for 7 of 7 workspace tasks.
- Core and provider test matrix passed with 15 files and 112 tests in each provider run.
- CLI tests passed with 1 file and 3 tests.
- React tests passed with 1 file and 3 tests.
- Core coverage passed with 91.06% statements, 87.04% branches, 93.35% functions, and 91.18% lines.
- Fixture validation passed with 63 manifests, 63 inputs, and 63 expected outputs.
- Build passed with 7 of 7 workspace tasks.
- Browser E2E passed with 15 tests across Chromium, Firefox, and WebKit.
- Markdown link validation passed with 70 links in 34 files.
- Secret scan passed with no credential patterns found.
- Dependency audit passed with no known vulnerabilities at the configured high threshold.

The full command output was observed in the local validation run. The Turbo warning that `web#test` has no declared output files was non-failing.

## Live deployment checks

- Production deployment `dpl_8jCw11g7sH8JdMFdLFpjPLm33eqj` was READY for commit `d5b4b10fb47fb10e22ab2392dcaa1dcd8688f5b4` at https://timetablekit.vercel.app/.
- Release-readiness preview deployment `dpl_DY6DFokaKFk8f3ZuZDMA4uLwe2BL` was READY for commit `690bd7098ea64c9b5012b17bc86cb273c86c0627` at https://timetablekit-cqaicezmx-ndycode.vercel.app/.
- Production smoke passed for the production URL and the release-readiness preview URL. The smoke checked security headers, health, synthetic parsing, and the main routes.
- The live browser audit returned HTTP 200 for `/`, `/playground`, `/docs`, `/privacy`, `/security`, `/roadmap`, `/code-of-conduct`, and `/sitemap.xml`.
- Axe returned 0 violations on `/`, `/playground`, `/docs`, `/privacy`, and `/security`.
- Live export checks produced valid JSON, CSV, and iCalendar downloads. Observed sizes were 32,934 bytes, 790 bytes, and 1,815 bytes.
- The live browser audit observed 0 console errors and 0 failed requests.
- The production Lighthouse run passed with performance 98, accessibility 100, best practices 100, SEO 100, and agentic browsing 100. The run timestamp was `2026-09-01T03:02:12.994Z`.
- Vercel runtime error inspection found no runtime errors in the selected one-hour window.

The browser audit and screenshots used only the fictional sample schedule. No personal timetable, account data, or private schedule was used.

## Package and integration checks

- The packed `@ndycode/timetablekit` archive installed into a clean temporary consumer and parsed one synthetic event. The same consumer generated JSON, CSV, and weekly iCalendar output.
- npm publication was attempted with `npm publish --access public --provenance` and returned `ENEEDAUTH`. No npm package URL exists until an authenticated maintainer publishes it.
- The isolated MySched integration branch passed 28 ImportPipeline tests and 32 MySchedObservability tests. The focused proposal is open at https://github.com/ndycode/mysched/pull/1553 and is not merged.
