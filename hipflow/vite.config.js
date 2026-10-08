import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "HipFlow — 10-Week Hip Mobility",
        short_name: "HipFlow",
        description: "Guided 10-minute daily hip mobility and flexibility program",
        theme_color: "#0e1014",
        background_color: "#0e1014",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,png,svg,glb}"], maximumFileSizeToCacheInBytes: 6 * 1024 * 1024 },
    }),
  ],
});
