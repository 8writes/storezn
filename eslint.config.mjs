import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright's generated HTML report bundles minified copies of its own
    // trace viewer. Linting those produced ~190 errors that are not this
    // project's code and buried the real ones. Both directories are already
    // gitignored.
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
