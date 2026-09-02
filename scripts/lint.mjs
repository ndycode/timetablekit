import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
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
const generatedPackageSidecar = /(?:\.d\.ts|\.js)(?:\.map)?$/u;
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
    else if (
      sourceExtensions.has(extname(entry.name)) ||
      generatedPackageSidecar.test(entry.name)
    )
      files.push(pathname);
  }
  return files;
}

const findings = [];
for (const pathname of await filesIn(root)) {
  if (pathname === fileURLToPath(import.meta.url)) continue;
  const projectPath = pathname
    .slice(root.length + 1)
    .split("\\")
    .join("/");
  if (
    /^packages\/[^/]+\/src\//u.test(projectPath) &&
    generatedPackageSidecar.test(projectPath)
  ) {
    findings.push(
      `${pathname}:1 generated JavaScript or declaration sidecar in package source`,
    );
    continue;
  }
  const content = await readFile(pathname, "utf8");
  const owner = /^packages\/([^/]+)\/(?:src|tests)\//u.exec(projectPath)?.[1];
  if (owner !== undefined) {
    const importExpression = /(?:from\s+|import\s*\()\s*["']([^"']+)["']/gu;
    for (const match of content.matchAll(importExpression)) {
      const specifier = match[1];
      if (specifier === undefined || !specifier.startsWith(".")) continue;
      const importedPath = resolve(dirname(pathname), specifier)
        .slice(root.length + 1)
        .split("\\")
        .join("/");
      const importedOwner = /^packages\/([^/]+)\/src(?:\/|$)/u.exec(
        importedPath,
      )?.[1];
      if (importedOwner === undefined || importedOwner === owner) continue;
      const line = content.slice(0, match.index).split("\n").length;
      findings.push(
        `${pathname}:${line} cross-package source import from ${importedOwner}`,
      );
    }
  }
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
