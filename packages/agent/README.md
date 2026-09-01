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

The contract supports text, CSV, PNG, JPEG, WebP, and PDF input. Binary input
uses bounded base64 because agent tool calls are JSON. The default parser
handles text and CSV. A host must inject a parser with PDF or OCR providers for
binary parsing. Remote URLs are not accepted or fetched. The default path
remains deterministic and local.

`getTimetableAgentCapabilities()` returns the tool name and JSON Schema input
and output definitions. `runTimetableAgentProtocol()` provides a small JSONL
transport for shell agents and process supervisors. Each JSONL request has an
`id` and an `op` of `capabilities` or `parse`.

Remote recovery is disabled by default. A host must set
`allowRemoteRecovery: true` when constructing the tool, inject a recovery
provider, and still require the request's explicit recovery flags.

Errors use a stable `{ code, message, retryable, details? }` shape. Request,
input, output, provider, and parser failures are returned as data instead of
being thrown across the agent boundary. Raw input is never logged by this
package.
