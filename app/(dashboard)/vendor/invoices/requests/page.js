"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Button } from "@/components/ui/Button.js";
import { Input } from "@/components/ui/Input.js";
import { PriceInput } from "@/components/ui/PriceInput.js";
import { UsdHint } from "@/components/ui/UsdHint.js";
import { formatCurrency, formatDate } from "@/lib/format.js";
import { customerFieldEntries } from "@/lib/customerFields.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { computeOrderTotals } from "@/lib/orders.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { EmptyState } from "@/components/ui/EmptyState.js";
import { PageHeader } from "@/components/ui/PageHeader.js";
import { SearchInput } from "@/components/ui/SearchInput.js";
import { OrderItemModal } from "@/components/ui/OrderItemModal.js";
import { useModalScrollLock } from "@/hooks/useModalScrollLock.js";

export default function VendorInvoiceRequestsPage() {
  const router = useRouter();
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
  const [intlFeePolicy, setIntlFeePolicy] = useState(null);
  const [usdRate, setUsdRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [activeItem, setActiveItem] = useState(null);
  // Arriving from "Create invoice" (?open=<request id>): open that request
  // straight away so the vendor carries on setting prices. Read once from
  // the URL; state rather than rendered, so no hydration mismatch.
  const [openOnLoad, setOpenOnLoad] = useState(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("open"),
  );
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
        setIntlFeePolicy(invoiceData.intlFeePolicy || null);
        setUsdRate(invoiceData.usdRate || null);
      })
      .catch((err) => toast.error(err.message || "Failed to load quote requests"))
      .finally(() => setLoading(false));
  }, [token, storeId, page, apiFetch]);

  useEffect(() => {
    const timer = setTimeout(loadData, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  const selected = requests.find((row) => row.request.id === selectedId) || null;
  useModalScrollLock(!!selected);
  const total = useMemo(
    () => (selected?.items || []).reduce((sum, item) => sum + (Number(prices[item.id]) || 0) * item.quantity, 0),
    [selected, prices],
  );
  // The customer answered "paying with a card from outside Nigeria" on the
  // quote request; the invoice is priced with whichever fee set that means
  // (the server decides the same way - see lib/feePolicy.js).
  const selectedInternational = !!selected?.request?.international && !!intlFeePolicy;
  const activeFeePolicy = selectedInternational ? intlFeePolicy : feePolicy;
  const invoiceTotals = useMemo(() => computeOrderTotals({
    subtotal: total,
    shippingFee: 0,
    commissionRatePercent: activeFeePolicy?.commissionRatePercent ?? 0,
    flatFee: activeFeePolicy?.flatFee ?? 0,
    feeChargedToCustomer: activeFeePolicy?.feeChargedToCustomer ?? false,
    maxCommissionAmount: activeFeePolicy?.maxCommissionAmount,
  }), [total, activeFeePolicy]);
  const normalizedSearch = search.trim().toLowerCase();
  const visibleRequests = useMemo(() => requests.filter(({ request, items }) => {
    if (!normalizedSearch) return true;
    return [request.requestNumber, request.buyerName, request.guestEmail, request.buyerPhone, ...items.map((item) => item.productName)]
      .some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
  }), [requests, normalizedSearch]);

  const selectRequest = useCallback((request, items) => {
    setSelectedId(request.id);
    setGuestEmail(request.guestEmail || "");
    setPlan("full");
    setPrices(Object.fromEntries(items.map((item) => [item.id, ""])));
  }, []);

  useEffect(() => {
    if (!openOnLoad || loading) return;
    const row = requests.find(({ request }) => request.id === openOnLoad);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenOnLoad(null);
    router.replace("/vendor/invoices/requests", { scroll: false });
    if (row) selectRequest(row.request, row.items);
  }, [openOnLoad, loading, requests, router, selectRequest]);

  const createInvoice = async () => {
    if (!selected) return;
    // Keyed by request line, so a custom (product-less) line prices the same
    // way as a catalogue one.
    const items = selected.items.map((item) => ({
      requestItemId: item.id,
      ...(item.productId ? { productId: item.productId, variantId: item.variantId || null } : {}),
      quantity: item.quantity,
      unitPrice: Number(prices[item.id]),
    }));
    if (items.some((item) => !Number.isFinite(item.unitPrice) || item.unitPrice <= 0)) {
      toast.error("Add a price for every item");
      return;
    }
    setSending(true);
    try {
      const email = guestEmail.trim() || selected.request.guestEmail || "";
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/invoices`, {
        method: "POST",
        body: JSON.stringify({ requestId: selected.request.id, guestEmail: email || undefined, plan, items }),
      });
      // Straight to the finished invoice, where the link is ready to copy
      // or send on WhatsApp.
      router.push(`/vendor/invoices/${data.invoice.id}?storeId=${storeId}&created=1`);
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
      if (selectedId === request.id) {
        setSelectedId("");
        setPrices({});
      }
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
        description="Customers waiting for your price. Open one, add prices, and send the invoice."
        actions={<Link href="/vendor/invoices"><Button variant="outline">Back to invoices</Button></Link>}
      />

      <div className="bg-surface border border-slate-200 rounded-sm p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput value={search} onSearch={setSearch} placeholder="Search requests" className="flex-1" />
        </div>
      </div>

      <section className="bg-surface border border-slate-200 rounded-sm divide-y divide-slate-200">
          <div className="p-4"><h2 className="font-semibold text-slate-900">Waiting for your price ({requestTotal})</h2></div>
          {loading ? <p className="p-4 text-sm text-slate-600">Loading requests...</p> : visibleRequests.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={search ? "No matching requests" : "Nothing waiting"}
              description={search ? "Try another search." : "When a customer asks for a price, it shows up here."}
              className="border-0 bg-transparent py-10"
            />
          ) : visibleRequests.map(({ request, items }) => (
            <div key={request.id} className="flex items-start gap-2 p-4 hover:bg-slate-50"><button type="button" onClick={() => selectRequest(request, items)} className="flex-1 min-w-0 text-left cursor-pointer">
              <div className="flex items-center justify-between gap-3"><span className="font-semibold text-slate-900 truncate">{request.buyerName || request.buyerPhone || request.guestEmail || "Customer not added yet"}</span><span className="text-xs text-slate-600 shrink-0">{formatDate(request.createdAt)}</span></div>
              <p className="text-sm text-slate-700 mt-1 truncate">{items.map((item) => `${item.productName} × ${item.quantity}`).join(", ")}</p>
              <p className="text-xs font-medium text-brand-700 mt-1">Set prices →</p>
            </button><Button size="sm" variant="ghost" onClick={() => cancelRequest(request)}>Cancel</Button></div>
          ))}
          <Pagination pagination={pagination} onPageChange={setPage} />
      </section>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center overscroll-none sm:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={sending ? undefined : () => setSelectedId("")} />
          <div role="dialog" aria-modal="true" aria-labelledby="quote-request-dialog-title" className="relative z-10 flex max-h-[92dvh] w-full flex-col rounded-t-sm bg-surface shadow-xl sm:max-w-2xl sm:rounded-sm">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-5">
              <div className="min-w-0"><h2 id="quote-request-dialog-title" className="font-semibold text-slate-900">Set prices</h2><p className="mt-0.5 text-sm text-slate-600 truncate">{[selected.request.buyerName, selected.request.buyerPhone, selected.request.guestEmail].filter(Boolean).join(" · ") || "No customer details yet - they'll add them when paying"}</p></div>
              <button type="button" aria-label="Close quote request" disabled={sending} onClick={() => setSelectedId("")} className="shrink-0 rounded-sm p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"><X size={20} /></button>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">
              <div className="space-y-5">
            {!selected.request.guestEmail && (
              <Input label="Customer email (optional)" hint="We'll email them the invoice. You can also send the link yourself." type="email" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} />
            )}
            <div className="space-y-3">
              {selected.items.map((item) => {
                const key = item.id;
                const details = customerFieldEntries(item.customerFields);
                const unitPrice = Number(prices[key]) || 0;
                return (
                  <div key={item.id} className="rounded-sm border border-slate-200 p-3 space-y-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-3 items-center">
                      <button
                        type="button"
                        onClick={() => setActiveItem({ ...item, unitPrice, lineTotal: unitPrice * item.quantity })}
                        className="min-w-0 text-left cursor-pointer rounded-sm hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        <p className="text-sm font-medium text-slate-900">{item.productName}</p>
                        <p className="text-xs text-slate-600">Qty {item.quantity}{item.variantLabel ? ` - ${item.variantLabel}` : ""}{item.productId ? "" : " - Custom item"}</p>
                      </button>
                      <PriceInput aria-label={`Price each for ${item.productName}`} placeholder="Price each" leadingText="₦" value={prices[key] || ""} onChange={(value) => setPrices((current) => ({ ...current, [key]: value }))} usdRate={usdRate} />
                    </div>
                    {details.length > 0 && (
                      <div className="bg-slate-50 border border-slate-200 rounded-sm p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Customer details</p>
                        <dl className="mt-2 space-y-1.5">
                          {details.map((detail) => (
                            <div key={detail.id} className="flex justify-between gap-3 text-xs text-slate-700">
                              <dt className="font-medium">{detail.label}</dt>
                              <dd className="text-right">{detail.value === true ? "Yes" : detail.value === false ? "No" : String(detail.value)}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-slate-200 pt-4 space-y-3">
              {selectedInternational && <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">The customer is paying with a card from outside Nigeria, so the higher processing fee applies.</p>}
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">How should they pay?</p>
                <div className="grid grid-cols-2 gap-2">
                  {[["full", "All at once"], ["deposit", "50% now, 50% later"]].map(([value, text]) => (
                    <button key={value} type="button" aria-pressed={plan === value} onClick={() => setPlan(value)} className={`rounded-sm border px-3 py-2.5 text-sm font-medium cursor-pointer transition-colors ${plan === value ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                      {text}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-sm bg-slate-50 border border-slate-200 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-700"><span>Items</span><span className="tabular-nums">{formatCurrency(total)}</span></div>
                {activeFeePolicy?.feeChargedToCustomer && invoiceTotals.platformFeeAmount > 0 && <div className="flex justify-between text-slate-700"><span>Processing Fee</span><span className="tabular-nums">+{formatCurrency(invoiceTotals.platformFeeAmount)}</span></div>}
                <div className="flex justify-between font-semibold text-slate-900"><span>Customer pays</span><span className="text-right tabular-nums">{formatCurrency(invoiceTotals.totalAmount)}<UsdHint ngn={invoiceTotals.totalAmount} rate={usdRate} className="font-normal" /></span></div>
                {plan === "deposit" && <div className="flex justify-between text-slate-700"><span>First payment</span><span className="tabular-nums">{formatCurrency(Math.round(invoiceTotals.totalAmount * 50) / 100)}</span></div>}
                <div className="flex justify-between text-slate-700 pt-1.5 border-t border-slate-200"><span>You receive</span><span className="tabular-nums">{formatCurrency(invoiceTotals.vendorPayoutAmount)}</span></div>
              </div>
              <Button onClick={createInvoice} loading={sending} fullWidth>Create invoice</Button>
            </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {confirmDialog}
      <OrderItemModal
        item={activeItem}
        productHref={activeItem?.productId ? `/vendor/products/${activeItem.productId}?storeId=${storeId}` : null}
        onClose={() => setActiveItem(null)}
      />
    </div>
  );
}
