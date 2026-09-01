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
  "Local by default",
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
  "Upload",
  "Warnings and conflicts",
  "validated events",
  "fictional sample",
  "prefers-color-scheme: dark",
];

const findings = [];
for (const file of files) {
  const source = readFileSync(join(process.cwd(), file), "utf8");
  for (const phrase of oldPhrases) {
    if (source.includes(phrase)) findings.push(`${file}: ${phrase}`);
  }
}

if (findings.length > 0) {
  console.error(findings.join("\n"));
  process.exit(1);
}

console.log(`UI copy check passed across ${files.length} files.`);
