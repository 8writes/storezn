// Temporary kill switches for features that are built but not ready to
// ship yet - flip back to true to re-enable, no other code changes
// needed. Not env-driven on purpose: this is a "not now" decision made in
// code, not something that should vary per-environment.

// Vercel Domains API integration (see lib/vercel.js) - held off pending a
// possible move off Vercel to a self-hosted VPS, since the whole
// register/verify flow is Vercel-specific and would need to be rebuilt
// around Caddy's automatic TLS instead (see conversation with the
// platform owner). Hides the vendor-facing UI and rejects the field
// server-side so a direct API call can't bypass the hidden UI.
export const CUSTOM_DOMAINS_ENABLED = false;
