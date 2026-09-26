"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Badge } from "@/components/ui/Badge.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format.js";

const STATUS_COLOR = { pending: "amber", processing: "blue", shipped: "blue", delivered: "green", cancelled: "red", refund_requested: "amber", refunded: "slate", refund_declined: "red" };

export default function VendorCustomerDetailPage({ params }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const storeId = searchParams.get("storeId");
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  // Data is tagged with the customer it belongs to, so `loading` can be
  // derived instead of set synchronously inside the effect, and navigating
  // to a different customer shows the skeleton rather than the previous
  // customer's details.
  const [loaded, setLoaded] = useState(null);
  const key = `${storeId}:${id}`;
  const data = loaded?.key === key ? loaded.data : null;
  const loading = !data;

  useEffect(() => {
    if (!storeId || !token) return undefined;
    let alive = true;
    apiFetch(`/api/v1/vendor/stores/${storeId}/customers/${id}`)
      .then((next) => {
        if (alive) setLoaded({ key, data: next });
      })
      .catch((err) => {
        if (alive) toast.error(err.message || "Could not load customer");
      });
    return () => {
      alive = false;
    };
  }, [apiFetch, storeId, id, token, key]);

  if (loading) return <FormSkeleton />;
  if (!data) return null;

  const { customer, orders, stats } = data;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <BackLink href="/vendor/customers" label="Back to customers" />

      <div>
        <h1 className="text-xl font-bold text-slate-900">{customer.firstName} {customer.lastName}</h1>
        <p className="text-sm text-slate-800">Customer since {formatDate(customer.createdAt)}</p>
      </div>

      <div className="bg-surface border border-slate-200 rounded-sm p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-slate-700">Email</p>
          <p className="text-slate-900 font-medium">{customer.email}</p>
        </div>
        <div>
          <p className="text-slate-700">Phone</p>
          <p className="text-slate-900 font-medium">{customer.phone || "-"}</p>
        </div>
        <div>
          <p className="text-slate-700">Orders placed</p>
          <p className="text-slate-900 font-medium">{stats.orderCount}</p>
        </div>
        <div>
          <p className="text-slate-700">Total spent</p>
          <p className="text-slate-900 font-medium">{formatCurrency(stats.totalSpent)}</p>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Order history</h2>
        <div className="bg-surface border border-slate-200 rounded-sm divide-y divide-slate-100">
          {orders.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-700">No orders yet</p>
          ) : (
            orders.map((o) => (
              <Link
                key={o.id}
                href={`/vendor/orders/${o.id}?storeId=${storeId}`}
                className="flex items-center justify-between p-4 hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{o.orderNumber}</p>
                  <p className="text-xs text-slate-700">{formatDateTime(o.createdAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-700">{formatCurrency(o.totalAmount)}</span>
                  <Badge color={STATUS_COLOR[o.status] || "slate"}>{o.status.replace("_", " ")}</Badge>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
