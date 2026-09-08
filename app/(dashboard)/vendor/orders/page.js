"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Select } from "@/components/ui/Select.js";
import { Badge } from "@/components/ui/Badge.js";
import { Button } from "@/components/ui/Button.js";
import { SearchInput } from "@/components/ui/SearchInput.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { TableRowSkeleton, CardListSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency, formatDate } from "@/lib/format.js";
import { Plus } from "lucide-react";

const STATUS_COLOR = { pending: "amber", processing: "blue", shipped: "blue", delivered: "green", cancelled: "red", abandoned: "slate", refund_requested: "amber", refunded: "slate", refund_declined: "red" };

// ["card:Moniepoint", "cash"] -> "POS (Moniepoint) + Cash"
const METHOD_NAME = { cash: "Cash", transfer: "Transfer", wallet: "Wallet", store_credit: "Store credit" };
function paidByLabel(methods) {
  if (!methods?.length) return null;
  return methods
    .map((m) => {
      if (m.startsWith("card")) {
        const p = m.slice(5);
        return `POS${p ? ` (${p})` : ""}`;
      }
      return METHOD_NAME[m] || m;
    })
    .join(" + ");
}
const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refund_requested", label: "Refund requested" },
  { value: "refunded", label: "Refunded" },
  { value: "refund_declined", label: "Refund declined" },
  { value: "abandoned", label: "Abandoned" },
];

export default function VendorOrdersPage() {
  const router = useRouter();
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const { stores, storeId, loading: storesLoading } = useVendorStore();
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Also gated on token, not just storeId - see VendorStoreContext.js:
    // storeId can already be populated (shared context, not remounted)
    // before this page's own token has resolved on a client-side
    // navigation, which would otherwise fire this fetch with no
    // Authorization header.
    if (!token || !storeId) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (status) params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    apiFetch(`/api/v1/vendor/stores/${storeId}/orders?${params}`)
      .then((data) => {
        setOrders(data.orders);
        setPagination(data.pagination);
      })
      .catch((err) => toast.error(err.message || "Failed to load orders"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId, page, status, q]);

  useEffect(() => {
    setPage(1);
  }, [status, q, storeId]);

  if (!storesLoading && stores.length === 0) {
    return <p className="text-sm text-slate-700">No store set up yet.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-slate-900">Orders</h1>
        <Link href="/vendor/orders/new">
          <Button type="button" size="sm" variant="outline">
            <Plus size={14} /> Record a past sale
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="w-full sm:max-w-xs">
          <Select label="Status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
        </div>
        <SearchInput value={q} onSearch={setQ} placeholder="Search by order number..." className="w-full sm:max-w-xs" />
      </div>

      {/* Mobile: stacked cards - the table needs horizontal scrolling on a
          phone, which hides the status and actions columns. */}
      <div className="space-y-3 sm:hidden">
        {loading ? (
          <CardListSkeleton count={5} />
        ) : orders.length === 0 ? (
          <p className="bg-white border border-slate-200 rounded-sm px-4 py-6 text-center text-sm text-slate-700">
            {q ? "No orders match your search" : "No orders yet"}
          </p>
        ) : (
          orders.map((o) => (
            <div
              key={o.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/vendor/orders/${o.id}?storeId=${storeId}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") router.push(`/vendor/orders/${o.id}?storeId=${storeId}`);
              }}
              className="bg-white border border-slate-200 rounded-sm p-4 space-y-2 cursor-pointer hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex items-center gap-2 font-medium text-slate-900">
                  {o.orderNumber}
                  {o.isOffline && <Badge color="slate">Offline</Badge>}
                </span>
                <span className="text-sm font-medium text-slate-900 shrink-0">{formatCurrency(o.totalAmount)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                  {formatDate(o.createdAt)}
                  {paidByLabel(o.paymentMethods) && <span className="text-slate-400"> · {paidByLabel(o.paymentMethods)}</span>}
                </span>
                <Badge color={STATUS_COLOR[o.status] || "slate"}>{o.status.replace("_", " ")}</Badge>
              </div>
            </div>
          ))
        )}
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>

      {/* Desktop: table */}
      <div className="hidden sm:block bg-white border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Paid by</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableRowSkeleton cols={6} />
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-700">{q ? "No orders match your search" : "No orders yet"}</td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => router.push(`/vendor/orders/${o.id}?storeId=${storeId}`)}
                  className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <span className="inline-flex items-center gap-2">
                      {o.orderNumber}
                      {o.isOffline && <Badge color="slate">Offline</Badge>}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(o.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatCurrency(o.totalAmount)}</td>
                  <td className="px-4 py-3 text-slate-500">{paidByLabel(o.paymentMethods) || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge color={STATUS_COLOR[o.status] || "slate"}>{o.status.replace("_", " ")}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <Link href={`/vendor/orders/${o.id}?storeId=${storeId}`} className="text-brand-600 hover:underline">View</Link>
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
