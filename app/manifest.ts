import type { MetadataRoute } from "next";

// Lets people add the community to a phone's Home Screen as an app. On iPhone
// and iPad that's also what pop-up notifications need.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Special Minds Community",
    short_name: "Special Minds",
    description: "Special Minds specialists and families, together.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#2a1a52",
    theme_color: "#2a1a52",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
