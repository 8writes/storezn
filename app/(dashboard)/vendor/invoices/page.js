"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, FileText, Minus, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { InternationalCardCheckbox } from "@/components/ui/InternationalCardCheckbox.js";
import { Button } from "@/components/ui/Button.js";
import { Select } from "@/components/ui/Select.js";
import { Input } from "@/components/ui/Input.js";
import { formatCurrency } from "@/lib/format.js";
import { customerFieldEntries } from "@/lib/customerFields.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { useModalScrollLock } from "@/hooks/useModalScrollLock.js";
import { getPlatformUrl } from "@/lib/storeUrl.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { PageHeader } from "@/components/ui/PageHeader.js";
import { SearchInput } from "@/components/ui/SearchInput.js";
import { EmptyState } from "@/components/ui/EmptyState.js";

export default function VendorInvoicesPage() {
  const router = useRouter();
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { stores, storeId, loading: storesLoading } = useVendorStore();
  const [invoices, setInvoices] = useState([]);
  const [requestCount, setRequestCount] = useState(0);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [manualOpen, setManualOpen] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  useModalScrollLock(manualOpen);

  const loadData = useCallback(() => {
    if (!token || !storeId) return;
    Promise.all([
      apiFetch(`/api/v1/vendor/stores/${storeId}/invoice-requests`),
      apiFetch(`/api/v1/vendor/stores/${storeId}/invoices?page=${page}&pageSize=20`),
    ])
      .then(([requestData, invoiceData]) => {
        setRequestCount(Number(requestData.total) || (requestData.requests || []).length);
        setInvoices(invoiceData.invoices || []);
        setPagination(invoiceData.pagination || null);
      })
      .catch((err) => toast.error(err.message || "Failed to load invoice requests"))
  }, [token, storeId, page, apiFetch]);

  useEffect(() => {
    const timer = setTimeout(loadData, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  const normalizedSearch = search.trim().toLowerCase();
  const visibleInvoices = useMemo(() => invoices.filter((invoice) => {
    if (status !== "all" && invoice.status !== status) return false;
    if (!normalizedSearch) return true;
    return [invoice.invoiceNumber, invoice.buyerName, invoice.guestEmail, invoice.buyerPhone, ...(invoice.productNames || [])]
      .some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
  }), [invoices, status, normalizedSearch]);

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

  if (!storesLoading && stores.length === 0) return <p className="text-sm text-slate-700">No store set up yet.</p>;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Invoices"
        description="Share secure payment links by email, WhatsApp, or anywhere else, then track partial and full payments."
        actions={
          <>
            <Link href="/vendor/invoices/requests"><Button variant="secondary">Quote requests{requestCount > 0 ? ` (${requestCount})` : ""}</Button></Link>
            <Button onClick={() => setManualOpen(true)}>New offline quote</Button>
          </>
        }
      />

      <div className="bg-surface border border-slate-200 rounded-sm p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput value={search} onSearch={setSearch} placeholder="Search number, customer, phone, email, or product" className="flex-1" />
        <div className="sm:w-52"><Select value={status} onChange={setStatus} options={[{ value: "all", label: "All statuses" }, { value: "sent", label: "Sent" }, { value: "partially_paid", label: "Partially paid" }, { value: "paid", label: "Paid" }, { value: "cancelled", label: "Cancelled" }, { value: "expired", label: "Expired" }]} /></div>
        </div>
      </div>

      {visibleInvoices.length > 0 ? (
        <section className="bg-surface border border-slate-200 rounded-sm divide-y divide-slate-200">
          <div className="p-4"><h2 className="font-semibold text-slate-900">Sent invoices</h2></div>
          {visibleInvoices.map((invoice) => (
            <div
              key={invoice.id}
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/vendor/invoices/${invoice.id}?storeId=${storeId}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  router.push(`/vendor/invoices/${invoice.id}?storeId=${storeId}`);
                }
              }}
              className="p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
            >
              <div><p className="font-medium text-slate-900">{invoice.invoiceNumber}</p><p className="text-sm text-slate-600">{invoice.guestEmail || invoice.buyerPhone || "Share by link"} - {invoice.status}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-900 mr-1">{formatCurrency(invoice.amountPaid)} / {formatCurrency(invoice.totalAmount)}</p>
                <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); copyInvoiceLink(invoice.shareToken); }}>Copy link</Button>
                {invoice.status === "sent" && <Button size="sm" variant="secondary" onClick={(event) => { event.stopPropagation(); cancelInvoice(invoice.id); }}>Cancel</Button>}
                <ChevronRight size={17} className="text-slate-400" aria-hidden="true" />
              </div>
            </div>
          ))}
          <Pagination pagination={pagination} onPageChange={setPage} />
        </section>
      ) : (
        <EmptyState
          icon={FileText}
          title={search || status !== "all" ? "No matching invoices" : "No invoices yet"}
          description={search || status !== "all" ? "Try another search or status filter." : "Create an offline quote or prepare invoices from quote requests."}
          action={<Button type="button" onClick={() => setManualOpen(true)}>New offline quote</Button>}
        />
      )}

      {manualOpen && <ManualQuoteModal storeId={storeId} internationalStore={!!stores.find((s) => s.id === storeId)?.internationalPaymentsEnabled} apiFetch={apiFetch} confirm={confirm} onClose={() => setManualOpen(false)} onCreated={() => { setManualOpen(false); loadData(); }} />}
      {confirmDialog}
    </div>
  );
}

// One line on an offline quote: a product from the store, or a custom item
// typed in by name for something the vendor never added to the platform.
// Custom lines carry no stock and no customer fields; both kinds are priced
// on the next step (quote requests).
let nextLineUid = 1;
const newLine = (kind = "product") => ({ uid: nextLineUid++, kind, key: "", name: "", quantity: 1, answers: {} });

function ManualQuoteModal({ storeId, internationalStore = false, apiFetch, confirm, onClose, onCreated }) {
  const [products, setProducts] = useState([]);
  const [productLoading, setProductLoading] = useState(true);
  const [lines, setLines] = useState(() => [newLine()]);
  const [buyerName, setBuyerName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [note, setNote] = useState("");
  // Customer will pay with a foreign card - see InternationalCardCheckbox.
  const [international, setInternational] = useState(false);
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
          const params = new URLSearchParams({ page: String(page), pageSize: "20", status: "active", sellable: "true", saleMode: "invoice_required", includeVariants: "true" });
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
  const choiceOptions = useMemo(() => choices.map(({ value, label, searchText }) => ({ value, label, searchText })), [choices]);
  const noProducts = !productLoading && choices.length === 0;

  const updateLine = (uid, patch) => setLines((current) => current.map((line) => (line.uid === uid ? { ...line, ...patch } : line)));
  const removeLine = (uid) => setLines((current) => (current.length > 1 ? current.filter((line) => line.uid !== uid) : current));

  const submit = async () => {
    if (!buyerName.trim() || !guestEmail.trim() || !buyerPhone.trim()) return toast.error("Customer name, email, and phone are required");
    const items = [];
    const seen = new Set();
    for (const [index, line] of lines.entries()) {
      const label = `Line ${index + 1}`;
      if (line.kind === "custom") {
        const name = line.name.trim();
        if (!name) return toast.error(`${label}: enter the item name`);
        const dupe = `custom:${name.toLowerCase()}`;
        if (seen.has(dupe)) return toast.error(`"${name}" is listed twice - change the quantity instead`);
        seen.add(dupe);
        items.push({ customName: name, quantity: line.quantity });
        continue;
      }
      const selected = choices.find((choice) => choice.value === line.key);
      if (!selected) return toast.error(`${label}: select a product, or switch it to a custom item`);
      if (seen.has(line.key)) return toast.error(`${selected.label} is listed twice - change the quantity instead`);
      seen.add(line.key);
      const fields = Array.isArray(selected.product.customerFields) ? selected.product.customerFields : [];
      const missingField = fields.find((field) => field.required && (field.type === "checkbox" ? line.answers[field.id] !== true : !String(line.answers[field.id] ?? "").trim()));
      if (missingField) return toast.error(`${selected.label}: ${missingField.label} is required`);
      items.push({ productId: selected.product.id, variantId: selected.variant?.id || null, quantity: line.quantity, customerFields: line.answers });
    }
    const approved = await confirm({ title: "Create this offline quote request?", description: "It will appear in the quote queue so you can set the prices and send the invoice.", confirmLabel: "Create request" });
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
          ...(internationalStore ? { international } : {}),
          items,
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
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">Items</p>
            {lines.map((line, index) => {
              const selected = line.kind === "product" ? choices.find((choice) => choice.value === line.key) || null : null;
              const fields = Array.isArray(selected?.product.customerFields) ? selected.product.customerFields : [];
              const setAnswer = (id, value) => updateLine(line.uid, { answers: { ...line.answers, [id]: value } });
              return (
                <div key={line.uid} className="rounded-sm border border-slate-200 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex rounded-sm border border-slate-300 p-0.5 text-xs" role="group" aria-label={`Line ${index + 1} type`}>
                      {[["product", "From your products"], ["custom", "Custom item"]].map(([kind, label]) => (
                        <button
                          key={kind}
                          type="button"
                          aria-pressed={line.kind === kind}
                          onClick={() => updateLine(line.uid, { kind, key: "", name: "", answers: {} })}
                          className={`rounded-sm px-2.5 py-1 cursor-pointer ${line.kind === kind ? "bg-brand-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(line.uid)} aria-label={`Remove line ${index + 1}`} className="p-1 text-slate-500 hover:text-red-600 cursor-pointer"><Trash2 size={16} /></button>
                    )}
                  </div>
                  {line.kind === "custom" ? (
                    <Input label="Item name" placeholder="e.g. Custom 3-seater sofa" maxLength={200} value={line.name} onChange={(event) => updateLine(line.uid, { name: event.target.value })} />
                  ) : (
                    <>
                      <Select label="Product or variant" value={line.key} onChange={(value) => updateLine(line.uid, { key: value, answers: {} })} options={choiceOptions} placeholder={productLoading ? "Loading products..." : noProducts ? "No quote products - use a custom item" : "Select product"} loading={productLoading} disabled={noProducts} />
                      {fields.map((field) => <label key={field.id} className="block space-y-1"><span className="text-sm font-medium text-slate-700">{field.label}{field.required ? " *" : ""}</span>{field.type === "textarea" ? <textarea rows={3} value={line.answers[field.id] || ""} onChange={(event) => setAnswer(field.id, event.target.value)} className="w-full border border-slate-300 rounded-sm px-3 py-2 text-sm" /> : field.type === "select" ? <select value={line.answers[field.id] || ""} onChange={(event) => setAnswer(field.id, event.target.value)} className="w-full border border-slate-300 rounded-sm px-3 py-2 text-sm"><option value="">Select</option>{(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select> : field.type === "checkbox" ? <input type="checkbox" checked={line.answers[field.id] === true} onChange={(event) => setAnswer(field.id, event.target.checked)} /> : <input type={field.type === "number" || field.type === "date" ? field.type : "text"} value={line.answers[field.id] || ""} onChange={(event) => setAnswer(field.id, event.target.value)} className="w-full border border-slate-300 rounded-sm px-3 py-2 text-sm" />}{field.helpText && <span className="block text-xs text-slate-600">{field.helpText}</span>}</label>)}
                    </>
                  )}
                  <div className="space-y-1"><p className="text-sm font-medium text-slate-700">Quantity</p><div className="inline-grid grid-cols-[2.75rem_4rem_2.75rem] h-11 border border-slate-300 rounded-sm overflow-hidden"><button type="button" onClick={() => updateLine(line.uid, { quantity: Math.max(1, line.quantity - 1) })} aria-label="Decrease quantity" className="grid place-items-center text-brand-700 hover:bg-brand-50 cursor-pointer"><Minus size={17} /></button><output className="grid place-items-center border-x border-slate-300 text-sm font-semibold tabular-nums">{line.quantity}</output><button type="button" onClick={() => updateLine(line.uid, { quantity: Math.min(100000, line.quantity + 1) })} aria-label="Increase quantity" className="grid place-items-center text-brand-700 hover:bg-brand-50 cursor-pointer"><Plus size={17} /></button></div></div>
                </div>
              );
            })}
            {lines.length < 100 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, newLine(noProducts ? "custom" : "product")])}>
                <Plus size={15} /> Add another item
              </Button>
            )}
          </div>
          <Input label="Customer name" required value={buyerName} onChange={(event) => setBuyerName(event.target.value)} />
          <Input label="Customer email" type="email" required value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} />
          <Input label="Customer phone or WhatsApp" type="tel" required value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} />
          {internationalStore && <InternationalCardCheckbox checked={international} onChange={setInternational} />}
          <label className="block space-y-1"><span className="text-sm font-medium text-slate-700">Note (optional)</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} className="w-full border border-slate-300 rounded-sm px-3 py-2 text-sm" /></label>
        </div>
        <div className="p-4 border-t border-slate-200 flex gap-3"><Button variant="outline" fullWidth onClick={onClose} disabled={submitting}>Cancel</Button><Button fullWidth onClick={submit} loading={submitting}>Add request</Button></div>
      </div>
    </div>
  );
}
