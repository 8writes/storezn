"use client";
import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { Badge } from "@/components/ui/Badge.js";
import { Button } from "@/components/ui/Button.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency, formatDateTime } from "@/lib/format.js";

const STATUS_COLOR = { pending: "amber", processing: "blue", shipped: "blue", delivered: "green", cancelled: "red", refund_requested: "amber", refunded: "slate" };
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

  const handleRefundDecision = async (refundDecision) => {
    const ok = await confirm({
      title: refundDecision === "approved" ? "Approve refund?" : "Reject refund?",
      variant: refundDecision === "rejected" ? "danger" : "default",
    });
    if (!ok) return;
    setUpdating(true);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/orders/${id}`, { method: "PATCH", body: JSON.stringify({ refundDecision }) });
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

  return (
    <div className="max-w-xl space-y-6">
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
        <Badge color={STATUS_COLOR[order.status] || "slate"}>{order.status.replace("_", " ")}</Badge>
      </div>

      {(order.buyerName || order.buyerPhone) && (
        <div className="bg-white border border-slate-200 rounded-sm p-5 text-sm text-slate-600">
          <p className="font-semibold text-slate-700 mb-1">Customer</p>
          {order.buyerName && <p>{order.buyerName}</p>}
          {order.buyerPhone && <p>{order.buyerPhone}</p>}
          {order.guestEmail && <p>{order.guestEmail}</p>}
        </div>
      )}

      {order.note && (
        <div className="bg-white border border-slate-200 rounded-sm p-5 text-sm text-slate-600">
          <p className="font-semibold text-slate-700 mb-1">Note</p>
          <p>{order.note}</p>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm text-slate-600">
            <span>{item.productName}{item.variantLabel ? ` (${item.variantLabel})` : ""} × {item.quantity}</span>
            <span>{formatCurrency(item.lineTotal)}</span>
          </div>
        ))}
        <div className="flex justify-between pt-2 border-t border-slate-100 text-sm text-slate-500">
          <span>Commission ({order.commissionRatePercent}%)</span>
          <span>-{formatCurrency(order.commissionAmount)}</span>
        </div>
        <div className="flex justify-between font-semibold text-slate-900">
          <span>Your payout</span>
          <span>{formatCurrency(order.vendorPayoutAmount)}</span>
        </div>
      </div>

      {order.shippingAddress && (
        <div className="bg-white border border-slate-200 rounded-sm p-5 text-sm text-slate-600">
          <p className="font-semibold text-slate-700 mb-1">Ship to</p>
          <p>{order.shippingAddress.fullName}</p>
          <p>{order.shippingAddress.line1}{order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ""}</p>
          <p>{order.shippingAddress.city}, {order.shippingAddress.state}</p>
          <p>{order.shippingAddress.phone}</p>
        </div>
      )}

      {refundRequest?.status === "pending" && (
        <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Refund requested</p>
          <p className="text-sm text-slate-600">{refundRequest.reason}</p>
          <div className="flex gap-3">
            <Button size="sm" onClick={() => handleRefundDecision("approved")} loading={updating}>Approve</Button>
            <Button size="sm" variant="danger" onClick={() => handleRefundDecision("rejected")} loading={updating}>Reject</Button>
          </div>
        </div>
      )}

      {(NEXT_ACTIONS[order.status] || []).length > 0 && (
        <div className="flex gap-3">
          {NEXT_ACTIONS[order.status].map((action) => (
            <Button key={action.status} variant={action.variant || "primary"} onClick={() => handleStatusChange(action.status, action.label)} loading={updating}>
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
