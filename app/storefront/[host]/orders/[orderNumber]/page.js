"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/Input.js";
import { Button } from "@/components/ui/Button.js";
import { Badge } from "@/components/ui/Badge.js";
import { formatCurrency, formatDateTime } from "@/lib/format.js";
import { useCustomerAuth } from "@/hooks/useCustomerAuth.js";

const STATUS_COLOR = { pending: "amber", processing: "blue", shipped: "blue", delivered: "green", cancelled: "red", refund_requested: "amber", refunded: "slate" };

export default function OrderConfirmationPage() {
  const { orderNumber } = useParams();
  const searchParams = useSearchParams();
  const { token } = useCustomerAuth();

  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = async (lookupEmail) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (lookupEmail) params.set("email", lookupEmail);
      const res = await fetch(`/api/v1/storefront/orders/${orderNumber}?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Order not found");
      setOrder(data.order);
      setItems(data.items);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token || searchParams.get("email")) load(searchParams.get("email"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!order) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Find your order</h1>
        <p className="text-sm text-slate-500">Enter the email you checked out with to view order {orderNumber}.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(email);
          }}
          className="space-y-4"
        >
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" fullWidth loading={loading}>Look up order</Button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Order confirmed</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-1">{order.orderNumber}</h1>
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

      {order.shippingAddress && (
        <div className="bg-white border border-slate-200 rounded-sm p-5 text-sm text-slate-600">
          <p className="font-semibold text-slate-700 mb-1">Shipping to</p>
          <p>{order.shippingAddress.fullName}</p>
          <p>{order.shippingAddress.line1}{order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ""}</p>
          <p>{order.shippingAddress.city}, {order.shippingAddress.state}</p>
          <p>{order.shippingAddress.phone}</p>
        </div>
      )}
    </div>
  );
}
