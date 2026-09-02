# Agent readiness grounding

## Scope and baseline

The repository has 389 tracked files, 102 TypeScript or JavaScript source files, 8 packages, 20 test files, and 189 synthetic fixture files. Four read-only audit agents covered core parsing, agent and CLI behavior, web and React behavior, providers, scripts, documentation, package metadata, and workflows.

`pnpm validate` passed at commit `8fb1db2` before this work began.

## Existing shape

`packages/core` owns the parser and result schema. Provider packages add PDF, OCR, and remote recovery. `packages/agent` wraps parsing in a JSON tool contract and JSONL protocol. `packages/cli` exposes file parsing and the JSONL process. `packages/react` and `apps/web` implement separate correction rules.

The code already has a useful agent package. A wholesale rewrite would discard working behavior. The refactor must remove proven failure paths and make the existing contract honest.

## Verified failures

1. Core has weak custom runtime guards beside stricter Zod schemas. The parser and exporters use the weak guards. Malformed input can throw a raw `TypeError`, and malformed events can reach JSON, CSV, and iCalendar exports.
2. Provider artifacts and recovery patches are not deeply validated. Malformed warnings and schedules can crash finalization. No-op recovery is reported as used.
3. `ResourceLimits.timeoutMs` is not enforced around extraction or recovery. A provider that never resolves can block parsing forever.
4. Text parsing treats course numbers and years as times. Metadata labels also match inside ordinary words. Evidence is emitted for fields that were not found. Exact-date conflicts ignore the selected term.
5. Agent capability discovery is static, mutable, and incomplete. The CLI advertises binary inputs that its configured parser cannot process. Effective limits and remote recovery availability are absent.
6. Agent success has no machine-readable result status. Every caller must repeat the prose rule for zero events and error warnings.
7. JSONL accepts unsafe numeric and missing request IDs. A large valid ID can make the oversized-response fallback terminate the stream.
8. The agent schemas advertise web URLs that have no matching routes in the repository.
9. Web and React duplicate correction and warning logic. The variants and optional-field behavior already differ. Agents cannot use correction logic without a UI package.
10. The HTTP parse route is unused by the first-party UI and defines a second, looser parse protocol.
11. Seven packages look publishable, but the release workflow publishes only core and agent. The release workflow also omits Playwright browser installation and defaults to a tag that predates the agent package.
12. Provider builds bypass public core declarations through three local compatibility files. The large tracked master plan contains stale paths and options that conflict with the current code.

## Constraints

- Keep parser rules in `packages/core`.
- Keep filesystem, browser, OCR, PDF, and remote provider code outside core.
- Treat every timetable, provider result, recovery patch, and JSON request as untrusted boundary data.
- Do not log raw timetable content, persist uploads, accept remote URLs, or enable remote recovery without host permission and request consent.
- Preserve the local deterministic path.
- Avoid UI redesign. Change web code only where it consumes shared domain rules or exposes agent schemas.
- Do not preserve internal duplicate APIs after callers move. Preserve published React names through direct re-exports when the behavior stays compatible.

## Completion predicate

The run is complete only when all of these checks pass.

1. Malformed core input, provider output, recovery output, and options return typed failures or safe warnings. They do not throw raw implementation errors.
2. Extraction and recovery stop at the configured parse deadline.
3. The agent tool reports configured input kinds, effective limits, and recovery availability through immutable capabilities.
4. Every successful agent parse includes one canonical result assessment.
5. JSONL request IDs round-trip exactly, and oversized responses do not stop later requests.
6. Agent schema routes return the same schemas exposed by package capability discovery.
7. Core, React, web, CLI, and agent callers use one result assessment and correction implementation.
8. Parser regressions for course codes, metadata boundaries, evidence, duplicate dates, and term-filtered conflicts have fixtures or focused tests.
9. Release and package checks consume one public-package registry.
10. Focused tests, package builds, `pnpm validate`, a JSONL process scenario, and local HTTP schema requests pass.
