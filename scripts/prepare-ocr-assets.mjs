import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const appRoot = path.join(repoRoot, "apps/web");
const providerRoot = path.join(repoRoot, "packages/provider-tesseract");
const publicRoot = path.join(appRoot, "public/tesseract");

function resolveFrom(specifier, searchPath) {
  return require.resolve(specifier, { paths: [searchPath] });
}

function copyAsset(source, destination) {
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

const workerPath = resolveFrom("tesseract.js/dist/worker.min.js", providerRoot);
const tesseractRoot = path.dirname(path.dirname(workerPath));
const coreRoot = path.dirname(
  resolveFrom("tesseract.js-core/tesseract-core.wasm.js", tesseractRoot),
);
const languageRoot = path.dirname(
  resolveFrom(
    "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
    appRoot,
  ),
);

copyAsset(workerPath, path.join(publicRoot, "worker.min.js"));
copyAsset(
  path.join(languageRoot, "eng.traineddata.gz"),
  path.join(publicRoot, "lang/4.0.0_best_int/eng.traineddata.gz"),
);

for (const filename of [
  "tesseract-core.wasm.js",
  "tesseract-core.wasm",
  "tesseract-core-simd.wasm.js",
  "tesseract-core-simd.wasm",
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-lstm.wasm",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm",
  "tesseract-core-relaxedsimd.wasm.js",
  "tesseract-core-relaxedsimd.wasm",
  "tesseract-core-relaxedsimd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm",
]) {
  copyAsset(
    path.join(coreRoot, filename),
    path.join(publicRoot, "core", filename),
  );
}

process.stdout.write("Prepared local OCR assets.\n");
