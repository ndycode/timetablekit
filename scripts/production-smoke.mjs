const rawBaseUrl = process.env["TIMETABLEKIT_SMOKE_URL"];

if (typeof rawBaseUrl !== "string" || rawBaseUrl.length === 0) {
  console.error("Set TIMETABLEKIT_SMOKE_URL to the deployed site URL.");
  process.exitCode = 1;
} else {
  const baseUrl = new URL(rawBaseUrl);
  baseUrl.pathname = "/";
  baseUrl.search = "";
  baseUrl.hash = "";

  async function get(pathname) {
    const response = await fetch(new URL(pathname, baseUrl));
    if (!response.ok)
      throw new Error(`${pathname} returned HTTP ${response.status}`);
    return response;
  }

  async function main() {
    const home = await get("/");
    const homeText = await home.text();
    const requiredHeaders = [
      "content-security-policy",
      "referrer-policy",
      "permissions-policy",
      "x-content-type-options",
      "x-frame-options",
    ];
    for (const header of requiredHeaders) {
      if (home.headers.get(header) === null) {
        throw new Error(`Missing security header: ${header}`);
      }
    }
    if (!homeText.includes("Turn timetables into calendar events.")) {
      throw new Error("The landing page marker is missing.");
    }

    const health = await get("/api/health");
    const healthBody = await health.json();
    if (
      healthBody.status !== "ok" ||
      healthBody.service !== "timetablekit-web"
    ) {
      throw new Error("The health response is not healthy.");
    }

    const parse = await fetch(new URL("/api/parse", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "text",
        text: "Production Smoke; Tuesday; 10:00-11:00",
        timezone: "UTC",
      }),
    });
    if (!parse.ok) throw new Error(`/api/parse returned HTTP ${parse.status}`);
    const parsedBody = await parse.json();
    if (!Array.isArray(parsedBody.events) || parsedBody.events.length !== 1) {
      throw new Error(
        "The production parser did not return one synthetic event.",
      );
    }

    for (const pathname of [
      "/playground",
      "/docs",
      "/privacy",
      "/security",
      "/sitemap.xml",
    ]) {
      await get(pathname);
    }

    console.log(`Production smoke passed for ${baseUrl.origin}.`);
  }

  try {
    await main();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Production smoke failed.",
    );
    process.exitCode = 1;
  }
}
