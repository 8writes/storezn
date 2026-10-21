"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button.js";
import { Input } from "@/components/ui/Input.js";
import { PriceInput } from "@/components/ui/PriceInput.js";
import { UsdHint } from "@/components/ui/UsdHint.js";
import { formatCurrency } from "@/lib/format.js";
import { computeOrderTotals } from "@/lib/orders.js";
import { depositPercentOf } from "@/lib/invoiceLabels.js";
import { useModalScrollLock } from "@/hooks/useModalScrollLock.js";
import { InvoiceTotalsSummary, PlanPicker, isValidDepositPercent } from "@/components/invoices/PlanPicker.js";

// Change an invoice nothing has been paid on yet: prices, how they pay,
// customer details and note. The link and invoice number stay the same, so
// the customer just reopens it. The server re-checks that it's still
// unpaid (PATCH .../invoices/[id], action "update").
export function EditInvoiceModal({ storeId, apiFetch, invoice, items, order, pricing, onClose, onSaved }) {
  const [prices, setPrices] = useState(() => Object.fromEntries(items.map((item) => [item.id, String(item.unitPrice ?? "")])));
  const [plan, setPlan] = useState(invoice.plan === "deposit" ? "deposit" : "full");
  const [depositPercent, setDepositPercent] = useState(() => depositPercentOf(invoice) || 50);
  const [details, setDetails] = useState({
    buyerName: invoice.buyerName || "",
    buyerPhone: invoice.buyerPhone || "",
    guestEmail: invoice.guestEmail || "",
    note: invoice.note || "",
  });
  const [saving, setSaving] = useState(false);
  useModalScrollLock(true);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + (Number(prices[item.id]) || 0) * item.quantity, 0),
    [items, prices],
  );
  const policy = order?.international && pricing.intlFeePolicy ? pricing.intlFeePolicy : pricing.feePolicy;
  const totals = useMemo(() => computeOrderTotals({
    subtotal,
    shippingFee: 0,
    commissionRatePercent: policy?.commissionRatePercent ?? 0,
    flatFee: policy?.flatFee ?? 0,
    feeChargedToCustomer: policy?.feeChargedToCustomer ?? false,
    maxCommissionAmount: policy?.maxCommissionAmount,
  }), [subtotal, policy]);

  const save = async () => {
    const lines = items.map((item) => ({ id: item.id, unitPrice: Number(prices[item.id]) }));
    if (lines.some((line) => !Number.isFinite(line.unitPrice) || line.unitPrice <= 0)) return toast.error("Add a price for every item");
    if (plan === "deposit" && !isValidDepositPercent(depositPercent)) return toast.error("Choose a first payment between 10% and 90%");
    setSaving(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/invoices/${invoice.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "update",
          items: lines,
          plan,
          ...(plan === "deposit" ? { depositPercent } : {}),
          buyerName: details.buyerName.trim(),
          buyerPhone: details.buyerPhone.trim(),
          guestEmail: details.guestEmail.trim(),
          note: details.note.trim(),
        }),
      });
      toast.success("Invoice updated. The same link now shows the new amount.");
      onSaved(data.invoice);
    } catch (err) {
      toast.error(err.message || "Could not update the invoice");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center overscroll-none sm:p-4">
      <div className="fixed inset-0 bg-black/50" onClick={saving ? undefined : onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="edit-invoice-title" className="relative z-10 flex max-h-[92dvh] w-full flex-col rounded-t-sm bg-surface shadow-xl sm:max-w-xl sm:rounded-sm">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-5">
          <div className="min-w-0">
            <h2 id="edit-invoice-title" className="font-semibold text-slate-900">Edit invoice</h2>
            <p className="mt-0.5 text-sm text-slate-600">{invoice.invoiceNumber} · the link stays the same</p>
          </div>
          <button type="button" aria-label="Close" disabled={saving} onClick={onClose} className="shrink-0 rounded-sm p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"><X size={20} /></button>
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-5">
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="rounded-sm border border-slate-200 p-3 grid grid-cols-[minmax(0,1fr)_8.5rem] gap-3 items-start">
                <div className="min-w-0 pt-1.5">
                  <p className="text-sm font-medium text-slate-900">{item.productName}</p>
                  <p className="text-xs text-slate-600">Qty {item.quantity}{item.variantLabel ? ` · ${item.variantLabel}` : ""}</p>
                </div>
                <PriceInput
                  aria-label={`Price each for ${item.productName}`}
                  placeholder="Price each"
                  leadingText="₦"
                  value={prices[item.id] || ""}
                  onChange={(value) => setPrices((current) => ({ ...current, [item.id]: value }))}
                  usdRate={pricing.usdRate}
                />
              </div>
            ))}
          </div>

          <PlanPicker plan={plan} onPlanChange={setPlan} depositPercent={depositPercent} onDepositPercentChange={setDepositPercent} />

          <InvoiceTotalsSummary
            subtotal={subtotal}
            totals={totals}
            feeChargedToCustomer={!!policy?.feeChargedToCustomer}
            plan={plan}
            depositPercent={depositPercent}
            usdHint={<UsdHint ngn={totals.totalAmount} rate={pricing.usdRate} className="font-normal" />}
            formatCurrency={formatCurrency}
          />

          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-700">Customer <span className="font-normal text-slate-500">(optional)</span></p>
            <Input label="Name" value={details.buyerName} onChange={(e) => setDetails((d) => ({ ...d, buyerName: e.target.value }))} maxLength={150} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Phone or WhatsApp" type="tel" value={details.buyerPhone} onChange={(e) => setDetails((d) => ({ ...d, buyerPhone: e.target.value }))} maxLength={30} />
              <Input label="Email" type="email" value={details.guestEmail} onChange={(e) => setDetails((d) => ({ ...d, guestEmail: e.target.value }))} />
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">Note (optional)</span>
              <textarea rows={2} value={details.note} onChange={(e) => setDetails((d) => ({ ...d, note: e.target.value }))} maxLength={2000} className="w-full border border-slate-300 rounded-sm px-3 py-2 text-sm bg-surface" />
            </label>
          </div>
        </div>

        <div className="border-t border-slate-200 p-4 sm:p-5 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save changes</Button>
        </div>
      </div>
    </div>
  );
}
