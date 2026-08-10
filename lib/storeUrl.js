// The public URL a store's own customers actually visit - prefers a
// linked custom domain over the <slug>.<rootDomain> subdomain, matching
// how proxy.js accepts either. Client-safe (reads NEXT_PUBLIC_* only).
export function getStorefrontUrl(store) {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost";
  const isLocal = rootDomain === "localhost";
  const protocol = isLocal ? "http" : "https";
  const port = isLocal ? ":3000" : "";
  const host = store.customDomain || `${store.slug}.${rootDomain}`;
  return `${protocol}://${host}${port}`;
}
