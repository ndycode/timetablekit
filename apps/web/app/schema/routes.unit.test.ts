import {
  timetableAgentCapabilitiesJsonSchema,
  timetableAgentInputJsonSchema,
  timetableAgentOutputJsonSchema,
} from "@ndycode/timetablekit-agent";
import { describe, expect, it } from "vitest";
import { GET as getAgentCapabilities } from "./agent-capabilities.schema.json/route";
import { GET as getAgentInput } from "./agent-input.schema.json/route";
import { GET as getAgentOutput } from "./agent-output.schema.json/route";

describe("agent schema routes", () => {
  it.each([
    [getAgentInput, timetableAgentInputJsonSchema],
    [getAgentOutput, timetableAgentOutputJsonSchema],
    [getAgentCapabilities, timetableAgentCapabilitiesJsonSchema],
  ] as const)("returns the package schema", async (get, schema) => {
    const response = get();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    await expect(response.json()).resolves.toEqual(schema);
  });
});
