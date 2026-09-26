"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Select } from "@/components/ui/Select.js";
import { Badge } from "@/components/ui/Badge.js";
import { SearchInput } from "@/components/ui/SearchInput.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { TableRowSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency, formatDate } from "@/lib/format.js";

const STATUS_COLOR = { pending: "amber", processing: "blue", shipped: "blue", delivered: "green", cancelled: "red", abandoned: "slate", refund_requested: "amber", refunded: "slate", refund_declined: "red" };
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

// Platform-wide view across every store - the vendor-side equivalent
// (app/(dashboard)/vendor/orders) only ever sees its own store.
export default function SuperAdminOrdersPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  // One fetch path, cancellable. `loading` starts true and is only cleared
  // when a fetch settles; it is switched back on by whichever interaction
  // asks for fresh data (the handlers below), never synchronously inside
  // this effect. `alive` drops the response of a request whose inputs have
  // already changed, so a slow earlier reply can't land on top of a newer
  // one.
  useEffect(() => {
    if (!token) return undefined;
    let alive = true;
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    apiFetch(`/api/v1/super-admin/orders?${params}`)
      .then((data) => {
        if (!alive) return;
        setOrders(data.orders);
        setPagination(data.pagination);
      })
      .catch((err) => {
        if (alive) toast.error(err.message || "Failed to load orders");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [apiFetch, token, page, status, q]);

  // Changing a filter resets to the first page - done in the event that
  // causes it rather than in an effect watching the filter.
  const handleSearch = (value) => {
    setLoading(true);
    setPage(1);
    setQ(value);
  };

  const handleStatus = (next) => {
    setLoading(true);
    setPage(1);
    setStatus(next);
  };

  const handlePageChange = (next) => {
    setLoading(true);
    setPage(next);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Orders</h1>

      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="max-w-xs">
          <Select label="Status" options={STATUS_OPTIONS} value={status} onChange={handleStatus} />
        </div>
        <SearchInput value={q} onSearch={handleSearch} placeholder="Search by order number..." className="max-w-xs" />
      </div>

      <div className="bg-surface border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-800 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Store</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Commission</th>
              <th className="px-4 py-3 font-medium">Status</th>
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
                <tr key={o.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{o.orderNumber}</td>
                  <td className="px-4 py-3 text-slate-800">{o.storeName}</td>
                  <td className="px-4 py-3 text-slate-800">{formatDate(o.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-800">{formatCurrency(o.totalAmount)}</td>
                  <td className="px-4 py-3 text-slate-800">{formatCurrency(o.commissionAmount + (o.flatFeeAmount || 0))}</td>
                  <td className="px-4 py-3">
                    <Badge color={STATUS_COLOR[o.status] || "slate"}>{o.status.replace("_", " ")}</Badge>
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
