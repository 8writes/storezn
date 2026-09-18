import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicStatus } from "../lib/publicStatus.js";

const now = new Date("2026-09-18T12:00:00.000Z");

function row(overrides = {}) {
  return {
    source: "auth.login",
    statusCode: 200,
    requests: 1,
    avgDurationMs: 100,
    latestAt: now,
    day: now,
    ...overrides,
  };
}

test("client errors do not reduce public uptime", () => {
  const historyRows = [row({ requests: 8 }), row({ statusCode: 403, requests: 2 })];
  const status = buildPublicStatus({ historyRows, recentRows: historyRows, now });
  const authentication = status.services.find((service) => service.id === "auth");

  assert.equal(status.uptime, 100);
  assert.equal(status.overallStatus, "operational");
  assert.equal(authentication.uptime, 100);
});

test("server errors reduce uptime and degrade the affected service", () => {
  const historyRows = [row({ requests: 9 }), row({ statusCode: 500 })];
  const status = buildPublicStatus({ historyRows, recentRows: historyRows, now });
  const authentication = status.services.find((service) => service.id === "auth");

  assert.equal(status.uptime, 90);
  assert.equal(status.overallStatus, "degraded");
  assert.equal(authentication.status, "degraded");
});

test("sustained recent server failures report an outage", () => {
  const historyRows = [row({ requests: 10 })];
  const recentRows = [row({ requests: 6 }), row({ statusCode: 503, requests: 4 })];
  const status = buildPublicStatus({ historyRows, recentRows, now });

  assert.equal(status.overallStatus, "outage");
});

test("services without observed traffic report unknown status", () => {
  const status = buildPublicStatus({ now });

  assert.equal(status.overallStatus, "unknown");
  assert.ok(status.services.every((service) => service.status === "unknown"));
});

test("subscription and payout operations appear as separate services", () => {
  const historyRows = [
    row({ source: "vendor.subscription.start" }),
    row({ source: "vendor.payout_account.resolve" }),
  ];
  const status = buildPublicStatus({ historyRows, recentRows: historyRows, now });

  assert.equal(status.services.find((service) => service.id === "subscriptions").status, "operational");
  assert.equal(status.services.find((service) => service.id === "payouts").status, "operational");
});
