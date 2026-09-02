# Providers

Providers are capability boundaries. Extraction providers report supported input kinds through `supports`; all providers accept an abort signal and resource limits, report progress when work is observable, and return structured output or a structured error. The core parser owns the parse-wide deadline; providers must honor the signal and limits they receive.

The local deterministic provider is always available for text and CSV. The PDF.js provider extracts text or renders bounded pages for OCR. The Tesseract provider is lazy-loaded in the browser. The optional recovery provider is disabled by default and must receive only unresolved fields after explicit consent.

The workspace provider packages are `@ndycode/timetablekit-provider-pdfjs`, `@ndycode/timetablekit-provider-tesseract`, and `@ndycode/timetablekit-provider-vercel-ai`. Their package metadata and publish order are checked by `pnpm packages:check`; that local registry does not assert external publication.

Provider tests use deterministic fakes. They verify support declarations, cancellation, bounded work, immutability, confidence, and structured failures without contacting a remote service.
