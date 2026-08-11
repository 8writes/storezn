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

const STATUS_COLOR = { pending: "amber", processing: "blue", shipped: "blue", delivered: "green", cancelled: "red", refund_requested: "amber", refunded: "slate" };
const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refund_requested", label: "Refund requested" },
  { value: "refunded", label: "Refunded" },
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

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    apiFetch(`/api/v1/super-admin/orders?${params}`)
      .then((data) => {
        setOrders(data.orders);
        setPagination(data.pagination);
      })
      .catch((err) => toast.error(err.message || "Failed to load orders"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, status, q]);

  useEffect(() => {
    setPage(1);
  }, [status, q]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Orders</h1>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="max-w-xs">
          <Select label="Status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
        </div>
        <SearchInput value={q} onSearch={setQ} placeholder="Search by order number..." className="max-w-xs" />
      </div>

      <div className="bg-white border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
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
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">{q ? "No orders match your search" : "No orders yet"}</td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{o.orderNumber}</td>
                  <td className="px-4 py-3 text-slate-500">{o.storeName}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(o.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatCurrency(o.totalAmount)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatCurrency(o.commissionAmount)}</td>
                  <td className="px-4 py-3">
                    <Badge color={STATUS_COLOR[o.status] || "slate"}>{o.status.replace("_", " ")}</Badge>
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
