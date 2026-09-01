const DEFAULT_SITE_URL = "https://timetablekit.vercel.app";

export function siteUrl(): string {
  const configured = process.env["NEXT_PUBLIC_SITE_URL"]?.trim();

  if (configured === undefined || configured.length === 0) {
    return DEFAULT_SITE_URL;
  }

  return /^https?:\/\//.test(configured) ? configured : `https://${configured}`;
}
