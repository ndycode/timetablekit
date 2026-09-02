# API reference

The core package is `@ndycode/timetablekit`. The stable entry points are `parseTimetable`, `createTimetableParser`, `deterministicProvider`, `validateTimetable`, `detectConflicts`, `toJSON`, `toCSV`, and `toICS`.

The parser returns schema version `1.0`. Dates use `YYYY-MM-DD`, times use local `HH:mm`, weekdays use RFC 5545 two-letter values, and timezones use IANA names. See [architecture](architecture.md) for the domain boundary and [export semantics](exports.md) for serialization rules.

Binary providers and remote recovery are optional. The core package stays independent of React, Next.js, Node filesystem APIs, OCR libraries, PDF.js, and network clients.

The optional provider packages are `@ndycode/timetablekit-provider-pdfjs`,
`@ndycode/timetablekit-provider-tesseract`, and
`@ndycode/timetablekit-provider-vercel-ai`. The root package registry checks
their manifests, exports, and publish order. A passing local check does not
claim npm publication or deployment.

For agent and function-calling integrations, use
`@ndycode/timetablekit-agent`. `createTimetableAgentTool()` exposes the
`timetablekit.parse` definition, JSON Schema input and output contracts, a
structured `{ ok, result, assessment }` or `{ ok, error }` response, and
cancellation through an invocation context. `assessment` is the shared typed
usability result. Event IDs and content are deterministic for the same input and
configuration, while timing metadata can vary. `runTimetableAgentProtocol()`
provides the same contract over JSONL without coupling the project to an agent
SDK. JSONL IDs are optional, null-preserving, and bounded to safe integers or
short strings.
