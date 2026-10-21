"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button.js";
import { Input } from "@/components/ui/Input.js";
import { PriceInput } from "@/components/ui/PriceInput.js";
import { UsdHint } from "@/components/ui/UsdHint.js";
import { OrderItemModal } from "@/components/ui/OrderItemModal.js";
import { formatCurrency } from "@/lib/format.js";
import { customerFieldEntries } from "@/lib/customerFields.js";
import { computeOrderTotals } from "@/lib/orders.js";
import { useModalScrollLock } from "@/hooks/useModalScrollLock.js";
import { InvoiceTotalsSummary, PlanPicker, isValidDepositPercent } from "@/components/invoices/PlanPicker.js";

// "Set prices" for one quote request, then create the invoice and go to
// it. Used from the quote requests list, and straight after a vendor
// creates a quote on the Invoices page, so they carry on without hunting
// for it.
//
// row: { request, items } as returned by the invoice-requests API.
// feePolicy / intlFeePolicy / usdRate: from GET /invoices (same numbers the
// server prices with - lib/feePolicy.js).
export function QuotePricingModal({ storeId, apiFetch, row, feePolicy, intlFeePolicy, usdRate, onClose }) {
  const router = useRouter();
  const { request, items } = row;
  const [prices, setPrices] = useState(() => Object.fromEntries(items.map((item) => [item.id, ""])));
  const [plan, setPlan] = useState("full");
  // First payment on a part-payment plan, as a whole percent (10-90).
  const [depositPercent, setDepositPercent] = useState(50);
  const [guestEmail, setGuestEmail] = useState(request.guestEmail || "");
  const [sending, setSending] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  useModalScrollLock(true);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + (Number(prices[item.id]) || 0) * item.quantity, 0),
    [items, prices],
  );
  // The customer said they'll pay with a card from outside Nigeria, so it's
  // priced with the international fees - the server decides the same way.
  const international = !!request.international && !!intlFeePolicy;
  const policy = international ? intlFeePolicy : feePolicy;
  const totals = useMemo(() => computeOrderTotals({
    subtotal: total,
    shippingFee: 0,
    commissionRatePercent: policy?.commissionRatePercent ?? 0,
    flatFee: policy?.flatFee ?? 0,
    feeChargedToCustomer: policy?.feeChargedToCustomer ?? false,
    maxCommissionAmount: policy?.maxCommissionAmount,
  }), [total, policy]);

  const createInvoice = async () => {
    // Keyed by request line, so a custom (product-less) line prices the
    // same way as a catalogue one.
    const lines = items.map((item) => ({
      requestItemId: item.id,
      ...(item.productId ? { productId: item.productId, variantId: item.variantId || null } : {}),
      quantity: item.quantity,
      unitPrice: Number(prices[item.id]),
    }));
    if (lines.some((line) => !Number.isFinite(line.unitPrice) || line.unitPrice <= 0)) {
      toast.error("Add a price for every item");
      return;
    }
    if (plan === "deposit" && !isValidDepositPercent(depositPercent)) {
      toast.error("Choose a first payment between 10% and 90%");
      return;
    }
    setSending(true);
    try {
      const email = guestEmail.trim() || request.guestEmail || "";
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/invoices`, {
        method: "POST",
        body: JSON.stringify({ requestId: request.id, guestEmail: email || undefined, plan, ...(plan === "deposit" ? { depositPercent } : {}), items: lines }),
      });
      // Straight to the finished invoice, where the link is ready to copy
      // or send on WhatsApp.
      router.push(`/vendor/invoices/${data.invoice.id}?storeId=${storeId}&created=1`);
    } catch (err) {
      toast.error(err.message || "Could not create invoice");
      setSending(false);
    }
  };

  const customer = [request.buyerName, request.buyerPhone, request.guestEmail].filter(Boolean).join(" · ");

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center overscroll-none sm:p-4">
        <div className="fixed inset-0 bg-black/50" onClick={sending ? undefined : onClose} />
        <div role="dialog" aria-modal="true" aria-labelledby="quote-pricing-title" className="relative z-10 flex max-h-[92dvh] w-full flex-col rounded-t-sm bg-surface shadow-xl sm:max-w-xl sm:rounded-sm">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-5">
            <div className="min-w-0">
              <h2 id="quote-pricing-title" className="font-semibold text-slate-900">Set prices</h2>
              <p className="mt-0.5 text-sm text-slate-600 truncate">{customer || "No customer details yet - they'll add them when paying"}</p>
            </div>
            <button type="button" aria-label="Close" disabled={sending} onClick={onClose} className="shrink-0 rounded-sm p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"><X size={20} /></button>
          </div>

          <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-5">
            <div className="space-y-2">
              {items.map((item) => {
                const details = customerFieldEntries(item.customerFields);
                const unitPrice = Number(prices[item.id]) || 0;
                return (
                  <div key={item.id} className="rounded-sm border border-slate-200 p-3 space-y-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-3 items-start">
                      <button
                        type="button"
                        onClick={() => setActiveItem({ ...item, unitPrice, lineTotal: unitPrice * item.quantity })}
                        className="min-w-0 text-left cursor-pointer rounded-sm hover:text-brand-700 pt-1.5"
                      >
                        <p className="text-sm font-medium text-slate-900">{item.productName}</p>
                        <p className="text-xs text-slate-600">
                          Qty {item.quantity}{item.variantLabel ? ` · ${item.variantLabel}` : ""}{item.productId ? "" : " · Custom item"}
                        </p>
                        {unitPrice > 0 && item.quantity > 1 && <p className="text-xs text-slate-600 tabular-nums">{formatCurrency(unitPrice * item.quantity)} total</p>}
                      </button>
                      <PriceInput
                        aria-label={`Price each for ${item.productName}`}
                        placeholder="Price each"
                        leadingText="₦"
                        value={prices[item.id] || ""}
                        onChange={(value) => setPrices((current) => ({ ...current, [item.id]: value }))}
                        usdRate={usdRate}
                      />
                    </div>
                    {details.length > 0 && (
                      <dl className="bg-slate-50 border border-slate-200 rounded-sm p-3 space-y-1.5">
                        {details.map((detail) => (
                          <div key={detail.id} className="flex justify-between gap-3 text-xs text-slate-700">
                            <dt className="font-medium">{detail.label}</dt>
                            <dd className="text-right">{detail.value === true ? "Yes" : detail.value === false ? "No" : String(detail.value)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                );
              })}
            </div>

            {!request.guestEmail && (
              <Input label="Customer email (optional)" hint="We'll email them the invoice. You can also send the link yourself." type="email" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} />
            )}

            <PlanPicker plan={plan} onPlanChange={setPlan} depositPercent={depositPercent} onDepositPercentChange={setDepositPercent} />

            {international && <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">The customer is paying with a card from outside Nigeria, so the higher processing fee applies.</p>}

            <InvoiceTotalsSummary
              subtotal={total}
              totals={totals}
              feeChargedToCustomer={!!policy?.feeChargedToCustomer}
              plan={plan}
              depositPercent={depositPercent}
              usdHint={<UsdHint ngn={totals.totalAmount} rate={usdRate} className="font-normal" />}
              formatCurrency={formatCurrency}
            />
          </div>

          <div className="border-t border-slate-200 p-4 sm:p-5">
            <Button onClick={createInvoice} loading={sending} fullWidth>Create invoice</Button>
          </div>
        </div>
      </div>
      <OrderItemModal
        item={activeItem}
        productHref={activeItem?.productId ? `/vendor/products/${activeItem.productId}?storeId=${storeId}` : null}
        onClose={() => setActiveItem(null)}
      />
    </>
  );
}
