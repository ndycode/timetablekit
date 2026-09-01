# Release checklist

Verified 2026-09-01. The checklist records the release surfaces without claiming a merged MySched integration.

| Gate                                                                       | Status        | Evidence                                                                                |
| -------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------- |
| Original public repository                                                 | Pass          | https://github.com/ndycode/timetablekit                                                 |
| MIT license and Code of Conduct                                            | Pass          | Repository root files                                                                   |
| Contribution, security, privacy, governance, support, and application docs | Pass          | Repository root, `docs/`, and `application/`                                            |
| Local validation                                                           | Pass          | `pnpm validate`, recorded in `docs/quality-report.md`                                   |
| Core coverage                                                              | Pass          | 92.10% line coverage and 87.62% branch coverage                                         |
| Fixture validation                                                         | Pass          | 63 manifests, 63 inputs, and 63 expected outputs                                        |
| Browser matrix                                                             | Pass          | 21 E2E cases across Chromium, Firefox, and WebKit                                       |
| Main branch protection                                                     | Pass          | `Foundation checks` required; force pushes and deletions disabled                       |
| Hosted GitHub Actions                                                      | Blocked       | Dispatch returned HTTP 422: `Actions has been disabled for this user`                   |
| Vercel GitHub connection                                                   | Pass          | Vercel project connected to `ndycode/timetablekit`                                      |
| Production deployment                                                      | Pass          | https://timetablekit.vercel.app/ (latest GitHub-connected deployment)                   |
| Preview deployment                                                         | Pass          | https://timetablekit-p18qr1s71-ndycode.vercel.app/ (`dpl_4655tEFzJ3uHFQ1r9mCdpCrjc4pQ`) |
| Live route, export, accessibility, and Lighthouse checks                   | Pass          | `docs/quality-report.md`                                                                |
| npm package publication                                                    | Pass          | https://www.npmjs.com/package/@ndycode/timetablekit (`0.1.0`)                           |
| GitHub release                                                             | Pass          | https://github.com/ndycode/timetablekit/releases/tag/v0.1.0                             |
| MySched integration                                                        | Proposal open | https://github.com/ndycode/mysched/pull/1553                                            |
