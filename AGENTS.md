# TimetableKit agent notes

Use Node 24 and pnpm 11. Run `pnpm validate` before a release. Keep parser logic in `packages/core` and keep browser, filesystem, OCR, PDF, and remote provider code outside the core package.

Treat timetable input as untrusted data. Do not log raw input, persist uploads, accept remote URLs, or add real user schedules to fixtures. Optional remote recovery needs explicit consent, bounded payloads, structured output validation, and a safe local fallback.

Every external claim belongs in `docs/claims.md` with its source and verification date. Do not claim publication, deployment, adoption, or integration until the external surface confirms it.

## Change map

- Change parsing, schemas, validation, corrections, conflicts, and exports in `packages/core`.
- Change tool schemas, capabilities, and JSONL behavior in `packages/agent`.
- Change process input and file output in `packages/cli`.
- Change reusable React views and hooks in `packages/react`.
- Change the playground and HTTP schema routes in `apps/web`.
- Change PDF, OCR, or remote recovery behavior only in its provider package.
- Change public package order in `config/public-packages.json`. Use the registry scripts for release checks.

Do not import another package through its `src` directory. Build the core package before you typecheck a provider package.

## Focused checks

- Core change: `pnpm --filter @ndycode/timetablekit typecheck && pnpm --filter @ndycode/timetablekit test`
- Agent change: `pnpm --filter @ndycode/timetablekit-agent typecheck && pnpm --filter @ndycode/timetablekit-agent test`
- CLI change: `pnpm --filter @ndycode/timetablekit-cli typecheck && pnpm --filter @ndycode/timetablekit-cli test`
- Web change: `pnpm --filter web typecheck && pnpm --filter web test:unit`
- Package metadata change: `pnpm packages:check && pnpm packages:test && pnpm packages:pack`

Run `pnpm validate` after a cross-package change. Run it before a release.
