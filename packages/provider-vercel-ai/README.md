# @ndycode/timetablekit-provider-vercel-ai

This package is an optional structured recovery adapter. Create it with a
Vercel AI SDK `LanguageModel` and an explicit `consent: true` option, then pass
the provider to the core parser configuration. Core parsing remains local until
the parse options also set `recovery: { enabled: true, consent: true }`.

The adapter sends only unresolved fields from a core `RecoveryRequest`,
validates model output with a strict Zod schema, and enforces these optional
provider bounds: `maxFields`, `maxRequestBytes`, `maxResponseBytes`, and
`timeoutMs`. It uses the SDK `generateObject` call directly. Tests can mock the
SDK module; there is no `transport` or `enabled` provider option.
