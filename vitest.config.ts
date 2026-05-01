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
    exclude: [
      "node_modules/**",
      "dist/**",
      "shared/lib/__tests__/public-docs.test.ts",
    ],
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "shared/**/*.test.ts",
      "functions/**/*.test.ts",
    ],
  },
});
