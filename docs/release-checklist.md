# Release checklist

Verified 2026-09-01. The checklist records the release surfaces without claiming an npm publication or a merged MySched integration.

| Gate                                                                       | Status        | Evidence                                              |
| -------------------------------------------------------------------------- | ------------- | ----------------------------------------------------- |
| Original public repository                                                 | Pass          | https://github.com/ndycode/timetablekit               |
| MIT license and Code of Conduct                                            | Pass          | Repository root files                                 |
| Contribution, security, privacy, governance, support, and application docs | Pass          | Repository root, `docs/`, and `application/`          |
| Local validation                                                           | Pass          | `pnpm validate`, recorded in `docs/quality-report.md` |
| Core coverage                                                              | Pass          | 91.18% line coverage and 87.04% branch coverage       |
| Fixture validation                                                         | Pass          | 63 manifests, 63 inputs, and 63 expected outputs      |
| Browser matrix                                                             | Pass          | 15 E2E cases across Chromium, Firefox, and WebKit     |
| Production deployment                                                      | Pass          | https://timetablekit.vercel.app/                      |
| Preview deployment                                                         | Pass          | https://timetablekit-6b9eoz98f-ndycode.vercel.app/    |
| Live route, export, accessibility, and Lighthouse checks                   | Pass          | `docs/quality-report.md`                              |
| npm package publication                                                    | Blocked       | npm authentication returned `ENEEDAUTH`               |
| GitHub release                                                             | Pending       | Create `v0.1.0` after the release PR merges           |
| MySched integration                                                        | Proposal open | https://github.com/ndycode/mysched/pull/1553          |
