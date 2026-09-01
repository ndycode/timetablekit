import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseTimetable } from "../src";
import type {
  EventSchedule,
  ParseOptions,
  TimetableEvent,
  TimetableInput,
} from "../src";

const fixturesRoot = fileURLToPath(
  new URL("../../../fixtures/", import.meta.url),
);

type FixtureManifest = {
  readonly id: string;
  readonly kind: "text" | "csv";
  readonly input: string;
  readonly expected: string;
  readonly filename: string;
  readonly delimiter?: "," | ";" | "\t";
  readonly options: ParseOptions;
};

type ExpectedFixture = {
  readonly source: Record<string, unknown>;
  readonly timezone: string;
  readonly locale: string;
  readonly events: readonly Record<string, unknown>[];
  readonly warningCodes: readonly string[];
  readonly conflicts: readonly Record<string, unknown>[];
};

type LoadedFixture = {
  readonly manifest: FixtureManifest;
  readonly expected: ExpectedFixture;
  readonly input: TimetableInput;
};

function eventShape(event: TimetableEvent): Record<string, unknown> {
  const shape: Record<string, unknown> = {
    title: event.title,
    schedule: event.schedule,
    startTime: event.startTime,
    endTime: event.endTime,
    timezone: event.timezone,
  };
  for (const field of [
    "code",
    "eventType",
    "location",
    "instructor",
    "notes",
  ] as const) {
    const value = event[field];
    if (value !== undefined) shape[field] = value;
  }
  return shape;
}

function conflictShape(conflict: {
  readonly occurrence: unknown;
  readonly overlap: unknown;
}): Record<string, unknown> {
  return { occurrence: conflict.occurrence, overlap: conflict.overlap };
}

function sortedJson(values: readonly unknown[]): readonly unknown[] {
  return [...values].sort((left, right) =>
    (JSON.stringify(left) ?? "").localeCompare(JSON.stringify(right) ?? ""),
  );
}

async function loadFixtures(): Promise<readonly LoadedFixture[]> {
  const manifestRoot = resolve(fixturesRoot, "manifests");
  const names = (await readdir(manifestRoot))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const fixtures: LoadedFixture[] = [];
  for (const name of names) {
    const manifest = JSON.parse(
      await readFile(resolve(manifestRoot, name), "utf8"),
    ) as FixtureManifest;
    if (manifest.kind !== "text" && manifest.kind !== "csv") continue;
    const inputText = await readFile(
      resolve(fixturesRoot, manifest.input),
      "utf8",
    );
    const expected = JSON.parse(
      await readFile(resolve(fixturesRoot, manifest.expected), "utf8"),
    ) as ExpectedFixture;
    const input: TimetableInput =
      manifest.kind === "csv"
        ? {
            kind: "csv",
            text: inputText,
            filename: manifest.filename,
            ...(manifest.delimiter === undefined
              ? {}
              : { delimiter: manifest.delimiter }),
          }
        : { kind: "text", text: inputText, filename: manifest.filename };
    fixtures.push({ manifest, expected, input });
  }
  return fixtures;
}

const fixtures = await loadFixtures();

describe("public synthetic fixtures", () => {
  it("has at least 30 manifest, input, and expected-output triplets", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(30);
  });

  it.each(fixtures.map((fixture) => [fixture.manifest.id, fixture] as const))(
    "matches the normalized golden output for %s",
    async (_id, fixture) => {
      const result = await parseTimetable(
        fixture.input,
        fixture.manifest.options,
      );
      const actualEvents = sortedJson(result.events.map(eventShape));
      const expectedEvents = sortedJson(fixture.expected.events);
      const actualWarnings = [...result.warnings]
        .map((warning) => warning.code)
        .sort();
      const expectedWarnings = [...fixture.expected.warningCodes].sort();
      const actualConflicts = sortedJson(result.conflicts.map(conflictShape));
      const expectedConflicts = sortedJson(fixture.expected.conflicts);

      expect({
        source: result.source,
        timezone: result.timezone,
        locale: result.locale,
      }).toEqual({
        source: fixture.expected.source,
        timezone: fixture.expected.timezone,
        locale: fixture.expected.locale,
      });
      expect(actualEvents).toEqual(expectedEvents);
      expect(actualWarnings).toEqual(expectedWarnings);
      expect(actualConflicts).toEqual(expectedConflicts);
    },
  );

  it("preserves evidence mode as a bounded, synthetic excerpt", async () => {
    const fixture = fixtures.find(
      (entry) => entry.manifest.id === "text-snippets",
    );
    expect(fixture).toBeDefined();
    if (fixture === undefined) return;
    const result = await parseTimetable(
      fixture.input,
      fixture.manifest.options,
    );
    const evidence = result.events[0]?.evidence;
    expect(evidence?.title?.[0]?.excerpt).toBe("Snippet Review");
    expect((evidence?.title?.[0]?.excerpt ?? "").length).toBeLessThanOrEqual(
      160,
    );
  });

  it("can disable evidence without changing normalized event fields", async () => {
    const fixture = fixtures.find(
      (entry) => entry.manifest.id === "text-evidence-none",
    );
    expect(fixture).toBeDefined();
    if (fixture === undefined) return;
    const withLocations = await parseTimetable(fixture.input, {
      ...fixture.manifest.options,
      evidence: "locations",
    });
    const withoutEvidence = await parseTimetable(fixture.input, {
      ...fixture.manifest.options,
      evidence: "none",
    });
    expect(withLocations.events.map(eventShape)).toEqual(
      withoutEvidence.events.map(eventShape),
    );
    expect(withoutEvidence.events[0]?.evidence).toEqual({});
  });
});

describe("fixture normalized event shape", () => {
  it("keeps schedules as weekly or exact values", () => {
    const schedules: readonly EventSchedule[] = fixtures.flatMap((fixture) =>
      fixture.expected.events.map((event) => event.schedule as EventSchedule),
    );
    expect(schedules.some((schedule) => schedule.kind === "weekly")).toBe(true);
    expect(schedules.some((schedule) => schedule.kind === "exact")).toBe(true);
  });
});
