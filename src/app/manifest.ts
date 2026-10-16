import type { MetadataRoute } from "next";

// Lets phones install Walkr like an app ("Add to Home Screen"), with its own icon and full-screen launch.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Walkr: loop walks through NYC parks",
    short_name: "Walkr",
    description: "Loop walks through New York City parks",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f1e7",
    theme_color: "#1f4d2b",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
