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
    expect(parseTime("1900")).toEqual({
      kind: "ok",
      time: "19:00",
      ambiguous: false,
    });
    expect(parseTime("900")).toEqual({
      kind: "ok",
      time: "09:00",
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
    expect(parseTimeRange("Monday 1900-2000")).toMatchObject({
      kind: "ok",
      startTime: "19:00",
      endTime: "20:00",
      ambiguous: false,
    });
    expect(parseTimeRange("Monday 900-1000")).toMatchObject({
      kind: "ok",
      startTime: "09:00",
      endTime: "10:00",
      ambiguous: false,
    });
    expect(parseTimeRange("Monday 900-930")).toMatchObject({
      kind: "ok",
      startTime: "09:00",
      endTime: "09:30",
      ambiguous: false,
    });
    expect(parseTimeRange("Monday 0000-0100")).toMatchObject({
      kind: "ok",
      startTime: "00:00",
      endTime: "01:00",
      ambiguous: false,
    });
    expect(parseTimeRange("Monday 0400-0500")).toMatchObject({
      kind: "ok",
      startTime: "04:00",
      endTime: "05:00",
      ambiguous: false,
    });
    expect(parseTimeRange("Monday 0837-0942")).toMatchObject({
      kind: "ok",
      startTime: "08:37",
      endTime: "09:42",
      ambiguous: false,
    });
    expect(parseTimeRange("Monday 0900-0905")).toMatchObject({
      kind: "ok",
      startTime: "09:00",
      endTime: "09:05",
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

  it("prefers clock ranges over academic years and room numbers", () => {
    expect(parseTimeRange("AY 2025-2026 Monday 9-10")).toMatchObject({
      kind: "ok",
      startTime: "09:00",
      endTime: "10:00",
    });
    expect(parseTimeRange("Room 101-102 Monday 9-10")).toMatchObject({
      kind: "ok",
      startTime: "09:00",
      endTime: "10:00",
    });
    expect(parseTimeRange("Academic Year 2024-2025")).toEqual({
      kind: "none",
    });
    expect(parseTimeRange("Room 101-102")).toEqual({ kind: "none" });
    expect(parseTimeRange("AY 2025-2040")).toEqual({ kind: "none" });
    expect(parseTimeRange("Room 100-200")).toEqual({ kind: "none" });
    expect(parseTimeRange("Room 900-1000 Monday 11-12")).toMatchObject({
      kind: "ok",
      startTime: "11:00",
      endTime: "12:00",
    });
  });
});
