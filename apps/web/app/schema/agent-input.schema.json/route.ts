import { timetableAgentInputJsonSchema } from "@ndycode/timetablekit-agent";

export function GET(): Response {
  return Response.json(timetableAgentInputJsonSchema, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
