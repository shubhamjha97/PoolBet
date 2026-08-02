import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// API + PWA routes live at the FastAPI backend's root paths; proxy them in dev.
const apiPaths = [
  "/auth", "/users", "/groups", "/markets", "/events", "/push", "/admin",
  "/health", "/sw.js", "/manifest.webmanifest", "/static",
];

export default defineConfig({
  // Served by FastAPI under /next/ during the migration (keeps the vanilla app at /).
  base: "/next/",
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: Object.fromEntries(
      apiPaths.map((p) => [p, { target: "http://localhost:8000", changeOrigin: true }]),
    ),
  },
  build: { outDir: "dist" },
});
