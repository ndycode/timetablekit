import { readFileSync } from "node:fs";
import { join } from "node:path";

const files = [
  "apps/web/app/api/parse/route.ts",
  "apps/web/app/code-of-conduct/page.tsx",
  "apps/web/app/docs/page.tsx",
  "apps/web/app/layout.tsx",
  "apps/web/app/manifest.ts",
  "apps/web/app/page.tsx",
  "apps/web/app/privacy/page.tsx",
  "apps/web/app/roadmap/page.tsx",
  "apps/web/app/security/page.tsx",
  "apps/web/components/playground.tsx",
  "apps/web/components/playground-events.tsx",
  "apps/web/components/playground-issues.tsx",
  "apps/web/components/playground-json.tsx",
  "apps/web/components/playground-preview.tsx",
  "apps/web/components/playground-source.tsx",
  "apps/web/components/site-header.tsx",
  "apps/web/components/timetable-demo.tsx",
  "apps/web/lib/input-boundary.ts",
  "apps/web/lib/samples.ts",
];

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
      "response.result",
      "timetableAgentOutputJsonSchema",
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
