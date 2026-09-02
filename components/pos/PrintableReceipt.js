"use client";
import { Button } from "@/components/ui/Button.js";
import { formatCurrency } from "@/lib/format.js";
import { X } from "lucide-react";

const RECEIPT_CSS = `
@media print {
  body { background: #fff; }
  .no-print { display: none !important; }
  .receipt-modal-backdrop { position: static !important; background: none !important; }
  .receipt-modal { position: static !important; box-shadow: none !important; max-height: none !important; }
  .receipt { box-shadow: none !important; border: 0 !important; }
}
@page { size: 80mm auto; margin: 4mm; }
`;

const METHOD = { cash: "Cash", card: "POS", transfer: "Transfer", wallet: "Wallet", store_credit: "Store credit" };

function Line({ label, value, strong }) {
  return (
    <div className={`flex justify-between ${strong ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

// An 80mm receipt rendered from local sale data - used the moment a sale
// completes (so the counter can print now), including the offline case
// where there's no server order to fetch yet.
export function PrintableReceipt({ storeName, orderNumber, soldAt, lines, tenders, subtotal, discount = 0, total, note, pending, onClose }) {
  const change = (tenders || []).reduce((s, t) => s + Number(t.changeGiven || 0), 0);

  return (
    <div className="receipt-modal-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/50 no-print" onClick={onClose} />
      <div className="receipt-modal relative bg-white rounded-t-sm sm:rounded-sm shadow-xl w-full sm:max-w-sm max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-3 border-b border-slate-100 no-print">
          <p className="text-sm font-bold text-slate-900">{pending ? "Saved offline" : "Sale complete"}</p>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          {pending && (
            <p className="no-print mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2">
              No connection - this sale is queued and will sync automatically when you&apos;re back online.
            </p>
          )}
          <div className="receipt bg-white border border-slate-200 rounded-sm p-5 font-mono text-[13px] text-slate-900 leading-relaxed">
            <div className="text-center">
              <p className="font-bold text-sm uppercase">{storeName}</p>
              <p className="text-slate-500 text-[11px]">{new Date(soldAt).toLocaleString()}</p>
              <p className="text-slate-500 text-[11px]">Receipt {orderNumber}</p>
            </div>
            <div className="border-t border-dashed border-slate-300 my-2" />
            <table className="w-full">
              <tbody>
                {lines.map((it, i) => (
                  <tr key={i} className="align-top">
                    <td className="py-0.5 pr-2">
                      {it.quantity}× {it.name}
                      {it.variantLabel ? <div className="text-slate-500 text-[11px]">{it.variantLabel}</div> : null}
                      {it.priceOverridden ? <div className="text-slate-500 text-[11px]">@ {formatCurrency(it.unitPrice)}</div> : null}
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
                  <Line label="Discount" value={`- ${formatCurrency(discount)}`} />
                </>
              )}
              <Line label="TOTAL" value={formatCurrency(total)} strong />
            </div>
            {tenders?.length > 0 && (
              <>
                <div className="border-t border-dashed border-slate-300 my-2" />
                <div className="space-y-0.5">
                  {tenders.map((t, i) => (
                    <Line key={i} label={METHOD[t.method] || t.method} value={formatCurrency(t.amount)} />
                  ))}
                  {change > 0 && <Line label="Change" value={formatCurrency(change)} />}
                </div>
              </>
            )}
            <div className="border-t border-dashed border-slate-300 my-2" />
            <p className="text-center text-[11px] text-slate-500">Thank you</p>
            {note ? <p className="text-center text-[11px] text-slate-400 mt-1">{note}</p> : null}
          </div>
        </div>

        <div className="flex gap-2 p-3 border-t border-slate-100 no-print">
          <Button type="button" variant="outline" fullWidth onClick={() => window.print()}>
            Print
          </Button>
          <Button type="button" fullWidth onClick={onClose}>
            Next sale
          </Button>
        </div>
      </div>
    </div>
  );
}
