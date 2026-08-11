// Registers/checks/removes vendor custom domains against this project on
// Vercel. Adding a domain here is what actually makes Vercel's edge route
// traffic for it to this app and provision its SSL cert - pointing DNS at
// Vercel alone does nothing until the domain is added to the project via
// this API (see PATCH /api/v1/vendor/stores/[storeId]/route.js, the only
// caller). VERCEL_TEAM_ID is only needed when the project lives under a
// Vercel Team rather than a personal account.
const BASE_URL = "https://api.vercel.com";

function authHeaders() {
  return { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`, "Content-Type": "application/json" };
}

function withTeamQuery(path) {
  const teamId = process.env.VERCEL_TEAM_ID;
  return teamId ? `${path}${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(teamId)}` : path;
}

export { isApexDomain, dnsInstructionsFor } from "./domain.js";

// Idempotent - re-adding a domain this project already owns just returns
// its current state rather than erroring.
export async function addProjectDomain(domain) {
  const res = await fetch(
    withTeamQuery(`${BASE_URL}/v10/projects/${process.env.VERCEL_PROJECT_ID}/domains`),
    { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: domain }) },
  );
  const data = await res.json();
  if (!res.ok && data.error?.code !== "domain_already_in_use") {
    throw new Error(data.error?.message || "Failed to register domain with Vercel");
  }
  // Only present when Vercel needs proof of ownership (domain already
  // registered elsewhere on Vercel) - absent in the common case.
  return { verification: data.verification || null };
}

export async function removeProjectDomain(domain) {
  const res = await fetch(
    withTeamQuery(`${BASE_URL}/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}`),
    { method: "DELETE", headers: authHeaders() },
  );
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || "Failed to remove domain from Vercel");
  }
}

// Reflects whether DNS actually points at Vercel yet, independent of the
// one-time ownership verification above - a domain can be "verified"
// (ownership proven) but still "misconfigured" (DNS not pointed yet), or
// vice versa never need verification at all. Both must be clear for the
// domain to actually serve traffic.
export async function getDomainConfig(domain) {
  const res = await fetch(withTeamQuery(`${BASE_URL}/v6/domains/${encodeURIComponent(domain)}/config`), { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Failed to fetch domain config");
  return { misconfigured: !!data.misconfigured };
}

// Ownership verification (the TXT-record challenge, separate from DNS
// pointing) resolves itself once the TXT record is in place - this is
// what actually flips it, used by the status-check route to know whether
// to still show the challenge to the vendor.
export async function getProjectDomain(domain) {
  const res = await fetch(
    withTeamQuery(`${BASE_URL}/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}`),
    { headers: authHeaders() },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Failed to fetch domain");
  return { verified: !!data.verified };
}
