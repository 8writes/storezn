"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
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
import { customerFieldEntries } from "@/lib/customerFields.js";
import { formatCurrency, formatDateTime } from "@/lib/format.js";
import { getPlatformUrl } from "@/lib/storeUrl.js";

const STATUS_COLOR = {
  draft: "slate",
  sent: "amber",
  partially_paid: "blue",
  paid: "green",
  expired: "red",
  void: "slate",
  cancelled: "red",
};

const PAYMENT_STATUS_COLOR = { pending: "amber", partially_paid: "blue", paid: "green", failed: "red" };

function label(value) {
  return String(value || "").replaceAll("_", " ");
}

function answerValue(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value == null || value === "") return "Not provided";
  return String(value);
}

export default function VendorInvoiceDetailPage({ params }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const { storeId: activeStoreId } = useVendorStore();
  const storeId = searchParams.get("storeId") || activeStoreId;
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { confirm, confirmDialog } = useConfirm();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {confirmDialog}
      <BackLink href="/vendor/invoices" label="Back to invoices" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{invoice.invoiceNumber}</h1>
          <p className="text-sm text-slate-700">Created {formatDateTime(invoice.createdAt)}</p>
        </div>
        <Badge color={STATUS_COLOR[invoice.status] || "slate"}>{label(invoice.status)}</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={copyPaymentLink}>Copy payment link</Button>
        <a href={paymentUrl} target="_blank" rel="noreferrer">
          <Button size="sm" variant="outline"><ExternalLink size={14} /> Open customer invoice</Button>
        </a>
        {order?.id && (
          <Link href={`/vendor/orders/${order.id}?storeId=${storeId}`}>
            <Button size="sm" variant="outline">View related order</Button>
          </Link>
        )}
      </div>

      <section className="bg-surface border border-slate-200 rounded-sm p-5 text-sm text-slate-700 space-y-1">
        <p className="font-semibold text-slate-900 mb-2">Customer</p>
        <p>{invoice.buyerName || "No customer name"}</p>
        {invoice.guestEmail && <p className="flex items-center gap-1.5">{invoice.guestEmail}<CopyButton value={invoice.guestEmail} label="Copy email" /></p>}
        {invoice.buyerPhone && <p className="flex items-center gap-1.5">{invoice.buyerPhone}<CopyButton value={invoice.buyerPhone} label="Copy phone number" /></p>}
      </section>

      <section className="bg-surface border border-slate-200 rounded-sm p-5 space-y-4">
        <p className="text-sm font-semibold text-slate-900">Items</p>
        {items.map((item) => {
          const answers = customerFieldEntries(item.customerFields);
          return (
            <div key={item.id} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0 space-y-2">
              <div className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{item.productName}</p>
                  {item.variantLabel && <p className="text-xs text-slate-600">{item.variantLabel}</p>}
                  <p className="text-xs text-slate-600">{item.quantity} x {formatCurrency(item.unitPrice)}</p>
                </div>
                <p className="font-semibold text-slate-900 shrink-0">{formatCurrency(item.lineTotal)}</p>
              </div>
              {answers.length > 0 && (
                <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-1 rounded-sm bg-slate-50 p-3 text-xs">
                  {answers.map((answer) => (
                    <div key={answer.id} className="min-w-0">
                      <dt className="text-slate-600">{answer.label}</dt>
                      <dd className="text-slate-900 break-words">{answerValue(answer.value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          );
        })}
      </section>

      <section className="bg-surface border border-slate-200 rounded-sm p-5 space-y-2 text-sm">
        <div className="flex justify-between text-slate-700"><span>Items subtotal</span><span>{formatCurrency(subtotal)}</span></div>
        {order && (
          <div className="flex justify-between text-slate-700">
            <span>Platform fee ({order.commissionRatePercent}%{Number(order.flatFeeAmount) > 0 ? ` + ${formatCurrency(order.flatFeeAmount)}` : ""})</span>
            <span>{order.feeChargedToCustomer ? "+" : "-"}{formatCurrency(platformFee)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-slate-900 pt-2 border-t border-slate-100"><span>Invoice total</span><span>{formatCurrency(invoice.totalAmount)}</span></div>
        <div className="flex justify-between text-brand-700"><span>Paid</span><span>{formatCurrency(invoice.amountPaid)}</span></div>
        <div className="flex justify-between font-semibold text-slate-900"><span>Currently due</span><span>{formatCurrency(invoice.amountDue)}</span></div>
        {order && <div className="flex justify-between text-slate-700"><span>Your total payout</span><span>{formatCurrency(order.vendorPayoutAmount)}</span></div>}
      </section>

      <section className="bg-surface border border-slate-200 rounded-sm p-5 space-y-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold text-slate-900">Invoice details</p>
          <Badge color="slate">{invoice.plan === "deposit" ? "50% deposit" : "Full payment"}</Badge>
        </div>
        {invoice.sentAt && <div className="flex justify-between gap-3"><span className="text-slate-600">Sent</span><span className="text-slate-900 text-right">{formatDateTime(invoice.sentAt)}</span></div>}
        {invoice.expiresAt && <div className="flex justify-between gap-3"><span className="text-slate-600">Expires</span><span className="text-slate-900 text-right">{formatDateTime(invoice.expiresAt)}</span></div>}
        {invoice.paidAt && <div className="flex justify-between gap-3"><span className="text-slate-600">Paid</span><span className="text-slate-900 text-right">{formatDateTime(invoice.paidAt)}</span></div>}
        {invoice.note && <div className="pt-2 border-t border-slate-100"><p className="text-slate-600 mb-1">Note</p><p className="text-slate-900 whitespace-pre-wrap">{invoice.note}</p></div>}
      </section>

      <section className="bg-surface border border-slate-200 rounded-sm p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-900">Payment history</p>
        {payments.length === 0 ? (
          <p className="text-sm text-slate-600">No payment attempts yet.</p>
        ) : payments.map((payment) => (
          <div key={payment.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 capitalize">{label(payment.kind)} payment</p>
              <p className="text-xs text-slate-600 break-all">{payment.paymentReference}</p>
              <p className="text-xs text-slate-600">Started {formatDateTime(payment.createdAt)}{payment.paidAt ? ` - paid ${formatDateTime(payment.paidAt)}` : ""}</p>
            </div>
            <div className="text-right space-y-1">
              <p className="text-sm font-semibold text-slate-900">{formatCurrency(payment.amount)}</p>
              <Badge color={PAYMENT_STATUS_COLOR[payment.status] || "slate"}>{label(payment.status)}</Badge>
            </div>
          </div>
        ))}
      </section>

      {canCancel && (
        <div className="flex justify-end">
          <Button variant="danger" onClick={cancelInvoice} loading={cancelling}>Cancel invoice</Button>
        </div>
      )}
    </div>
  );
}
