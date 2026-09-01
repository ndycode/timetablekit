# Architecture

TimetableKit is a pnpm workspace with a framework-independent core. The web application, React helpers, command-line interface, agent contract, and provider adapters depend on the core package rather than the other way around.

## Workspace boundaries

```text
apps/web          Vercel-hosted playground and documentation site
packages/core     schemas, parsing, normalization, validation, conflicts, exports
packages/agent    JSON-only agent tool contract, capabilities, and JSONL transport
packages/react    optional React correction and preview components
packages/cli      optional command-line interface
packages/provider-* provider adapters such as local OCR or optional remote recovery
fixtures          synthetic or redistributable parser inputs and golden outputs
examples           small consumer examples kept outside the core package
```

The core package owns the stable domain contract. Provider, UI, and agent packages add capabilities at the boundary and do not leak browser, filesystem, OCR, PDF, network, or model SDK dependencies into the core package.

## Data flow

1. An input boundary accepts pasted text or a user-selected file.
2. The boundary identifies the input kind and applies size and type limits.
3. A deterministic parser produces candidates with source evidence.
4. Normalization creates versioned schedule data.
5. Validation reports missing, ambiguous, invalid, duplicate, overlapping, and low-confidence values.
6. The user corrects the result before export.
7. JSON, CSV, or iCalendar output is generated from the corrected normalized data.

Image OCR, scanned-PDF OCR, and remote recovery are provider boundaries. They must be optional and must not be required for the deterministic text path.

The agent package is a transport boundary. It converts JSON requests, including
bounded base64 binary inputs, into core inputs and converts parser failures into
stable structured data. It does not fetch URLs or choose a model.

## Privacy boundary

The core is local-first. Raw timetable content remains in the calling process unless a caller explicitly enables a provider that needs remote processing. Providers expose their data flow, accept cancellation, return structured errors, and avoid persistent storage by default. See [the privacy model](privacy.md).

## Design constraints

- TypeScript remains strict at package boundaries.
- Core code must not depend on Next.js, React, Vercel, or a remote AI service.
- External input is parsed at the boundary and is never treated as executable content.
- Public fixtures are synthetic or have explicit redistribution rights.
- Export behavior is deterministic and documented. See [export semantics](exports.md).

## Verification

The root validation command runs formatting, source checks, type checking, unit and provider tests, coverage, fixture validation, builds, browser E2E, link validation, secret checks, and dependency license and vulnerability checks. The release quality report records the exact run and the separate production smoke result.
