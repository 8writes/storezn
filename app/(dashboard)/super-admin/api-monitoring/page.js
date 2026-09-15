"use client";
import { useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Badge } from "@/components/ui/Badge.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { TableRowSkeleton } from "@/components/ui/Skeleton.js";
import { formatDateTime } from "@/lib/format.js";

function statusColor(status) {
  if (status >= 500) return "red";
  if (status >= 400) return "amber";
  if (status >= 300) return "blue";
  return "green";
}

export default function SuperAdminApiMonitoringPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const [requests, setRequests] = useState(null);
  const [slowRoutes, setSlowRoutes] = useState([]);
  const [stats, setStats] = useState({ total: 0, errors: 0, clientErrors: 0, avgDurationMs: 0 });
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("24h");
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20", range });
    if (q.trim()) params.set("q", q.trim());
    if (status !== "all") params.set("status", status);
    return params.toString();
  }, [page, q, status, range]);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/api/v1/super-admin/api-monitoring?${query}`);
      setRequests(data.requests);
      setStats(data.stats || { total: 0, errors: 0, clientErrors: 0, avgDurationMs: 0 });
      setSlowRoutes(data.slowRoutes || []);
      setPagination(data.pagination);
    } catch (err) {
      toast.error(err.message || "Failed to load API monitoring");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    queueMicrotask(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, query]);

  const resetPage = (fn) => (value) => {
    setPage(1);
    fn(value);
  };

  const clearOld = async () => {
    if (!window.confirm("Delete API monitoring records older than 1 hour?")) return;
    setClearing(true);
    try {
      const data = await apiFetch("/api/v1/super-admin/api-monitoring", { method: "DELETE" });
      toast.success(`Deleted ${data.deleted || 0} old request log${data.deleted === 1 ? "" : "s"}`);
      await load();
    } catch (err) {
      toast.error(err.message || "Could not clear old API logs");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">API monitoring</h1>
          <p className="text-sm text-slate-500 mt-1">Request status, duration, and backend failures for monitored API endpoints.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={clearOld}
            disabled={clearing}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-sm border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 size={16} />
            Clear old
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-sm border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Requests" value={stats.total} />
        <Metric label="5xx errors" value={stats.errors} tone="red" />
        <Metric label="4xx responses" value={stats.clientErrors} tone="amber" />
        <Metric label="Avg duration" value={`${stats.avgDurationMs || 0}ms`} />
      </div>

      <div className="bg-surface border border-slate-200 rounded-sm p-3">
        <div className="grid gap-3 lg:grid-cols-[1fr_140px_140px]">
          <label className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => resetPage(setQ)(e.target.value)}
              placeholder="Search route, source, request id, error"
              className="w-full pl-9 pr-3 py-2 rounded-sm border border-slate-300 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <select value={status} onChange={(e) => resetPage(setStatus)(e.target.value)} className="rounded-sm border border-slate-300 px-3 py-2 text-sm bg-white">
            <option value="all">All status</option>
            <option value="2xx">2xx</option>
            <option value="4xx">4xx</option>
            <option value="5xx">5xx</option>
          </select>
          <select value={range} onChange={(e) => resetPage(setRange)(e.target.value)} className="rounded-sm border border-slate-300 px-3 py-2 text-sm bg-white">
            <option value="1h">Last hour</option>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7 days</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="bg-surface border border-slate-200 rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Endpoint</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {requests === null ? (
                <TableRowSkeleton cols={5} />
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">No matching requests</td>
                </tr>
              ) : (
                requests.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                    <td className="px-4 py-3 min-w-72">
                      <p className="font-semibold text-slate-900">{row.source}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500 break-all">{row.method} {row.route}</p>
                      {row.requestId && <p className="mt-1 font-mono text-xs text-slate-400 break-all">{row.requestId}</p>}
                    </td>
                    <td className="px-4 py-3"><Badge color={statusColor(row.statusCode)}>{row.statusCode}</Badge></td>
                    <td className="px-4 py-3 text-slate-700 tabular-nums">{row.durationMs}ms</td>
                    <td className="px-4 py-3 text-slate-600 min-w-72">
                      {row.errorMessage ? (
                        <>
                          <p className="font-semibold text-slate-900">{row.errorName || "Error"}</p>
                          <p className="mt-1 break-words">{row.errorMessage}</p>
                        </>
                      ) : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination pagination={pagination} onPageChange={setPage} />
        </div>

        <aside className="bg-surface border border-slate-200 rounded-sm p-4 h-fit">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-brand-600" />
            <h2 className="font-bold text-slate-900">Slow routes</h2>
          </div>
          <div className="mt-4 space-y-3">
            {slowRoutes.length === 0 ? (
              <p className="text-sm text-slate-400">No route data yet</p>
            ) : (
              slowRoutes.map((r) => (
                <div key={`${r.source}-${r.route}`} className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                  <p className="text-sm font-semibold text-slate-900">{r.source}</p>
                  <p className="mt-1 text-xs font-mono text-slate-500 break-all">{r.route}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {r.hits} hit{r.hits === 1 ? "" : "s"} - avg {r.avgDurationMs}ms - max {r.maxDurationMs}ms
                    {r.errors > 0 ? ` - ${r.errors} error${r.errors === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-surface text-slate-900",
    red: "border-red-100 bg-red-50 text-red-900",
    amber: "border-amber-100 bg-amber-50 text-amber-900",
  };
  return (
    <div className={`rounded-sm border p-4 ${tones[tone] || tones.slate}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</p>
    </div>
  );
}
