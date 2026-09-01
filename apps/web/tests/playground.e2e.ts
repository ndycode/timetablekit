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

test("sample flow supports review, correction, and ICS export", async ({
  page,
}) => {
  await page.goto("/playground");
  await expect(
    page.getByRole("heading", { name: "Review your schedule." }),
  ).toBeVisible();
  await expect(page.getByText("Parsed 6 events.")).toBeVisible();
  await expect(page.getByText("Warnings and conflicts")).toBeVisible();
  await expect(page.getByText("SCHEDULE CONFLICT").first()).toBeVisible();

  const titleInput = page.locator(".event-table tbody tr input").first();
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
  await page.goto("/playground");
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page
    .getByLabel("Timetable text")
    .fill("Thu 18:00-19:30 ART201 Studio Practice | Room 8");
  await page.getByRole("button", { name: "Parse locally" }).click();
  await expect(page.getByText("Parsed 1 event.")).toBeVisible();
  expect(requests.some((url) => url.includes("/api/parse"))).toBe(false);
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
});

test("correction changes recompute conflicts and expose AI consent state", async ({
  page,
}) => {
  await page.goto("/playground");
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page
    .getByLabel("Timetable text")
    .fill("Alpha; Monday; 09:00-10:00\nBeta; Monday; 09:30-10:30");
  await page.getByRole("button", { name: "Parse locally" }).click();
  await expect(page.getByText("Parsed 2 events.")).toBeVisible();
  await expect(page.getByText("SCHEDULE CONFLICT").first()).toBeVisible();
  await page
    .locator(".event-table tbody tr")
    .first()
    .locator("input")
    .nth(2)
    .fill("09:15");
  await expect(page.getByText("SCHEDULE CONFLICT")).toHaveCount(0);

  await page.getByLabel("Timetable text").fill("Sketching; Monday; 9-10");
  await page.getByRole("checkbox", { name: /Optional AI recovery/ }).check();
  await page.getByRole("button", { name: "Parse locally" }).click();
  await expect(page.getByText("AI PROVIDER UNAVAILABLE")).toBeVisible();
  await expect(page.getByText("AMBIGUOUS TIME")).toBeVisible();
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

  await page.getByRole("link", { name: "Try a sample" }).click();
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.locator("#timetable-file").setInputFiles({
    name: "wrong.gif",
    mimeType: "image/gif",
    buffer: Buffer.from("not-an-image"),
  });
  await expect(
    page.getByText("Use a TXT, CSV, PNG, JPEG, WebP, or PDF file."),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs");
  await page.getByRole("link", { name: "Quick start" }).focus();
  await expect(page.getByRole("link", { name: "Quick start" })).toBeFocused();
  await page.getByRole("link", { name: "Quick start" }).press("Enter");
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
