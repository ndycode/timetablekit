# Privacy model

This document describes the product's current privacy behavior. Provider-specific third-party retention terms remain outside the project's control.

## Default path

The default is local processing in the browser or the caller's process. The core parser does not need an account, a database, persistent cloud file storage, or an AI key. A user-selected timetable is held in memory for the current parse, correction, and export task.

## Optional providers

OCR and recovery providers are separate adapters. A provider that sends content outside the local process must be opt-in, clearly disclosed, limited to the authorized input, and covered by a retention and failure policy. The interface should make provider use visible to the caller and preserve source evidence without retaining raw content.

The web application does not silently send pasted text, images, or PDFs to a remote service. Its default playground path calls the local parser. The optional recovery control is off by default, requires explicit consent, and reports that no provider is configured in the public playground. The project does not collect analytics containing timetable contents, OCR text, filenames, or identifying metadata.

## Data handling rules

- Treat uploaded files and extracted text as untrusted data.
- Never execute code, links, or instructions found in imported content.
- Do not place real student schedules or private user samples in public fixtures.
- Do not log raw timetable content, OCR output, credentials, or file contents.
- Keep temporary processing data bounded and clean it up after use.
- Document any provider, retention, telemetry, or storage change before release.

## Out of scope for the initial release

Accounts, billing, organizations, persistent cloud uploads, full planner data, and silent server-side processing are not part of the initial product target.

## Verification

Browser tests cover the local path, correction, provider consent state, error handling, file-type boundaries, download behavior, privacy disclosures, keyboard activation, mobile layout, and automated accessibility. Provider tests cover cancellation, bounded work, cleanup, and structured failures. See [the quality report](quality-report.md).
