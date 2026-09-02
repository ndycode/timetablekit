import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "timetablekit-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}

function capture(cwd: string): {
  readonly io: {
    readonly stdout: (value: string) => void;
    readonly stderr: (value: string) => void;
    readonly cwd: string;
  };
  readonly output: { stdout: string; stderr: string };
} {
  const output = { stdout: "", stderr: "" };
  return {
    io: {
      stdout: (value) => {
        output.stdout += value;
      },
      stderr: (value) => {
        output.stderr += value;
      },
      cwd,
    },
    output,
  };
}

describe("timetablekit CLI", () => {
  it("parses a local text file and writes normalized JSON", async () => {
    const directory = await temporaryDirectory();
    const inputPath = join(directory, "schedule.txt");
    await writeFile(inputPath, "Calculus Monday 09:00-10:30 Room 101", "utf8");
    const captured = capture(directory);

    const exitCode = await runCli(
      ["parse", inputPath, "--timezone", "Asia/Manila", "--locale", "en-PH"],
      captured.io,
    );

    expect(exitCode).toBe(0);
    expect(captured.output.stderr).toBe("");
    const result: unknown = JSON.parse(captured.output.stdout);
    expect(result).toMatchObject({
      source: { kind: "text", filename: "schedule.txt" },
      timezone: "Asia/Manila",
      locale: "en-PH",
    });
    expect(result).toHaveProperty("events.0.title", "Calculus");
  });

  it("rejects invalid timetable input with a nonzero result and clear stderr", async () => {
    const directory = await temporaryDirectory();
    const inputPath = join(directory, "invalid.csv");
    await writeFile(
      inputPath,
      "title,days,start,end\nCalculus,Monday,not-a-time,10:30\n",
      "utf8",
    );
    const captured = capture(directory);

    const exitCode = await runCli([inputPath], captured.io);

    expect(exitCode).toBe(1);
    expect(captured.output.stdout).toBe("");
    expect(captured.output.stderr).toContain("timetablekit:");
    expect(captured.output.stderr).toContain("invalid");
  });

  it("rejects a result with no events using the shared assessment", async () => {
    const directory = await temporaryDirectory();
    const inputPath = join(directory, "empty.txt");
    await writeFile(inputPath, "", "utf8");
    const captured = capture(directory);

    const exitCode = await runCli(["parse", inputPath], captured.io);

    expect(exitCode).toBe(1);
    expect(captured.output.stdout).toBe("");
    expect(captured.output.stderr).toContain(
      "No timetable events were recognized in the input.",
    );
  });

  it("selects JSON, CSV, and ICS output files", async () => {
    const directory = await temporaryDirectory();
    const inputPath = join(directory, "exam.csv");
    await writeFile(
      inputPath,
      "title,date,start,end\nMidterm Exam,2026-10-12,09:00,10:30\n",
      "utf8",
    );
    const formats = [
      { name: "json", extension: "json", marker: '"events"' },
      { name: "csv", extension: "csv", marker: "id,title" },
      { name: "ics", extension: "ics", marker: "BEGIN:VCALENDAR" },
    ] as const;

    for (const selected of formats) {
      const outputPath = join(directory, `exported-exam.${selected.extension}`);
      const captured = capture(directory);
      const exitCode = await runCli(
        [inputPath, "--format", selected.name, "--out", outputPath],
        captured.io,
      );

      expect(exitCode).toBe(0);
      expect(captured.output.stdout).toBe("");
      expect(captured.output.stderr).toBe("");
      await expect(readFile(outputPath, "utf8")).resolves.toContain(
        selected.marker,
      );
    }
  });

  it("accepts the documented --output alias", async () => {
    const directory = await temporaryDirectory();
    const inputPath = join(directory, "alias.txt");
    const outputPath = join(directory, "alias.json");
    await writeFile(inputPath, "Alias Check Monday 09:00-10:00", "utf8");
    const captured = capture(directory);

    const exitCode = await runCli(
      [inputPath, "--format", "json", "--output", outputPath],
      captured.io,
    );

    expect(exitCode).toBe(0);
    expect(captured.output.stdout).toBe("");
    expect(captured.output.stderr).toBe("");
    await expect(readFile(outputPath, "utf8")).resolves.toContain('"events"');
  });

  it("rejects UNC input paths before filesystem access", async () => {
    const captured = capture(process.cwd());

    const exitCode = await runCli(
      ["\\\\server\\share\\schedule.txt"],
      captured.io,
    );

    expect(exitCode).toBe(1);
    expect(captured.output.stdout).toBe("");
    expect(captured.output.stderr).toContain("Remote URLs are not accepted");
  });

  it("runs the JSONL agent protocol with machine-readable responses", async () => {
    const captured = capture(process.cwd());
    const input = [
      JSON.stringify({ id: "capabilities", op: "capabilities" }),
      JSON.stringify({
        id: "parse",
        op: "parse",
        request: {
          schemaVersion: "1",
          input: { kind: "text", text: "CLI Agent Monday 09:00-10:00" },
        },
      }),
    ].join("\n");

    const exitCode = await runCli(["agent"], {
      ...captured.io,
      stdin: (async function* () {
        yield input;
      })(),
    });

    expect(exitCode).toBe(0);
    expect(captured.output.stderr).toBe("");
    const responses = captured.output.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(responses).toHaveLength(2);
    expect(responses[0]).toMatchObject({
      id: "capabilities",
      ok: true,
      result: {
        inputKinds: ["text", "csv"],
        recovery: { allowed: false },
        tools: [{ name: "timetablekit.parse" }],
      },
    });
    expect(responses[1]).toMatchObject({
      id: "parse",
      ok: true,
      result: { events: [{ title: "CLI Agent" }] },
      assessment: { status: "usable", reasons: [] },
    });
  });

  it("parses CSV stdin when --input-kind csv is explicit", async () => {
    const captured = capture(process.cwd());
    const exitCode = await runCli(["parse", "-", "--input-kind", "csv"], {
      ...captured.io,
      stdin: (async function* () {
        yield "title,date,start,end\nCSV Agent,2026-10-12,09:00,10:30\n";
      })(),
    });

    expect(exitCode).toBe(0);
    expect(captured.output.stderr).toBe("");
    expect(JSON.parse(captured.output.stdout)).toMatchObject({
      source: { kind: "csv" },
      events: [{ title: "CSV Agent" }],
    });
  });

  it("documents the stdin default and explicit input-kind override in help", async () => {
    const captured = capture(process.cwd());
    const exitCode = await runCli(["--help"], captured.io);

    expect(exitCode).toBe(0);
    expect(captured.output.stderr).toBe("");
    expect(captured.output.stdout).toContain(
      "--input-kind <kind>     Input kind: text or csv.",
    );
    expect(captured.output.stdout).toContain("stdin is text");
  });
});
