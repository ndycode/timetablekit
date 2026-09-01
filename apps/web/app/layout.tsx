import type { Metadata } from "next";
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
    "Turn timetable text, images, and PDFs into validated calendar events through a privacy-first TypeScript toolkit.",
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "TimetableKit",
    description: "Turn timetables into calendar events, locally and privately.",
    type: "website",
    images: [
      {
        url: "/opengraph.svg",
        width: 1200,
        height: 630,
        alt: "TimetableKit timetable parser",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
