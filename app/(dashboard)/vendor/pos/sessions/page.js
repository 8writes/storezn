"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Select } from "@/components/ui/Select.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { formatKobo } from "@/lib/money.js";
import { formatDateTime } from "@/lib/format.js";

export default function SessionsPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");
  const [sessions, setSessions] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => setPage(1), [storeId]);

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sessions?page=${page}&pageSize=20`)
      .then((data) => {
        setSessions(data.sessions);
        setPagination(data.pagination || null);
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
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

      <div className="bg-white border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
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
                <td colSpan={4} className="px-4 py-6 text-slate-500 text-center">
                  No sessions yet
                </td>
              </tr>
            ) : (
              sessions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/vendor/pos/sessions/${s.id}?storeId=${storeId}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {s.registerName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{formatDateTime(s.openedAt)}</td>
                  <td className="px-4 py-2.5">
                    {s.status === "open" ? (
                      <span className="text-emerald-600 font-medium">Open</span>
                    ) : (
                      <span className="text-slate-500">Closed</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {s.overShort == null ? (
                      "—"
                    ) : (
                      <span className={s.overShort === 0 ? "text-slate-500" : "text-red-600"}>{formatKobo(s.overShort)}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>
    </div>
  );
}
