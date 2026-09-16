"use client";
import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { History, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency, formatDateTime } from "@/lib/format.js";

export default function ProductHistoryPage({ params }) {
  const { id } = use(params);
  const storeId = useSearchParams().get("storeId");
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!token || !storeId) return;
    apiFetch(`/api/v1/vendor/stores/${storeId}/products/${id}/history`)
      .then(setData).catch((error) => toast.error(error.message || "Failed to load product history"));
  }, [token, storeId, id, apiFetch]);

  if (!data) return <div className="space-y-5"><BackLink href={`/vendor/products/${id}?storeId=${storeId}`} label="Back to product" /><FormSkeleton fields={4} /></div>;

  return <div className="space-y-6 max-w-5xl mx-auto">
    <BackLink href={`/vendor/products/${id}?storeId=${storeId}`} label="Back to product" />
    <div><h1 className="text-xl font-bold text-slate-900">{data.product.name} history</h1>
      <p className="text-sm text-slate-600">Changes and every recorded sale price.</p></div>

    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><History size={16} /> Changes</h2>
      <div className="bg-surface border border-slate-200 rounded-sm divide-y divide-slate-100">
        {data.changes.length === 0 ? <p className="p-4 text-sm text-slate-600">No recorded changes yet.</p> : data.changes.map((entry) =>
          <div key={entry.id} className="p-3 flex items-start justify-between gap-4">
            <div><p className="text-sm text-slate-900">{entry.summary}</p><p className="text-xs text-slate-600">{entry.actorName}{entry.metadata?.branchName ? ` - ${entry.metadata.branchName}` : ""}</p></div>
            <time className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(entry.createdAt)}</time>
          </div>)}
      </div>
    </section>

    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><ShoppingBag size={16} /> Sales ({data.sales.length})</h2>
      <div className="bg-surface border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-slate-700"><tr>
          <th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Order</th>
          <th className="px-3 py-2 font-medium">Branch</th><th className="px-3 py-2 font-medium">Variant</th>
          <th className="px-3 py-2 font-medium text-right">Qty</th><th className="px-3 py-2 font-medium text-right">Sold price</th>
        </tr></thead><tbody>{data.sales.map((sale) => {
          const qty = Math.abs(sale.quantity);
          const effectivePrice = qty ? Math.abs(Number(sale.lineTotal)) / qty : Number(sale.unitPrice);
          return <tr key={sale.id} className="border-t border-slate-100">
            <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(sale.soldAt)}</td>
            <td className="px-3 py-2"><Link href={`/vendor/orders/${sale.orderId}?storeId=${storeId}`} className="text-brand-700 hover:underline">{sale.orderNumber}</Link><span className="block text-xs text-slate-500 capitalize">{sale.isReturn ? "return" : sale.channel}</span></td>
            <td className="px-3 py-2">{sale.branchName || "-"}</td><td className="px-3 py-2">{sale.variantLabel || "Base product"}</td>
            <td className={`px-3 py-2 text-right ${sale.isReturn ? "text-red-600" : ""}`}>{sale.quantity}</td>
            <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(effectivePrice)}{sale.priceOverridden && <span className="block text-xs text-amber-700">overridden</span>}</td>
          </tr>;
        })}</tbody></table>
        {data.sales.length === 0 && <p className="p-4 text-sm text-slate-600">No sales recorded for this product.</p>}
      </div>
    </section>
  </div>;
}
