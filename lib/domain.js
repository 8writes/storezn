// Pure domain-string helpers, split out of lib/vercel.js so the vendor
// settings UI (client component) can show DNS instructions without
// bundling the Vercel API client (which needs the server-only API token).

// A bare root domain (e.g. "yourbrand.com") needs an A record; anything
// with a subdomain label (e.g. "shop.yourbrand.com") needs a CNAME
// instead - Vercel's own dashboard draws this same distinction. Not
// airtight for multi-part public suffixes (co.uk and the like), but
// matches what Vercel's UI itself uses and is good enough to point a
// vendor at the right record type.
export function isApexDomain(domain) {
  return domain.split(".").length === 2;
}

export function dnsInstructionsFor(domain) {
  return isApexDomain(domain)
    ? { type: "A", name: "@", value: "76.76.21.21" }
    : { type: "CNAME", name: domain.split(".")[0], value: "cname.vercel-dns.com" };
}
