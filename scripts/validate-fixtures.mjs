import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import {
  allFixtureDefinitions,
  fixturesRoot,
  renderBinaryFixture,
  renderFixture,
} from "./generate-fixtures.mjs";

async function filesIn(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const pathname = resolve(directory, entry.name);
      if (entry.isDirectory()) files.push(...(await filesIn(pathname)));
      else files.push(pathname);
    }
    return files;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return [];
    throw error;
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeFixturePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0"))
    return false;
  const pathname = resolve(fixturesRoot, value);
  const pathFromRoot = relative(fixturesRoot, pathname);
  return (
    pathFromRoot.length > 0 &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(sep)
  );
}

function validateExpected(expected, manifest, pathname) {
  const errors = [];
  if (!isRecord(expected) || expected.format !== "timetablekit-normalized-v1") {
    errors.push(`${pathname}: expected output has an unknown format`);
    return errors;
  }
  if (
    !isRecord(expected.source) ||
    expected.source.kind !== manifest.kind ||
    typeof expected.source.filename !== "string"
  ) {
    errors.push(
      `${pathname}: expected output has an invalid source descriptor`,
    );
  }
  if (
    typeof expected.timezone !== "string" ||
    typeof expected.locale !== "string"
  ) {
    errors.push(
      `${pathname}: expected output needs string timezone and locale`,
    );
  }
  if (
    !Array.isArray(expected.events) ||
    !Array.isArray(expected.warningCodes) ||
    !Array.isArray(expected.conflicts)
  ) {
    errors.push(
      `${pathname}: expected output needs events, warningCodes, and conflicts arrays`,
    );
    return errors;
  }
  for (const [index, event] of expected.events.entries()) {
    if (
      !isRecord(event) ||
      typeof event.title !== "string" ||
      !isRecord(event.schedule) ||
      typeof event.startTime !== "string" ||
      typeof event.endTime !== "string" ||
      typeof event.timezone !== "string"
    ) {
      errors.push(`${pathname}: expected event ${index} is incomplete`);
    }
  }
  if (!expected.warningCodes.every((code) => typeof code === "string")) {
    errors.push(`${pathname}: expected warningCodes must contain strings`);
  }
  for (const [index, conflict] of expected.conflicts.entries()) {
    if (
      !isRecord(conflict) ||
      !isRecord(conflict.occurrence) ||
      !isRecord(conflict.overlap)
    ) {
      errors.push(`${pathname}: expected conflict ${index} is incomplete`);
    }
  }
  return errors;
}

function generatedTextMatches(pathname, actualText, expectedText) {
  if (!pathname.endsWith(".json")) return actualText === expectedText;
  try {
    return (
      JSON.stringify(JSON.parse(actualText)) ===
      JSON.stringify(JSON.parse(expectedText))
    );
  } catch {
    return actualText === expectedText;
  }
}

const unsafeContent =
  /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b(?:password|secret|api[_ -]?key)\b)/iu;
const manifestFiles = (await filesIn(resolve(fixturesRoot, "manifests")))
  .filter((file) => file.endsWith(".json"))
  .sort();
const generatedById = new Map(
  allFixtureDefinitions.map((definition) => [definition.id, definition]),
);
const seenIds = new Set();
const errors = [];
const generatedIds = new Set();
let inputCount = 0;
let expectedCount = 0;

if (manifestFiles.length < 30) {
  errors.push(
    `fixtures/manifests: expected at least 30 manifests, found ${manifestFiles.length}`,
  );
}

for (const pathname of manifestFiles) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(pathname, "utf8"));
  } catch (error) {
    errors.push(
      `${pathname}: ${error instanceof Error ? error.message : "invalid JSON"}`,
    );
    continue;
  }
  if (
    !isRecord(manifest) ||
    typeof manifest.id !== "string" ||
    typeof manifest.kind !== "string"
  ) {
    errors.push(`${pathname}: manifest needs string id and kind`);
    continue;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(manifest.id)) {
    errors.push(`${pathname}: manifest id is not a safe slug`);
  }
  if (seenIds.has(manifest.id)) {
    errors.push(`${pathname}: duplicate manifest id ${manifest.id}`);
  }
  seenIds.add(manifest.id);
  if (manifest.synthetic !== true || manifest.visibility !== "public") {
    errors.push(`${pathname}: manifest must be public synthetic data`);
  }
  if (
    manifest.kind !== "text" &&
    manifest.kind !== "csv" &&
    manifest.kind !== "image" &&
    manifest.kind !== "pdf"
  ) {
    errors.push(`${pathname}: unsupported fixture kind ${manifest.kind}`);
  }
  if (
    typeof manifest.filename !== "string" ||
    unsafeContent.test(manifest.filename)
  ) {
    errors.push(`${pathname}: filename is missing or unsafe`);
  }
  if (
    typeof manifest.provenance !== "string" ||
    manifest.provenance !==
      "Synthetic data generated by scripts/generate-fixtures.mjs."
  ) {
    errors.push(`${pathname}: provenance is missing or unexpected`);
  }
  if (
    !isSafeFixturePath(manifest.input) ||
    !isSafeFixturePath(manifest.expected)
  ) {
    errors.push(
      `${pathname}: input and expected paths must stay under fixtures`,
    );
    continue;
  }
  const inputPath = resolve(fixturesRoot, manifest.input);
  const expectedPath = resolve(fixturesRoot, manifest.expected);
  const isBinary = manifest.kind === "image" || manifest.kind === "pdf";
  try {
    const input = await readFile(inputPath);
    inputCount += 1;
    if (isBinary && input.byteLength === 0)
      errors.push(`${inputPath}: input is empty`);
    if (!isBinary && unsafeContent.test(input.toString("utf8")))
      errors.push(
        `${inputPath}: input contains disallowed external or secret-like content`,
      );
    if (manifest.kind === "csv" && !manifest.input.endsWith(".csv"))
      errors.push(`${pathname}: CSV input must use a .csv file`);
    if (manifest.kind === "text" && !manifest.input.endsWith(".txt"))
      errors.push(`${pathname}: text input must use a .txt file`);
    if (manifest.kind === "image" && !manifest.input.endsWith(".png"))
      errors.push(`${pathname}: image input must use a .png file`);
    if (manifest.kind === "pdf" && !manifest.input.endsWith(".pdf"))
      errors.push(`${pathname}: PDF input must use a .pdf file`);
  } catch (error) {
    errors.push(
      `${pathname}: input is not readable: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  try {
    const expectedText = await readFile(expectedPath, "utf8");
    expectedCount += 1;
    const expected = JSON.parse(expectedText);
    errors.push(...validateExpected(expected, manifest, expectedPath));
    if (unsafeContent.test(expectedText))
      errors.push(
        `${expectedPath}: expected output contains disallowed external or secret-like content`,
      );
  } catch (error) {
    errors.push(
      `${pathname}: expected output is not readable: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  const definition = generatedById.get(manifest.id);
  if (definition !== undefined) {
    generatedIds.add(manifest.id);
    const rendered = await renderFixture(definition);
    const textFiles = [
      [resolve(fixturesRoot, rendered.manifestPath), rendered.manifestText],
      [resolve(fixturesRoot, rendered.expectedPath), rendered.expectedText],
    ];
    for (const [generatedPath, expectedText] of textFiles) {
      try {
        const actualText = await readFile(generatedPath, "utf8");
        if (!generatedTextMatches(generatedPath, actualText, expectedText))
          errors.push(
            `${generatedPath}: differs from deterministic generator output`,
          );
      } catch (error) {
        errors.push(
          `${generatedPath}: generated artifact is not readable: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }
    const inputPath = resolve(fixturesRoot, rendered.inputPath);
    try {
      const actualInput = await readFile(inputPath);
      const expectedInput = isBinary
        ? await renderBinaryFixture(definition)
        : Buffer.from(rendered.inputText);
      if (!actualInput.equals(expectedInput))
        errors.push(
          `${inputPath}: differs from deterministic generator output`,
        );
    } catch (error) {
      errors.push(
        `${inputPath}: generated artifact is not readable: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
}

for (const definition of allFixtureDefinitions) {
  if (!generatedIds.has(definition.id))
    errors.push(
      `fixtures/manifests: missing generated fixture ${definition.id}`,
    );
}

if (errors.length > 0) {
  console.error("Fixture validation failed.");
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${manifestFiles.length} fixture manifests, ${inputCount} inputs, and ${expectedCount} expected outputs.`,
  );
}
