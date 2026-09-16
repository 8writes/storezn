"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Button } from "@/components/ui/Button.js";
import { formatCurrency, formatDateTime } from "@/lib/format.js";
import { toNaira } from "@/lib/money.js";

const RECEIPT_CSS = `
@media print {
  body { background: #fff; }
  .no-print { display: none !important; }
  .receipt { box-shadow: none !important; border: 0 !important; margin: 0 !important; width: auto !important; }
}
@page { size: 80mm auto; margin: 4mm; }
`;

const METHOD = { cash: "Cash", card: "POS", transfer: "Transfer", wallet: "Wallet", store_credit: "Store credit" };

export default function ReceiptPage({ params }) {
  const { id } = use(params);
  const storeId = useSearchParams().get("storeId");
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const [state, setState] = useState(null); // { order, items, tenders, storeName }

  useEffect(() => {
    if (!token || !storeId) return;
    Promise.all([
      apiFetch(`/api/v1/vendor/stores/${storeId}/orders/${id}`),
      apiFetch("/api/v1/vendor/stores"),
    ])
      .then(([o, s]) => {
        const store = s.stores.find((x) => x.id === storeId);
        setState({ ...o, storeName: store?.name || "" });
      })
      .catch((err) => toast.error(err.message || "Couldn't load the receipt"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId, id]);

  if (!state) return <div className="max-w-xs mx-auto h-80 bg-slate-100 rounded-sm animate-pulse" />;

  const { order, items, tenders, storeName } = state;
  const discount = Number(order.discountAmount || 0); // kobo
  const subtotal = Number(order.subtotal || 0);
  const cashChange = (tenders || []).reduce((s, t) => s + Number(t.changeGiven || 0), 0);

  return (
    <div className="max-w-sm mx-auto space-y-4">
      <style>{RECEIPT_CSS}</style>

      <div className="no-print flex items-center justify-between gap-2">
        <Link href={`/vendor/orders/${id}?storeId=${storeId}`} className="text-sm text-slate-800 hover:text-slate-800">
          Order detail
        </Link>
        <div className="flex gap-2">
          <Link href="/vendor/pos">
            <Button type="button" variant="outline" size="sm">
              New sale
            </Button>
          </Link>
          <Button type="button" size="sm" onClick={() => window.print()}>
            Print receipt
          </Button>
        </div>
      </div>

      <div className="receipt bg-surface border border-slate-200 rounded-sm p-5 font-mono text-[13px] text-slate-900 leading-relaxed">
        <div className="text-center">
          <p className="font-bold text-sm uppercase">{storeName}</p>
          <p className="text-slate-800 text-[11px]">{formatDateTime(order.paidAt || order.createdAt)}</p>
          <p className="text-slate-800 text-[11px]">Receipt {order.orderNumber}</p>
        </div>

        <div className="border-t border-dashed border-slate-300 my-2" />

        <table className="w-full">
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="align-top">
                <td className="py-0.5 pr-2">
                  {it.quantity}× {it.productName}
                  {it.variantLabel ? <div className="text-slate-800 text-[11px]">{it.variantLabel}</div> : null}
                  {it.priceOverridden ? <div className="text-slate-800 text-[11px]">@ {formatCurrency(it.unitPrice)}</div> : null}
                </td>
                <td className="py-0.5 text-right tabular-nums whitespace-nowrap">{formatCurrency(it.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t border-dashed border-slate-300 my-2" />

        <div className="space-y-0.5">
          {discount > 0 && (
            <>
              <Line label="Subtotal" value={formatCurrency(subtotal)} />
              <Line label="Discount" value={`- ${formatCurrency(toNaira(discount))}`} />
            </>
          )}
          <Line label="TOTAL" value={formatCurrency(order.totalAmount)} strong />
        </div>

        {tenders && tenders.length > 0 && (
          <>
            <div className="border-t border-dashed border-slate-300 my-2" />
            <div className="space-y-0.5">
              {tenders.map((t) => (
                <Line
                  key={t.id}
                  label={`${METHOD[t.method] || t.method}${t.provider ? ` · ${t.provider}` : ""}`}
                  value={formatCurrency(toNaira(t.amount))}
                />
              ))}
              {cashChange > 0 && <Line label="Change (cash from drawer)" value={formatCurrency(toNaira(cashChange))} />}
            </div>
          </>
        )}

        <div className="border-t border-dashed border-slate-300 my-2" />
        <p className="text-center text-[11px] text-slate-800">Thank you</p>
        {order.note ? <p className="text-center text-[11px] text-slate-400 mt-1">{order.note}</p> : null}
      </div>
    </div>
  );
}

function Line({ label, value, strong }) {
  return (
    <div className={`flex justify-between ${strong ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
