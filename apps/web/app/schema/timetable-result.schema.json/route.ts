import { timetableResultJsonSchema } from "@ndycode/timetablekit";

export function GET(): Response {
  return Response.json(timetableResultJsonSchema, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
