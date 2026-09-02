import { execFile as runProcess } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const execFile = promisify(runProcess);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const registryPath = resolve(root, "config/public-packages.json");
const workspaceRoots = ["packages", "apps"];
const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addError(errors, message) {
  errors.push(message);
}

function isInsideRoot(rootPath, targetPath) {
  const pathFromRoot = relative(rootPath, targetPath);
  return (
    pathFromRoot === "" ||
    (!isAbsolute(pathFromRoot) &&
      pathFromRoot !== ".." &&
      !pathFromRoot.startsWith(`..${sep}`))
  );
}

async function readJson(pathname) {
  const content = await readFile(pathname, "utf8");
  try {
    return JSON.parse(content);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`${pathname}: ${reason}`);
  }
}

async function readWorkspaceManifests(workspaceRoot) {
  const manifests = [];
  const errors = [];
  let entries;
  try {
    entries = await readdir(resolve(workspaceRoot), { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { manifests, errors };
    }
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packageDir = resolve(workspaceRoot, entry.name);
    const manifestPath = resolve(packageDir, "package.json");
    try {
      const manifest = await readJson(manifestPath);
      manifests.push({ manifest, manifestPath, packageDir });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }
      addError(
        errors,
        error instanceof Error
          ? error.message
          : `${manifestPath}: invalid manifest`,
      );
    }
  }

  return { manifests, errors };
}

function checkExportMetadata(manifest, packageName, errors) {
  if (
    !isRecord(manifest.scripts) ||
    typeof manifest.scripts.build !== "string" ||
    manifest.scripts.build.trim() === ""
  ) {
    addError(
      errors,
      `${packageName}: package.json must define a non-empty scripts.build command`,
    );
  }

  for (const field of ["main", "module", "types"]) {
    if (typeof manifest[field] !== "string" || manifest[field].trim() === "") {
      addError(
        errors,
        `${packageName}: package.json must define ${field} metadata`,
      );
    }
  }

  if (
    !Array.isArray(manifest.files) ||
    !manifest.files.some(
      (entry) =>
        typeof entry === "string" &&
        (entry === "dist" || entry.startsWith("dist/")),
    )
  ) {
    addError(errors, `${packageName}: package.json files must expose dist`);
  }

  const rootExport = isRecord(manifest.exports)
    ? manifest.exports["."]
    : undefined;
  if (
    !isRecord(rootExport) ||
    typeof rootExport.types !== "string" ||
    typeof rootExport.import !== "string"
  ) {
    addError(
      errors,
      `${packageName}: package.json exports must define . with types and import`,
    );
  }
}

function checkRegistryMetadata(registry, registryFile, errors) {
  const metadata = registry.metadata;
  if (!isRecord(metadata)) {
    addError(
      errors,
      `${registryFile}: registry must define shared package metadata`,
    );
    return;
  }
  if (
    !isRecord(metadata.engines) ||
    typeof metadata.engines.node !== "string" ||
    metadata.engines.node.trim() === ""
  ) {
    addError(errors, `${registryFile}: metadata.engines.node is required`);
  }
  if (
    !isRecord(metadata.repository) ||
    metadata.repository.type !== "git" ||
    typeof metadata.repository.url !== "string" ||
    metadata.repository.url.trim() === ""
  ) {
    addError(
      errors,
      `${registryFile}: metadata.repository must define the git URL`,
    );
  }
  if (
    typeof metadata.homepage !== "string" ||
    metadata.homepage.trim() === ""
  ) {
    addError(errors, `${registryFile}: metadata.homepage is required`);
  }
  if (
    !isRecord(metadata.bugs) ||
    typeof metadata.bugs.url !== "string" ||
    metadata.bugs.url.trim() === ""
  ) {
    addError(errors, `${registryFile}: metadata.bugs.url is required`);
  }
}

function checkPackageMetadata(manifest, packageName, expected, errors) {
  if (
    !isRecord(manifest.engines) ||
    manifest.engines.node !== expected.engines.node
  ) {
    addError(
      errors,
      `${packageName}: engines.node must match the registry metadata`,
    );
  }
  if (
    !isRecord(manifest.repository) ||
    manifest.repository.type !== expected.repository.type ||
    manifest.repository.url !== expected.repository.url
  ) {
    addError(
      errors,
      `${packageName}: repository metadata must match the registry metadata`,
    );
  }
  if (manifest.homepage !== expected.homepage) {
    addError(
      errors,
      `${packageName}: homepage metadata must match the registry metadata`,
    );
  }
  if (!isRecord(manifest.bugs) || manifest.bugs.url !== expected.bugs.url) {
    addError(
      errors,
      `${packageName}: bugs metadata must match the registry metadata`,
    );
  }
}

function checkDependencyOrder(records, errors) {
  const indexByName = new Map(
    records.map((record, index) => [record.name, index]),
  );
  for (const [index, record] of records.entries()) {
    const dependencyNames = new Set([
      ...Object.keys(
        isRecord(record.manifest.dependencies)
          ? record.manifest.dependencies
          : {},
      ),
      ...Object.keys(
        isRecord(record.manifest.optionalDependencies)
          ? record.manifest.optionalDependencies
          : {},
      ),
    ]);
    for (const dependencyName of dependencyNames) {
      const dependencyIndex = indexByName.get(dependencyName);
      if (dependencyIndex !== undefined && dependencyIndex > index) {
        addError(
          errors,
          `${record.name}: registry order must place dependency ${dependencyName} first`,
        );
      }
    }
  }
}

function registryEntryPath(rootPath, entry) {
  const packageDir = resolve(rootPath, entry.path);
  return { packageDir, manifestPath: resolve(packageDir, "package.json") };
}

export async function validateRegistry(options = {}) {
  const rootPath = options.root ?? root;
  const registryFile = options.registryPath ?? registryPath;
  const errors = [];
  let registry;

  try {
    registry = await readJson(registryFile);
  } catch (error) {
    throw new Error(
      [
        "Public package registry check failed.",
        error instanceof Error
          ? error.message
          : `${registryFile}: invalid registry`,
      ].join("\n"),
    );
  }

  if (!isRecord(registry)) {
    addError(errors, `${registryFile}: registry must be a JSON object`);
  }
  if (
    !isRecord(registry) ||
    typeof registry.version !== "string" ||
    registry.version.trim() === ""
  ) {
    addError(
      errors,
      `${registryFile}: registry must define a non-empty version`,
    );
  }
  if (
    !isRecord(registry) ||
    !Array.isArray(registry.packages) ||
    registry.packages.length === 0
  ) {
    addError(
      errors,
      `${registryFile}: registry must define a non-empty packages array`,
    );
  }
  if (isRecord(registry)) {
    checkRegistryMetadata(registry, registryFile, errors);
  }
  if (errors.length > 0) {
    throw new Error(
      ["Public package registry check failed.", ...errors].join("\n"),
    );
  }

  const records = [];
  const names = new Set();
  const paths = new Set();
  for (const [index, entry] of registry.packages.entries()) {
    if (
      !isRecord(entry) ||
      typeof entry.name !== "string" ||
      typeof entry.path !== "string"
    ) {
      addError(
        errors,
        `registry package ${index + 1}: name and path are required`,
      );
      continue;
    }
    if (names.has(entry.name)) {
      addError(errors, `${entry.name}: duplicate registry package name`);
    }
    if (paths.has(entry.path)) {
      addError(
        errors,
        `${entry.name}: duplicate registry package path ${entry.path}`,
      );
    }
    names.add(entry.name);
    paths.add(entry.path);

    const { packageDir, manifestPath } = registryEntryPath(rootPath, entry);
    if (!isInsideRoot(rootPath, packageDir)) {
      addError(
        errors,
        `${entry.name}: registry path leaves the repository root`,
      );
      continue;
    }

    let manifest;
    try {
      manifest = await readJson(manifestPath);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        addError(
          errors,
          `${entry.name}: missing manifest at ${entry.path}/package.json`,
        );
      } else {
        addError(
          errors,
          error instanceof Error
            ? error.message
            : `${manifestPath}: invalid manifest`,
        );
      }
      continue;
    }

    if (!isRecord(manifest)) {
      addError(errors, `${entry.name}: package manifest must be a JSON object`);
      continue;
    }
    if (manifest.name !== entry.name) {
      addError(
        errors,
        `${entry.name}: manifest name is ${String(manifest.name)}`,
      );
    }
    if (manifest.private === true) {
      addError(
        errors,
        `${entry.name}: private packages cannot be listed for publication`,
      );
    }
    if (manifest.version !== registry.version) {
      addError(
        errors,
        `${entry.name}: version ${String(manifest.version)} differs from registry ${registry.version}`,
      );
    }
    checkPackageMetadata(manifest, entry.name, registry.metadata, errors);
    checkExportMetadata(manifest, entry.name, errors);
    records.push({
      index,
      name: entry.name,
      path: entry.path,
      packageDir,
      manifest,
      manifestPath,
    });
  }

  const workspaceManifestResults = await Promise.all(
    workspaceRoots.map((workspaceRoot) =>
      readWorkspaceManifests(resolve(rootPath, workspaceRoot)),
    ),
  );
  const workspaceManifests = workspaceManifestResults.flatMap(
    (result) => result.manifests,
  );
  for (const result of workspaceManifestResults) errors.push(...result.errors);

  const workspaceNames = new Map();
  for (const { manifest, manifestPath } of workspaceManifests) {
    if (!isRecord(manifest) || manifest.private === true) continue;
    if (typeof manifest.name !== "string" || manifest.name.trim() === "") {
      addError(
        errors,
        `${manifestPath}: non-private workspace manifest must define a name`,
      );
      continue;
    }
    if (workspaceNames.has(manifest.name)) {
      addError(
        errors,
        `${manifest.name}: duplicate non-private workspace package name`,
      );
    }
    workspaceNames.set(manifest.name, manifestPath);
    if (!names.has(manifest.name)) {
      addError(
        errors,
        `${manifest.name}: non-private workspace package is missing from registry`,
      );
    }
  }

  for (const name of names) {
    if (!workspaceNames.has(name)) {
      addError(
        errors,
        `${name}: registry package is not a non-private workspace package`,
      );
    }
  }

  if (records.length === registry.packages.length) {
    checkDependencyOrder(records, errors);
  }
  if (errors.length > 0) {
    throw new Error(
      ["Public package registry check failed.", ...errors].join("\n"),
    );
  }

  return { root: rootPath, version: registry.version, packages: records };
}

export function registryPlan(registry) {
  return registry.packages.map(
    (record, index) => `${index + 1}. ${record.name} (${record.path})`,
  );
}

async function runPackageAction(action, options = {}) {
  const registry = await validateRegistry(options);
  const dryRun = options.dryRun === true;
  const log = options.log ?? console.log;
  const commands = registry.packages.map((record) => {
    const args = ["--filter", record.name, action];
    if (action === "publish") args.push("--access", "public", "--provenance");
    return {
      name: record.name,
      args,
      command: `${packageManager} ${args.join(" ")}`,
    };
  });

  for (const command of commands) {
    if (dryRun) {
      log(`Would run ${command.command}`);
      continue;
    }
    log(`Running ${command.command}`);
    await (options.exec ?? execFile)(packageManager, command.args, {
      cwd: registry.root,
      stdio: "inherit",
    });
  }
  return commands;
}

export async function packPackages(options = {}) {
  return runPackageAction("pack", options);
}

export async function publishPackages(options = {}) {
  return runPackageAction("publish", options);
}

function usage() {
  return [
    "Usage: node scripts/public-packages.mjs <check|pack|publish> [--dry-run]",
    "check validates the ordered public package registry.",
    "pack creates package archives in registry order, or lists commands with --dry-run.",
    "publish publishes packages in registry order. Use only in the release workflow.",
  ].join("\n");
}

async function main() {
  const [action = "check", ...flags] = process.argv.slice(2);
  const dryRun = flags.length === 1 && flags[0] === "--dry-run";
  if (
    !["check", "pack", "publish"].includes(action) ||
    (flags.length > 0 && !dryRun)
  ) {
    throw new Error(usage());
  }

  if (action === "check") {
    const registry = await validateRegistry();
    console.log(
      `Public package registry check passed at version ${registry.version}.`,
    );
    for (const line of registryPlan(registry)) console.log(line);
    return;
  }
  const runner = action === "pack" ? packPackages : publishPackages;
  const commands = await runner({ dryRun });
  if (dryRun)
    console.log(
      `Enumerated ${commands.length} ${action} commands without running them.`,
    );
}

const invokedPath =
  process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
