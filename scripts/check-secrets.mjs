import { readdir, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ignoredDirectories = new Set([
  ".git",
  ".omo",
  ".pnpm-store",
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
]);
const textExtensions = new Set([
  ".cjs",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".mts",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
const secretPatterns = [
  {
    label: "private key header",
    expression: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  },
  { label: "cloud access key", expression: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    label: "token-like value",
    expression:
      /\b(?:ghp|github_pat|glpat|npm_|pypi-|xox[baprs]-|sk-)[A-Za-z0-9_-]{16,}\b/,
  },
  {
    label: "credential assignment",
    expression:
      /\b(?:api[_-]?key|access[_-]?token|secret|password|private[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9+/=_-]{16,}/i,
  },
];

async function collectTextFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    const pathname = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTextFiles(pathname)));
    } else if (textExtensions.has(extname(entry.name))) {
      files.push(pathname);
    }
  }

  return files;
}

const findings = [];
for (const pathname of await collectTextFiles(root)) {
  const content = await readFile(pathname, "utf8");
  for (const pattern of secretPatterns) {
    const match = pattern.expression.exec(content);
    if (match === null || match.index === undefined) {
      continue;
    }
    const line = content.slice(0, match.index).split("\n").length;
    findings.push(`${pathname}:${line} ${pattern.label}`);
  }
}

if (findings.length > 0) {
  console.error("Potential credential patterns found. Values are not printed.");
  for (const finding of findings) {
    console.error(finding);
  }
  process.exitCode = 1;
} else {
  console.log(
    "No credential patterns found in scanned text files. Values and external systems were not accessed.",
  );
}
