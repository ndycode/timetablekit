# Reviewer checklist

Status: public repository, release, and deployment checks complete on 2026-09-01. npm publication remains blocked by local authentication.

- [x] Open the local site without an account.
- [x] Click the sample action and see normalized events.
- [x] Edit one event field.
- [x] Observe warning or conflict feedback.
- [x] Download JSON, CSV, and ICS.
- [x] Open local repository documentation, license, Code of Conduct, security, roadmap, and contribution links.
- [x] Run the clean local validation command.
- [x] Open the production site without an account at https://timetablekit.vercel.app/.
- [x] Open the preview deployment at https://timetablekit-p18qr1s71-ndycode.vercel.app/.
- [ ] Install the published package in a clean directory. Public npm publication is blocked by `npm whoami` returning `ENEEDAUTH`.
- [x] Compare the historical release tag and current deployed implementation. v0.1.0 and core package 0.1.0 resolve to `e3aeafc3ebf4e1d3ab9082446b3b42eda1f20b23`; the current production deployment `dpl_EzinWRAaunh9SRtpdQNVDwHb5Ym4` was created from fixed implementation commit `fd742d2aaf6ee91a855fdfc60cd355247786499e`.
- [x] Recheck the live Vercel form and map its current 14 fields in [answers.md](answers.md).
- [x] Check the claims ledger before copying any impact statement.

The final packet must replace every unchecked external item with a dated URL or command artifact. It must not claim Vercel selection or MySched production adoption.
