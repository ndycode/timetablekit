import { describe, expect, it } from "vitest";
import { formatTime, parseTime, parseTimeRange, timeToMinutes } from "../src";

describe("time parsing", () => {
  it("parses 12-hour and 24-hour values", () => {
    expect(parseTime("9:05 AM")).toEqual({
      kind: "ok",
      time: "09:05",
      ambiguous: false,
    });
    expect(parseTime("21:30")).toEqual({
      kind: "ok",
      time: "21:30",
      ambiguous: false,
    });
    expect(parseTime("9")).toEqual({
      kind: "ok",
      time: "09:00",
      ambiguous: true,
    });
  });

  it("applies a shared meridiem to compact ranges", () => {
    expect(parseTimeRange("9-10:30 AM")).toMatchObject({
      kind: "ok",
      startTime: "09:00",
      endTime: "10:30",
      ambiguous: false,
    });
  });

  it("rejects reversed or malformed values through canonical helpers", () => {
    expect(parseTime("25:00").kind).toBe("invalid");
    expect(parseTimeRange("9:00").kind).toBe("missing-end");
    expect(formatTime(23, 59)).toBe("23:59");
    expect(timeToMinutes("23:59")).toBe(1439);
    expect(timeToMinutes("24:00")).toBeUndefined();
  });
});
