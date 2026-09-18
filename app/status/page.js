import { count, gte, max, sql } from "drizzle-orm";
import { Activity, AlertTriangle, CheckCircle2, CircleHelp, Clock3 } from "lucide-react";
import { db } from "@/lib/db/index.js";
import { apiRequestLogs } from "@/lib/db/schema.js";
import { buildPublicStatus, STATUS_LABELS } from "@/lib/publicStatus.js";
import { MarketingHeader } from "@/components/MarketingHeader.js";
import { Footer } from "@/components/Footer.js";
import { StatusRefresh } from "@/components/status/StatusRefresh.js";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "System status | Storezn",
  description: "Current availability and recent performance for Storezn services.",
};

const STATUS_STYLE = {
  operational: { dot: "bg-green-500", text: "text-green-700", panel: "border-green-200 bg-green-50", icon: CheckCircle2, label: "Operational" },
  degraded: { dot: "bg-amber-500", text: "text-amber-800", panel: "border-amber-200 bg-amber-50", icon: AlertTriangle, label: "Degraded" },
  outage: { dot: "bg-red-500", text: "text-red-700", panel: "border-red-200 bg-red-50", icon: AlertTriangle, label: "Disruption" },
  unknown: { dot: "bg-slate-400", text: "text-slate-700", panel: "border-slate-200 bg-slate-50", icon: CircleHelp, label: "No recent data" },
};

function formatUptime(value) {
  if (value == null) return "Not available";
  return `${value.toFixed(value >= 99.99 ? 3 : 2)}%`;
}

function formatChecked(value) {
  if (!value) return "No checks recorded";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date(value));
}

async function loadStatus() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const dayExpression = sql`date_trunc('day', ${apiRequestLogs.createdAt})`;
  const selection = {
    source: apiRequestLogs.source,
    statusCode: apiRequestLogs.statusCode,
    requests: count(),
    avgDurationMs: sql`coalesce(round(avg(${apiRequestLogs.durationMs})), 0)`.mapWith(Number),
    latestAt: max(apiRequestLogs.createdAt),
  };

  const [historyRows, recentRows] = await Promise.all([
    db
      .select({ ...selection, day: dayExpression })
      .from(apiRequestLogs)
      .where(gte(apiRequestLogs.createdAt, sevenDaysAgo))
      .groupBy(apiRequestLogs.source, apiRequestLogs.statusCode, dayExpression),
    db
      .select(selection)
      .from(apiRequestLogs)
      .where(gte(apiRequestLogs.createdAt, oneHourAgo))
      .groupBy(apiRequestLogs.source, apiRequestLogs.statusCode),
  ]);
  return buildPublicStatus({ historyRows, recentRows, now });
}

export default async function StatusPage() {
  let status;
  try {
    status = await loadStatus();
  } catch (error) {
    console.error("Public status metrics unavailable:", error);
    status = buildPublicStatus({ now: new Date() });
  }

  const overall = STATUS_STYLE[status.overallStatus];
  const OverallIcon = overall.icon;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <MarketingHeader />
      <main className="flex-1">
        <section className="border-b border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-brand-700">Storezn status</p>
                <h1 className="mt-1 font-display text-3xl font-bold text-slate-900 sm:text-4xl">System availability</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-700">Live health and seven-day observed reliability for monitored Storezn services.</p>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-5xl space-y-10 px-4 py-10 sm:px-6 sm:py-14">
          <section className={`flex items-start gap-3 rounded-sm border p-4 ${overall.panel}`}>
            <div>
              <h2 className={`font-semibold ${overall.text}`}>{STATUS_LABELS[status.overallStatus]}</h2>
              <p className="mt-1 text-sm text-slate-700">
                {status.overallStatus === "unknown" ? "We could not read monitoring metrics. The status page remains available while checks recover." : `Last monitored request: ${formatChecked(status.latestAt)}.`}
              </p>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-3">
            <Metric icon={Activity} label="7-day uptime" value={formatUptime(status.uptime)} />
            <Metric icon={Clock3} label="Average response" value={status.avgDurationMs == null ? "Not available" : `${status.avgDurationMs}ms`} />
          </section>

          <section>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">Services</h2>
              <p className="mt-1 text-sm text-slate-600">Current health uses the latest hour of monitoring; uptime covers the last seven days.</p>
            </div>
            <div className="overflow-hidden rounded-sm border border-slate-200 bg-white">
              {status.services.slice(1).map((service) => {
                const style = STATUS_STYLE[service.status];
                return (
                  <div key={service.id} className="grid gap-4 border-t border-slate-100 px-4 py-4 first:border-t-0 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:px-5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                        <h3 className="font-semibold text-slate-900">{service.name}</h3>
                      </div>
                      <p className="mt-1 text-sm text-slate-600 sm:pl-[18px]">{service.description}</p>
                    </div>
                    <div className="flex gap-1" aria-label={`${service.name} daily status for seven days`}>
                      {service.daily.map((day) => {
                        const dayStatus = day.requests === 0 ? "unknown" : day.failures > 0 ? "degraded" : "operational";
                        return <span key={day.day} title={`${day.day}: ${formatUptime(day.uptime)}`} className={`h-6 w-3 rounded-[2px] ${STATUS_STYLE[dayStatus].dot}`} />;
                      })}
                    </div>
                    <div className="min-w-28 text-left sm:text-right">
                      <p className={`text-sm font-semibold ${style.text}`}>{style.label}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{formatUptime(service.uptime)} uptime</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="border-t border-slate-200 pt-6 text-sm text-slate-600">
            <p>Availability is calculated from instrumented Storezn API operations.</p>
            <p className="mt-2">Metrics updated {formatChecked(status.generatedAt)} and refresh automatically every minute.</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="border-l-2 border-brand-500 py-1 pl-4">
      <div className="flex items-center gap-2 text-slate-600">
        <Icon size={15} />
        <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
