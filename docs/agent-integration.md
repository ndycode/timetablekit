# Agent integration

TimetableKit has a framework-neutral agent boundary in
`@ndycode/timetablekit-agent`. The package keeps agent concerns outside the
parser core, so MCP servers, function-calling adapters, and process runners can
share the same contract.

## Tool contract

The tool name is `timetablekit.parse`. A request is JSON and has
`schemaVersion: "1"` plus an `input`. Text and CSV inputs carry text directly.
Image and PDF inputs carry bounded base64 bytes because `Uint8Array` is not a
JSON wire type. The default tool advertises and accepts text and CSV only. A
host must inject a parser and declare its supported `inputKinds` before binary
input is advertised or accepted. An injected parser with no declaration
advertises no input kinds.

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

The success response is `{ ok: true, result, assessment }`. `result` is the
normal versioned `TimetableParseResult` with schema version `1.0`. `assessment`
is the typed core assessment with `status: "usable" | "unusable"` and fixed
reasons. Agents should branch on that field. They do not need to duplicate
warning prose rules. Failures contain a stable error code, a short safe
message, a retry hint, and optional non-content details. The boundary never
logs the request. Event IDs and content are deterministic for the same input
and configuration. Timing metadata such as duration can vary.

## Capability discovery

`getTimetableAgentCapabilities()` returns the frozen default snapshot. Each
created tool exposes a matching frozen `capabilities` snapshot and `definition`.
The snapshot lists effective input kinds, max input and output bytes, max
request and response bytes, max input lines, timeout, image pixels, PDF pages,
the effective JSONL line limit, and whether the host allows recovery plus its
consent requirement. Provider health is checked during each invocation. These
definitions are plain objects and do not require an agent SDK.

The default limits are the core limits. Hosts can lower or raise them through
`createTimetableAgentTool({ limits })`, set independent request and response
byte ceilings, and set the structural text line limit through `maxInputLines`.
The default line limit is 5,000. Binary data is checked before base64 decoding
allocates the byte array. JSONL input and output lines are bounded. The
`maxProtocolLineBytes` value is the total wire-line limit, including the LF
terminator when present. A terminated payload is accepted only when its payload
bytes plus one LF byte fit the limit. An EOF payload without LF may use all
limit bytes. The protocol line limit must be at least 256 bytes.

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
next newline. Oversized responses return a bounded `OUTPUT_TOO_LARGE` error,
then continue with later requests. Blank lines are ignored. Request IDs are
optional. Missing and explicit `null` IDs return `null`; accepted IDs are
limited to 256 UTF-8 bytes or safe integers. Invalid IDs return a null ID with
`INVALID_REQUEST`. If an accepted ID cannot fit an oversized-response fallback,
that fallback uses a null ID and the stream continues. The CLI does not read
paths or fetch URLs in agent mode.

## Why this boundary exists

The core parser already has the right execution properties for agents. It has
typed provider interfaces, cancellation, resource limits, deterministic
event content, warnings, conflicts, and a versioned result schema. The agent package
adds only the missing wire shape and capability discovery. It does not add a
model dependency or move parsing policy into a transport adapter.

## Design decision

Three shapes were considered. A CLI-only JSONL mode would help shell agents but
would duplicate the contract for MCP and function-calling hosts. A broad
protocol package would couple the public API to one transport. The selected
shape is the small agent package with a thin CLI JSONL adapter. This keeps the
tool definition reusable, keeps transport policy outside core, and makes the
process path observable without requiring an agent SDK.
