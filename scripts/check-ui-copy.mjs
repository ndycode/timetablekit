import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const files = ["apps/web/app", "apps/web/components", "apps/web/lib"]
  .flatMap((directory) =>
    readdirSync(join(process.cwd(), directory), { recursive: true })
      .filter(
        (entry) =>
          typeof entry === "string" &&
          /\.(?:ts|tsx)$/u.test(entry) &&
          !/\.test\.(?:ts|tsx)$/u.test(entry),
      )
      .map((entry) => join(directory, entry)),
  )
  .sort((left, right) => left.localeCompare(right));

const oldPhrases = [
  "A short path from a timetable source",
  "A small, fixture-driven toolkit",
  "Agenda preview",
  "Code of Conduct",
  "Current path",
  "Fictional campus week",
  "File providers",
  "Import timetable",
  "Normalized JSON",
  "Optional AI recovery",
  "PARSER TRACE",
  "Parse locally",
  "Parsed events",
  "Parsing failed",
  "Privacy by design",
  "Provider boundary",
  "Review assistant",
  "Review your schedule",
  "Supported formats",
  "The input boundary checks",
  "Try a sample",
  "TypeScript SDK",
  "Upload a schedule",
  "Warnings and conflicts",
  "Spring 2025",
  "May 2025",
  "sample-week-spring-2025",
  "127.0.0.1:4173/demo",
  "A small package for your app.",
  "match score",
  "events[6]",
  "conflicts[3]",
  "sample input · stays here",
  "Read here",
  "Read files",
  "The app never hides them.",
  "works in UTC",
  "<strong>Now</strong>",
  "Add more file readers",
  "validated events",
  "fictional sample",
  "prefers-color-scheme: dark",
];

const oldTextPatterns = [["standalone Upload label", />\s*Upload\s*</]];

const requiredPhrases = [
  [
    "apps/web/app/page.tsx",
    ["@ndycode/timetablekit-agent", "timetablekit.parse"],
  ],
  [
    "apps/web/app/docs/page.tsx",
    [
      "Agent integrations",
      "timetablekit agent",
      "base64",
      "allowRemoteRecovery: true",
      "options.recovery.enabled",
      "options.recovery.consent",
      "response.result",
      "timetableAgentOutputJsonSchema",
      "ok: false",
    ],
  ],
  [
    "apps/web/app/privacy/page.tsx",
    ["Remote recovery is opt-in", "allowRemoteRecovery: true"],
  ],
  [
    "apps/web/app/security/page.tsx",
    ["What agent mode accepts", "allowRemoteRecovery: true"],
  ],
  ["apps/web/app/roadmap/page.tsx", ["Framework-neutral agent tool"]],
];

const findings = [];
for (const file of files) {
  const source = readFileSync(join(process.cwd(), file), "utf8");
  for (const phrase of oldPhrases) {
    if (source.includes(phrase)) findings.push(`${file}: ${phrase}`);
  }
}

for (const file of files) {
  const source = readFileSync(join(process.cwd(), file), "utf8");
  for (const [label, pattern] of oldTextPatterns) {
    if (pattern.test(source)) findings.push(file + ": " + label);
  }
}

for (const [file, phrases] of requiredPhrases) {
  const source = readFileSync(join(process.cwd(), file), "utf8");
  for (const phrase of phrases) {
    if (!source.includes(phrase)) {
      findings.push(file + ": missing " + phrase);
    }
  }
}

if (findings.length > 0) {
  console.error(findings.join("\n"));
  process.exit(1);
}

console.log(`UI copy check passed across ${files.length} files.`);
