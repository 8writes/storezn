import { db } from "./db/index.js";
import { appErrorLogs } from "./db/schema.js";

const MAX_MESSAGE = 4000;
const MAX_STACK = 12000;

function clip(value, max) {
  if (value == null) return null;
  const text = String(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function safeJson(value) {
  if (value == null) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { note: "metadata was not JSON-serializable" };
  }
}

function routeFromRequest(req) {
  if (!req?.url) return null;
  try {
    return new URL(req.url).pathname;
  } catch {
    return null;
  }
}

function requestIdFromHeaders(req) {
  return (
    req?.headers?.get("x-request-id") ||
    req?.headers?.get("x-vercel-id") ||
    req?.headers?.get("cf-ray") ||
    null
  );
}

export function normalizeError(err) {
  if (err instanceof Error) {
    return {
      name: err.name || "Error",
      message: clip(err.message || "Unknown error", MAX_MESSAGE),
      stack: clip(err.stack || null, MAX_STACK),
    };
  }
  return {
    name: typeof err,
    message: clip(typeof err === "string" ? err : JSON.stringify(err), MAX_MESSAGE) || "Unknown error",
    stack: null,
  };
}

export async function logAppError(err, { req, user, source, route, method, statusCode, storeId, metadata, level = "error" } = {}) {
  const normalized = normalizeError(err);
  try {
    await db.insert(appErrorLogs).values({
      level,
      source: source || "application",
      route: route || routeFromRequest(req),
      method: method || req?.method || null,
      statusCode: statusCode || null,
      message: normalized.message,
      name: normalized.name,
      stack: normalized.stack,
      userId: user?.id || null,
      userRole: user?.role || null,
      storeId: storeId || user?.storeId || null,
      requestId: requestIdFromHeaders(req),
      metadata: safeJson(metadata),
    });
  } catch (logErr) {
    console.error("logAppError failed:", logErr);
  }
}
