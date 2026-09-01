import type { MetadataRoute } from "next";

function siteUrl(): string {
  return process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    "/",
    "/playground",
    "/docs",
    "/privacy",
    "/security",
    "/code-of-conduct",
    "/roadmap",
  ].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date("2026-09-01"),
  }));
}
