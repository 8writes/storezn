"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Button } from "@/components/ui/Button.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { formatDate } from "@/lib/format.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { EmptyState } from "@/components/ui/EmptyState.js";
import { SearchInput } from "@/components/ui/SearchInput.js";
import { QuotePricingModal } from "@/components/invoices/QuotePricingModal.js";

export default function VendorInvoiceRequestsPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { stores, storeId, loading: storesLoading } = useVendorStore();
  const [requests, setRequests] = useState([]);
  const [requestTotal, setRequestTotal] = useState(0);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [pricing, setPricing] = useState({ feePolicy: null, intlFeePolicy: null, usdRate: null });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { confirm, confirmDialog } = useConfirm();

  const loadData = useCallback(() => {
    if (!token || !storeId) return;
    setLoading(true);
    Promise.all([
      apiFetch(`/api/v1/vendor/stores/${storeId}/invoice-requests?page=${page}&pageSize=20`),
      apiFetch(`/api/v1/vendor/stores/${storeId}/invoices?pageSize=1`),
    ])
      .then(([requestData, invoiceData]) => {
        setRequests(requestData.requests || []);
        setRequestTotal(Number(requestData.total) || (requestData.requests || []).length);
        setPagination(requestData.pagination || null);
        setPricing({ feePolicy: invoiceData.feePolicy || null, intlFeePolicy: invoiceData.intlFeePolicy || null, usdRate: invoiceData.usdRate || null });
      })
      .catch((err) => toast.error(err.message || "Failed to load quote requests"))
      .finally(() => setLoading(false));
  }, [token, storeId, page, apiFetch]);

  useEffect(() => {
    const timer = setTimeout(loadData, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  const selected = requests.find((row) => row.request.id === selectedId) || null;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleRequests = useMemo(() => requests.filter(({ request, items }) => {
    if (!normalizedSearch) return true;
    return [request.requestNumber, request.buyerName, request.guestEmail, request.buyerPhone, ...items.map((item) => item.productName)]
      .some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
  }), [requests, normalizedSearch]);

  const cancelRequest = async (request) => {
    const approved = await confirm({
      title: "Cancel this quote request?",
      description: request.guestEmail ? "The customer will be emailed that it was cancelled." : undefined,
      confirmLabel: "Cancel request",
      variant: "danger",
    });
    if (!approved) return;
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/invoice-requests/${request.id}`, { method: "PATCH", body: JSON.stringify({ action: "cancel" }) });
      setRequests((rows) => rows.filter((row) => row.request.id !== request.id));
      setRequestTotal((value) => Math.max(0, value - 1));
      if (selectedId === request.id) setSelectedId("");
      toast.success("Quote request cancelled");
    } catch (err) {
      toast.error(err.message || "Could not cancel quote request");
    }
  };

  if (!storesLoading && stores.length === 0) return <p className="text-sm text-slate-700">No store set up yet.</p>;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <BackLink href="/vendor/invoices" label="Invoices" />

      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Quote requests</h1>
        <p className="mt-1 text-sm text-slate-700">Customers waiting for your price. Open one, add prices, and send the invoice.</p>
      </div>

      {requests.length > 0 && <SearchInput value={search} onSearch={setSearch} placeholder="Search requests" />}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => <div key={i} className="h-24 rounded-sm border border-slate-200 bg-surface animate-pulse" />)}
        </div>
      ) : visibleRequests.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={search ? "No matching requests" : "Nothing waiting"}
          description={search ? "Try another search." : "When a customer asks for a price, it shows up here."}
        />
      ) : (
        <>
          <p className="text-sm font-medium text-slate-700">{requestTotal} waiting for your price</p>
          <ul className="space-y-2">
            {visibleRequests.map(({ request, items }) => {
              const name = request.buyerName || request.buyerPhone || request.guestEmail;
              return (
                <li key={request.id} className="rounded-sm border border-slate-200 bg-surface p-4 shadow-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`font-semibold truncate ${name ? "text-slate-900" : "text-slate-500"}`}>{name || "Customer not added yet"}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{formatDate(request.createdAt)}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Needs price</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700 line-clamp-2">
                    {items.map((item) => `${item.productName} × ${item.quantity}`).join(", ")}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Button size="sm" onClick={() => setSelectedId(request.id)}>Set prices</Button>
                    <Button size="sm" variant="ghost" onClick={() => cancelRequest(request)}>Cancel</Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination pagination={pagination} onPageChange={setPage} />
        </>
      )}

      {selected && (
        <QuotePricingModal
          key={selected.request.id}
          storeId={storeId}
          apiFetch={apiFetch}
          row={selected}
          feePolicy={pricing.feePolicy}
          intlFeePolicy={pricing.intlFeePolicy}
          usdRate={pricing.usdRate}
          onClose={() => setSelectedId("")}
        />
      )}
      {confirmDialog}
    </div>
  );
}
