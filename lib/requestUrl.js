function firstHeaderValue(value) {
  return (value || "").split(",")[0].trim();
}

function cleanHost(value) {
  return firstHeaderValue(value).replace(/^https?:\/\//i, "").split("/")[0];
}

function cleanProtocol(value, fallback = "https") {
  const protocol = firstHeaderValue(value).replace(/:$/, "").toLowerCase();
  return protocol === "http" || protocol === "https" ? protocol : fallback;
}

function defaultProtocolForHost(host) {
  const hostname = host.split(":")[0].toLowerCase();
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "[::1]"
    ? "http"
    : "https";
}

export function getRequestOrigin(req, { fallbackProtocol } = {}) {
  // The public Host header is already preserved by the production reverse
  // proxy. Do not let an arbitrary forwarded-host header change payment
  // return URLs unless the deployment explicitly opts into trusting it.
  const forwardedHost = process.env.TRUST_PROXY_HEADERS === "true" ? req.headers.get("x-forwarded-host") : null;
  const host = cleanHost(forwardedHost || req.headers.get("host"));
  if (!host) return null;

  const forwardedProto = process.env.TRUST_PROXY_HEADERS === "true" ? req.headers.get("x-forwarded-proto") : null;
  const protocol = cleanProtocol(forwardedProto, fallbackProtocol || defaultProtocolForHost(host));
  return `${protocol}://${host}`;
}

export function buildRequestUrl(req, path, options) {
  const origin = getRequestOrigin(req, options);
  if (!origin) return null;
  return new URL(path, origin).toString();
}

function isLoopbackOrigin(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".localhost");
  } catch {
    return true;
  }
}

// Platform links are often generated while Next is reached through an
// internal localhost reverse proxy. Prefer the configured public platform
// host and never put a loopback URL into a production email or callback.
export function getPublicAppOrigin(req) {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured && (process.env.NODE_ENV !== "production" || !isLoopbackOrigin(configured))) {
    return configured.replace(/\/$/, "");
  }

  const requestOrigin = getRequestOrigin(req);
  if (requestOrigin && (process.env.NODE_ENV !== "production" || !isLoopbackOrigin(requestOrigin))) return requestOrigin;

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (rootDomain && rootDomain !== "localhost") return `https://${cleanHost(rootDomain)}`;
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  throw new Error("A public APP_URL or NEXT_PUBLIC_ROOT_DOMAIN is required in production");
}

export function buildPublicAppUrl(req, path) {
  return new URL(path, `${getPublicAppOrigin(req)}/`).toString();
}
