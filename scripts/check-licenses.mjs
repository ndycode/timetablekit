import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const virtualStore = resolve(root, "node_modules/.pnpm");

function licenseExpressions(manifest) {
  const value = manifest.license ?? manifest.licenses;
  const entries = Array.isArray(value) ? value : [value];
  return entries
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (
        typeof entry === "object" &&
        entry !== null &&
        "type" in entry &&
        typeof entry.type === "string"
      ) {
        return entry.type.trim();
      }
      return "";
    })
    .filter((entry) => entry.length > 0);
}

async function packageManifestPaths() {
  const paths = [];
  const packageEntries = await readdir(virtualStore, { withFileTypes: true });
  for (const packageEntry of packageEntries) {
    if (!packageEntry.isDirectory()) continue;
    const dependencyRoot = resolve(
      virtualStore,
      packageEntry.name,
      "node_modules",
    );
    let dependencies;
    try {
      dependencies = await readdir(dependencyRoot, { withFileTypes: true });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }
      throw error;
    }
    for (const dependency of dependencies) {
      if (!dependency.isDirectory()) continue;
      if (!dependency.name.startsWith("@")) {
        paths.push(resolve(dependencyRoot, dependency.name, "package.json"));
        continue;
      }
      const scopedRoot = resolve(dependencyRoot, dependency.name);
      const scopedDependencies = await readdir(scopedRoot, {
        withFileTypes: true,
      });
      for (const scopedDependency of scopedDependencies) {
        if (scopedDependency.isDirectory()) {
          paths.push(
            resolve(scopedRoot, scopedDependency.name, "package.json"),
          );
        }
      }
    }
  }
  return paths;
}

const packages = new Map();
for (const pathname of await packageManifestPaths()) {
  const manifest = JSON.parse(await readFile(pathname, "utf8"));
  if (
    typeof manifest.name !== "string" ||
    typeof manifest.version !== "string"
  ) {
    continue;
  }
  packages.set(`${manifest.name}@${manifest.version}`, {
    expressions: licenseExpressions(manifest),
    pathname,
  });
}

const missing = [...packages.entries()].filter(
  ([, metadata]) => metadata.expressions.length === 0,
);
if (packages.size === 0) {
  console.error(
    "No installed package manifests were found for license validation.",
  );
  process.exitCode = 1;
} else if (missing.length > 0) {
  console.error("Installed packages with missing license metadata:");
  for (const [name, metadata] of missing) {
    console.error(`${name} ${metadata.pathname}`);
  }
  process.exitCode = 1;
} else {
  const expressions = new Set(
    [...packages.values()].flatMap((metadata) => metadata.expressions),
  );
  console.log(
    `Validated license metadata for ${packages.size} installed packages across ${expressions.size} license expressions.`,
  );
}
