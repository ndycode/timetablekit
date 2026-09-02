import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { SiteFooter, SiteHeader } from "../components/site-header";
import { siteUrl } from "../lib/site-url";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "TimetableKit",
    template: "%s · TimetableKit",
  },
  description:
    "Local-first timetable parsing for browsers, TypeScript apps, CLIs, and agent hosts. Review warnings and conflicts, then export JSON, CSV, or iCalendar.",
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "TimetableKit",
    description:
      "Read timetables locally, review warnings and conflicts, and export JSON, CSV, or iCalendar.",
    type: "website",
    images: [
      {
        url: "/opengraph.svg",
        width: 1200,
        height: 630,
        alt: "TimetableKit schedule reader",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
