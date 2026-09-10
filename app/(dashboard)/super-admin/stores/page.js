"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { Badge } from "@/components/ui/Badge.js";
import { SearchInput } from "@/components/ui/SearchInput.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { TableRowSkeleton } from "@/components/ui/Skeleton.js";

// Stores are created via vendor self-signup, not by the super_admin - this
// is a read-only oversight list (search + enable/disable + drill into
// details), not an onboarding form.
export default function SuperAdminStoresPage() {
  const router = useRouter();
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { confirm, confirmDialog } = useConfirm();

  const [stores, setStores] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (q.trim()) params.set("q", q.trim());
    apiFetch(`/api/v1/super-admin/stores?${params.toString()}`)
      .then((data) => {
        setStores(data.stores);
        setPagination(data.pagination);
      })
      .catch((err) => toast.error(err.message || "Failed to load stores"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, q]);

  useEffect(() => {
    setPage(1);
  }, [q]);

  const toggleActive = async (store) => {
    if (store.isActive) {
      const ok = await confirm({
        title: `Disable ${store.name}?`,
        description: "The vendor won't be able to log in or manage this store until you re-enable it.",
        confirmLabel: "Disable",
        variant: "danger",
      });
      if (!ok) return;
    }

    setTogglingId(store.id);
    try {
      const data = await apiFetch(`/api/v1/super-admin/stores/${store.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !store.isActive }),
      });
      setStores((list) => list.map((s) => (s.id === store.id ? data.store : s)));
      toast.success(data.store.isActive ? "Store enabled" : "Store disabled");
    } catch (err) {
      toast.error(err.message || "Failed to update store");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Stores</h1>

      <SearchInput value={q} onSearch={setQ} placeholder="Search by store name or slug..." className="max-w-sm" />

      <div className="bg-surface border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Payout account</th>
              <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableRowSkeleton cols={5} />
            ) : stores.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-700">{q ? "No stores match your search" : "No stores yet"}</td>
              </tr>
            ) : (
              stores.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => router.push(`/super-admin/stores/${s.id}`)}
                  className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-slate-700">{s.slug}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {s.owner ? `${s.owner.firstName} ${s.owner.lastName}` : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={s.isActive ? "green" : "red"}>{s.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {s.subAccountCode ? `${s.bankName} · ${s.accountNumber}` : <span className="text-slate-700">Not set</span>}
                  </td>
                  <td className="px-4 py-3 text-right space-x-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Link href={`/super-admin/stores/${s.id}`} className="text-brand-600 hover:underline">View</Link>
                    <button
                      type="button"
                      onClick={() => toggleActive(s)}
                      disabled={togglingId === s.id}
                      className="text-brand-600 hover:underline cursor-pointer disabled:text-slate-700 disabled:cursor-wait"
                    >
                      {s.isActive ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>
      {confirmDialog}
    </div>
  );
}
