"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Copy, ExternalLink, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { Badge } from "@/components/ui/Badge.js";
import { Button } from "@/components/ui/Button.js";
import { CopyButton } from "@/components/ui/CopyButton.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { OrderItemModal } from "@/components/ui/OrderItemModal.js";
import { formatCurrency, formatDateTime } from "@/lib/format.js";
import { getPlatformUrl } from "@/lib/storeUrl.js";
import { invoiceStatus, paymentKindLabel, paymentStatus, whatsappInvoiceUrl } from "@/lib/invoiceLabels.js";

export default function VendorInvoiceDetailPage({ params }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const { storeId: activeStoreId, stores } = useVendorStore();
  const storeId = searchParams.get("storeId") || activeStoreId;
  // Just created from the pricing screen - lead with "send it".
  const justCreated = searchParams.get("created") === "1";
  const storeName = stores.find((s) => s.id === storeId)?.name || "";
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { confirm, confirmDialog } = useConfirm();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [activeItem, setActiveItem] = useState(null);

  const load = useCallback(() => {
    if (!token || !storeId || !id) return;
    setLoading(true);
    apiFetch(`/api/v1/vendor/stores/${storeId}/invoices/${id}`)
      .then(setData)
      .catch((error) => toast.error(error.message || "Could not load invoice"))
      .finally(() => setLoading(false));
  }, [apiFetch, id, storeId, token]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const paymentUrl = data?.invoice?.shareToken ? getPlatformUrl(`/invoice/${data.invoice.shareToken}`) : "";

  const copyPaymentLink = async () => {
    try {
      await navigator.clipboard.writeText(paymentUrl);
      toast.success("Payment link copied");
    } catch {
      toast.error("Could not copy the payment link");
    }
  };

  const cancelInvoice = async () => {
    const approved = await confirm({
      title: "Cancel this invoice?",
      description: "The customer will be emailed and any held stock will be released.",
      confirmLabel: "Cancel invoice",
      variant: "danger",
    });
    if (!approved) return;
    setCancelling(true);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/invoices/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "cancel" }),
      });
      toast.success("Invoice cancelled and held stock was released");
      load();
    } catch (error) {
      toast.error(error.message || "Could not cancel invoice");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <FormSkeleton />;
  if (!data) return null;

  const { invoice, items = [], payments = [], order } = data;
  const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const platformFee = Number(order?.commissionAmount || 0) + Number(order?.flatFeeAmount || 0);
  const canCancel = invoice.status === "sent" && Number(invoice.amountPaid || 0) === 0;
  const status = invoiceStatus(invoice.status);
  const payable = ["sent", "partially_paid"].includes(invoice.status);
  const whatsappUrl = whatsappInvoiceUrl({ phone: invoice.buyerPhone, storeName, link: paymentUrl });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {confirmDialog}
      <BackLink href="/vendor/invoices" label="Back to invoices" />

      {justCreated && payable && (
        <div className="rounded-sm border border-green-200 bg-green-50 p-4 space-y-1">
          <p className="flex items-center gap-2 font-semibold text-green-900"><CheckCircle2 size={18} /> Invoice created</p>
          <p className="text-sm text-green-900">Now send the payment link to your customer.</p>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 truncate">{invoice.buyerName || "Invoice"}</h1>
          <p className="text-sm text-slate-700">{invoice.invoiceNumber} · {formatDateTime(invoice.createdAt)}</p>
        </div>
        <Badge color={status.color}>{status.label}</Badge>
      </div>

      {payable && (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={copyPaymentLink}><Copy size={15} /> Copy link</Button>
          <a href={whatsappUrl} target="_blank" rel="noreferrer" className="block">
            <Button variant="outline" fullWidth><MessageCircle size={15} /> Send on WhatsApp</Button>
          </a>
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <a href={paymentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
          <ExternalLink size={14} /> See what the customer sees
        </a>
        {order?.id && (
          <Link href={`/vendor/orders/${order.id}?storeId=${storeId}`} className="font-medium text-brand-700 hover:underline">View order</Link>
        )}
      </div>

      <section className="bg-surface border border-slate-200 rounded-sm p-5 text-sm text-slate-700 space-y-1">
        <p className="font-semibold text-slate-900 mb-2">Customer</p>
        {!invoice.buyerName && !invoice.guestEmail && !invoice.buyerPhone ? (
          <p className="text-slate-600">Not added yet. The customer fills in their details when they pay.</p>
        ) : (
          <>
            <p>{invoice.buyerName || "Name not added yet"}</p>
            {invoice.buyerPhone && <p className="flex items-center gap-1.5">{invoice.buyerPhone}<CopyButton value={invoice.buyerPhone} label="Copy phone number" /></p>}
            {invoice.guestEmail && <p className="flex items-center gap-1.5">{invoice.guestEmail}<CopyButton value={invoice.guestEmail} label="Copy email" /></p>}
          </>
        )}
      </section>

      <section className="bg-surface border border-slate-200 rounded-sm p-5 space-y-4">
        <p className="text-sm font-semibold text-slate-900">Items</p>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveItem(item)}
            className="flex items-center justify-between gap-3 text-sm text-slate-700 w-full text-left cursor-pointer hover:text-slate-900"
          >
            <div className="flex items-center gap-3 min-w-0">
              {item.productImage ? (
                <img src={item.productImage} alt="" className="w-10 h-10 rounded-sm object-cover border border-slate-200 shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-sm bg-slate-100 shrink-0" />
              )}
              <span className="truncate">
                {item.productName}
                {item.variantLabel ? ` (${item.variantLabel})` : ""} x {item.quantity}
              </span>
            </div>
            <span className="font-semibold text-slate-900 shrink-0">{formatCurrency(item.lineTotal)}</span>
          </button>
        ))}
      </section>

      <section className="bg-surface border border-slate-200 rounded-sm p-5 space-y-2 text-sm">
        <div className="flex justify-between text-slate-700"><span>Items</span><span className="tabular-nums">{formatCurrency(subtotal)}</span></div>
        {order?.feeChargedToCustomer && platformFee > 0 && (
          <div className="flex justify-between text-slate-700"><span>Processing Fee</span><span className="tabular-nums">+{formatCurrency(platformFee)}</span></div>
        )}
        <div className="flex justify-between font-semibold text-slate-900 pt-2 border-t border-slate-100"><span>Customer pays</span><span className="tabular-nums">{formatCurrency(invoice.totalAmount)}</span></div>
        {Number(invoice.amountPaid) > 0 && <div className="flex justify-between text-green-700"><span>Paid so far</span><span className="tabular-nums">{formatCurrency(invoice.amountPaid)}</span></div>}
        {payable && <div className="flex justify-between font-semibold text-slate-900"><span>{invoice.plan === "deposit" && Number(invoice.amountPaid) === 0 ? "First payment (50%)" : "Still to pay"}</span><span className="tabular-nums">{formatCurrency(invoice.amountDue)}</span></div>}
        {order && <div className="flex justify-between text-slate-700 pt-2 border-t border-slate-100"><span>You receive</span><span className="tabular-nums">{formatCurrency(order.vendorPayoutAmount)}</span></div>}
      </section>

      <section className="bg-surface border border-slate-200 rounded-sm p-5 space-y-2 text-sm">
        <div className="flex justify-between gap-3"><span className="text-slate-600">Payment</span><span className="text-slate-900 text-right">{invoice.plan === "deposit" ? "50% now, 50% later" : "All at once"}</span></div>
        {invoice.expiresAt && payable && <div className="flex justify-between gap-3"><span className="text-slate-600">Link works until</span><span className="text-slate-900 text-right">{formatDateTime(invoice.expiresAt)}</span></div>}
        {invoice.paidAt && <div className="flex justify-between gap-3"><span className="text-slate-600">Paid on</span><span className="text-slate-900 text-right">{formatDateTime(invoice.paidAt)}</span></div>}
        {invoice.note && <div className="pt-2 border-t border-slate-100"><p className="text-slate-600 mb-1">Note</p><p className="text-slate-900 whitespace-pre-wrap">{invoice.note}</p></div>}
      </section>

      <section className="bg-surface border border-slate-200 rounded-sm p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-900">Payments</p>
        {payments.length === 0 ? (
          <p className="text-sm text-slate-600">No payments yet.</p>
        ) : payments.map((payment) => (
          <div key={payment.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900" title={payment.paymentReference}>{paymentKindLabel(payment.kind)}</p>
              <p className="text-xs text-slate-600">{formatDateTime(payment.paidAt || payment.createdAt)}</p>
            </div>
            <div className="text-right space-y-1">
              <p className="text-sm font-semibold text-slate-900 tabular-nums">{formatCurrency(payment.amount)}</p>
              <Badge color={paymentStatus(payment.status).color}>{paymentStatus(payment.status).label}</Badge>
            </div>
          </div>
        ))}
      </section>

      {canCancel && (
        <div className="flex justify-end">
          <Button variant="danger" onClick={cancelInvoice} loading={cancelling}>Cancel invoice</Button>
        </div>
      )}

      <OrderItemModal
        item={activeItem}
        productHref={activeItem?.productId ? `/vendor/products/${activeItem.productId}?storeId=${storeId}` : null}
        onClose={() => setActiveItem(null)}
      />
    </div>
  );
}
