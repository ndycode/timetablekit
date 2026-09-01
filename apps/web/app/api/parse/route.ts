import { parseTimetable, toJSON } from "@ndycode/timetablekit";
import type { ParseOptions } from "@ndycode/timetablekit";

export const dynamic = "force-dynamic";

const MAX_REMOTE_TEXT_BYTES = 200_000;
const MAX_REQUEST_BYTES = 256_000;
const MAX_RESPONSE_BYTES = 5_000_000;
const MAX_ACTIVE_REQUESTS = 4;
const REQUEST_TIMEOUT_MS = 15_000;
let activeRequests = 0;

class RequestBodyTooLargeError extends Error {}

class RequestTimedOutError extends Error {}

class RequestAbortedError extends Error {}

async function readBoundedBody(
  request: Request,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (signal.aborted) {
    const reason = signal.reason;
    throw reason instanceof Error ? reason : new RequestAbortedError();
  }
  if (request.body === null) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      if (signal.aborted) {
        const reason = signal.reason;
        throw reason instanceof Error ? reason : new RequestAbortedError();
      }
      const next = await new Promise<ReadableStreamReadResult<Uint8Array>>(
        (resolve, reject) => {
          const onAbort = () => {
            void reader.cancel().catch(() => undefined);
            const reason = signal.reason;
            reject(
              reason instanceof Error ? reason : new RequestAbortedError(),
            );
          };
          signal.addEventListener("abort", onAbort, { once: true });
          void reader.read().then(
            (value) => {
              signal.removeEventListener("abort", onAbort);
              resolve(value);
            },
            (error: unknown) => {
              signal.removeEventListener("abort", onAbort);
              reject(error);
            },
          );
        },
      );
      if (next.done) break;
      totalBytes += next.value.byteLength;
      if (totalBytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

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
  if (request.signal.aborted) return new Response(null, { status: 499 });
  if (activeRequests >= MAX_ACTIVE_REQUESTS) {
    return Response.json(
      { error: "The app is busy. Try again soon." },
      {
        status: 429,
        headers: { "Retry-After": "1", "Cache-Control": "no-store" },
      },
    );
  }
  activeRequests += 1;
  const controller = new AbortController();
  let timedOut = false;
  let clientDisconnected = false;
  const onRequestAbort = () => {
    clientDisconnected = true;
    controller.abort(new RequestAbortedError());
  };
  if (request.signal.aborted) {
    onRequestAbort();
  } else {
    request.signal.addEventListener("abort", onRequestAbort, { once: true });
  }
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new RequestTimedOutError());
  }, REQUEST_TIMEOUT_MS);
  try {
    const contentLength = request.headers.get("content-length");
    if (
      contentLength !== null &&
      Number.isFinite(Number(contentLength)) &&
      Number(contentLength) > MAX_REQUEST_BYTES
    ) {
      return Response.json(
        { error: "That request is too large." },
        { status: 413 },
      );
    }
    const requestBody = await readBoundedBody(request, controller.signal);
    const payload: unknown = JSON.parse(new TextDecoder().decode(requestBody));
    if (!isRecord(payload) || typeof payload["text"] !== "string") {
      return Response.json(
        { error: "Send a JSON object with a text field." },
        { status: 400 },
      );
    }
    const text = payload["text"];
    if (new TextEncoder().encode(text).byteLength > MAX_REMOTE_TEXT_BYTES) {
      return Response.json(
        { error: "That text is too large." },
        { status: 413 },
      );
    }
    if (
      payload["kind"] !== undefined &&
      payload["kind"] !== "text" &&
      payload["kind"] !== "csv"
    ) {
      return Response.json(
        { error: "The kind must be text or CSV." },
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
    const result = await parseTimetable(input, {
      ...optionsFromPayload(payload),
      signal: controller.signal,
    });
    const serialized = toJSON(result);
    if (new TextEncoder().encode(serialized).byteLength > MAX_RESPONSE_BYTES) {
      return Response.json(
        { error: "The result is too large." },
        { status: 413 },
      );
    }
    return Response.json(JSON.parse(serialized), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (clientDisconnected) return new Response(null, { status: 499 });
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json(
        { error: "That request is too large." },
        { status: 413 },
      );
    }
    if (timedOut) {
      return Response.json(
        { error: "The request took too long." },
        { status: 504 },
      );
    }
    const message =
      error instanceof Error
        ? error.message
        : "We could not read the schedule.";
    return Response.json({ error: message }, { status: 400 });
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", onRequestAbort);
    activeRequests -= 1;
  }
}
