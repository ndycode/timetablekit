# Agent integration

TimetableKit has a framework-neutral agent boundary in
`@ndycode/timetablekit-agent`. The package keeps agent concerns outside the
parser core, so MCP servers, function-calling adapters, and process runners can
share the same contract.

## Tool contract

The tool name is `timetablekit.parse`. A request is JSON and has
`schemaVersion: "1"` plus an `input`. Text and CSV inputs carry text directly.
Image and PDF inputs carry bounded base64 bytes because `Uint8Array` is not a
JSON wire type. The default tool parses text and CSV. Hosts must inject a
parser with the PDF.js or OCR providers to process binary input.

```ts
import { createTimetableAgentTool } from "@ndycode/timetablekit-agent";

const tool = createTimetableAgentTool();
const response = await tool.invoke({
  schemaVersion: "1",
  input: { kind: "text", text: rawText },
  options: {
    locale: "en-PH",
    timezone: "Asia/Manila",
    evidence: "none",
  },
});
```

The success response contains the normal versioned `TimetableParseResult`.
`ok: true` means the parser completed and returned a schema-valid result. It
does not mean that events were found or that every field is certain. Agents
must inspect `warnings`, including `NO_EVENTS_FOUND` and
`UNSUPPORTED_PROVIDER`, and treat zero events or any warning with
`severity: "error"` as an unusable parse before taking action. Failures contain
a stable error code, a short safe message, a retry hint, and optional
non-content details. The boundary never logs the request.

## Capability discovery

`getTimetableAgentCapabilities()` returns the protocol version, tool name,
description, and JSON Schema input and output definitions. These definitions are
plain objects and do not require an agent SDK.

The default limits are the core limits. Hosts can lower or raise them through
`createTimetableAgentTool({ limits })`, set independent request and response
byte ceilings, and lower the default 100,000-line text limit through
`maxInputLines`. Binary data is checked before base64 decoding allocates the
byte array. JSONL input and output lines are bounded. The protocol line limit
must be at least 256 bytes.

Remote recovery remains opt-in. A host must inject a parser with a recovery
provider and set `allowRemoteRecovery: true`. A request must also explicitly
set both `options.recovery.enabled` and `options.recovery.consent`. The request
cannot grant remote-recovery permission by itself.

## JSONL process transport

The CLI exposes the same contract through `timetablekit agent`. It reads one
JSON request per line and writes one JSON response per line.

```sh
printf '%s\n' \
  '{"id":"1","op":"capabilities"}' \
  '{"id":"2","op":"parse","request":{"schemaVersion":"1","input":{"kind":"text","text":"Math Monday 09:00-10:00"}}}' \
  | timetablekit agent
```

Malformed lines and invalid UTF-8 lines return structured non-retryable errors
and do not terminate the stream. Oversized lines are discarded through their
next newline. Oversized responses return a bounded `OUTPUT_TOO_LARGE` error.
Blank lines are ignored. Request IDs are limited to 256 UTF-8 bytes. The CLI
does not read paths or fetch URLs in agent mode.

## Why this boundary exists

The core parser already has the right execution properties for agents. It has
typed provider interfaces, cancellation, resource limits, deterministic
outputs, warnings, conflicts, and a published result schema. The agent package
adds only the missing wire shape and capability discovery. It does not add a
model dependency or move parsing policy into a transport adapter.

## Design decision

Three shapes were considered. A CLI-only JSONL mode would help shell agents but
would duplicate the contract for MCP and function-calling hosts. A broad
protocol package would couple the public API to one transport. The selected
shape is the small agent package with a thin CLI JSONL adapter. This keeps the
tool definition reusable, keeps the core unchanged, and makes the process path
observable without requiring an agent SDK.
