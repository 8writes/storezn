# Storezn Browser E2E

These tests run through the real Next.js UI with Playwright.

Required environment:

- `E2E=1`
- `DATABASE_URL` pointing at a local/test/temp database

Example:

```powershell
$env:E2E = "1"
$env:DATABASE_URL = "<test database url>"
npm run test:e2e:smoke
```

The DB helper refuses to run unless the target database appears to be safe for E2E use.
