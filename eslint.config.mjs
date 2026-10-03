import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local tooling state, not project code:
    ".remember/**",
    ".superpowers/**",
    "dist/**",
    "playwright-report/**",
    "test-results/**",
    // Vendored ReUI gantt (registry code, kept close to upstream for updates):
    "src/components/reui/**",
  ]),
]);

export default eslintConfig;
