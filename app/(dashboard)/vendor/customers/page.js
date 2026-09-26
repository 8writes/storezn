"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { SearchInput } from "@/components/ui/SearchInput.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { TableRowSkeleton } from "@/components/ui/Skeleton.js";
import { PageHeader } from "@/components/ui/PageHeader.js";
import { EmptyState } from "@/components/ui/EmptyState.js";
import { formatCurrency, formatDate } from "@/lib/format.js";
import { Users } from "lucide-react";

export default function VendorCustomersPage() {
  const router = useRouter();
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const { stores, storeId, loading: storesLoading } = useVendorStore();
  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [pageStoreId, setPageStoreId] = useState(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  // `page` only counts for the store it was chosen on - switching stores
  // falls back to page 1 without an effect resetting it (the store comes
  // from the shared context, so there's no event on this page to hang a
  // reset off).
  const effectivePage = pageStoreId === storeId ? page : 1;

  // One fetch path, cancellable. `loading` starts true and is only cleared
  // when a fetch settles; it is switched back on by whichever interaction
  // asks for fresh data (the handlers below), never synchronously inside
  // this effect. `alive` drops the response of a request whose inputs have
  // already changed, so a slow earlier reply can't land on top of a newer
  // one.
  useEffect(() => {
    // Also gated on token, not just storeId - see VendorStoreContext.js:
    // storeId can already be populated (shared context, not remounted)
    // before this page's own token has resolved on a client-side
    // navigation, which would otherwise fire this fetch with no
    // Authorization header.
    if (!token || !storeId) return undefined;
    let alive = true;
    const params = new URLSearchParams({ page: String(effectivePage), pageSize: "20" });
    if (q.trim()) params.set("q", q.trim());
    apiFetch(`/api/v1/vendor/stores/${storeId}/customers?${params}`)
      .then((data) => {
        if (!alive) return;
        setCustomers(data.customers);
        setPagination(data.pagination);
      })
      .catch((err) => {
        if (alive) toast.error(err.message || "Failed to load customers");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [apiFetch, token, storeId, effectivePage, q]);

  // A new search resets to the first page - done in the event that causes
  // it rather than in an effect watching `q`.
  const handleSearch = (value) => {
    setLoading(true);
    setPage(1);
    setPageStoreId(storeId);
    setQ(value);
  };

  const handlePageChange = (next) => {
    setLoading(true);
    setPageStoreId(storeId);
    setPage(next);
  };

  if (!storesLoading && stores.length === 0) {
    return <p className="text-sm text-slate-700">No store set up yet.</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="See who buys from your store, how often they order, and their lifetime spend."
      />

      <div className="bg-surface border border-slate-200 rounded-sm p-3 sm:p-4">
        <SearchInput value={q} onSearch={handleSearch} placeholder="Search by name or email..." className="w-full sm:max-w-sm" />
      </div>

      <div className="bg-surface border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-800 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Orders</th>
              <th className="px-4 py-3 font-medium">Total spent</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableRowSkeleton cols={7} />
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6">
                  <EmptyState
                    icon={Users}
                    title={q ? "No matching customers" : "No customers yet"}
                    description={q ? "Try searching another name or email." : "Customer profiles will appear here after people place orders."}
                    className="border-0 bg-transparent py-8"
                  />
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/vendor/customers/${c.id}?storeId=${storeId}`)}
                  className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">{c.firstName} {c.lastName}</td>
                  <td className="px-4 py-3 text-slate-800">{c.email}</td>
                  <td className="px-4 py-3 text-slate-800">{c.phone || "-"}</td>
                  <td className="px-4 py-3 text-slate-800">{c.orderCount}</td>
                  <td className="px-4 py-3 text-slate-800">{formatCurrency(c.totalSpent)}</td>
                  <td className="px-4 py-3 text-slate-800">{formatDate(c.createdAt)}</td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <Link href={`/vendor/customers/${c.id}?storeId=${storeId}`} className="text-brand-600 hover:underline">View</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination pagination={pagination} onPageChange={handlePageChange} />
      </div>
    </div>
  );
}
