# @ndycode/timetablekit-provider-vercel-ai

This package is an optional structured recovery adapter. It is disabled by
default and only calls a model when the caller sets both `enabled: true` and
`consent: true`. It accepts a core `RecoveryRequest`, sends only its unresolved
fields, validates the response with a strict Zod schema, and applies request,
timeout, and output-size bounds.

The `transport` option is a deterministic test seam. Without it, the package
uses the Vercel AI SDK and the caller-supplied language model. This provider is
never part of local deterministic parsing unless the caller explicitly wires
it in.
