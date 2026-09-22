import { lt, sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { rateLimitBuckets } from "./db/schema.js";

// The database bucket is the source of truth so limits hold across all app
// workers. This bounded map is only a migration/dev fallback if the new table
// has not been applied yet or the database is temporarily unavailable.
const localBuckets = new Map();
const MAX_LOCAL_BUCKETS = 10_000;
const EVICTION_INTERVAL_MS = 60_000;
let lastLocalEvictionAt = 0;
let pruneInFlight = false;
let requestsSincePrune = 0;

function getClientIp(req) {
  // Forwarded headers are only trustworthy when the deployment's reverse
  // proxy is explicitly configured as trusted. NextRequest has no portable
  // socket address to fall back to, so "unknown" is safer than spoofable IPs.
  if (process.env.TRUST_PROXY_HEADERS === "true") {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim().slice(0, 128);
    const realIp = req.headers.get("x-real-ip");
    if (realIp) return realIp.trim().slice(0, 128);
  }
  return "unknown";
}

function identityFor(req, userId, includeIp) {
  const ip = getClientIp(req);
  return userId ? (includeIp ? `${userId}:${ip}` : userId) : ip;
}

function localCheck(bucketKey, max, windowMs, now) {
  if (now - lastLocalEvictionAt > EVICTION_INTERVAL_MS || localBuckets.size > MAX_LOCAL_BUCKETS) {
    for (const [storedKey, timestamps] of localBuckets) {
      const active = timestamps.filter((ts) => now - ts < windowMs);
      if (active.length === 0) localBuckets.delete(storedKey);
      else localBuckets.set(storedKey, active);
    }
    lastLocalEvictionAt = now;
  }

  const active = (localBuckets.get(bucketKey) || []).filter((ts) => now - ts < windowMs);
  if (active.length >= max) {
    localBuckets.set(bucketKey, active);
    return { allowed: false };
  }
  active.push(now);
  localBuckets.set(bucketKey, active);
  while (localBuckets.size > MAX_LOCAL_BUCKETS) localBuckets.delete(localBuckets.keys().next().value);
  return { allowed: true };
}

function pruneExpiredBuckets() {
  if (pruneInFlight) return;
  pruneInFlight = true;
  db.delete(rateLimitBuckets)
    .where(lt(rateLimitBuckets.expiresAt, new Date()))
    .catch(() => {})
    .finally(() => {
      pruneInFlight = false;
    });
}

export async function checkRateLimit(req, key, { max, windowMs, userId, includeIp = false } = {}) {
  const identity = identityFor(req, userId, includeIp);
  const bucketKey = `${key}:${identity}`;
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);
  const expiresAt = new Date(now.getTime() + windowMs);

  try {
    const reset = sql`${rateLimitBuckets.windowStartedAt} <= ${windowStart}`;
    const [row] = await db
      .insert(rateLimitBuckets)
      .values({ bucketKey, windowStartedAt: now, count: 1, expiresAt })
      .onConflictDoUpdate({
        target: rateLimitBuckets.bucketKey,
        set: {
          count: sql`case when ${reset} then 1 else ${rateLimitBuckets.count} + 1 end`,
          windowStartedAt: sql`case when ${reset} then ${now} else ${rateLimitBuckets.windowStartedAt} end`,
          expiresAt: sql`case when ${reset} then ${expiresAt} else ${rateLimitBuckets.expiresAt} end`,
        },
      })
      .returning({ count: rateLimitBuckets.count });

    requestsSincePrune += 1;
    if (requestsSincePrune >= 1_000) {
      requestsSincePrune = 0;
      pruneExpiredBuckets();
    }
    return { allowed: Number(row?.count || 0) <= max };
  } catch {
    // Keep auth and checkout available during a migration or short database
    // outage; the bounded local fallback still protects the current worker.
    return localCheck(bucketKey, max, windowMs, Date.now());
  }
}
