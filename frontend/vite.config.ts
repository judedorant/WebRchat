import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/ws": {
        target: process.env.REVERB_PROXY_TARGET || "ws://127.0.0.1:8081",
        ws: true,
        rewrite: (path) => path.replace(/^\/ws/, ""),
      },
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:8000",
      },
      "/sanctum": {
        target: process.env.API_PROXY_TARGET || "http://localhost:8000",
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
