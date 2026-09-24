"use client";

import { use, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button.js";
import { Input } from "@/components/ui/Input.js";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format.js";
import { customerFieldEntries } from "@/lib/customerFields.js";
import { generateBrandShades } from "@/lib/colorShades.js";

export default function PublicInvoicePage({ params }) {
  const { shareToken } = use(params);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [email, setEmail] = useState("");
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/storefront/invoices/${shareToken}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Invoice not found");
        setData(body);
      })
      .catch((err) => setError(err.message));
  }, [shareToken]);

  const pay = async () => {
    setPaymentError("");
    setPaying(true);
    try {
      const res = await fetch(`/api/v1/storefront/invoices/${shareToken}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(email.trim() ? { email: email.trim() } : {}),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not start payment");
      window.location.assign(body.authorizationUrl);
    } catch (err) {
      setPaymentError(err.message);
      setPaying(false);
    }
  };

  if (error) return <main className="min-h-screen grid place-items-center p-6"><p className="text-sm text-red-700">{error}</p></main>;
  if (!data) return <main className="min-h-screen grid place-items-center p-6"><p className="text-sm text-slate-600">Loading invoice...</p></main>;
  const { invoice, items, store } = data;
  const paid = invoice.status === "paid";
  const expired = invoice.isExpired;
  const payable = ["sent", "partially_paid"].includes(invoice.status) && !expired;

  return (
    <main
      className="min-h-screen bg-slate-50 p-4 sm:p-8"
      style={
        store.storefrontAccentColor
          ? generateBrandShades(store.storefrontAccentColor)
          : undefined
      }
    >
      <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-sm p-5 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-200 pb-5">
          {store.logoUrl && (
            <img
              src={store.logoUrl}
              alt=""
              className="w-12 h-12 rounded-sm object-cover"
            />
          )}
          <div>
            <h1 className="text-xl font-bold text-slate-900">{store.name}</h1>
            <p className="text-sm text-slate-600">
              Invoice {invoice.invoiceNumber}
            </p>
          </div>
        </div>
        <div className="py-5 space-y-3">
          {items.map((item) => {
            const details = customerFieldEntries(item.customerFields);
            return (
              <div key={item.id} className="flex justify-between gap-4 text-sm">
                <div>
                  <p className="text-slate-700">
                    {item.productName}
                    {item.variantLabel ? ` - ${item.variantLabel}` : ""} x{" "}
                    {item.quantity}
                  </p>
                  {details.map((detail) => (
                    <p key={detail.id} className="text-xs text-slate-600 mt-1">
                      {detail.label}:{" "}
                      {detail.value === true
                        ? "Yes"
                        : detail.value === false
                          ? "No"
                          : String(detail.value)}
                    </p>
                  ))}
                </div>
                <span className="font-medium text-slate-900">
                  {formatCurrency(item.lineTotal)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="border-t border-slate-200 pt-4 space-y-2">
          {invoice.feeChargedToCustomer && (
            <div className="flex justify-between text-sm text-slate-700">
              <span>Subtotal</span>
              <span>{formatCurrency(invoice.subtotal)}</span>
            </div>
          )}
          {invoice.commissionAmount > 0 && (
            <div className="flex justify-between text-sm text-slate-700">
              <span>Platform fee ({invoice.commissionRatePercent}%)</span>
              <span>{formatCurrency(invoice.commissionAmount)}</span>
            </div>
          )}
          {invoice.flatFeeAmount > 0 && (
            <div className="flex justify-between text-sm text-slate-700">
              <span>Flat fee</span>
              <span>{formatCurrency(invoice.flatFeeAmount)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-slate-900">
            <span>Total</span>
            <span>{formatCurrency(invoice.totalAmount)}</span>
          </div>
          <div className="flex justify-between text-sm text-slate-700">
            <span>Paid</span>
            <span>{formatCurrency(invoice.amountPaid)}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold text-brand-700">
            <span>Due now</span>
            <span>{formatCurrency(invoice.amountDue)}</span>
          </div>
        </div>
        <div className="pt-6 space-y-3">
          {invoice.orderStatus && invoice.amountPaid > 0 && (
            <p className="text-sm text-slate-700">
              Order status:{" "}
              <strong className="capitalize text-slate-900">
                {invoice.orderStatus.replace("_", " ")}
              </strong>
            </p>
          )}
          {invoice.expiresAt && invoice.status === "sent" && (
            <p className="text-xs text-slate-600">
              Valid until {formatDate(invoice.expiresAt)}
            </p>
          )}
          {invoice.status === "partially_paid" && (
            <p className="text-xs text-slate-600">
              Your deposit is confirmed. The remaining balance stays payable
              from this link.
            </p>
          )}
          {paid ? (
            <p className="text-sm font-semibold text-green-700">
              Paid in full. Thank you.
            </p>
          ) : !payable ? (
            <p className="text-sm font-semibold text-slate-700">
              This invoice is {expired ? "expired" : invoice.status} and can no
              longer be paid.
            </p>
          ) : (
            <>
              {invoice.requiresPaymentEmail && (
                <Input
                  type="email"
                  label="Email for payment receipt"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              )}
              {paymentError && (
                <p className="text-sm text-red-700">{paymentError}</p>
              )}
              <Button onClick={pay} loading={paying} fullWidth>
                Pay {formatCurrency(invoice.amountDue)}
              </Button>
              <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span>
                  Powered by{" "}
                  <strong className="font-semibold text-slate-700">
                    Storezn
                  </strong>
                </span>
                <span aria-hidden="true">&middot;</span>
                <span className="inline-flex items-center gap-1.5">
                  Secured by Paystack
                </span>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
