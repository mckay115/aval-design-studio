import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: host ?? "127.0.0.1",
    port: 1420,
    strictPort: true,
    hmr: host === undefined
      ? undefined
      : {
          protocol: "ws",
          host,
          port: 1421
        },
    watch: {
      ignored: ["**/src-tauri/**"]
    }
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    restoreMocks: true
  }
});
