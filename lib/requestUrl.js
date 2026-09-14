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
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = cleanHost(forwardedHost || req.headers.get("host"));
  if (!host) return null;

  const protocol = cleanProtocol(req.headers.get("x-forwarded-proto"), fallbackProtocol || defaultProtocolForHost(host));
  return `${protocol}://${host}`;
}

export function buildRequestUrl(req, path, options) {
  const origin = getRequestOrigin(req, options);
  if (!origin) return null;
  return new URL(path, origin).toString();
}
