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
      "strict-transport-security",
    ];
    for (const header of requiredHeaders) {
      if (home.headers.get(header) === null) {
        throw new Error(`Missing security header: ${header}`);
      }
    }
    if (!homeText.includes("Turn schedules into calendar events.")) {
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

    const schemas = [
      ["/schema/timetable-result.schema.json", "TimetableParseResult"],
      ["/schema/agent-input.schema.json", "TimetableAgentRequest"],
      ["/schema/agent-output.schema.json", "TimetableAgentResponse"],
      ["/schema/agent-capabilities.schema.json", "TimetableAgentCapabilities"],
    ];
    for (const [pathname, title] of schemas) {
      const response = await get(pathname);
      const schema = await response.json();
      if (schema.title !== title || typeof schema.$id !== "string") {
        throw new Error(`${pathname} did not return the expected schema.`);
      }
    }

    const removedParseRoute = await fetch(new URL("/api/parse", baseUrl));
    if (removedParseRoute.status !== 404) {
      throw new Error(
        `/api/parse should be absent but returned HTTP ${removedParseRoute.status}`,
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
