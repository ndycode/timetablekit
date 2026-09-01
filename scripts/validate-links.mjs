import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceRoots = [
  "README.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "GOVERNANCE.md",
  "SECURITY.md",
  "SUPPORT.md",
  "MAINTAINERS.md",
  "ROADMAP.md",
  "CHANGELOG.md",
  "docs",
  "application",
  ".github",
];
const ignoredDirectories = new Set([
  ".git",
  ".omo",
  "node_modules",
  ".pnpm-store",
]);
const markdownExtensions = new Set([".md", ".mdx"]);
const markdownLink = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

async function collectMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    const pathname = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(pathname)));
    } else if (markdownExtensions.has(extname(entry.name))) {
      files.push(pathname);
    }
  }

  return files;
}

async function pathExists(pathname) {
  try {
    await stat(pathname);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function isInsideRoot(pathname) {
  const pathFromRoot = relative(root, pathname);
  return (
    pathFromRoot === "" ||
    (pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`))
  );
}

async function validateTarget(source, target) {
  const trimmedTarget = target.trim().replace(/^<|>$/g, "");
  if (
    trimmedTarget === "" ||
    trimmedTarget.startsWith("#") ||
    trimmedTarget.startsWith("mailto:")
  ) {
    return null;
  }

  try {
    const externalUrl = new URL(trimmedTarget);
    if (externalUrl.protocol === "http:" || externalUrl.protocol === "https:") {
      return null;
    }
    return `${source}: unsupported URL scheme in ${trimmedTarget}`;
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error;
    }
  }

  const [pathnamePart] = trimmedTarget.split("#", 1);
  let decodedPathname;
  try {
    decodedPathname = decodeURIComponent(pathnamePart);
  } catch (error) {
    if (error instanceof URIError) {
      return `${source}: invalid encoded link target ${trimmedTarget}`;
    }
    throw error;
  }

  const targetPath = decodedPathname.startsWith("/")
    ? resolve(root, `.${decodedPathname}`)
    : resolve(dirname(source), decodedPathname);
  if (!isInsideRoot(targetPath)) {
    return `${source}: link leaves repository root ${trimmedTarget}`;
  }
  if (!(await pathExists(targetPath))) {
    return `${source}: missing local target ${trimmedTarget}`;
  }
  return null;
}

const markdownFiles = [];
for (const sourceRoot of sourceRoots) {
  const pathname = resolve(root, sourceRoot);
  const metadata = await stat(pathname);
  if (metadata.isDirectory()) {
    markdownFiles.push(...(await collectMarkdownFiles(pathname)));
  } else if (markdownExtensions.has(extname(pathname))) {
    markdownFiles.push(pathname);
  }
}

const errors = [];
let linkCount = 0;
for (const pathname of markdownFiles) {
  const content = await readFile(pathname, "utf8");
  for (const match of content.matchAll(markdownLink)) {
    const target = match[1];
    if (target === undefined) {
      continue;
    }
    linkCount += 1;
    const line = content.slice(0, match.index).split("\n").length;
    const error = await validateTarget(`${pathname}:${line}`, target);
    if (error !== null) {
      errors.push(error);
    }
  }
}

if (errors.length > 0) {
  console.error(
    "Link validation failed. External URL reachability is not checked.",
  );
  for (const error of errors) {
    console.error(error);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${linkCount} Markdown links in ${markdownFiles.length} files. Local targets exist; external URL syntax only was checked.`,
  );
}
