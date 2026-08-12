"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCustomerAuth } from "@/hooks/useCustomerAuth.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { Badge } from "@/components/ui/Badge.js";
import { Button } from "@/components/ui/Button.js";
import { OrderItemModal } from "@/components/ui/OrderItemModal.js";
import { formatCurrency, formatDateTime } from "@/lib/format.js";
import { downloadOrderPdf } from "@/lib/orderPdf.js";
import { Download } from "lucide-react";

const STATUS_COLOR = { pending: "amber", processing: "blue", shipped: "blue", delivered: "green", cancelled: "red", refund_requested: "amber", refunded: "slate", refund_declined: "red" };

export default function CustomerOrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, token, loading: authLoading } = useCustomerAuth();
  const { confirm, confirmDialog } = useConfirm();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [activeItem, setActiveItem] = useState(null);

  const load = () => {
    setLoading(true);
    fetch(`/api/v1/customer/orders/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((err) => toast.error(err.message || "Could not load order"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?next=account/orders/${id}`);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, token]);

  const handleRequestRefund = async () => {
    const reason = await confirm({ title: "Request a refund?", description: "Tell the seller why - they'll review your request.", requireReason: true, confirmLabel: "Send request" });
    if (!reason) return;
    setRequesting(true);
    try {
      const res = await fetch(`/api/v1/customer/orders/${id}/refund-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error);
      toast.success("Refund request sent");
      load();
    } catch (err) {
      toast.error(err.message || "Could not send refund request");
    } finally {
      setRequesting(false);
    }
  };

  if (authLoading || loading) return <p className="text-center text-slate-400 py-20">Loading…</p>;
  if (!data) return null;

  const { order, items, refundRequest } = data;

  const downloadPdf = () =>
    downloadOrderPdf({
      order,
      items,
      storeName: order.storeName,
      shippingAddress: order.shippingAddress,
      totalsLines: [{ label: "Total", value: order.totalAmount, bold: true }],
    });

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {confirmDialog}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{order.orderNumber}</h1>
          <p className="text-sm text-slate-500 mt-1">Placed {formatDateTime(order.createdAt)}</p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadPdf}>
          <Download size={14} />
          PDF
        </Button>
      </div>

      <Badge color={STATUS_COLOR[order.status] || "slate"}>{order.status.replace("_", " ")}</Badge>

      <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-3">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveItem(item)}
            className="flex items-center justify-between gap-3 text-sm text-slate-600 w-full text-left cursor-pointer hover:text-slate-900"
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
        <div className="flex justify-between pt-2 border-t border-slate-100 font-semibold text-slate-900">
          <span>Total</span>
          <span>{formatCurrency(order.totalAmount)}</span>
        </div>
      </div>

      {refundRequest ? (
        <div className="bg-white border border-slate-200 rounded-sm p-5 text-sm space-y-1">
          <p className="font-semibold text-slate-700">Refund request</p>
          <p className="text-slate-500">Status: <Badge color={refundRequest.status === "approved" ? "green" : refundRequest.status === "rejected" ? "red" : "amber"}>{refundRequest.status}</Badge></p>
          <p className="text-slate-500">Reason: {refundRequest.reason}</p>
          {refundRequest.reviewNote && <p className="text-slate-500">Seller note: {refundRequest.reviewNote}</p>}
        </div>
      ) : order.status === "delivered" ? (
        <Button variant="outline" onClick={handleRequestRefund} loading={requesting}>Request a refund</Button>
      ) : null}

      <OrderItemModal
        item={activeItem}
        productHref={activeItem?.productSlug ? `/products/${activeItem.productSlug}` : null}
        onClose={() => setActiveItem(null)}
      />
    </div>
  );
}
