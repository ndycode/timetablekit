# @ndycode/timetablekit-agent

This package exposes a framework-neutral, JSON-only tool contract for agents
that need to parse timetable content. It does not depend on MCP, a model SDK,
or a server framework.

```ts
import {
  createTimetableAgentTool,
  serializeTimetableAgentResponse,
} from "@ndycode/timetablekit-agent";

const tool = createTimetableAgentTool();
const response = await tool.invoke({
  schemaVersion: "1",
  input: {
    kind: "text",
    text: "Calculus Monday 09:00-10:30 Room 101",
  },
});

console.log(serializeTimetableAgentResponse(response));
```

The default contract supports text and CSV input. Binary input uses bounded
base64 because agent tool calls are JSON. A host must inject a parser and
declare its supported `inputKinds` before binary input is advertised or
accepted. An injected parser with no declaration advertises no input kinds.
Remote URLs are not accepted or fetched. The default path remains deterministic
and local.

`getTimetableAgentCapabilities()` returns the frozen default capability
snapshot. A tool also exposes its own frozen `capabilities` and matching
`definition`. Capabilities include effective input, request, response, line,
image, PDF, timeout, and output limits, plus whether the host allows remote
recovery and its consent requirement. Provider health is checked during each
invocation. `runTimetableAgentProtocol()` provides a small JSONL transport for
shell agents and process supervisors. `maxProtocolLineBytes` counts total wire
bytes, including LF for a terminated line. An EOF line without LF may use all
limit bytes.

The success response is `{ ok: true, result, assessment }`. `result` remains
the core `TimetableParseResult` with schema version `1.0`. `assessment` is
`{ status: "usable" | "unusable", reasons }`, derived by the core assessment
rule. Agents should branch on this typed field. They do not need to reimplement
warning prose rules. Event IDs and content are deterministic for the same
input and configuration. Timing metadata such as duration can vary.

Errors use a stable `{ code, message, retryable, details? }` shape. Request,
input, output, provider, and parser failures are returned as data instead of
being thrown across the agent boundary. Raw input is never logged by this
package. JSONL request IDs are optional. Missing and explicit `null` IDs are
returned as `null`; accepted IDs are bounded strings or safe integers. Invalid
IDs return a null ID with `INVALID_REQUEST`. String IDs can contain up to 256
UTF-8 bytes.

Remote recovery is disabled by default. A host must set
`allowRemoteRecovery: true` when constructing the tool, inject a recovery
provider, and still require the request's explicit recovery flags. A request
cannot grant recovery permission when the tool's capabilities do not allow it.
