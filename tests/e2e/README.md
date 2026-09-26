# Storezn Browser E2E

These tests run through the real Next.js UI with Playwright.

Required environment:

- `E2E_DATABASE_URL` pointing at a **throwaway** database

Example:

```powershell
$env:E2E_DATABASE_URL = "<throwaway database url>"
npm run test:e2e:smoke
```

`E2E=1` is set for you by `playwright.config.mjs`, which also passes
`E2E_DATABASE_URL` through to the dev server as its `DATABASE_URL` so the app
under test and these fixtures use the same database.

## Why a separate variable

These specs insert, update and delete real rows. The helper reads
`E2E_DATABASE_URL` and **never** falls back to `DATABASE_URL`, so the
application's own database cannot be written to by accident, and it refuses to
run if the two are set to the same value.

It used to accept any `DATABASE_URL` whose host was loopback or whose
host/path contained `test`/`temp`/`dev`/`local`/`e2e`. Both were unsafe
guesses: a loopback address is what a tunnel or connection proxy to a remote
database looks like, and `temp` matches a production database branch named
`<app>-temp`.
