import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("parse route request boundary", () => {
  it("returns 499 without parsing an already-aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    const response = await POST(
      new Request("http://localhost/api/parse", {
        method: "POST",
        body: JSON.stringify({ text: "Synthetic; Monday; 09:00-10:00" }),
        signal: controller.signal,
      }),
    );

    expect(response.status).toBe(499);
  });
});
