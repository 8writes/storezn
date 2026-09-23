"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Select } from "@/components/ui/Select.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { formatKobo } from "@/lib/money.js";
import { formatDateTime } from "@/lib/format.js";

export default function SessionsPage() {
  const router = useRouter();
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");
  const [sessions, setSessions] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/v1/vendor/stores")
      .then((data) => {
        setStores(data.stores);
        if (data.stores[0]) setStoreId(data.stores[0].id);
        else setLoading(false);
      })
      .catch((err) => toast.error(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    setPage(1);
    setSessions([]);
    setPagination(null);
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    const requestedPage = page;
    let active = true;
    if (requestedPage === 1) setLoading(true);
    else setLoadingMore(true);
    apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sessions?page=${requestedPage}&pageSize=20`)
      .then((data) => {
        if (!active) return;
        setSessions((current) => requestedPage === 1 ? data.sessions : [...current, ...data.sessions]);
        setPagination(data.pagination || null);
      })
      .catch((err) => {
        if (active) toast.error(err.message);
      })
      .finally(() => {
        if (!active) return;
        if (requestedPage === 1) setLoading(false);
        else setLoadingMore(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, page]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <BackLink href="/vendor/pos/registers" label="Back to registers" />
      <h1 className="text-xl font-bold text-slate-900">Register sessions</h1>

      {stores.length > 1 && (
        <div className="w-52">
          <Select options={stores.map((s) => ({ value: s.id, label: s.name }))} value={storeId} onChange={setStoreId} />
        </div>
      )}

      <div className="bg-surface border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-800 border-b border-slate-100">
              <th className="px-4 py-2.5 font-semibold">Register</th>
              <th className="px-4 py-2.5 font-semibold">Opened</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold text-right">Over / short</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-slate-800 text-center">
                  No sessions yet
                </td>
              </tr>
            ) : (
              sessions.map((s) => (
                <tr
                  key={s.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/vendor/pos/sessions/${s.id}?storeId=${storeId}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/vendor/pos/sessions/${s.id}?storeId=${storeId}`);
                    }
                  }}
                  className="hover:bg-slate-50 focus:outline-none focus-visible:bg-brand-50 cursor-pointer"
                >
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-slate-900">
                      {s.registerName}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{formatDateTime(s.openedAt)}</td>
                  <td className="px-4 py-2.5">
                    {s.status === "open" ? (
                      <span className="text-emerald-600 font-medium">Open</span>
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <span className="text-slate-800">Closed</span>
                        {s.closeMethod === "forced_uncounted" && (
                          <span className="rounded-sm bg-red-100 text-red-700 text-[10px] font-semibold px-1.5 py-0.5">not counted</span>
                        )}
                        {s.provisional && (
                          <span className="rounded-sm bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5">provisional</span>
                        )}
                        {s.reviewStatus === "pending" && (
                          <span className="rounded-sm bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5">review</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {s.overShort == null ? (
                      "N/A"
                    ) : (
                      <span className={s.overShort === 0 ? "text-slate-800" : "text-red-600"}>{formatKobo(s.overShort)}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {pagination && pagination.total > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-700 sm:flex-row sm:text-sm">
            <span className="tabular-nums">
              Showing {sessions.length.toLocaleString()} of {pagination.total.toLocaleString()}
            </span>
            {page < pagination.totalPages && (
              <button
                type="button"
                onClick={() => setPage((current) => current + 1)}
                disabled={loadingMore}
                className="inline-flex min-h-9 items-center gap-2 rounded-sm border border-slate-300 bg-surface px-3 py-1.5 font-medium text-slate-800 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {loadingMore && <Loader2 size={15} className="animate-spin" />}
                {loadingMore ? "Loading sessions..." : "Load more sessions"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
