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
