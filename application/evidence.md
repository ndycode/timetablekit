# Application evidence map

Status: prepared, not submitted. Verified 2026-09-01. External facts below use exact URLs or commands. npm publication remains pending because the available npm session is unauthenticated.

| Criterion           | Evidence                                                                                                                                                                                                                                                                                                 | Status                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Open source         | [Public repository](https://github.com/ndycode/timetablekit) and [MIT license](https://github.com/ndycode/timetablekit/blob/main/LICENSE)                                                                                                                                                                | Pass, verified 2026-09-01                                                   |
| Active project      | [Roadmap](https://github.com/ndycode/timetablekit/blob/main/ROADMAP.md), [changelog](https://github.com/ndycode/timetablekit/blob/main/CHANGELOG.md), [release](https://github.com/ndycode/timetablekit/releases/tag/v0.1.0), and [commit history](https://github.com/ndycode/timetablekit/commits/main) | Pass, release verified 2026-09-01                                           |
| Vercel hosting      | [Production](https://timetablekit.vercel.app/) and [preview](https://timetablekit-p18qr1s71-ndycode.vercel.app/)                                                                                                                                                                                         | Pass, fixed implementation preview and production smoke verified 2026-09-01 |
| Working product     | [Production playground](https://timetablekit.vercel.app/playground), no-account sample, correction, conflict feedback, and three exports                                                                                                                                                                 | Pass, manual and Playwright verified 2026-09-01                             |
| Quality             | `mise exec node@24 -- pnpm validate`, browser matrix, coverage, fixture validation, and [production smoke script](https://github.com/ndycode/timetablekit/blob/main/scripts/production-smoke.mjs)                                                                                                        | Pass locally and live on 2026-09-01                                         |
| Accessibility       | Axe checks on the exact preview, playground, docs, privacy, security, Code of Conduct, and roadmap routes                                                                                                                                                                                                | Pass, zero violations on 2026-09-01                                         |
| Impact or growth    | [Dated claims ledger](../docs/claims.md) with ten scoped roadmap issues and no unsupported adoption metrics                                                                                                                                                                                              | Pass as an honest limitation                                                |
| Code of Conduct     | [CODE_OF_CONDUCT.md](https://github.com/ndycode/timetablekit/blob/main/CODE_OF_CONDUCT.md)                                                                                                                                                                                                               | Pass                                                                        |
| Credit isolation    | [credit-usage.md](credit-usage.md) and [public deployment](https://timetablekit.vercel.app/)                                                                                                                                                                                                             | Pass, policy prepared                                                       |
| Community           | [Contribution](https://github.com/ndycode/timetablekit/blob/main/CONTRIBUTING.md), governance, support, security, issue templates, Discussions, and [roadmap issues](https://github.com/ndycode/timetablekit/issues)                                                                                     | Pass, verified 2026-09-01                                                   |
| Developer ecosystem | SDK, CLI, fixtures, exporters, provider documentation, and [API docs](https://timetablekit.vercel.app/docs)                                                                                                                                                                                              | Pass, verified 2026-09-01                                                   |
| MySched integration | [Focused adapter PR](https://github.com/ndycode/mysched/pull/1553) with isolated tests                                                                                                                                                                                                                   | Pass as open proposal, not adoption                                         |
| Published package   | Clean package archive install passed; public npm publication was attempted and returned `ENEEDAUTH`                                                                                                                                                                                                      | Blocked by npm authentication                                               |

## Internal readiness score

This is the plan's internal rubric, not Vercel's scoring formula or a selection
prediction.

| Area                           |  Score |
| ------------------------------ | -----: |
| Hard eligibility               |  20/20 |
| Working open-source product    |  20/20 |
| Impact and credibility         |  10/15 |
| Community design               |  12/15 |
| Vercel fit                     |  10/10 |
| Quality, privacy, and security |  10/10 |
| Application quality            |  10/10 |
| Total                          | 92/100 |

The score is conservative. It gives no credit for external launch, usage, or
tester metrics, and no credit for external participation. The packet remains
prepared but not submitted until the npm and GitHub Actions account gates are
resolved and the applicant rechecks the live form.
