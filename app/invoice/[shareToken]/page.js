"use client";

import { use, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button.js";
import { formatCurrency, formatDate } from "@/lib/format.js";

export default function PublicInvoicePage({ params }) {
  const { shareToken } = use(params);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/storefront/invoices/${shareToken}`).then(async (res) => { const body = await res.json(); if (!res.ok) throw new Error(body.error || "Invoice not found"); setData(body); }).catch((err) => setError(err.message));
  }, [shareToken]);

  const pay = async () => {
    setPaying(true);
    try {
      const res = await fetch(`/api/v1/storefront/invoices/${shareToken}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not start payment");
      window.location.assign(body.authorizationUrl);
    } catch (err) { setError(err.message); setPaying(false); }
  };

  if (error) return <main className="min-h-screen grid place-items-center p-6"><p className="text-sm text-red-700">{error}</p></main>;
  if (!data) return <main className="min-h-screen grid place-items-center p-6"><p className="text-sm text-slate-600">Loading invoice...</p></main>;
  const { invoice, items, store } = data;
  const paid = invoice.status === "paid";
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8"><div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-sm p-5 sm:p-8 shadow-sm"><div className="flex items-center gap-3 border-b border-slate-200 pb-5">{store.logoUrl && <img src={store.logoUrl} alt="" className="w-12 h-12 rounded-sm object-cover" />}<div><h1 className="text-xl font-bold text-slate-900">{store.name}</h1><p className="text-sm text-slate-600">Invoice {invoice.invoiceNumber}</p></div></div><div className="py-5 space-y-3">{items.map((item) => <div key={item.id} className="flex justify-between gap-4 text-sm"><span className="text-slate-700">{item.productName}{item.variantLabel ? ` · ${item.variantLabel}` : ""} × {item.quantity}</span><span className="font-medium text-slate-900">{formatCurrency(item.lineTotal)}</span></div>)}</div><div className="border-t border-slate-200 pt-4 space-y-2"><div className="flex justify-between font-semibold text-slate-900"><span>Total</span><span>{formatCurrency(invoice.totalAmount)}</span></div><div className="flex justify-between text-sm text-slate-700"><span>Paid</span><span>{formatCurrency(invoice.amountPaid)}</span></div><div className="flex justify-between text-sm font-semibold text-brand-700"><span>Due now</span><span>{formatCurrency(invoice.amountDue)}</span></div></div><div className="pt-6 space-y-3">{invoice.expiresAt && <p className="text-xs text-slate-600">Valid until {formatDate(invoice.expiresAt)}</p>}{paid ? <p className="text-sm font-semibold text-green-700">Paid in full. Thank you.</p> : <Button onClick={pay} loading={paying} fullWidth>Pay {formatCurrency(invoice.amountDue)}</Button>}</div></div></main>;
}
