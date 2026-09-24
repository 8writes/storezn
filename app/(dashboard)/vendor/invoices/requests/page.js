"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Button } from "@/components/ui/Button.js";
import { Select } from "@/components/ui/Select.js";
import { formatCurrency, formatDate } from "@/lib/format.js";
import { customerFieldEntries } from "@/lib/customerFields.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { getPlatformUrl } from "@/lib/storeUrl.js";
import { computeOrderTotals } from "@/lib/orders.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { EmptyState } from "@/components/ui/EmptyState.js";
import { PageHeader } from "@/components/ui/PageHeader.js";
import { SearchInput } from "@/components/ui/SearchInput.js";

export default function VendorInvoiceRequestsPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { stores, storeId, loading: storesLoading } = useVendorStore();
  const [requests, setRequests] = useState([]);
  const [requestTotal, setRequestTotal] = useState(0);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [prices, setPrices] = useState({});
  const [plan, setPlan] = useState("full");
  const [guestEmail, setGuestEmail] = useState("");
  const [feePolicy, setFeePolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const { confirm, confirmDialog } = useConfirm();

  const loadData = useCallback(() => {
    if (!token || !storeId) return;
    setLoading(true);
    Promise.all([
      apiFetch(`/api/v1/vendor/stores/${storeId}/invoice-requests?page=${page}&pageSize=20`),
      apiFetch(`/api/v1/vendor/stores/${storeId}/invoices`),
    ])
      .then(([requestData, invoiceData]) => {
        setRequests(requestData.requests || []);
        setRequestTotal(Number(requestData.total) || (requestData.requests || []).length);
        setPagination(requestData.pagination || null);
        setFeePolicy(invoiceData.feePolicy || null);
      })
      .catch((err) => toast.error(err.message || "Failed to load quote requests"))
      .finally(() => setLoading(false));
  }, [token, storeId, page, apiFetch]);

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

  const selectRequest = (request, items) => {
    setSelectedId(request.id);
    setGuestEmail(request.guestEmail || "");
    setPlan("full");
    setPrices(Object.fromEntries(items.map((item) => [`${item.productId}:${item.variantId || ""}`, ""])));
  };

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
      toast.success(copied ? "Invoice created. Its payment link was copied." : "Invoice created. Use the invoice page to copy its link.");
      setRequests((rows) => rows.filter((row) => row.request.id !== selected.request.id));
      setRequestTotal((value) => Math.max(0, value - 1));
      setSelectedId("");
      setPrices({});
    } catch (err) {
      toast.error(err.message || "Could not create invoice");
    } finally {
      setSending(false);
    }
  };

  const cancelRequest = async (request) => {
    const approved = await confirm({ title: "Cancel this quote request?", description: "The customer will be emailed that the quote was cancelled.", confirmLabel: "Cancel request", variant: "danger" });
    if (!approved) return;
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/invoice-requests/${request.id}`, { method: "PATCH", body: JSON.stringify({ action: "cancel" }) });
      setRequests((rows) => rows.filter((row) => row.request.id !== request.id));
      setRequestTotal((value) => Math.max(0, value - 1));
      if (selectedId === request.id) setSelectedId("");
      toast.success("Quote request cancelled and customer notified");
    } catch (err) {
      toast.error(err.message || "Could not cancel quote request");
    }
  };

  if (!storesLoading && stores.length === 0) return <p className="text-sm text-slate-700">No store set up yet.</p>;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Quote requests"
        description="Set a price for customer requests and send a secure invoice."
        actions={<Link href="/vendor/invoices"><Button variant="outline">Back to invoices</Button></Link>}
      />

      <div className="bg-surface border border-slate-200 rounded-sm p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput value={search} onSearch={setSearch} placeholder="Search request, customer, phone, email, or product" className="flex-1" />
        <div className="sm:w-52"><Select value={status} onChange={setStatus} options={[{ value: "all", label: "All statuses" }, { value: "new", label: "New" }, { value: "reviewing", label: "Reviewing" }, { value: "quoted", label: "Quoted" }]} /></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-5">
        <section className="bg-surface border border-slate-200 rounded-sm divide-y divide-slate-200">
          <div className="p-4"><h2 className="font-semibold text-slate-900">Open requests ({requestTotal})</h2></div>
          {loading ? <p className="p-4 text-sm text-slate-600">Loading requests...</p> : visibleRequests.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={search || status !== "all" ? "No matching quote requests" : "No quote requests yet"}
              description={search || status !== "all" ? "Try another search or status filter." : "Customer quote requests and offline quote requests will appear here."}
              className="border-0 bg-transparent py-10"
            />
          ) : visibleRequests.map(({ request, items }) => (
            <div key={request.id} className={`flex items-start gap-2 p-4 hover:bg-slate-50 ${selectedId === request.id ? "bg-brand-50" : ""}`}><button type="button" onClick={() => selectRequest(request, items)} className="flex-1 min-w-0 text-left cursor-pointer">
              <div className="flex items-center justify-between gap-3"><span className="font-semibold text-slate-900">{request.requestNumber}</span><span className="text-xs text-slate-600">{formatDate(request.createdAt)}</span></div>
              <p className="text-sm text-slate-700 mt-1">{request.buyerName || request.guestEmail || request.buyerPhone || "Guest buyer"}</p>
              <p className="text-xs text-slate-600 mt-1">{items.length} item{items.length === 1 ? "" : "s"} - {request.status}</p>
            </button><Button size="sm" variant="secondary" onClick={() => cancelRequest(request)}>Cancel</Button></div>
          ))}
          <Pagination pagination={pagination} onPageChange={setPage} />
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
      {confirmDialog}
    </div>
  );
}
