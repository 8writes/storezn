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
  {
    // This is a plain-JavaScript codebase, so nothing else catches a
    // typo'd or orphaned identifier before a user does. Three have
    // reached production already: `setTheme` left behind by a refactor
    // (the light/dark toggle silently did nothing at all), `producZt`
    // (invoice creation threw), and each was invisible to lint because
    // eslint-config-next leaves no-undef off - it assumes TypeScript is
    // doing this job.
    rules: {
      "no-undef": "error",
    },
    languageOptions: {
      globals: {
        // Browser + Node globals this codebase legitimately uses on both
        // sides of the Next boundary.
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        indexedDB: "readonly",
        fetch: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
        FormData: "readonly",
        Blob: "readonly",
        File: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        AbortController: "readonly",
        crypto: "readonly",
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        queueMicrotask: "readonly",
        structuredClone: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        Intl: "readonly",
        Image: "readonly",
        MediaRecorder: "readonly",
        __dirname: "readonly",
        module: "readonly",
        require: "readonly",
        globalThis: "readonly",
      },
    },
  },
]);

export default eslintConfig;
