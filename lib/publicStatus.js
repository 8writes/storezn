const SERVICE_DEFINITIONS = [
  { id: "core", name: "Core API", description: "Storezn application services", matches: () => true },
  { id: "auth", name: "Authentication", description: "Sign-in and account access", matches: (source) => source.startsWith("auth.") },
  { id: "storefront", name: "Storefront & checkout", description: "Shopping carts and online checkout", matches: (source) => source.startsWith("storefront.") },
  { id: "payments", name: "Payment processing", description: "Payment confirmation", matches: (source) => source === "paystack.webhook" },
  { id: "subscriptions", name: "Vendor subscriptions", description: "Storezn Plus subscription checkout", matches: (source) => source === "vendor.subscription.start" },
  { id: "payouts", name: "Payout accounts", description: "Bank lookup, verification, and account linking", matches: (source) => source.startsWith("vendor.payout_account.") },
  { id: "pos", name: "Point of sale", description: "Register sales and offline systems", matches: (source) => source.startsWith("vendor.pos.") },
  { id: "uploads", name: "File uploads", description: "Product images and store media", matches: (source) => source.startsWith("uploads.") },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function summarize(rows) {
  const requests = rows.reduce((sum, row) => sum + Number(row.requests || 0), 0);
  const failures = rows.reduce((sum, row) => sum + (Number(row.statusCode) >= 500 ? Number(row.requests || 0) : 0), 0);
  const weightedDuration = rows.reduce((sum, row) => sum + Number(row.avgDurationMs || 0) * Number(row.requests || 0), 0);
  const latestAt = rows.reduce((latest, row) => {
    const value = row.latestAt ? new Date(row.latestAt).getTime() : 0;
    return value > latest ? value : latest;
  }, 0);
  return {
    requests,
    failures,
    uptime: requests ? ((requests - failures) / requests) * 100 : null,
    avgDurationMs: requests ? Math.round(weightedDuration / requests) : null,
    latestAt: latestAt ? new Date(latestAt).toISOString() : null,
  };
}

function healthFor(summary, recentSummary) {
  if (!summary.requests) return "unknown";
  if (!recentSummary.requests) return "operational";
  const failureRate = recentSummary.failures / recentSummary.requests;
  if (recentSummary.requests >= 5 && failureRate >= 0.2) return "outage";
  if (recentSummary.failures > 0 || recentSummary.avgDurationMs > 2500) return "degraded";
  return "operational";
}

export function buildPublicStatus({ historyRows = [], recentRows = [], now = new Date() }) {
  const days = Array.from({ length: 7 }, (_, index) => dayKey(new Date(now.getTime() - (6 - index) * DAY_MS)));

  const services = SERVICE_DEFINITIONS.map((definition) => {
    const history = historyRows.filter((row) => definition.matches(row.source));
    const recent = recentRows.filter((row) => definition.matches(row.source));
    const summary = summarize(history);
    const recentSummary = summarize(recent);
    const daily = days.map((day) => {
      const daySummary = summarize(history.filter((row) => dayKey(row.day) === day));
      return { day, ...daySummary };
    });
    return { ...definition, ...summary, status: healthFor(summary, recentSummary), daily };
  });

  const overall = services[0];
  return {
    generatedAt: now.toISOString(),
    overallStatus: overall.status,
    uptime: overall.uptime,
    avgDurationMs: overall.avgDurationMs,
    requests: overall.requests,
    latestAt: overall.latestAt,
    days,
    services,
  };
}

export const STATUS_LABELS = {
  operational: "All systems operational",
  degraded: "Some systems are degraded",
  outage: "Service disruption detected",
  unknown: "Status data unavailable",
};
