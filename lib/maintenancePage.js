// Returned directly by proxy.js as a raw Response - self-contained
// (inline styles, no Tailwind, no app shell) since it has to render
// without depending on the rest of the app actually working.
export function maintenancePageHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Storezn - Down for maintenance</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; padding: 24px; }
  .card { max-width: 26rem; text-align: center; }
  .badge { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 9999px; background: #dcfce9; color: #14915b; margin-bottom: 16px; }
  h1 { font-size: 1.25rem; font-weight: 700; margin: 0 0 8px; }
  p { font-size: 0.9rem; color: #64748b; line-height: 1.5; margin: 0; }
</style>
</head>
<body>
  <div class="card">
    <div class="badge">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
    </div>
    <h1>We'll be back shortly</h1>
    <p>Storezn is offline for a quick update. This shouldn't take long - please check back in a few minutes.</p>
  </div>
</body>
</html>`;
}
