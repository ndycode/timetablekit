# Agent readiness design

## Decision

Keep the existing package boundaries. Make core the single owner of trusted
domain data, result assessment, correction, and parse deadlines. Make the
agent package a configured JSON and JSONL adapter. Remove duplicate policies
and unused surfaces after their callers migrate.

This design uses the Daybreak candidate as its base. It includes Terra's
deadline cleanup and result-finalizer rules, plus Sol's field-discriminated
correction types, JSONL fallback invariants, and registry failure checks.

## Public behavior

### Core

- Keep `TimetableParseResult.schemaVersion` at `"1.0"`.
- Add `assessTimetableResult(result)` as the only usability rule.
- Return `usable` when the result has events and no error-severity warnings.
- Return `unusable` with fixed reasons `NO_EVENTS` and `ERROR_WARNINGS`.
- Add one field-discriminated `EventCorrection` type and one
  `applyEventCorrection` implementation.
- Preserve React's existing correction and warning helper names as direct
  re-exports from core.
- Validate input, options, provider artifacts, recovery output, correction
  values, parse results, and exporter inputs with authoritative Zod schemas.
- Preserve existing capitalized runtime-schema exports as adapters over those
  schemas. Delete the weaker parallel guard trees.

### Providers and execution

- Use one parse-wide deadline for extraction and recovery.
- Caller abort remains `ABORTED`. Deadline expiry is a typed timeout outcome.
- A parse must settle even when provider code ignores cancellation.
- Observe late promise rejection without consuming or logging the late value.
- Validate provider identity, nested warnings, pages, locations, and total
  structure before pipeline code reads them.
- Count recovery as used only when an accepted patch changes the result.
- Keep PDF, OCR, browser, filesystem, and remote code outside core.

### Agent and JSONL

- Keep protocol version `"1"`. Change the locally unverified agent success
  shape directly and do not add a legacy envelope.
- A success is `{ ok: true, result, assessment }`.
- `createTimetableAgentTool` owns a deeply immutable capability snapshot.
- Tool options declare supported input kinds. The default tool declares text
  and CSV. An injected parser with no declaration advertises no binary kinds.
- Capabilities expose effective request, response, input, line, image, PDF,
  timeout, and recovery limits.
- Invocation rejects kinds outside the same snapshot that generated its JSON
  schema.
- Request IDs remain bounded strings, safe integers, or null. Reject unsafe,
  fractional, infinite, negative-zero, object, and array IDs.
- Response fallback order is normal response, bounded `OUTPUT_TOO_LARGE` with
  the accepted ID, then the same bounded error with null ID.
- A response-size failure must not stop later JSONL requests.

### Web and package surfaces

- Add GET routes for agent input, output, and capability schemas. Route bodies
  must equal the package exports.
- Delete the unused `/api/parse` route after removing its internal tests and
  references. The first-party playground keeps local parsing.
- Add one ordered public-package registry for all seven current non-private
  package manifests.
- Use the registry for metadata checks, dry packing, release tag checks, and
  publish order. Do not publish during this work.
- Delete provider core-compat declarations after providers build against the
  emitted public core declarations.
- Delete the stale master plan after current instructions cover its live
  information.

## Compatibility choices

- Do not add assessment to persisted parse results or exports.
- Do not add a required `inputKinds` member to the public provider interface.
- Preserve safe numeric and null JSONL IDs.
- Preserve existing React helper names through direct exports, not wrappers.
- Do not mark current packages private without maintainer intent.
- Treat package publication, deployed routes, and unknown `/api/parse`
  consumers as unverified external facts.

## Implementation order

1. Authoritative core boundary schemas and adversarial tests.
2. Core result assessment, correction, and caller migration.
3. Parser, recovery, conflict, evidence, and deadline fixes.
4. Configured agent capabilities, schemas, assessment, and JSONL handling.
5. Agent schema routes and `/api/parse` deletion.
6. Provider build boundaries, package registry, release workflow, and docs.
7. Comment audit, independent review, full validation, and manual QA.

Each unit must pass its focused tests and build before the next dependent unit
starts. The final proof uses Node 24 and pnpm 11 and includes `pnpm validate`,
a library driver, a real JSONL process, local HTTP requests, and a browser
playground scenario.

## Rejected designs

- Embedding assessment in `TimetableParseResult`. It duplicates derived state
  and changes the stable result schema and every export.
- A new domain package. Core already owns the affected invariants.
- Mandatory provider `inputKinds`. It breaks custom providers for an agent-only
  discovery need.
- String-only IDs. Safe numeric and null IDs can round-trip exactly.
- A core-and-agent-only registry. The other five manifests currently present
  themselves as public, and no maintainer decision says to make them private.
- Retaining or adapting `/api/parse`. It is an unused second upload protocol
  with weaker validation.
- A warning-level `needs-review` state. Existing behavior defines only the
  export-blocking unusable rule.

## Known residual risks

- A non-cooperative provider may continue private work after the parser returns.
- Removing `/api/parse` could affect an unknown external caller. No such caller
  is proven by repository evidence.
- Real npm permissions, publication state, and deployed schema URLs require a
  separate dated external verification before release claims change.
