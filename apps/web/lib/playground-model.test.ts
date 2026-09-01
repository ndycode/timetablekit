import { describe, expect, it } from "vitest";
import { parseTimetable } from "@ndycode/timetablekit";
import {
  agendaGroupsForResult,
  applyEventCorrection,
  createInitialPlaygroundState,
  currentInputForSource,
  issueTitle,
  playgroundReducer,
  warningsForResult,
} from "./playground-model";

const parseOptions = {
  locale: "en-PH",
  timezone: "Asia/Manila",
};

describe("playground model", () => {
  it("keeps the selected source and input together", () => {
    let state = createInitialPlaygroundState();
    state = playgroundReducer(state, { type: "tab-changed", tab: "paste" });
    state = playgroundReducer(state, {
      type: "paste-text-changed",
      text: "Practice; Monday; 09:00-10:00",
    });
    expect(state.source).toEqual({
      kind: "paste",
      text: "Practice; Monday; 09:00-10:00",
    });
    expect(currentInputForSource(state.source)).toMatchObject({
      kind: "text",
      text: "Practice; Monday; 09:00-10:00",
    });

    state = playgroundReducer(state, { type: "tab-changed", tab: "sample" });
    expect(currentInputForSource(state.source)).toMatchObject({
      kind: "text",
    });
    expect(currentInputForSource(state.source)).not.toMatchObject({
      text: "Practice; Monday; 09:00-10:00",
    });

    state = playgroundReducer(state, { type: "tab-changed", tab: "upload" });
    expect(currentInputForSource(state.source)).toBeUndefined();

    state = playgroundReducer(state, {
      type: "file-selected",
      input: {
        kind: "text",
        text: "Uploaded; Friday; 12:00-13:00",
        filename: "uploaded.txt",
      },
      label: "uploaded.txt",
    });
    expect(currentInputForSource(state.source)).toMatchObject({
      text: "Uploaded; Friday; 12:00-13:00",
    });
    state = playgroundReducer(state, {
      type: "file-rejected",
      message: "Choose a TXT, CSV, image, or PDF file.",
    });
    expect(currentInputForSource(state.source)).toBeUndefined();
  });

  it("recalculates conflicts and removes stale validation warnings after edits", async () => {
    const result = await parseTimetable(
      {
        kind: "text",
        text: "Alpha; Monday; 09:00-10:00\nBeta; Monday; 09:30-10:30",
      },
      parseOptions,
    );
    const firstEvent = result.events[0];
    expect(firstEvent).toBeDefined();
    if (firstEvent === undefined) return;

    const corrected = applyEventCorrection(result, {
      eventId: firstEvent.id,
      field: "endTime",
      value: "09:15",
    });
    expect(corrected.conflicts).toHaveLength(0);
    expect(
      warningsForResult(corrected).some(
        (warning) => warning.code === "SCHEDULE_CONFLICT",
      ),
    ).toBe(false);
  });

  it("preserves source-row warnings for rejected candidates after edits", async () => {
    const result = await parseTimetable(
      {
        kind: "text",
        text: "Alpha; Monday; 09:00-10:00\n; Monday; 10:00-11:00",
      },
      parseOptions,
    );
    const event = result.events[0];
    expect(event).toBeDefined();
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MISSING_TITLE",
          source: expect.anything(),
        }),
      ]),
    );
    if (event === undefined) return;

    const corrected = applyEventCorrection(result, {
      eventId: event.id,
      field: "title",
      value: "Updated Alpha",
    });

    expect(corrected.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MISSING_TITLE",
          source: expect.anything(),
        }),
      ]),
    );
  });

  it("shows exact dates, multiple weekdays, and unscheduled events in preview groups", async () => {
    const exact = await parseTimetable(
      {
        kind: "text",
        text: "Project Review; 2026-09-14; 10:00-11:00; Room Juniper",
      },
      parseOptions,
    );
    const multiple = await parseTimetable(
      {
        kind: "text",
        text: "Studio Practice; Monday, Wednesday, Friday; 08:30-09:45; Room Indigo",
      },
      parseOptions,
    );
    expect(agendaGroupsForResult(exact).map((group) => group.label)).toContain(
      "2026-09-14",
    );
    expect(agendaGroupsForResult(multiple).map((group) => group.label)).toEqual(
      ["Monday", "Wednesday", "Friday"],
    );

    const unscheduled = {
      ...exact,
      events: exact.events.map((event) => ({
        ...event,
        schedule: { kind: "exact" as const, exactDates: [] },
      })),
    };
    expect(
      agendaGroupsForResult(unscheduled).map((group) => group.label),
    ).toContain("Unscheduled");
  });

  it("deduplicates conflict display warnings and formats their title", async () => {
    const result = await parseTimetable(
      {
        kind: "text",
        text: "Alpha; Monday; 09:00-10:00\nBeta; Monday; 09:30-10:30",
      },
      parseOptions,
    );
    const conflictWarnings = warningsForResult(result).filter(
      (warning) => warning.code === "SCHEDULE_CONFLICT",
    );
    expect(conflictWarnings).toHaveLength(result.conflicts.length);
    expect(conflictWarnings[0]).toBeDefined();
    if (conflictWarnings[0] !== undefined) {
      expect(issueTitle(conflictWarnings[0])).toBe("Time conflict");
    }
  });
});
