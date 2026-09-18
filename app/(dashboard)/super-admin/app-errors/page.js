"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Badge } from "@/components/ui/Badge.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { TableRowSkeleton } from "@/components/ui/Skeleton.js";
import { formatDateTime } from "@/lib/format.js";

const LEVEL_COLOR = { error: "red", warn: "amber", info: "blue" };

function compactJson(value) {
  if (!value) return null;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function SuperAdminAppErrorsPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [errors, setErrors] = useState(null);
  const [stats, setStats] = useState({ open: 0, resolved: 0 });
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("all");
  const [resolved, setResolved] = useState("false");
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (q.trim()) params.set("q", q.trim());
    if (level !== "all") params.set("level", level);
    if (resolved !== "all") params.set("resolved", resolved);
    return params.toString();
  }, [page, q, level, resolved]);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/api/v1/super-admin/app-errors?${query}`);
      setErrors(data.errors);
      setStats(data.stats || { open: 0, resolved: 0 });
      setPagination(data.pagination);
    } catch (err) {
      toast.error(err.message || "Failed to load application errors");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    queueMicrotask(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, query]);

  const toggleResolved = async (row, next) => {
    try {
      const data = await apiFetch("/api/v1/super-admin/app-errors", {
        method: "PATCH",
        body: JSON.stringify({ id: row.id, resolved: next }),
      });
      setErrors((rows) => rows?.map((r) => (r.id === row.id ? data.error : r)) || rows);
      setStats((s) => ({
        open: Math.max(0, s.open + (next ? -1 : 1)),
        resolved: Math.max(0, s.resolved + (next ? 1 : -1)),
      }));
      toast.success(next ? "Marked resolved" : "Reopened");
    } catch (err) {
      toast.error(err.message || "Could not update error");
    }
  };

  const clearOld = async () => {
    if (!window.confirm("Delete application error logs older than 1 hour?")) return;
    setClearing(true);
    try {
      const data = await apiFetch("/api/v1/super-admin/app-errors", { method: "DELETE" });
      toast.success(`Deleted ${data.deleted || 0} old error log${data.deleted === 1 ? "" : "s"}`);
      await load();
    } catch (err) {
      toast.error(err.message || "Could not clear old errors");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Application errors</h1>
          <p className="text-sm text-slate-800 mt-1">Server-side failures captured from checkout, payments, auth, uploads, and admin flows.</p>
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="border border-red-100 bg-red-50 rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Open</p>
          <p className="mt-1 text-2xl font-bold text-red-900 tabular-nums">{stats.open.toLocaleString()}</p>
        </div>
        <div className="border border-slate-200 bg-surface rounded-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-800">Resolved</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{stats.resolved.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-slate-100 border border-slate-300 rounded-sm p-3">
        <div className="grid gap-3 lg:grid-cols-[1fr_160px_180px]">
          <label className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder="Search message, source, route, request id"
              className="w-full pl-9 pr-3 py-2 rounded-sm border border-slate-400 bg-surface text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <select
            value={level}
            onChange={(e) => {
              setPage(1);
              setLevel(e.target.value);
            }}
            className="rounded-sm border border-slate-400 px-3 py-2 text-sm bg-surface text-slate-900"
          >
            <option value="all">All levels</option>
            <option value="error">Errors</option>
            <option value="warn">Warnings</option>
            <option value="info">Info</option>
          </select>
          <select
            value={resolved}
            onChange={(e) => {
              setPage(1);
              setResolved(e.target.value);
            }}
            className="rounded-sm border border-slate-400 px-3 py-2 text-sm bg-surface text-slate-900"
          >
            <option value="false">Open only</option>
            <option value="true">Resolved only</option>
            <option value="all">All statuses</option>
          </select>
        </div>
      </div>

      <div className="bg-surface border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-800 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Error</th>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {errors === null ? (
              <TableRowSkeleton cols={5} />
            ) : errors.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">No matching errors</td>
              </tr>
            ) : (
              errors.map((row) => {
                const metadata = compactJson(row.metadata);
                return (
                  <tr key={row.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                    <td className="px-4 py-3 min-w-56">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge color={LEVEL_COLOR[row.level] || "slate"}>{row.level}</Badge>
                        <span className="font-semibold text-slate-900">{row.source}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-800 font-mono break-all">{row.method || "-"} {row.route || "-"}</p>
                      {row.requestId && <p className="mt-1 text-xs text-slate-400 font-mono break-all">{row.requestId}</p>}
                    </td>
                    <td className="px-4 py-3 min-w-96">
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={16} className="mt-0.5 text-red-500 shrink-0" />
                        <div>
                          <p className="font-semibold text-slate-900">{row.name || "Error"}</p>
                          <p className="mt-1 text-slate-700 break-words">{row.message}</p>
                        </div>
                      </div>
                      {(row.stack || metadata) && (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs font-semibold text-slate-800">Details</summary>
                          {row.stack && <pre className="mt-2 max-w-3xl overflow-x-auto rounded-sm bg-slate-950 p-3 text-xs text-slate-100">{row.stack}</pre>}
                          {metadata && <pre className="mt-2 max-w-3xl overflow-x-auto rounded-sm bg-slate-50 p-3 text-xs text-slate-700">{metadata}</pre>}
                        </details>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      <p>{row.userRole || "-"}</p>
                      <p className="mt-1 text-xs font-mono break-all">{row.userId || ""}</p>
                      {row.storeId && <p className="mt-1 text-xs font-mono break-all">store {row.storeId}</p>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {row.resolved ? (
                        <button
                          type="button"
                          onClick={() => toggleResolved(row, false)}
                          className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-sm border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <RotateCcw size={14} /> Reopen
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleResolved(row, true)}
                          className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-sm border border-brand-300 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                        >
                          <CheckCircle2 size={14} /> Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>
    </div>
  );
}
