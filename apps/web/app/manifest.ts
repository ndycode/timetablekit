import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TimetableKit",
    short_name: "TimetableKit",
    description: "Turn schedules into calendar events.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#155eef",
    icons: [
      {
        src: "/icon.svg",
        sizes: "48x48",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
