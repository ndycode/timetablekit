export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    service: "timetablekit-web",
    version: "0.1.0",
  });
}
