# TimetableKit agent notes

Use Node 24 and pnpm 11. Run `pnpm validate` before a release. Keep parser logic in `packages/core` and keep browser, filesystem, OCR, PDF, and remote provider code outside the core package.

Treat timetable input as untrusted data. Do not log raw input, persist uploads, accept remote URLs, or add real user schedules to fixtures. Optional remote recovery needs explicit consent, bounded payloads, structured output validation, and a safe local fallback.

Every external claim belongs in `docs/claims.md` with its source and verification date. Do not claim publication, deployment, adoption, or integration until the external surface confirms it.
