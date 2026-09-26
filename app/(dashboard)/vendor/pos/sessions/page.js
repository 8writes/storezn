"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { History, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Select } from "@/components/ui/Select.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { EmptyState } from "@/components/ui/EmptyState.js";
import { PageHeader } from "@/components/ui/PageHeader.js";
import { formatKobo } from "@/lib/money.js";
import { formatDateTime } from "@/lib/format.js";

export default function SessionsPage() {
  const router = useRouter();
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const [stores, setStores] = useState([]);
  const [storesLoaded, setStoresLoaded] = useState(false);
  const [storeId, setStoreId] = useState("");
  // The whole feed in one value, tagged with the store it was loaded for.
  // `loadedPage` is 0 until the first page for this store has arrived.
  const [feed, setFeed] = useState({ storeId: null, page: 1, loadedPage: 0, sessions: [], pagination: null });
  const [loadingMore, setLoadingMore] = useState(false);

  // Everything below is derived, so switching stores shows an empty,
  // loading feed with nothing having to clear it in an effect.
  const isCurrentStore = feed.storeId === storeId;
  const sessions = isCurrentStore ? feed.sessions : [];
  const pagination = isCurrentStore ? feed.pagination : null;
  const page = isCurrentStore ? feed.page : 1;
  // Before a store is known we're waiting on the store list; after that,
  // on this store's first page. An account with no store at all settles on
  // "not loading" and renders the empty state.
  const loading = storeId ? !isCurrentStore || feed.loadedPage === 0 : !storesLoaded;

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/v1/vendor/stores")
      .then((data) => {
        setStores(data.stores);
        setStoresLoaded(true);
        if (data.stores[0]) setStoreId(data.stores[0].id);
      })
      .catch((err) => toast.error(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!storeId) return undefined;
    const requestedPage = page;
    let active = true;
    apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sessions?page=${requestedPage}&pageSize=20`)
      .then((data) => {
        if (!active) return;
        setFeed((current) => ({
          storeId,
          page: requestedPage,
          loadedPage: requestedPage,
          // Page 1 replaces; later pages append to what is already showing
          // for THIS store (never to a previous store's list).
          sessions:
            requestedPage === 1 || current.storeId !== storeId
              ? data.sessions
              : [...current.sessions, ...data.sessions],
          pagination: data.pagination || null,
        }));
      })
      .catch((err) => {
        if (active) toast.error(err.message);
      })
      .finally(() => {
        if (active) setLoadingMore(false);
      });
    return () => {
      active = false;
    };
  }, [apiFetch, storeId, page]);

  // Asking for the next page is a button press, which is the right place
  // to turn its own spinner on.
  const loadMore = () => {
    setLoadingMore(true);
    setFeed((current) => ({ ...current, storeId, page: (current.storeId === storeId ? current.page : 1) + 1 }));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <BackLink href="/vendor/pos/registers" label="Back to registers" />
      <PageHeader
        title="Register sessions"
        description="Review register openings, closings, cash differences, and Z report history."
      />

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
                <td colSpan={4} className="px-4 py-6">
                  <EmptyState
                    icon={History}
                    title="No sessions yet"
                    description="Register sessions will appear here after a till is opened and closed."
                    className="border-0 bg-transparent py-8"
                  />
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
                onClick={loadMore}
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
