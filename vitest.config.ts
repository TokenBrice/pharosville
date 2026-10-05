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
    // Vitest's 5 s default is wrong for this suite. Many cases build a whole
    // PharosVille world, its terrain and its renderer from scratch, which
    // costs over a second on a fast workstation and three to four times that
    // on a GitHub Actions runner. Four separate cases were failing in CI at
    // 5.0-5.6 s while passing locally, and chasing them one at a time just
    // surfaced the next one. 20 s keeps a genuine hang failing fast without
    // making correct, inherently heavy tests flaky on slower hardware; it
    // weakens no assertion. world-renderer.test.ts keeps its own 120 s
    // override for the cold-render cases.
    testTimeout: 20_000,
  },
});
