// ESLint flat config for PharosVille.
//
// Wave 4 #24 (maint F4): wires the ESLint lane with @typescript-eslint and
// react-hooks. Type-info-aware rules (recommended-type-checked) are NOT
// enabled yet — they require project parsing and are slow/strict; defer.
//
// Wave 4 #25 / Round 2 #15 (maint F10): `no-restricted-imports` is now
// enforced for `shared/**` to mechanically guard the runtime-neutral
// boundary documented in `shared/AGENTS.md` (no `src/**`, no React/DOM).
//
// Wave intent: wire the lane and let it report findings. Rules that flag
// existing convention (unused vars, hooks deps, ref patterns) are downgraded
// from error to warn so the script exits cleanly. Cleanup is a follow-up.

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
      "output/**",
      "outputs/**",
      "agents/completed/**",
      ".wrangler/**",
      ".cache/**",
      ".playwright-mcp/**",
      ".worktrees/**",
      ".claude/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    // Stub plugin so `eslint-disable security/...` directives parse without
    // erroring out. We don't depend on eslint-plugin-security here; the
    // single in-source directive (shared/lib/stablecoins/schema.ts) is
    // documentation of intent rather than an active rule.
    plugins: {
      security: { rules: { "detect-unsafe-regex": { meta: {}, create: () => ({}) } } },
    },
  },
  {
    // Browser + Node globals cover the TS app, the Vite/Wrangler config
    // surface, and the .mjs guard scripts under scripts/.
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Underscore-prefixed args/vars are the existing convention for
      // intentionally-unused values; keep it tolerated.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      // Existing renderer/hook patterns will warn until cleanup. Keep them
      // surfaced but non-blocking so the lane can land additive.
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      // Existing nits to surface, not block. Cleanup is a follow-up.
      "no-useless-escape": "warn",
      "no-control-regex": "warn",
      "no-useless-assignment": "warn",
      "preserve-caught-error": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
    },
  },
  {
    // TypeScript already enforces undeclared-identifier checks; the core
    // `no-undef` rule duplicates that and produces false positives for
    // ambient types. Disable it in TS files per typescript-eslint guidance.
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    rules: {
      "no-undef": "off",
    },
  },
  {
    // Round 2 #15 (maint F10): mechanically enforce the `shared/**` boundary
    // contract described in `shared/AGENTS.md`. shared/lib/** must be
    // runtime-neutral — no `src/**` imports, no React/DOM/Worker globals.
    // Use `@shared/...` aliases from frontend code instead of relative
    // cross-boundary imports.
    files: ["shared/**/*.ts", "shared/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/*", "src/*", "../src/*", "../../src/*", "../../../src/*"],
              message:
                "shared/** must be runtime-neutral; do not import from src/**.",
            },
            {
              group: ["react", "react-dom", "react/*", "react-dom/*"],
              message:
                "shared/** must be runtime-neutral; React imports belong in src/**.",
            },
          ],
        },
      ],
    },
  },
);
