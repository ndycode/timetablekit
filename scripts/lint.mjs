import { readdir, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ignored = new Set([
  ".git",
  ".next",
  ".omo",
  "coverage",
  "dist",
  "node_modules",
  ".turbo",
  ".vercel",
]);
const sourceExtensions = new Set([".cjs", ".js", ".mjs", ".ts", ".tsx"]);
const forbidden = [
  { label: "explicit any", expression: /\bany\b/ },
  { label: "ts-ignore suppression", expression: /@ts-(?:ignore|expect-error)/ },
  {
    label: "raw secret assignment",
    expression: /(?:api[_-]?key|secret|password)\s*[:=]\s*["'][^"']{12,}["']/i,
  },
];

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const pathname = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesIn(pathname)));
    else if (sourceExtensions.has(extname(entry.name))) files.push(pathname);
  }
  return files;
}

const findings = [];
for (const pathname of await filesIn(root)) {
  if (pathname === fileURLToPath(import.meta.url)) continue;
  const content = await readFile(pathname, "utf8");
  for (const rule of forbidden) {
    const match = rule.expression.exec(content);
    if (match?.index !== undefined) {
      const line = content.slice(0, match.index).split("\n").length;
      findings.push(`${pathname}:${line} ${rule.label}`);
    }
  }
}

if (findings.length > 0) {
  console.error(
    "Lint failed. Remove unsafe type escapes and credential-like source text.",
  );
  for (const finding of findings) console.error(finding);
  process.exitCode = 1;
} else {
  console.log(
    "Lint passed. No forbidden type escapes or credential-like source text found.",
  );
}
