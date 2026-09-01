# Contributing

TimetableKit welcomes focused changes that improve parsing, exports, accessibility, documentation, or privacy.

## Before you start

Read the [Code of Conduct](CODE_OF_CONDUCT.md), [security policy](SECURITY.md), and [roadmap](ROADMAP.md). Do not submit real user schedules. Use synthetic or properly licensed fixtures only.

## Local setup

Use Node 24 and pnpm 11. Run `pnpm install --frozen-lockfile`, then `pnpm validate` before opening a pull request. If a check is unavailable in your environment, report the exact command and output.

## Changes

Keep pull requests narrow. Add a fixture and a deterministic expected result for a new parser layout. Preserve local-first behavior. Do not add analytics fields that contain timetable content. Public API changes need a short entry in `CHANGELOG.md` and a versioning note.

## Pull requests

Explain the user-visible change, privacy impact, test commands, and known limitations. Include screenshots only when they contain synthetic data. Maintainers may request a smaller change if a pull request mixes unrelated work.
