"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCustomerAuth } from "@/hooks/useCustomerAuth.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { Badge } from "@/components/ui/Badge.js";
import { Button } from "@/components/ui/Button.js";
import { formatCurrency, formatDateTime } from "@/lib/format.js";

const STATUS_COLOR = { pending: "amber", processing: "blue", shipped: "blue", delivered: "green", cancelled: "red", refund_requested: "amber", refunded: "slate" };

export default function CustomerOrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, token, loading: authLoading } = useCustomerAuth();
  const { confirm, confirmDialog } = useConfirm();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

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

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {confirmDialog}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{order.orderNumber}</h1>
        <p className="text-sm text-slate-500 mt-1">Placed {formatDateTime(order.createdAt)}</p>
      </div>

      <Badge color={STATUS_COLOR[order.status] || "slate"}>{order.status.replace("_", " ")}</Badge>

      <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm text-slate-600">
            <span>{item.productName}{item.variantLabel ? ` (${item.variantLabel})` : ""} × {item.quantity}</span>
            <span>{formatCurrency(item.lineTotal)}</span>
          </div>
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
    </div>
  );
}
