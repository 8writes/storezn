"use client";
import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { Badge } from "@/components/ui/Badge.js";
import { Button } from "@/components/ui/Button.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { CopyButton } from "@/components/ui/CopyButton.js";
import { OrderItemModal } from "@/components/ui/OrderItemModal.js";
import { PriceInput } from "@/components/ui/PriceInput.js";
import { formatCurrency, formatDateTime } from "@/lib/format.js";
import { toNaira } from "@/lib/money.js";
import { downloadOrderPdf } from "@/lib/orderPdf.js";

const STATUS_COLOR = { pending: "amber", processing: "blue", shipped: "blue", delivered: "green", cancelled: "red", abandoned: "slate", refund_requested: "amber", refunded: "slate", refund_declined: "red" };
const NEXT_ACTIONS = {
  processing: [{ status: "shipped", label: "Mark as shipped" }, { status: "cancelled", label: "Cancel order", variant: "danger" }],
  shipped: [{ status: "delivered", label: "Mark as delivered" }],
};

export default function VendorOrderDetailPage({ params }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const storeId = searchParams.get("storeId");
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { confirm, confirmDialog } = useConfirm();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  const [shippingFeeInput, setShippingFeeInput] = useState("");
  const [savingShippingFee, setSavingShippingFee] = useState(false);

  const load = () => {
    setLoading(true);
    apiFetch(`/api/v1/vendor/stores/${storeId}/orders/${id}`)
      .then(setData)
      .catch((err) => toast.error(err.message || "Could not load order"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!storeId || !token) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, token]);

  const handleStatusChange = async (status, label) => {
    const ok = await confirm({ title: label + "?", variant: status === "cancelled" ? "danger" : "default" });
    if (!ok) return;
    setUpdating(true);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast.success("Order updated");
      load();
    } catch (err) {
      toast.error(err.message || "Could not update order");
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveShippingFee = async () => {
    if (shippingFeeInput === "") return;
    setSavingShippingFee(true);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ shippingFee: Number(shippingFeeInput) }),
      });
      toast.success("Delivery fee saved");
      load();
    } catch (err) {
      toast.error(err.message || "Could not save delivery fee");
    } finally {
      setSavingShippingFee(false);
    }
  };

  const handleRefundDecision = async (refundDecision) => {
    let reviewNote;
    if (refundDecision === "rejected") {
      reviewNote = await confirm({
        title: "Reject refund?",
        description: "Tell the customer why - they'll see this note on their order.",
        requireReason: true,
        confirmLabel: "Reject",
        variant: "danger",
      });
      if (!reviewNote) return;
    } else {
      // Approving is a record-keeping action only - it does not move any
      // money (see DOCUMENTATION.md). The vendor has to actually send the
      // refund themselves, and note that their platform commission on
      // this order isn't returned to them either way.
      const ok = await confirm({
        title: "Approve refund?",
        description: `This only records the decision - it doesn't send any money. You'll need to refund ${formatCurrency(data.order.totalAmount)} to the customer yourself (bank transfer, Paystack dashboard, etc.). The platform's commission on this order isn't returned.`,
      });
      if (!ok) return;
    }
    setUpdating(true);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ refundDecision, ...(reviewNote ? { reviewNote } : {}) }),
      });
      toast.success("Refund request updated");
      load();
    } catch (err) {
      toast.error(err.message || "Could not update refund request");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <FormSkeleton />;
  if (!data) return null;

  const { order, items, refundRequest } = data;

  const downloadPdf = () =>
    downloadOrderPdf({
      order,
      items,
      storeName: order.isOffline ? "Offline sale" : undefined,
      shippingAddress: order.shippingAddress,
      totalsLines: [
        // No fee lines at all for an offline sale - the platform never
        // took a cut of it, unlike a real online checkout.
        ...(order.isOffline
          ? []
          : [
              {
                label: `Platform fee (${order.commissionRatePercent}%${order.flatFeeAmount > 0 ? ` + ${formatCurrency(order.flatFeeAmount)}` : ""})`,
                value: -(order.commissionAmount + (order.flatFeeAmount || 0)),
              },
            ]),
        { label: "Your payout", value: order.vendorPayoutAmount, bold: true },
      ],
    });

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {confirmDialog}
      <BackLink href="/vendor/orders" label="Back to orders" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            {order.orderNumber}
            {order.isOffline && <Badge color="slate">Offline</Badge>}
          </h1>
          <p className="text-sm text-slate-500">Placed {formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge color={STATUS_COLOR[order.status] || "slate"}>{order.status.replace("_", " ")}</Badge>
          <Button variant="outline" size="sm" onClick={downloadPdf}>
            <Download size={14} />
            PDF
          </Button>
        </div>
      </div>

      {(order.buyerName || order.buyerPhone) && (
        <div className="bg-white border border-slate-200 rounded-sm p-5 text-sm text-slate-700">
          <p className="font-semibold text-slate-700 mb-1">Customer</p>
          {order.buyerName && <p>{order.buyerName}</p>}
          {order.buyerPhone && (
            <p className="flex items-center gap-1.5">
              {order.buyerPhone}
              <CopyButton value={order.buyerPhone} label="Copy phone number" />
            </p>
          )}
          {order.guestEmail && <p>{order.guestEmail}</p>}
        </div>
      )}

      {order.note && (
        <div className="bg-white border border-slate-200 rounded-sm p-5 text-sm text-slate-700">
          <p className="font-semibold text-slate-700 mb-1">Note</p>
          <p>{order.note}</p>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-3">
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
                {item.variantLabel ? ` (${item.variantLabel})` : ""} × {item.quantity}
              </span>
            </div>
            <span className="shrink-0">{formatCurrency(item.lineTotal)}</span>
          </button>
        ))}
        {!order.isOffline && (
          <div className="pt-2 border-t border-slate-100">
            <div className="flex justify-between text-sm text-slate-500">
              <span>
                Platform fee ({order.commissionRatePercent}%
                {order.flatFeeAmount > 0 ? ` + ${formatCurrency(order.flatFeeAmount)}` : ""})
              </span>
              <span>-{formatCurrency(order.commissionAmount + (order.flatFeeAmount || 0))}</span>
            </div>
          </div>
        )}
        <div className={`flex justify-between font-semibold text-slate-900 ${order.isOffline ? "pt-2 border-t border-slate-100" : ""}`}>
          <span>Your payout</span>
          <span>{formatCurrency(order.vendorPayoutAmount)}</span>
        </div>
      </div>

      {data.tenders?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-1.5">
          <p className="text-sm font-semibold text-slate-700 mb-1">Payment</p>
          {data.tenders.map((t) => {
            const label = t.method === "card" ? `POS${t.provider ? ` · ${t.provider}` : ""}` : t.method.replace("_", " ");
            const change = Number(t.changeGiven || 0);
            return (
              <div key={t.id} className="flex justify-between text-sm">
                <span className="text-slate-600 capitalize">
                  {label}
                  {t.reference ? <span className="text-slate-400"> · {t.reference}</span> : null}
                  {change > 0 ? <span className="text-slate-400"> · {formatCurrency(toNaira(change))} cash change from drawer</span> : null}
                </span>
                <span className="text-slate-900 tabular-nums">{formatCurrency(toNaira(t.amount))}</span>
              </div>
            );
          })}
        </div>
      )}

      {order.shippingAddress && (
        <div className="bg-white border border-slate-200 rounded-sm p-5 text-sm text-slate-700">
          <p className="font-semibold text-slate-700 mb-1">Ship to</p>
          <p>{order.shippingAddress.fullName}</p>
          <p>{order.shippingAddress.line1}{order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ""}</p>
          <p>{order.shippingAddress.city}, {order.shippingAddress.state}</p>
          <p className="flex items-center gap-1.5">
            {order.shippingAddress.phone}
            <CopyButton value={order.shippingAddress.phone} label="Copy phone number" />
          </p>
        </div>
      )}

      {order.shippingAddress && (
        <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-3">
          <p className="font-semibold text-slate-700 text-sm">Delivery fee</p>
          {!order.shippingFeeTBD ? (
            <p className="text-sm text-slate-700">{formatCurrency(order.shippingFee)}</p>
          ) : order.shippingFeeConfirmedAt ? (
            <p className="text-sm text-slate-700 flex items-center gap-2">
              {formatCurrency(order.shippingFee)}
              <Badge color="green">Confirmed</Badge>
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                Delivery for this order is to be determined - enter what you actually charged before you can update its
                status.
              </p>
              <div className="flex items-end gap-2">
                <PriceInput label="Fee" className="max-w-40" value={shippingFeeInput} onChange={setShippingFeeInput} />
                <Button size="sm" onClick={handleSaveShippingFee} loading={savingShippingFee}>Save</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {refundRequest?.status === "pending" && (
        <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Refund requested</p>
          <p className="text-sm text-slate-700">{refundRequest.reason}</p>
          <div className="flex justify-end gap-3">
            <Button size="sm" onClick={() => handleRefundDecision("approved")} loading={updating}>Approve</Button>
            <Button size="sm" variant="danger" onClick={() => handleRefundDecision("rejected")} loading={updating}>Reject</Button>
          </div>
        </div>
      )}

      {(NEXT_ACTIONS[order.status] || []).length > 0 && (
        order.shippingFeeTBD && !order.shippingFeeConfirmedAt ? (
          <p className="text-xs text-slate-500 text-right">Enter the delivery fee above before updating this order's status.</p>
        ) : (
          <div className="flex justify-end gap-3">
            {NEXT_ACTIONS[order.status].map((action) => (
              <Button key={action.status} variant={action.variant || "primary"} onClick={() => handleStatusChange(action.status, action.label)} loading={updating}>
                {action.label}
              </Button>
            ))}
          </div>
        )
      )}

      <OrderItemModal
        item={activeItem}
        productHref={activeItem ? `/vendor/products/${activeItem.productId}?storeId=${storeId}` : null}
        onClose={() => setActiveItem(null)}
      />
    </div>
  );
}
