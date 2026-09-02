import { timetableAgentOutputJsonSchema } from "@ndycode/timetablekit-agent";

export function GET(): Response {
  return Response.json(timetableAgentOutputJsonSchema, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
