import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function downloadText(
  page: Page,
  name: string,
  marker: string,
): Promise<void> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    name.replace("Download ", "").toLocaleLowerCase() === "ics"
      ? "timetable.ics"
      : name.includes("CSV")
        ? "timetable.csv"
        : "timetable.json",
  );
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream ?? []) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString("utf8")).toContain(marker);
}

async function openReadyPlayground(page: Page): Promise<void> {
  await page.goto("/playground");
  await expect(page.getByTestId("parse-status")).toHaveText("Found 6 events.");
}

test("sample flow supports review, correction, and ICS export", async ({
  page,
}) => {
  await openReadyPlayground(page);
  await expect(
    page.getByRole("heading", { name: "Read and review your schedule." }),
  ).toBeVisible();
  await expect(page.getByText("Found 6 events.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible();
  await expect(page.getByText("Time conflict").first()).toBeVisible();

  const titleInput = page.getByTestId(/event-title-/).first();
  await titleInput.fill("Edited fictional class");
  await expect(page.locator(".json-inspector pre")).toContainText(
    "Edited fictional class",
  );

  await downloadText(page, "Download JSON", '"events"');
  await downloadText(page, "Download CSV", "id,title");
  await downloadText(page, "Download ICS", "BEGIN:VCALENDAR");
  const icsDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download ICS" }).click();
  const ics = await icsDownload;
  const stream = await ics.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream ?? []) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString("utf8")).toContain("RRULE:FREQ=WEEKLY");
});

test("paste parsing stays local and requires no account", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await openReadyPlayground(page);
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page
    .getByLabel("Schedule text")
    .fill("Thu 18:00-19:30 ART201 Studio Practice | Room 8");
  await page.getByRole("button", { name: "Read schedule" }).click();
  await expect(page.getByText("Found 1 event.")).toBeVisible();
  expect(requests.some((url) => url.includes("/api/parse"))).toBe(false);
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
});

test("correction changes recompute conflicts and expose recovery state", async ({
  page,
}) => {
  const dataRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.resourceType() === "fetch" ||
      request.resourceType() === "xhr"
    ) {
      dataRequests.push(request.url());
    }
  });
  await openReadyPlayground(page);
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page
    .getByLabel("Schedule text")
    .fill("Alpha; Monday; 09:00-10:00\nBeta; Monday; 09:30-10:30");
  await page.getByRole("button", { name: "Read schedule" }).click();
  await expect(page.getByText("Found 2 events.")).toBeVisible();
  await expect(page.getByText("Time conflict").first()).toBeVisible();
  await page
    .getByTestId(/event-endTime-/)
    .first()
    .fill("09:15");
  await expect(page.getByText("Time conflict")).toHaveCount(0);

  await page.getByLabel("Schedule text").fill("Sketching; Monday; 9-10");
  await page
    .getByRole("checkbox", { name: /Enable optional remote recovery/ })
    .check();
  await page.getByRole("button", { name: "Read schedule" }).click();
  await expect(page.getByText("Recovery unavailable")).toBeVisible();
  await expect(page.getByText("Unclear time")).toBeVisible();
  expect(dataRequests).toEqual([]);
});

test("public copy names the shipped agent contract", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Use it in TypeScript or an agent host",
    }),
  ).toBeVisible();
  await expect(page.getByText("@ndycode/timetablekit-agent")).toBeVisible();
  await expect(page.getByText("timetablekit.parse")).toBeVisible();
  await expect(page.getByText("Fictional week").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("May 2025");
  await expect(page.locator("body")).not.toContainText("Spring 2025");
  await expect(page.locator("body")).not.toContainText("AI help");

  await page.goto("/docs");
  await expect(
    page.getByRole("heading", { name: "Agent integrations" }),
  ).toBeVisible();
  await expect(page.getByText("timetablekit agent")).toBeVisible();
  await expect(page.getByText("bounded base64")).toBeVisible();
});

test("reduced motion pauses the example without hiding its content", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".timetable-demo")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Play schedule example" }),
  ).toBeVisible();
  await expect(page.locator(".demo-message").first()).toHaveCSS(
    "animation-name",
    "none",
  );
});

test("mobile pages keep scroll regions focusable and review order intact", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/playground", "/docs"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations,
      path + " mobile accessibility violations",
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }

  await page.goto("/playground");
  const panelOrder = await page
    .locator(
      '[data-testid="playground-source"], [data-testid="playground-events"], [data-testid="playground-issues"], [data-testid="playground-preview"], [data-testid="playground-json"]',
    )
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-testid")),
    );
  expect(panelOrder).toEqual([
    "playground-source",
    "playground-events",
    "playground-issues",
    "playground-preview",
    "playground-json",
  ]);
});

test("file input, exact dates, multiple weekdays, and reset stay observable", async ({
  page,
}) => {
  await openReadyPlayground(page);
  await page.getByRole("tab", { name: "Choose file" }).click();
  await page.getByLabel(/Choose a TXT, CSV, image, or PDF file/).setInputFiles({
    name: "uploaded.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Workshop; Thursday; 13:00-14:00 | Room 4"),
  });
  await expect(
    page.getByTestId("upload-panel").getByText("Selected uploaded.txt."),
  ).toBeVisible();
  await page.getByTestId("read-schedule").click();
  await expect(page.getByTestId("parse-status")).toHaveText("Found 1 event.");

  await page.getByRole("tab", { name: "Paste text" }).click();
  await page
    .getByLabel("Schedule text")
    .fill("Project Review; 2026-09-14; 10:00-11:00; Room Juniper");
  await page.getByTestId("read-schedule").click();
  await expect(page.getByTestId("parse-status")).toHaveText("Found 1 event.");
  await expect(page.getByTestId("playground-preview")).toContainText(
    "2026-09-14",
  );

  await page
    .getByLabel("Schedule text")
    .fill(
      "Studio Practice; Monday, Wednesday, Friday; 08:30-09:45; Room Indigo",
    );
  await page.getByTestId("read-schedule").click();
  await expect(page.getByTestId("playground-preview")).toContainText("Monday");
  await expect(page.getByTestId("playground-preview")).toContainText(
    "Wednesday",
  );
  await expect(page.getByTestId("playground-preview")).toContainText("Friday");

  await page.getByTestId("start-over").click();
  await expect(page.getByTestId("source-tab-sample")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("parse-status")).toHaveText("Found 6 events.");
});

test("OCR runtime assets stay on the app origin", async ({ page }) => {
  const documentResponse = await page.goto("/playground");
  expect(documentResponse).not.toBeNull();
  const contentSecurityPolicy =
    documentResponse?.headers()["content-security-policy"] ?? "";
  expect(contentSecurityPolicy).not.toContain("cdn.jsdelivr.net");

  for (const asset of [
    "/tesseract/worker.min.js",
    "/tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js",
    "/tesseract/lang/4.0.0_best_int/eng.traineddata.gz",
  ]) {
    const response = await page.request.get(asset);
    expect(response, `${asset} response`).toBeOK();
  }
});

test("API validation, upload boundaries, and mobile keyboard flow work", async ({
  page,
}) => {
  await page.goto("/");
  const parsed = await page.request.post("/api/parse", {
    data: { kind: "text", text: "Endpoint Check; Tuesday; 10:00-11:00" },
  });
  expect(parsed.status()).toBe(200);
  await expect(parsed).toBeOK();
  await expect((await parsed.json()).events).toHaveLength(1);

  const invalidKind = await page.request.post("/api/parse", {
    data: { kind: "remote", text: "ignored" },
  });
  expect(invalidKind.status()).toBe(400);
  const oversized = await page.request.post("/api/parse", {
    data: { text: "x".repeat(200_001) },
  });
  expect(oversized.status()).toBe(413);
  const oversizedEnvelope = await page.request.post("/api/parse", {
    data: { text: "ok", metadata: "x".repeat(260_000) },
  });
  expect(oversizedEnvelope.status()).toBe(413);

  await page.getByRole("link", { name: "Try it" }).last().click();
  await page.getByRole("tab", { name: "Choose file" }).click();
  await page.locator("#timetable-file").setInputFiles({
    name: "wrong.gif",
    mimeType: "image/gif",
    buffer: Buffer.from("not-an-image"),
  });
  await expect(page.getByTestId("parse-error")).toHaveText(
    "Choose a TXT, CSV, image, or PDF file.",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs");
  await page.getByRole("link", { name: "Start here" }).focus();
  await expect(page.getByRole("link", { name: "Start here" })).toBeFocused();
  await page.getByRole("link", { name: "Start here" }).press("Enter");
  await expect(page).toHaveURL(/\/docs#quickstart$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("landing page and playground have no automated accessibility violations", async ({
  page,
}) => {
  test.setTimeout(60_000);
  for (const path of ["/", "/playground", "/docs", "/privacy", "/security"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `${path} accessibility violations`).toEqual([]);
  }
});

test("robots and sitemap use public URLs", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.locator('meta[property="og:image"]').getAttribute("content"),
  ).resolves.toBe("https://timetablekit.vercel.app/opengraph.svg");

  const sitemap = await page.request.get("/sitemap.xml");
  expect(sitemap).toBeOK();
  const sitemapText = await sitemap.text();
  expect(sitemapText).not.toContain("localhost");
  expect(sitemapText).toContain("https://timetablekit.vercel.app/");

  const robots = await page.request.get("/robots.txt");
  expect(robots).toBeOK();
  const robotsText = await robots.text();
  expect(robotsText).toContain(
    "Sitemap: https://timetablekit.vercel.app/sitemap.xml",
  );
});

test("the public JSON Schema endpoint serves the package schema", async ({
  page,
}) => {
  const schema = await page.request.get("/schema/timetable-result.schema.json");
  expect(schema).toBeOK();
  expect(schema.headers()["cache-control"]).toContain("max-age=3600");
  const schemaBody = await schema.json();
  expect(schemaBody.$id).toBe(
    "https://timetablekit.vercel.app/schema/timetable-result.schema.json",
  );
  expect(schemaBody.$defs.location).toMatchObject({
    type: "object",
    additionalProperties: false,
  });
  expect(schemaBody.$defs.evidence.properties.location).toEqual({
    $ref: "#/$defs/location",
  });
  expect(schemaBody.$defs.warning.properties.source).toEqual({
    $ref: "#/$defs/location",
  });
});
