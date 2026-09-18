import { db } from "./db/index.js";
import { apiRequestLogs } from "./db/schema.js";
import { logAppError, normalizeError } from "./appErrorLog.js";

function routeFromRequest(req) {
  if (!req?.url) return "/";
  try {
    return new URL(req.url).pathname;
  } catch {
    return "/";
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

function safeResponseMessage(value) {
  if (typeof value !== "string") return null;
  const message = value.replace(/\0/g, "").trim();
  return message ? message.slice(0, 1000) : null;
}

async function messageFromErrorResponse(response, statusCode) {
  if (statusCode < 400 || !response?.clone) return null;
  try {
    const body = await response.clone().json();
    return safeResponseMessage(body?.error) || safeResponseMessage(body?.message);
  } catch {
    // Do not persist arbitrary HTML/text response bodies in the admin log.
    return null;
  }
}

async function logApiRequest({ req, source, statusCode, durationMs, err, responseMessage }) {
  const normalized = err ? normalizeError(err) : null;
  try {
    await db.insert(apiRequestLogs).values({
      source,
      route: routeFromRequest(req),
      method: req?.method || "GET",
      statusCode,
      durationMs,
      requestId: requestIdFromHeaders(req),
      errorName: normalized?.name || (responseMessage ? `HTTP ${statusCode}` : null),
      errorMessage: normalized?.message || responseMessage || null,
    });
  } catch (logErr) {
    console.error("logApiRequest failed:", logErr);
  }
}

export function withApiMonitoring(handler, { source }) {
  return async function monitoredApiHandler(req, ctx) {
    const started = Date.now();
    try {
      const response = await handler(req, ctx);
      const statusCode = response?.status || 200;
      const responseMessage = await messageFromErrorResponse(response, statusCode);
      await logApiRequest({
        req,
        source,
        statusCode,
        durationMs: Date.now() - started,
        responseMessage,
      });
      return response;
    } catch (err) {
      const durationMs = Date.now() - started;
      await Promise.all([
        logApiRequest({ req, source, statusCode: 500, durationMs, err }),
        logAppError(err, { req, source, statusCode: 500 }),
      ]);
      throw err;
    }
  };
}
