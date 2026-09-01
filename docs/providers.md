# Providers

Providers are capability boundaries. A provider declares the input kinds it supports, accepts an abort signal and resource limits, reports progress, and returns structured output or a structured error.

The local deterministic provider is always available for text and CSV. The PDF.js provider extracts text or renders bounded pages for OCR. The Tesseract provider is lazy-loaded in the browser. The optional recovery provider is disabled by default and must receive only unresolved fields after explicit consent.

Provider tests use deterministic fakes. They verify support declarations, cancellation, timeout behavior, immutability, confidence, and structured failures without contacting a remote service.
