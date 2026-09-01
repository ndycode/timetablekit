import { parseTimetable, toJSON } from "@ndycode/timetablekit";
import type { ParseOptions } from "@ndycode/timetablekit";

export const dynamic = "force-dynamic";

const MAX_REMOTE_TEXT_BYTES = 200_000;
const MAX_REQUEST_BYTES = 256_000;
const MAX_ACTIVE_REQUESTS = 4;
let activeRequests = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionsFromPayload(payload: Record<string, unknown>): ParseOptions {
  const locale =
    typeof payload["locale"] === "string" && payload["locale"].length > 0
      ? payload["locale"]
      : "en-PH";
  const timezone =
    typeof payload["timezone"] === "string" && payload["timezone"].length > 0
      ? payload["timezone"]
      : "UTC";
  return { locale, timezone, evidence: "none" };
}

function csvDelimiter(value: unknown): "," | ";" | "\t" | undefined {
  return value === "," || value === ";" || value === "\t" ? value : undefined;
}

export async function POST(request: Request): Promise<Response> {
  if (activeRequests >= MAX_ACTIVE_REQUESTS) {
    return Response.json(
      { error: "The parser is busy. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": "1", "Cache-Control": "no-store" },
      },
    );
  }
  activeRequests += 1;
  try {
    const requestBody = await request.arrayBuffer();
    if (requestBody.byteLength > MAX_REQUEST_BYTES) {
      return Response.json(
        { error: "The remote request is too large." },
        { status: 413 },
      );
    }
    const payload: unknown = JSON.parse(new TextDecoder().decode(requestBody));
    if (!isRecord(payload) || typeof payload["text"] !== "string") {
      return Response.json(
        { error: "Send a JSON object with a text string." },
        { status: 400 },
      );
    }
    const text = payload["text"];
    if (new TextEncoder().encode(text).byteLength > MAX_REMOTE_TEXT_BYTES) {
      return Response.json(
        { error: "The remote text request is too large." },
        { status: 413 },
      );
    }
    if (
      payload["kind"] !== undefined &&
      payload["kind"] !== "text" &&
      payload["kind"] !== "csv"
    ) {
      return Response.json(
        { error: "The kind must be text or csv." },
        { status: 400 },
      );
    }
    const inputKind = payload["kind"] === "csv" ? "csv" : "text";
    const delimiter = csvDelimiter(payload["delimiter"]);
    const input =
      inputKind === "csv"
        ? delimiter === undefined
          ? { kind: "csv" as const, text }
          : { kind: "csv" as const, text, delimiter }
        : { kind: "text" as const, text };
    const result = await parseTimetable(input, optionsFromPayload(payload));
    return Response.json(JSON.parse(toJSON(result)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The timetable could not be parsed.";
    return Response.json({ error: message }, { status: 400 });
  } finally {
    activeRequests -= 1;
  }
}
