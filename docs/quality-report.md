# Quality report

Evidence snapshot recorded on 2026-09-01. The fixed implementation commit is
`fd742d2aaf6ee91a855fdfc60cd355247786499e`. The historical v0.1.0 release
commit is `e3aeafc3ebf4e1d3ab9082446b3b42eda1f20b23`.

This is a historical snapshot for those commits. It is not current release
status. The `/api/parse` checks below describe the old deployment and that route
has since been removed. See [the release checklist](release-checklist.md) for
current local evidence.

## Local validation

`mise exec node@24 -- pnpm validate` exited 0.

- Formatting check passed.
- Lint passed. No forbidden type escapes or credential-like source text were found.
- Typecheck passed for 10 of 10 workspace tasks.
- Core and each provider test matrix passed with 15 files and 120 tests in each workspace run.
- CLI tests passed with 1 file and 5 tests.
- React tests passed with 1 file and 3 tests.
- The coverage run passed with 17 files and 123 tests.
- Core coverage passed with 91.94% statements, 87.62% branches, 96.98% functions, and 92.10% lines.
- Web boundary unit tests passed with 2 files and 3 tests.
- Fixture validation passed with 63 manifests, 63 inputs, and 63 expected outputs.
- Build passed with 7 of 7 workspace tasks.
- Browser E2E passed with 21 tests across Chromium, Firefox, and WebKit.
- Markdown link validation passed with 78 links in 34 files.
- Secret scan passed with no credential patterns found.
- Dependency audit passed with no known vulnerabilities at the configured high threshold.

The full command output was observed in the local validation run. The Turbo warning that `web#test` has no declared output files was non-failing.

Hosted GitHub Actions could not be started. `gh workflow run ci.yml --repo
ndycode/timetablekit --ref main` returned HTTP 422 with `Actions has been
disabled for this user`. The repository workflow files remain present, and the
local Node 24 gate above is the available equivalent. The `main` branch is
protected with the `Foundation checks` status required, force pushes and
deletions disabled, and conversation resolution required.

## Live deployment checks

- The Vercel project is connected to `https://github.com/ndycode/timetablekit.git`; `vercel git connect` returned `Connected`.
- The latest GitHub-connected production deployment is READY at https://timetablekit.vercel.app/.
- Preview deployment `dpl_4655tEFzJ3uHFQ1r9mCdpCrjc4pQ` is READY at https://timetablekit-p18qr1s71-ndycode.vercel.app/.
- The current production application code is unchanged from fixed implementation commit `fd742d2aaf6ee91a855fdfc60cd355247786499e`; the latest GitHub push added only documentation evidence.
- Production and preview smoke passed. The smoke checked security headers, health, synthetic parsing, and the main routes.
- The final production browser audit returned HTTP 200 for all seven app routes and the public JSON Schema endpoint.
- Axe returned 0 violations on all seven audited production routes.
- Live production export checks produced valid JSON, CSV, and iCalendar downloads. Observed sizes were 32,922 bytes, 778 bytes, and 1,803 bytes.
- The live production API parsed 46 synthetic overlapping events and returned the configured 1,000-conflict cap with a limit warning. An oversized request returned HTTP 413.
- The final production browser audit observed 0 console errors, 0 page errors, and 0 failed requests.
- The final production Lighthouse 13.0.1 run returned performance 95, accessibility 100, best practices 100, and SEO 100 at `2026-09-01T12:21:45.795Z`.
- The exact preview Lighthouse 13.0.1 run returned performance 97, accessibility 100, best practices 100, and SEO 63 at `2026-09-01T11:45:55.406Z`. The lower preview SEO score is expected because Vercel preview deployments are marked noindex.
- The production runtime error query for the selected one-hour window returned no error entries.

The browser audit and screenshots used only the fictional sample schedule. No personal timetable, account data, or private schedule was used.

## Package and integration checks

- The packed `@ndycode/timetablekit` archive installed into a clean temporary consumer and parsed one synthetic event. The same consumer generated JSON, CSV, and weekly iCalendar output.
- `npm publish --access public --provenance` was rejected because this local environment has no supported provenance provider. The public publish then completed with `npm publish --access public` after browser verification.
- [The npm package](https://www.npmjs.com/package/@ndycode/timetablekit) is listed in the public npm search index as `@ndycode/timetablekit@0.1.0`, and `npm access get status` reports `public`. A clean-cache consumer installed it, parsed one synthetic event, and generated JSON, CSV, and iCalendar output.
- The isolated MySched integration branch passed 28 ImportPipeline tests and 32 MySchedObservability tests. The focused proposal is open at https://github.com/ndycode/mysched/pull/1553 and is not merged.
