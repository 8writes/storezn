"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Minus, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Button } from "@/components/ui/Button.js";
import { Select } from "@/components/ui/Select.js";
import { Input } from "@/components/ui/Input.js";
import { formatCurrency, formatDate } from "@/lib/format.js";
import { customerFieldEntries } from "@/lib/customerFields.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { useModalScrollLock } from "@/hooks/useModalScrollLock.js";
import { getPlatformUrl } from "@/lib/storeUrl.js";
import { computeOrderTotals } from "@/lib/orders.js";

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
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [manualOpen, setManualOpen] = useState(false);
  const [feePolicy, setFeePolicy] = useState(null);
  const { confirm, confirmDialog } = useConfirm();
  useModalScrollLock(manualOpen);

  const loadData = useCallback(() => {
    if (!token || !storeId) return;
    setLoading(true);
    Promise.all([
      apiFetch(`/api/v1/vendor/stores/${storeId}/invoice-requests`),
      apiFetch(`/api/v1/vendor/stores/${storeId}/invoices`),
    ])
      .then(([requestData, invoiceData]) => {
        setRequests(requestData.requests || []);
        setInvoices(invoiceData.invoices || []);
        setFeePolicy(invoiceData.feePolicy || null);
      })
      .catch((err) => toast.error(err.message || "Failed to load invoice requests"))
      .finally(() => setLoading(false));
  }, [token, storeId, apiFetch]);

  useEffect(() => {
    const timer = setTimeout(loadData, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  const selected = requests.find((row) => row.request.id === selectedId) || null;
  const total = useMemo(
    () => (selected?.items || []).reduce((sum, item) => sum + (Number(prices[`${item.productId}:${item.variantId || ""}`]) || 0) * item.quantity, 0),
    [selected, prices],
  );
  const invoiceTotals = useMemo(() => computeOrderTotals({
    subtotal: total,
    shippingFee: 0,
    commissionRatePercent: feePolicy?.commissionRatePercent ?? 0,
    flatFee: feePolicy?.flatFee ?? 0,
    feeChargedToCustomer: feePolicy?.feeChargedToCustomer ?? false,
    maxCommissionAmount: feePolicy?.maxCommissionAmount,
  }), [total, feePolicy]);
  const normalizedSearch = search.trim().toLowerCase();
  const visibleRequests = useMemo(() => requests.filter(({ request, items }) => {
    if (status !== "all" && request.status !== status) return false;
    if (!normalizedSearch) return true;
    return [request.requestNumber, request.buyerName, request.guestEmail, request.buyerPhone, ...items.map((item) => item.productName)]
      .some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
  }), [requests, status, normalizedSearch]);
  const visibleInvoices = useMemo(() => invoices.filter((invoice) => {
    if (status !== "all" && invoice.status !== status) return false;
    if (!normalizedSearch) return true;
    return [invoice.invoiceNumber, invoice.buyerName, invoice.guestEmail, invoice.buyerPhone]
      .some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
  }), [invoices, status, normalizedSearch]);

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
    const approved = await confirm({
      title: "Create and send this invoice?",
      description: `${formatCurrency(invoiceTotals.totalAmount)} will be sent with the ${plan === "deposit" ? "50/50" : "full payment"} plan.`,
      confirmLabel: "Create invoice",
    });
    if (!approved) return;
    setSending(true);
    try {
      const email = guestEmail.trim() || selected.request.guestEmail || "";
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/invoices`, {
        method: "POST",
        body: JSON.stringify({ requestId: selected.request.id, guestEmail: email || undefined, plan, items }),
      });
      const copied = await navigator.clipboard?.writeText(getPlatformUrl(`/invoice/${data.invoice.shareToken}`)).then(() => true).catch(() => false);
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
      await navigator.clipboard.writeText(getPlatformUrl(`/invoice/${shareToken}`));
      toast.success("Payment link copied");
    } catch {
      toast.error("Could not copy the payment link");
    }
  };

  const cancelInvoice = async (invoiceId) => {
    const approved = await confirm({ title: "Cancel this invoice?", description: "The customer will be emailed and any held stock will be released.", confirmLabel: "Cancel invoice", variant: "danger" });
    if (!approved) return;
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/invoices/${invoiceId}`, { method: "PATCH", body: JSON.stringify({ action: "cancel" }) });
      setInvoices((rows) => rows.map((row) => row.id === invoiceId ? { ...row, status: "cancelled", amountDue: 0 } : row));
      toast.success("Invoice cancelled and held stock was released");
    } catch (err) {
      toast.error(err.message || "Could not cancel invoice");
    }
  };

  const cancelRequest = async (request) => {
    const approved = await confirm({ title: "Cancel this quote request?", description: "The customer will be emailed that the quote was cancelled.", confirmLabel: "Cancel request", variant: "danger" });
    if (!approved) return;
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/invoice-requests/${request.id}`, { method: "PATCH", body: JSON.stringify({ action: "cancel" }) });
      setRequests((rows) => rows.filter((row) => row.request.id !== request.id));
      if (selectedId === request.id) setSelectedId("");
      toast.success("Quote request cancelled and customer notified");
    } catch (err) {
      toast.error(err.message || "Could not cancel quote request");
    }
  };

  const selectRequest = (request, items) => {
    setSelectedId(request.id);
    setGuestEmail(request.guestEmail || "");
    setPrices(Object.fromEntries(items.map((item) => [`${item.productId}:${item.variantId || ""}`, ""])));
  };

  if (!storesLoading && stores.length === 0) return <p className="text-sm text-slate-700">No store set up yet.</p>;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-bold text-slate-900">Invoices</h1><p className="text-sm text-slate-600 mt-1">Review quote requests and share secure payment links by email, WhatsApp, or anywhere else.</p></div><Button onClick={() => setManualOpen(true)}>New offline quote</Button></div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search number, customer, phone, email, or product" className="w-full border border-slate-300 rounded-sm bg-surface pl-9 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" /></div>
        <div className="sm:w-52"><Select value={status} onChange={setStatus} options={[{ value: "all", label: "All statuses" }, { value: "new", label: "New requests" }, { value: "reviewing", label: "Reviewing" }, { value: "sent", label: "Sent" }, { value: "partially_paid", label: "Partially paid" }, { value: "paid", label: "Paid" }, { value: "cancelled", label: "Cancelled" }, { value: "expired", label: "Expired" }]} /></div>
      </div>

      {visibleInvoices.length > 0 && (
        <section className="bg-surface border border-slate-200 rounded-sm divide-y divide-slate-200">
          <div className="p-4"><h2 className="font-semibold text-slate-900">Sent invoices</h2></div>
          {visibleInvoices.map((invoice) => (
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
          {loading ? <p className="p-4 text-sm text-slate-600">Loading requests...</p> : visibleRequests.length === 0 ? <p className="p-4 text-sm text-slate-600">No matching quote requests.</p> : visibleRequests.map(({ request, items }) => (
            <div key={request.id} className={`flex items-start gap-2 p-4 hover:bg-slate-50 ${selectedId === request.id ? "bg-brand-50" : ""}`}><button type="button" onClick={() => selectRequest(request, items)} className="flex-1 min-w-0 text-left cursor-pointer">
              <div className="flex items-center justify-between gap-3"><span className="font-semibold text-slate-900">{request.requestNumber}</span><span className="text-xs text-slate-600">{formatDate(request.createdAt)}</span></div>
              <p className="text-sm text-slate-700 mt-1">{request.buyerName || request.guestEmail || request.buyerPhone || "Guest buyer"}</p>
              <p className="text-xs text-slate-600 mt-1">{items.length} item{items.length === 1 ? "" : "s"} - {request.status}</p>
            </button><Button size="sm" variant="secondary" onClick={() => cancelRequest(request)}>Cancel</Button></div>
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
              <div className="flex justify-between text-sm"><span>Quote subtotal</span><strong>{formatCurrency(total)}</strong></div>
              {feePolicy?.feeChargedToCustomer && invoiceTotals.commissionAmount > 0 && <div className="flex justify-between text-sm text-slate-700"><span>Platform fee ({feePolicy.commissionRatePercent}%)</span><strong>{formatCurrency(invoiceTotals.commissionAmount)}</strong></div>}
              {feePolicy?.feeChargedToCustomer && invoiceTotals.flatFeeAmount > 0 && <div className="flex justify-between text-sm text-slate-700"><span>Flat fee</span><strong>{formatCurrency(invoiceTotals.flatFeeAmount)}</strong></div>}
              <div className="flex justify-between text-sm"><span>Customer total</span><strong>{formatCurrency(invoiceTotals.totalAmount)}</strong></div>
              {!feePolicy?.feeChargedToCustomer && invoiceTotals.platformFeeAmount > 0 && <p className="text-xs text-slate-600">Your store absorbs {formatCurrency(invoiceTotals.platformFeeAmount)} in platform fees.</p>}
              <Select label="Payment plan" options={[{ value: "full", label: "Full payment" }, { value: "deposit", label: "50/50 deposit" }]} value={plan} onChange={setPlan} />
              {plan === "deposit" && <div className="flex justify-between text-sm text-slate-700"><span>First payment (50%)</span><strong>{formatCurrency(Math.round(invoiceTotals.totalAmount * 50) / 100)}</strong></div>}
              <Button onClick={createInvoice} loading={sending} fullWidth>Create invoice and copy link</Button>
            </div>
          </div>}
        </section>
      </div>
      {manualOpen && <ManualQuoteModal storeId={storeId} apiFetch={apiFetch} confirm={confirm} onClose={() => setManualOpen(false)} onCreated={() => { setManualOpen(false); loadData(); }} />}
      {confirmDialog}
    </div>
  );
}

function ManualQuoteModal({ storeId, apiFetch, confirm, onClose, onCreated }) {
  const [products, setProducts] = useState([]);
  const [productLoading, setProductLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [buyerName, setBuyerName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [note, setNote] = useState("");
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadProducts = async () => {
      setProductLoading(true);
      try {
        const loaded = [];
        let page = 1;
        let totalPages = 1;
        do {
          const params = new URLSearchParams({ page: String(page), pageSize: "100", status: "active", sellable: "true", saleMode: "invoice_required", includeVariants: "true" });
          const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/products?${params}`);
          loaded.push(...(data.products || []));
          totalPages = Math.max(1, Number(data.pagination?.totalPages) || 1);
          page += 1;
        } while (page <= totalPages && !cancelled);
        if (!cancelled) setProducts(loaded);
      } catch (error) {
        if (!cancelled) toast.error(error.message || "Could not load quote products");
      } finally {
        if (!cancelled) setProductLoading(false);
      }
    };
    loadProducts();
    return () => { cancelled = true; };
  }, [apiFetch, storeId]);

  const choices = useMemo(() => products.flatMap((product) => {
    const variants = product.offlineVariants || [];
    const options = [];
    if (product.allowStandardVariant !== false || variants.length === 0) options.push({ value: `${product.id}:`, label: variants.length ? `${product.name} - Standard` : product.name, searchText: product.sku || "", product, variant: null });
    for (const variant of variants) options.push({ value: `${product.id}:${variant.id}`, label: `${product.name} - ${Object.values(variant.options || {}).join(" / ")}`, searchText: `${product.sku || ""} ${variant.sku || ""}`, product, variant });
    return options;
  }), [products]);
  const selected = choices.find((choice) => choice.value === selectedKey) || null;
  const fields = Array.isArray(selected?.product.customerFields) ? selected.product.customerFields : [];

  const submit = async () => {
    if (!selected) return toast.error("Select a product");
    if (!buyerName.trim() || !guestEmail.trim() || !buyerPhone.trim()) return toast.error("Customer name, email, and phone are required");
    const missingField = fields.find((field) => field.required && (field.type === "checkbox" ? answers[field.id] !== true : !String(answers[field.id] ?? "").trim()));
    if (missingField) return toast.error(`${missingField.label} is required`);
    const approved = await confirm({ title: "Create this offline quote request?", description: "It will appear in the quote queue so you can set the price and send the invoice.", confirmLabel: "Create request" });
    if (!approved) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/invoice-requests`, {
        method: "POST",
        body: JSON.stringify({
          buyerName: buyerName.trim(),
          guestEmail: guestEmail.trim(),
          buyerPhone: buyerPhone.trim(),
          note: note.trim() || undefined,
          items: [{ productId: selected.product.id, variantId: selected.variant?.id || null, quantity, customerFields: answers }],
        }),
      });
      toast.success("Offline quote request created");
      onCreated();
    } catch (error) {
      toast.error(error.message || "Could not create quote request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center overscroll-none">
      <div className="fixed inset-0 bg-black/50" onClick={submitting ? undefined : onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[92dvh] flex flex-col bg-surface rounded-t-sm sm:rounded-sm shadow-xl">
        <div className="p-4 border-b border-slate-200 flex items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900">New offline quote</h2><p className="text-sm text-slate-600 mt-1">For a walk-in, phone, or WhatsApp customer.</p></div><button type="button" onClick={onClose} disabled={submitting} aria-label="Close" className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"><X size={19} /></button></div>
        <div className="p-4 overflow-y-auto overscroll-contain space-y-4">
          <Select label="Product or variant" value={selectedKey} onChange={(value) => { setSelectedKey(value); setAnswers({}); }} options={choices.map(({ value, label, searchText }) => ({ value, label, searchText }))} placeholder={productLoading ? "Loading products..." : "Select product"} loading={productLoading} />
          <div className="space-y-1"><p className="text-sm font-medium text-slate-700">Quantity</p><div className="inline-grid grid-cols-[2.75rem_4rem_2.75rem] h-11 border border-slate-300 rounded-sm overflow-hidden"><button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Decrease quantity" className="grid place-items-center text-brand-700 hover:bg-brand-50 cursor-pointer"><Minus size={17} /></button><output className="grid place-items-center border-x border-slate-300 text-sm font-semibold tabular-nums">{quantity}</output><button type="button" onClick={() => setQuantity((value) => Math.min(100000, value + 1))} aria-label="Increase quantity" className="grid place-items-center text-brand-700 hover:bg-brand-50 cursor-pointer"><Plus size={17} /></button></div></div>
          <Input label="Customer name" required value={buyerName} onChange={(event) => setBuyerName(event.target.value)} />
          <Input label="Customer email" type="email" required value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} />
          <Input label="Customer phone or WhatsApp" type="tel" required value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} />
          {fields.map((field) => <label key={field.id} className="block space-y-1"><span className="text-sm font-medium text-slate-700">{field.label}{field.required ? " *" : ""}</span>{field.type === "textarea" ? <textarea rows={3} value={answers[field.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [field.id]: event.target.value }))} className="w-full border border-slate-300 rounded-sm px-3 py-2 text-sm" /> : field.type === "select" ? <select value={answers[field.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [field.id]: event.target.value }))} className="w-full border border-slate-300 rounded-sm px-3 py-2 text-sm"><option value="">Select</option>{(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select> : field.type === "checkbox" ? <input type="checkbox" checked={answers[field.id] === true} onChange={(event) => setAnswers((current) => ({ ...current, [field.id]: event.target.checked }))} /> : <input type={field.type === "number" || field.type === "date" ? field.type : "text"} value={answers[field.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [field.id]: event.target.value }))} className="w-full border border-slate-300 rounded-sm px-3 py-2 text-sm" />}{field.helpText && <span className="block text-xs text-slate-600">{field.helpText}</span>}</label>)}
          <label className="block space-y-1"><span className="text-sm font-medium text-slate-700">Note (optional)</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} className="w-full border border-slate-300 rounded-sm px-3 py-2 text-sm" /></label>
        </div>
        <div className="p-4 border-t border-slate-200 flex gap-3"><Button variant="outline" fullWidth onClick={onClose} disabled={submitting}>Cancel</Button><Button fullWidth onClick={submit} loading={submitting}>Add request</Button></div>
      </div>
    </div>
  );
}
