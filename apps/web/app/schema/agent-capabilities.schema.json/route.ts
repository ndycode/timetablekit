import { timetableAgentCapabilitiesJsonSchema } from "@ndycode/timetablekit-agent";

export function GET(): Response {
  return Response.json(timetableAgentCapabilitiesJsonSchema, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
