import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/site-url";

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
    lastModified: new Date("2026-09-02"),
  }));
}
