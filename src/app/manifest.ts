import type { MetadataRoute } from "next";

// PWA manifest — lets the dashboard install to a phone's home screen and open
// full-screen like an app (handy at expos).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Coolkidz Brand Dashboard",
    short_name: "Coolkidz",
    description: "Live sales & marketing dashboard for all Coolkidz brands",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#132741",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
