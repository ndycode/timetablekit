# Release checklist

Local package and release checks verified 2026-09-03. External publication and deployment rows are not re-verified by this refactor. The checklist does not claim a merged MySched integration.

| Gate                                                                       | Status          | Evidence                                                                  |
| -------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------- |
| Original public repository                                                 | Pass            | https://github.com/ndycode/timetablekit                                   |
| MIT license and Code of Conduct                                            | Pass            | Repository root files                                                     |
| Contribution, security, privacy, governance, support, and application docs | Pass            | Repository root, `docs/`, and `application/`                              |
| Local validation                                                           | Pass            | `mise exec node@24 -- pnpm validate` exited 0 on 2026-09-03               |
| Public package registry                                                    | Pass            | `pnpm packages:check`; seven non-private manifests in dependency order    |
| Dry package enumeration                                                    | Pass            | `pnpm packages:pack`; seven pack commands listed and no publish attempted |
| Core coverage                                                              | Pass            | 91.13% statements, 85.12% branches, 97.98% functions, and 91.90% lines    |
| Fixture validation                                                         | Pass            | 63 manifests, 63 inputs, and 63 expected outputs                          |
| Browser matrix                                                             | Pass            | 16 E2E cases and 48 runs across Chromium, Firefox, and WebKit             |
| Main branch protection                                                     | Pass            | `Foundation checks` required; force pushes and deletions disabled         |
| Hosted GitHub Actions                                                      | Blocked         | Dispatch returned HTTP 422: `Actions has been disabled for this user`     |
| Vercel GitHub connection                                                   | Unverified here | Historical evidence only; no external check run by this refactor          |
| Production deployment                                                      | Unverified here | Historical evidence only; no external check run by this refactor          |
| Preview deployment                                                         | Unverified here | Historical evidence only; no external check run by this refactor          |
| Live route, export, accessibility, and Lighthouse checks                   | Unverified here | Historical evidence only; no external check run by this refactor          |
| npm package publication                                                    | Unverified here | No publish attempted; external status belongs in `docs/claims.md`         |
| GitHub release                                                             | Unverified here | No external release check run by this refactor                            |
| MySched integration                                                        | Proposal open   | https://github.com/ndycode/mysched/pull/1553                              |
