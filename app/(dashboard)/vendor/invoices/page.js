"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Button } from "@/components/ui/Button.js";
import { Select } from "@/components/ui/Select.js";
import { formatCurrency, formatDate } from "@/lib/format.js";

export default function VendorInvoicesPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { stores, storeId, loading: storesLoading } = useVendorStore();
  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [prices, setPrices] = useState({});
  const [plan, setPlan] = useState("full");
  const [deposit, setDeposit] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!token || !storeId) return;
    apiFetch(`/api/v1/vendor/stores/${storeId}/invoice-requests`)
      .then((data) => setRequests(data.requests || []))
      .catch((err) => toast.error(err.message || "Failed to load invoice requests"))
      .finally(() => setLoading(false));
  }, [token, storeId, apiFetch]);

  const selected = requests.find((row) => row.request.id === selectedId) || null;
  const total = useMemo(() => (selected?.items || []).reduce((sum, item) => sum + (Number(prices[`${item.productId}:${item.variantId || ""}`]) || 0) * item.quantity, 0), [selected, prices]);

  const createInvoice = async () => {
    if (!selected) return;
    const items = selected.items.map((item) => ({ productId: item.productId, variantId: item.variantId || null, quantity: item.quantity, unitPrice: Number(prices[`${item.productId}:${item.variantId || ""}`]), customerFields: item.customerFields || {} }));
    if (items.some((item) => !Number.isFinite(item.unitPrice) || item.unitPrice <= 0)) return toast.error("Add a valid price for every item");
    if (plan === "deposit" && (!Number.isFinite(Number(deposit)) || Number(deposit) <= 0 || Number(deposit) > total)) return toast.error("Enter a deposit up to the invoice total");
    setSending(true);
    try {
      const email = guestEmail.trim() || selected.request.guestEmail || "";
      if (!email) return toast.error("Add the customer's email so they can pay the invoice");
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/invoices`, { method: "POST", body: JSON.stringify({ requestId: selected.request.id, guestEmail: email, plan, depositAmount: plan === "deposit" ? Number(deposit) : undefined, items }) });
      await navigator.clipboard?.writeText(`${window.location.origin}/invoice/${data.invoice.shareToken}`).catch(() => {});
      toast.success("Invoice created. Its payment link was copied.");
      setRequests((rows) => rows.filter((row) => row.request.id !== selected.request.id));
      setSelectedId("");
    } catch (err) {
      toast.error(err.message || "Could not create invoice");
    } finally {
      setSending(false);
    }
  };

  if (!storesLoading && stores.length === 0) return <p className="text-sm text-slate-700">No store set up yet.</p>;
  return (
    <div className="space-y-6 max-w-5xl">
      <div><h1 className="text-xl font-bold text-slate-900">Invoices</h1><p className="text-sm text-slate-600 mt-1">Review quote requests and send a secure payment link.</p></div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-5">
        <section className="bg-surface border border-slate-200 rounded-sm divide-y divide-slate-200">
          {loading ? <p className="p-4 text-sm text-slate-600">Loading requests...</p> : requests.length === 0 ? <p className="p-4 text-sm text-slate-600">No invoice requests yet.</p> : requests.map(({ request, items }) => (
            <button key={request.id} type="button" onClick={() => { setSelectedId(request.id); setGuestEmail(request.guestEmail || ""); setPrices(Object.fromEntries(items.map((item) => [`${item.productId}:${item.variantId || ""}`, ""]))); }} className={`w-full text-left p-4 cursor-pointer hover:bg-slate-50 ${selectedId === request.id ? "bg-brand-50" : ""}`}>
              <div className="flex items-center justify-between gap-3"><span className="font-semibold text-slate-900">{request.requestNumber}</span><span className="text-xs text-slate-600">{formatDate(request.createdAt)}</span></div>
              <p className="text-sm text-slate-700 mt-1">{request.buyerName || request.guestEmail || "Guest buyer"}</p>
              <p className="text-xs text-slate-600 mt-1">{items.length} item{items.length === 1 ? "" : "s"} · {request.status}</p>
            </button>
          ))}
        </section>

        <section className="bg-surface border border-slate-200 rounded-sm p-5">
          {!selected ? <p className="text-sm text-slate-600">Select a request to prepare its invoice.</p> : <div className="space-y-5">
            <div><h2 className="font-semibold text-slate-900">{selected.request.requestNumber}</h2><p className="text-sm text-slate-600">{selected.request.guestEmail || "No email yet"}</p></div>
            <input type="email" required placeholder="Customer email for payment link" value={guestEmail || selected.request.guestEmail || ""} onChange={(e) => setGuestEmail(e.target.value)} className="w-full border border-slate-300 rounded-sm px-3 py-2 text-sm" />
            <div className="space-y-3">{selected.items.map((item) => { const key = `${item.productId}:${item.variantId || ""}`; return <div key={item.id} className="grid grid-cols-[1fr_7rem] gap-3 items-end"><div><p className="text-sm font-medium text-slate-900">{item.productName}</p><p className="text-xs text-slate-600">Qty {item.quantity}{item.variantLabel ? ` · ${item.variantLabel}` : ""}</p></div><input type="number" min="0.01" step="0.01" placeholder="Price" value={prices[key] || ""} onChange={(e) => setPrices((p) => ({ ...p, [key]: e.target.value }))} className="w-full border border-slate-300 rounded-sm px-2 py-2 text-sm" /></div>; })}</div>
            <div className="border-t border-slate-200 pt-4 space-y-3"><div className="flex justify-between text-sm"><span>Quote total</span><strong>{formatCurrency(total)}</strong></div><Select label="Payment plan" options={[{ value: "full", label: "Full payment" }, { value: "deposit", label: "50/50 deposit" }]} value={plan} onChange={setPlan} />{plan === "deposit" && <input type="number" min="0.01" step="0.01" placeholder="Deposit amount" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="w-full border border-slate-300 rounded-sm px-3 py-2 text-sm" />}<Button onClick={createInvoice} loading={sending} fullWidth>Send invoice link</Button></div>
          </div>}
        </section>
      </div>
    </div>
  );
}
