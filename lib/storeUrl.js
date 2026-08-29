// The public URL a store's own customers actually visit - prefers a
// linked custom domain over the <slug>.<rootDomain> subdomain, matching
// how proxy.js accepts either. Client-safe (reads NEXT_PUBLIC_* only).
//
// The custom domain is only used once it's actually verified
// (domainStatus === "verified") - a domain that's set but still
// pending_dns doesn't resolve here yet, so linking anyone to it would be
// a dead end; fall back to the always-working subdomain until then.
export function getStorefrontUrl(store) {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost";
  const isLocal = rootDomain === "localhost";
  const protocol = isLocal ? "http" : "https";
  const port = isLocal ? ":3000" : "";
  const host =
    store.domainStatus === "verified" && store.customDomain
      ? store.customDomain
      : `${store.slug}.${rootDomain}`;
  return `${protocol}://${host}${port}`;
}

// The reverse direction - a link from inside a store's own host (a
// subdomain/custom domain, routed entirely to app/storefront/[host] by
// proxy.js) back out to the platform's own pages (e.g. /signup). A plain
// relative Link can't reach these from a storefront - every path there
// resolves against the store's own host, which proxy.js rewrites to the
// storefront route tree, not the platform's.
export function getPlatformUrl(path = "") {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost";
  const isLocal = rootDomain === "localhost";
  const protocol = isLocal ? "http" : "https";
  const port = isLocal ? ":3000" : "";
  return `${protocol}://${rootDomain}${port}${path}`;
}
