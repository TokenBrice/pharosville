import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    exclude: ["node_modules/**", "dist/**"],
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "functions/**/*.test.ts",
    ],
    setupFiles: ["./src/test-setup.ts"],
  },
});
