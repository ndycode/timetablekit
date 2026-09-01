import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FieldValueSchema,
  SchemaValidationError,
  TimetableEventSchema,
  TimetableInputSchema,
  TimetableParseResultSchema,
  fieldValueSchema,
  parseTimetable,
  timetableEventSchema,
  timetableInputSchema,
  timetableParseResultSchema,
  timetableResultJsonSchema,
} from "../src";
import type { TimetableEvent, TimetableParseResult } from "../src";

const options = {
  locale: "en-PH",
  timezone: "Asia/Manila",
  evidence: "none" as const,
};

const packageSchema = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../schema/timetable-result.schema.json", import.meta.url),
    ),
    "utf8",
  ),
) as unknown;

describe("runtime schema boundaries", () => {
  it("keeps the TypeScript and package JSON schemas identical", () => {
    expect(timetableResultJsonSchema).toEqual(packageSchema);
  });

  it("accepts every supported input kind at both schema layers", async () => {
    const text = {
      kind: "text" as const,
      text: "Schema Entry; Monday; 09:00-10:00",
      filename: "schema.txt",
    };
    const csv = {
      kind: "csv" as const,
      text: "title,days,start,end\nSchema Entry,Monday,09:00,10:00",
      delimiter: "," as const,
    };
    const image = {
      kind: "image" as const,
      bytes: new Uint8Array([1, 2]),
      mimeType: "image/png" as const,
    };
    const pdf = {
      kind: "pdf" as const,
      bytes: new Uint8Array([3, 4]),
      mimeType: "application/pdf" as const,
    };

    for (const input of [text, csv, image, pdf]) {
      expect(TimetableInputSchema.safeParse(input)).toMatchObject({
        success: true,
      });
      expect(timetableInputSchema.safeParse(input)).toMatchObject({
        success: true,
      });
    }
    const result = await parseTimetable(text, options);
    const parsedEvent = result.events[0];
    expect(parsedEvent).toBeDefined();
    if (parsedEvent === undefined) return;
    expect(TimetableEventSchema.safeParse(parsedEvent)).toMatchObject({
      success: true,
    });
    expect(timetableEventSchema.safeParse(parsedEvent)).toMatchObject({
      success: true,
    });
    expect(TimetableParseResultSchema.safeParse(result)).toMatchObject({
      success: true,
    });
    expect(timetableParseResultSchema.safeParse(result)).toMatchObject({
      success: true,
    });
  });

  it("rejects malformed custom schemas with typed errors", () => {
    expect(TimetableInputSchema.safeParse(null).success).toBe(false);
    expect(TimetableInputSchema.safeParse([]).success).toBe(false);
    expect(TimetableInputSchema.safeParse({ kind: "text" }).success).toBe(
      false,
    );
    expect(
      TimetableInputSchema.safeParse({ kind: "csv", text: "x", delimiter: ":" })
        .success,
    ).toBe(false);
    expect(
      TimetableInputSchema.safeParse({
        kind: "image",
        bytes: [1],
        mimeType: "image/png",
      }).success,
    ).toBe(false);
    expect(
      TimetableInputSchema.safeParse({
        kind: "image",
        bytes: new Uint8Array(),
        mimeType: "image/gif",
      }).success,
    ).toBe(false);
    expect(
      TimetableInputSchema.safeParse({
        kind: "pdf",
        bytes: new Uint8Array(),
        mimeType: "text/plain",
      }).success,
    ).toBe(false);
    expect(() => TimetableInputSchema.parse({ kind: "unknown" })).toThrow(
      SchemaValidationError,
    );
    expect(TimetableEventSchema.safeParse(null).success).toBe(false);
    expect(TimetableEventSchema.safeParse({}).success).toBe(false);
    expect(TimetableParseResultSchema.safeParse(null).success).toBe(false);
    expect(FieldValueSchema.safeParse(null).success).toBe(false);
    expect(FieldValueSchema.safeParse({ kind: "unknown" }).success).toBe(false);
  });

  it("accepts rich zod event, warning, conflict, evidence, and stage shapes", async () => {
    const result = await parseTimetable(
      {
        kind: "text",
        text: "Rich Entry; Monday; 09:00-10:00",
        filename: "rich.txt",
      },
      options,
    );
    const event = result.events[0];
    expect(event).toBeDefined();
    if (event === undefined) return;
    const location = {
      page: 1,
      line: 1,
      charStart: 0,
      charEnd: 10,
      bounds: { x: 1, y: 2, width: 3, height: 4 },
    };
    const richEvent: TimetableEvent = {
      ...event,
      code: "RICH-101",
      eventType: "Lab",
      location: "Cedar",
      instructor: "Mira Vale",
      notes: "Synthetic note",
      fieldConfidence: { title: 1, code: 0.9 },
      evidence: {
        title: [
          {
            source: { kind: "text", filename: "rich.txt", pageCount: 1 },
            location,
            excerpt: "Rich Entry",
          },
        ],
      },
    };
    const richResult: TimetableParseResult = {
      ...result,
      events: [richEvent],
      warnings: [
        {
          code: "LOW_CONFIDENCE",
          severity: "warning",
          message: "Synthetic warning.",
          eventId: event.id,
          field: "title",
          source: location,
          details: { sample: true, count: 1 },
        },
      ],
      conflicts: [
        {
          code: "SCHEDULE_CONFLICT",
          id: "conflict-rich",
          eventIds: [event.id, "evt-other"],
          occurrence: { kind: "weekday", weekday: "MO" },
          overlap: { startsAt: "09:00", endsAt: "09:30" },
        },
      ],
      parse: {
        ...result.parse,
        stageReports: [
          {
            stage: "normalize",
            status: "completed",
            durationMs: 0,
            warningCount: 1,
            providerId: "synthetic",
          },
        ],
      },
    };
    expect(timetableEventSchema.parse(richEvent)).toEqual(richEvent);
    expect(timetableParseResultSchema.parse(richResult)).toEqual(richResult);
    expect(fieldValueSchema.parse("value")).toBe("value");
    expect(fieldValueSchema.parse(["MO", "TU"])).toEqual(["MO", "TU"]);
    expect(
      fieldValueSchema.parse({ kind: "weekly", weekdays: ["MO"] }),
    ).toEqual({ kind: "weekly", weekdays: ["MO"] });
    expect(
      fieldValueSchema.parse({ kind: "exact", exactDates: ["2026-09-01"] }),
    ).toEqual({ kind: "exact", exactDates: ["2026-09-01"] });
  });

  it("rejects invalid zod refinements and strict objects", () => {
    expect(
      timetableInputSchema.safeParse({ kind: "text", text: "x", extra: true })
        .success,
    ).toBe(false);
    expect(
      timetableInputSchema.safeParse({
        kind: "image",
        bytes: new Uint8Array(),
        mimeType: "image/png",
        extra: true,
      }).success,
    ).toBe(false);
    expect(
      timetableEventSchema.safeParse({
        id: "evt-invalid",
        title: "Invalid",
        schedule: { kind: "weekly", weekdays: [] },
        startTime: "25:00",
        endTime: "09:00",
        timezone: "UTC",
        confidence: 2,
        fieldConfidence: {},
        evidence: {},
      }).success,
    ).toBe(false);
    expect(
      timetableEventSchema.safeParse({
        id: "evt-invalid",
        title: "Invalid",
        schedule: { kind: "exact", exactDates: [] },
        startTime: "09:00",
        endTime: "10:00",
        timezone: "UTC",
        confidence: 0.5,
        fieldConfidence: { title: 2 },
        evidence: {},
      }).success,
    ).toBe(false);
    expect(
      fieldValueSchema.safeParse({ kind: "weekly", weekdays: ["XX"] }).success,
    ).toBe(false);
  });
});
