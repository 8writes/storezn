"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Button } from "@/components/ui/Button.js";
import { Select } from "@/components/ui/Select.js";
import { formatCurrency, formatDate } from "@/lib/format.js";
import { customerFieldEntries } from "@/lib/customerFields.js";

export default function VendorInvoicesPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { stores, storeId, loading: storesLoading } = useVendorStore();
  const [requests, setRequests] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [prices, setPrices] = useState({});
  const [plan, setPlan] = useState("full");
  const [guestEmail, setGuestEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!token || !storeId) return;
    Promise.all([
      apiFetch(`/api/v1/vendor/stores/${storeId}/invoice-requests`),
      apiFetch(`/api/v1/vendor/stores/${storeId}/invoices`),
    ])
      .then(([requestData, invoiceData]) => {
        setRequests(requestData.requests || []);
        setInvoices(invoiceData.invoices || []);
      })
      .catch((err) => toast.error(err.message || "Failed to load invoice requests"))
      .finally(() => setLoading(false));
  }, [token, storeId, apiFetch]);

  const selected = requests.find((row) => row.request.id === selectedId) || null;
  const total = useMemo(
    () => (selected?.items || []).reduce((sum, item) => sum + (Number(prices[`${item.productId}:${item.variantId || ""}`]) || 0) * item.quantity, 0),
    [selected, prices],
  );

  const createInvoice = async () => {
    if (!selected) return;
    const items = selected.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId || null,
      quantity: item.quantity,
      unitPrice: Number(prices[`${item.productId}:${item.variantId || ""}`]),
    }));
    if (items.some((item) => !Number.isFinite(item.unitPrice) || item.unitPrice <= 0)) {
      toast.error("Add a valid price for every item");
      return;
    }
    setSending(true);
    try {
      const email = guestEmail.trim() || selected.request.guestEmail || "";
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/invoices`, {
        method: "POST",
        body: JSON.stringify({ requestId: selected.request.id, guestEmail: email || undefined, plan, items }),
      });
      const copied = await navigator.clipboard?.writeText(`${window.location.origin}/invoice/${data.invoice.shareToken}`).then(() => true).catch(() => false);
      toast.success(copied ? "Invoice created. Its payment link was copied." : "Invoice created. Use Copy link to share it.");
      setRequests((rows) => rows.filter((row) => row.request.id !== selected.request.id));
      setInvoices((rows) => [data.invoice, ...rows]);
      setSelectedId("");
    } catch (err) {
      toast.error(err.message || "Could not create invoice");
    } finally {
      setSending(false);
    }
  };

  const copyInvoiceLink = async (shareToken) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/invoice/${shareToken}`);
      toast.success("Payment link copied");
    } catch {
      toast.error("Could not copy the payment link");
    }
  };

  const cancelInvoice = async (invoiceId) => {
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/invoices/${invoiceId}`, { method: "PATCH", body: JSON.stringify({ action: "cancel" }) });
      setInvoices((rows) => rows.map((row) => row.id === invoiceId ? { ...row, status: "cancelled", amountDue: 0 } : row));
      toast.success("Invoice cancelled and held stock was released");
    } catch (err) {
      toast.error(err.message || "Could not cancel invoice");
    }
  };

  const selectRequest = (request, items) => {
    setSelectedId(request.id);
    setGuestEmail(request.guestEmail || "");
    setPrices(Object.fromEntries(items.map((item) => [`${item.productId}:${item.variantId || ""}`, ""])));
  };

  if (!storesLoading && stores.length === 0) return <p className="text-sm text-slate-700">No store set up yet.</p>;
  return (
    <div className="space-y-6 max-w-5xl">
      <div><h1 className="text-xl font-bold text-slate-900">Invoices</h1><p className="text-sm text-slate-600 mt-1">Review quote requests and share secure payment links by email, WhatsApp, or anywhere else.</p></div>

      {invoices.length > 0 && (
        <section className="bg-surface border border-slate-200 rounded-sm divide-y divide-slate-200">
          <div className="p-4"><h2 className="font-semibold text-slate-900">Sent invoices</h2></div>
          {invoices.map((invoice) => (
            <div key={invoice.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div><p className="font-medium text-slate-900">{invoice.invoiceNumber}</p><p className="text-sm text-slate-600">{invoice.guestEmail || invoice.buyerPhone || "Share by link"} - {invoice.status}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-900 mr-1">{formatCurrency(invoice.amountPaid)} / {formatCurrency(invoice.totalAmount)}</p>
                <Button size="sm" variant="outline" onClick={() => copyInvoiceLink(invoice.shareToken)}>Copy link</Button>
                {invoice.status === "sent" && <Button size="sm" variant="secondary" onClick={() => cancelInvoice(invoice.id)}>Cancel</Button>}
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-5">
        <section className="bg-surface border border-slate-200 rounded-sm divide-y divide-slate-200">
          {loading ? <p className="p-4 text-sm text-slate-600">Loading requests...</p> : requests.length === 0 ? <p className="p-4 text-sm text-slate-600">No invoice requests yet.</p> : requests.map(({ request, items }) => (
            <button key={request.id} type="button" onClick={() => selectRequest(request, items)} className={`w-full text-left p-4 cursor-pointer hover:bg-slate-50 ${selectedId === request.id ? "bg-brand-50" : ""}`}>
              <div className="flex items-center justify-between gap-3"><span className="font-semibold text-slate-900">{request.requestNumber}</span><span className="text-xs text-slate-600">{formatDate(request.createdAt)}</span></div>
              <p className="text-sm text-slate-700 mt-1">{request.buyerName || request.guestEmail || request.buyerPhone || "Guest buyer"}</p>
              <p className="text-xs text-slate-600 mt-1">{items.length} item{items.length === 1 ? "" : "s"} - {request.status}</p>
            </button>
          ))}
        </section>

        <section className="bg-surface border border-slate-200 rounded-sm p-5">
          {!selected ? <p className="text-sm text-slate-600">Select a request to prepare its invoice.</p> : <div className="space-y-5">
            <div><h2 className="font-semibold text-slate-900">{selected.request.requestNumber}</h2><p className="text-sm text-slate-600">{selected.request.guestEmail || selected.request.buyerPhone || "No contact details - share the link manually"}</p></div>
            <input type="email" placeholder="Customer email (optional)" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} className="w-full border border-slate-300 rounded-sm px-3 py-2 text-sm" />
            <div className="space-y-3">
              {selected.items.map((item) => {
                const key = `${item.productId}:${item.variantId || ""}`;
                const details = customerFieldEntries(item.customerFields);
                return <div key={item.id} className="grid grid-cols-[1fr_7rem] gap-3 items-end"><div><p className="text-sm font-medium text-slate-900">{item.productName}</p><p className="text-xs text-slate-600">Qty {item.quantity}{item.variantLabel ? ` - ${item.variantLabel}` : ""}</p>{details.length > 0 && <dl className="mt-2 space-y-1">{details.map((detail) => <div key={detail.id} className="text-xs text-slate-700"><dt className="inline font-medium">{detail.label}: </dt><dd className="inline">{detail.value === true ? "Yes" : detail.value === false ? "No" : String(detail.value)}</dd></div>)}</dl>}</div><input type="number" min="0.01" step="0.01" placeholder="Price" value={prices[key] || ""} onChange={(event) => setPrices((current) => ({ ...current, [key]: event.target.value }))} className="w-full border border-slate-300 rounded-sm px-2 py-2 text-sm" /></div>;
              })}
            </div>
            <div className="border-t border-slate-200 pt-4 space-y-3">
              <div className="flex justify-between text-sm"><span>Quote total</span><strong>{formatCurrency(total)}</strong></div>
              <Select label="Payment plan" options={[{ value: "full", label: "Full payment" }, { value: "deposit", label: "50/50 deposit" }]} value={plan} onChange={setPlan} />
              {plan === "deposit" && <div className="flex justify-between text-sm text-slate-700"><span>First payment (50%)</span><strong>{formatCurrency(Math.round(total * 50) / 100)}</strong></div>}
              <Button onClick={createInvoice} loading={sending} fullWidth>Create invoice and copy link</Button>
            </div>
          </div>}
        </section>
      </div>
    </div>
  );
}
