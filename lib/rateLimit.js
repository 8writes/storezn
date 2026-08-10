// In-memory sliding-window rate limiter. Fine for a single-instance deploy
// per client database; swap for a shared store (Redis) if this ever runs
// behind multiple instances for the same tenant.
const buckets = new Map();

function getClientIp(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export function checkRateLimit(req, key, { max, windowMs, userId } = {}) {
  const identity = userId || getClientIp(req);
  const bucketKey = `${key}:${identity}`;
  const now = Date.now();

  const bucket = buckets.get(bucketKey) || [];
  const active = bucket.filter((ts) => now - ts < windowMs);

  if (active.length >= max) {
    buckets.set(bucketKey, active);
    return { allowed: false };
  }

  active.push(now);
  buckets.set(bucketKey, active);
  return { allowed: true };
}
