"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Select } from "@/components/ui/Select.js";
import { Badge } from "@/components/ui/Badge.js";
import { SearchInput } from "@/components/ui/SearchInput.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { TableRowSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency, formatDateTime } from "@/lib/format.js";

const STATUS_COLOR = { pending: "amber", paid: "green", failed: "red" };
const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "failed", label: "Failed" },
];

// Platform-wide payment audit trail - every checkout attempt regardless
// of outcome, so a payment that never got a webhook (or got one that
// failed to apply) is still visible instead of silently vanishing. See
// app/api/v1/super-admin/transactions/route.js for why this is a
// separate route from Orders (which only ever shows paid orders).
export default function SuperAdminTransactionsPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [summary, setSummary] = useState(null);
  const [page, setPage] = useState(1);
  const [paymentStatus, setPaymentStatus] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (paymentStatus) params.set("paymentStatus", paymentStatus);
    if (q.trim()) params.set("q", q.trim());
    apiFetch(`/api/v1/super-admin/transactions?${params}`)
      .then((data) => {
        setTransactions(data.transactions);
        setPagination(data.pagination);
        setSummary(data.summary);
      })
      .catch((err) => toast.error(err.message || "Failed to load transactions"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, paymentStatus, q]);

  useEffect(() => {
    setPage(1);
  }, [paymentStatus, q]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Transactions</h1>
        <p className="text-sm text-slate-500 mt-1">
          Every checkout attempt platform-wide - initiated, pending, paid, or failed - so nothing gets lost between a customer paying and an order updating.
        </p>
      </div>

      {summary?.pendingCount > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-sm p-4 text-sm text-amber-800">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p>
            {summary.pendingCount} transaction{summary.pendingCount === 1 ? "" : "s"} still pending. If any of these were paid at Paystack but never
            updated here, look up the payment reference directly in the Paystack dashboard.
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="max-w-xs">
          <Select label="Payment status" options={STATUS_OPTIONS} value={paymentStatus} onChange={setPaymentStatus} />
        </div>
        <SearchInput value={q} onSearch={setQ} placeholder="Search by order number..." className="max-w-xs" />
      </div>

      <div className="bg-white border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Store</th>
              <th className="px-4 py-3 font-medium">Initiated</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Commission</th>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableRowSkeleton cols={7} />
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">{q ? "No transactions match your search" : "No transactions yet"}</td>
              </tr>
            ) : (
              transactions.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{t.orderNumber}</td>
                  <td className="px-4 py-3 text-slate-500">{t.storeName}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(t.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatCurrency(t.totalAmount)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatCurrency(t.commissionAmount)}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">{t.isOffline ? "offline sale" : t.paymentReference}</td>
                  <td className="px-4 py-3">
                    <Badge color={STATUS_COLOR[t.paymentStatus] || "slate"}>{t.paymentStatus}</Badge>
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
