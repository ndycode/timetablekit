import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { packPackages, validateRegistry } from "./public-packages.mjs";

const version = "0.1.0";
const metadata = {
  engines: { node: ">=24 <27" },
  repository: {
    type: "git",
    url: "https://github.com/ndycode/timetablekit.git",
  },
  homepage: "https://timetablekit.vercel.app/",
  bugs: { url: "https://github.com/ndycode/timetablekit/issues" },
};
const definitions = [
  {
    name: "@ndycode/timetablekit",
    path: "packages/core",
    dependencies: {},
  },
  {
    name: "@ndycode/timetablekit-provider-pdfjs",
    path: "packages/provider-pdfjs",
    dependencies: { "@ndycode/timetablekit": "workspace:*" },
  },
  {
    name: "@ndycode/timetablekit-provider-tesseract",
    path: "packages/provider-tesseract",
    dependencies: { "@ndycode/timetablekit": "workspace:*" },
  },
  {
    name: "@ndycode/timetablekit-provider-vercel-ai",
    path: "packages/provider-vercel-ai",
    dependencies: { "@ndycode/timetablekit": "workspace:*" },
  },
  {
    name: "@ndycode/timetablekit-react",
    path: "packages/react",
    dependencies: { "@ndycode/timetablekit": "workspace:*" },
  },
  {
    name: "@ndycode/timetablekit-agent",
    path: "packages/agent",
    dependencies: { "@ndycode/timetablekit": "workspace:*" },
  },
  {
    name: "@ndycode/timetablekit-cli",
    path: "packages/cli",
    dependencies: {
      "@ndycode/timetablekit": "workspace:*",
      "@ndycode/timetablekit-agent": "workspace:*",
    },
  },
];

function manifestFor(definition) {
  return {
    name: definition.name,
    version,
    type: "module",
    engines: { ...metadata.engines },
    repository: { ...metadata.repository },
    homepage: metadata.homepage,
    bugs: { ...metadata.bugs },
    files: ["dist"],
    main: "./dist/index.js",
    module: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
    },
    scripts: { build: "tsc --project tsconfig.json" },
    dependencies: definition.dependencies,
  };
}

async function createFixture() {
  const fixtureRoot = await mkdtemp(
    join(tmpdir(), "timetablekit-public-packages-"),
  );
  await mkdir(resolve(fixtureRoot, "config"), { recursive: true });
  for (const definition of definitions) {
    const packageDir = resolve(fixtureRoot, definition.path);
    await mkdir(packageDir, { recursive: true });
    await writeFile(
      resolve(packageDir, "package.json"),
      JSON.stringify(manifestFor(definition), null, 2),
    );
  }
  const registryPath = resolve(fixtureRoot, "config/public-packages.json");
  await writeFile(
    registryPath,
    JSON.stringify(
      {
        version,
        metadata,
        packages: definitions.map(({ name, path }) => ({ name, path })),
      },
      null,
      2,
    ),
  );
  return {
    root: fixtureRoot,
    registryPath,
    cleanup: () => rm(fixtureRoot, { recursive: true, force: true }),
  };
}

async function updateRegistry(fixture, update) {
  const registry = JSON.parse(await readFile(fixture.registryPath, "utf8"));
  update(registry);
  await writeFile(fixture.registryPath, JSON.stringify(registry, null, 2));
}

async function updateManifest(fixture, packagePath, update) {
  const manifestPath = resolve(fixture.root, packagePath, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  update(manifest);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

test("validates the seven-package publish order", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  const registry = await validateRegistry(fixture);
  assert.deepEqual(
    registry.packages.map((record) => record.name),
    definitions.map((definition) => definition.name),
  );
});

test("rejects duplicate registry names", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  await updateRegistry(fixture, (registry) => {
    registry.packages[1].name = registry.packages[0].name;
  });
  await assert.rejects(
    validateRegistry(fixture),
    /duplicate registry package name/,
  );
});

test("rejects a registry entry with no manifest", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  await updateRegistry(fixture, (registry) => {
    registry.packages[1].path = "packages/missing";
  });
  await assert.rejects(validateRegistry(fixture), /missing manifest/);
});

test("rejects private listed packages", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  await updateManifest(fixture, "packages/core", (manifest) => {
    manifest.private = true;
  });
  await assert.rejects(
    validateRegistry(fixture),
    /private packages cannot be listed/,
  );
});

test("rejects unlisted non-private workspace packages", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  const extraDir = resolve(fixture.root, "packages/extra");
  await mkdir(extraDir, { recursive: true });
  await writeFile(
    resolve(extraDir, "package.json"),
    JSON.stringify(
      manifestFor({ name: "@ndycode/timetablekit-extra", dependencies: {} }),
      null,
      2,
    ),
  );
  await assert.rejects(
    validateRegistry(fixture),
    /non-private workspace package is missing from registry/,
  );
});

test("rejects package version drift", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  await updateManifest(fixture, "packages/agent", (manifest) => {
    manifest.version = "0.2.0";
  });
  await assert.rejects(validateRegistry(fixture), /differs from registry/);
});

test("rejects package metadata drift", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  await updateManifest(fixture, "packages/agent", (manifest) => {
    manifest.engines.node = ">=22 <24";
  });
  await assert.rejects(validateRegistry(fixture), /engines.node must match/);
  await updateManifest(fixture, "packages/agent", (manifest) => {
    manifest.engines.node = metadata.engines.node;
  });

  await updateManifest(fixture, "packages/agent", (manifest) => {
    manifest.repository.url = "https://example.test/timetablekit.git";
  });
  await assert.rejects(
    validateRegistry(fixture),
    /repository metadata must match/,
  );
  await updateManifest(fixture, "packages/agent", (manifest) => {
    manifest.repository.url = metadata.repository.url;
  });

  await updateManifest(fixture, "packages/agent", (manifest) => {
    manifest.homepage = "https://example.test/";
  });
  await assert.rejects(
    validateRegistry(fixture),
    /homepage metadata must match/,
  );
  await updateManifest(fixture, "packages/agent", (manifest) => {
    manifest.homepage = metadata.homepage;
  });

  await updateManifest(fixture, "packages/agent", (manifest) => {
    manifest.bugs.url = "https://example.test/issues";
  });
  await assert.rejects(validateRegistry(fixture), /bugs metadata must match/);
});

test("rejects a registry without shared package metadata", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  await updateRegistry(fixture, (registry) => {
    delete registry.metadata;
  });
  await assert.rejects(validateRegistry(fixture), /shared package metadata/);
});

test("rejects missing build and export metadata", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  await updateManifest(fixture, "packages/core", (manifest) => {
    delete manifest.scripts.build;
    delete manifest.exports;
  });
  await assert.rejects(validateRegistry(fixture), /scripts.build command/);
  await assert.rejects(validateRegistry(fixture), /exports must define/);
});

test("rejects dependency order drift", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  await updateRegistry(fixture, (registry) => {
    const cli = registry.packages.pop();
    registry.packages.splice(1, 0, cli);
  });
  await assert.rejects(
    validateRegistry(fixture),
    /registry order must place dependency/,
  );
});

test("dry pack enumerates every package without running pnpm", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  const logs = [];
  let executions = 0;
  const commands = await packPackages({
    ...fixture,
    dryRun: true,
    log: (line) => logs.push(line),
    exec: async () => {
      executions += 1;
    },
  });
  assert.equal(commands.length, definitions.length);
  assert.equal(logs.length, definitions.length);
  assert.equal(executions, 0);
  assert.match(logs[0], /@ndycode\/timetablekit/);
  assert.match(logs.at(-1), /@ndycode\/timetablekit-cli/);
});
