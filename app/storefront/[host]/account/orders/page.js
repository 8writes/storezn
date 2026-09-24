"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCustomerAuth } from "@/hooks/useCustomerAuth.js";
import { Badge } from "@/components/ui/Badge.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { formatCurrency, formatDate } from "@/lib/format.js";

const STATUS_COLOR = { pending: "amber", processing: "blue", shipped: "blue", delivered: "green", cancelled: "red", refund_requested: "amber", refunded: "slate", refund_declined: "red" };

export default function CustomerOrdersPage() {
  const router = useRouter();
  const { user, token, loading: authLoading } = useCustomerAuth();
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login?next=account/orders");
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      Promise.all([
        fetch(`/api/v1/customer/orders?page=${page}`, { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json()),
        fetch("/api/v1/customer/invoices", { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json()),
      ])
        .then(([orderData, invoiceData]) => {
          setOrders(orderData.orders || []);
          setPagination(orderData.pagination);
          setInvoices(invoiceData.invoices || []);
        })
        .catch(() => toast.error("Could not load your orders"))
        .finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [authLoading, user, token, page, router]);

  if (authLoading || loading) return <p className="text-center text-slate-700 py-20">Loading…</p>;
  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Your orders</h1>

      {invoices.length > 0 && <section className="space-y-3"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Invoices</h2><div className="divide-y divide-slate-100 border-y border-slate-200">{invoices.map((invoice) => <a key={invoice.id} href={invoice.paymentUrl} className="flex items-center justify-between gap-3 py-4 hover:bg-slate-50 transition-colors -mx-2 px-2"><div><p className="text-sm font-medium text-slate-900">{invoice.invoiceNumber}</p><p className="text-xs text-slate-700 mt-0.5">Paid {formatCurrency(invoice.amountPaid)} of {formatCurrency(invoice.totalAmount)}</p></div><div className="text-right"><Badge color={invoice.status === "paid" ? "green" : invoice.status === "partially_paid" ? "blue" : invoice.status === "cancelled" || invoice.status === "expired" ? "red" : "amber"}>{invoice.status.replace("_", " ")}</Badge><p className="text-xs text-slate-700 mt-1">Due {formatCurrency(invoice.amountDue)}</p></div></a>)}</div></section>}

      {orders.length === 0 ? (
        <p className="text-sm text-slate-700">You haven&apos;t placed any orders yet.</p>
      ) : (
        <div className="divide-y divide-slate-100 border-y border-slate-200">
          {orders.map((o) => (
            <Link key={o.id} href={`/account/orders/${o.id}`} className="flex items-center justify-between py-4 hover:bg-slate-50 transition-colors -mx-2 px-2">
              <div>
                <p className="text-sm font-medium text-slate-900">{o.orderNumber}</p>
                <p className="text-xs text-slate-700 mt-0.5">{formatDate(o.createdAt)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-700">{formatCurrency(o.totalAmount)}</span>
                <Badge color={STATUS_COLOR[o.status] || "slate"}>{o.status.replace("_", " ")}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
      <Pagination pagination={pagination} onPageChange={setPage} />
    </div>
  );
}
