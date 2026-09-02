# Testing plan

The repository uses layered tests. The release command is `pnpm validate`, and the quality report records its exact result.

## Current checks

```bash
pnpm install --frozen-lockfile
pnpm packages:check
pnpm packages:pack
pnpm validate
```

The package commands validate all seven non-private workspace manifests in publish order. `pnpm packages:pack` only enumerates dry-pack commands and never publishes. The root command checks formatting, forbidden source patterns, TypeScript, unit and provider tests, core coverage, fixture integrity, builds, Playwright across Chromium, Firefox, and WebKit, local Markdown targets, secret-like content, and dependency vulnerabilities and licenses. The browser suite starts the isolated web app on port 3417.

`pnpm validate:links` checks local Markdown targets, including provider README targets linked from the root repository map. It does not fetch external URLs.

## Test layers

- Unit tests for normalization, time parsing, schema boundaries, validation, conflicts, confidence, and exporters.
- Golden fixture tests for every public synthetic or licensed fixture.
- Property tests for parser invariants and exporter escaping.
- Provider contract tests for local OCR and optional remote recovery.
- Integration tests for the real package boundaries and file paths.
- Playwright scenarios for sample selection, correction, warnings, preview, and downloads.
- Accessibility checks for keyboard, screen reader semantics, focus, contrast, and responsive layouts.
- Security checks for malicious file names, oversized inputs, prompt or instruction injection in imported text, and secret leakage.

## Evidence rule

A passing command is not enough for a user-visible claim. Record the exact invocation, exit code, observable result, and artifact path. Fixture provenance and expected outputs must be reviewed before they enter the repository. Production behavior needs a separate HTTP smoke and browser observation against the deployed URL.
