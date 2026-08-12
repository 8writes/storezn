"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Trash2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { formatCurrency } from "@/lib/format.js";

export default function CartPage() {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setLoading(true);
    fetch("/api/v1/storefront/cart")
      .then((res) => res.json())
      .then(setCart)
      .catch(() => toast.error("Could not load your cart"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const updateQuantity = async (itemId, quantity) => {
    if (quantity < 1) return;
    setBusyId(itemId);
    try {
      const res = await fetch(`/api/v1/storefront/cart/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCart(data);
      window.dispatchEvent(new Event("cart:updated"));
    } catch (err) {
      toast.error(err.message || "Could not update quantity");
    } finally {
      setBusyId(null);
    }
  };

  const removeItem = async (itemId) => {
    setBusyId(itemId);
    try {
      const res = await fetch(`/api/v1/storefront/cart/items/${itemId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCart(data);
      window.dispatchEvent(new Event("cart:updated"));
    } catch (err) {
      toast.error(err.message || "Could not remove item");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="text-center text-slate-700 py-20">Loading your cart…</p>;

  if (!cart || cart.items.length === 0) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-slate-700">Your cart is empty.</p>
        <Link href="/" className="text-brand-600 hover:underline text-sm">Continue shopping</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Your cart</h1>

      <div className="divide-y divide-slate-100 border-y border-slate-200">
        {cart.items.map((item) => (
          // A single fixed-width row (image + name + stepper + price
          // column + trash icon all inline) doesn't fit narrow screens -
          // wraps into a second row below the name on mobile instead,
          // back to one row from sm: up.
          <div key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-5">
            <div className="h-20 w-20 shrink-0 bg-slate-100 overflow-hidden flex items-center justify-center">
              {item.product.images?.[0] ? (
                <img src={item.product.images[0]} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-slate-300 text-xs">No image</span>
              )}
            </div>
            <div className="flex-1 min-w-40">
              <p className="text-sm font-medium text-slate-900 truncate">{item.product.name}</p>
              {item.variant && (
                <p className="text-xs text-slate-700 mt-0.5">{Object.entries(item.variant.options).map(([k, v]) => `${k}: ${v}`).join(", ")}</p>
              )}
              <p className="text-sm text-slate-500 mt-1">{formatCurrency(item.unitPrice)}</p>
            </div>

            <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-4 pl-24 sm:pl-0">
              <div className="flex items-center gap-3 border border-slate-300">
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                  className="h-8 w-8 flex items-center justify-center hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  <Minus size={13} />
                </button>
                <span className="w-4 text-center text-sm">{item.quantity}</span>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="h-8 w-8 flex items-center justify-center hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  <Plus size={13} />
                </button>
              </div>
              <p className="sm:w-24 text-right text-sm font-medium text-slate-900">{formatCurrency(item.lineTotal)}</p>
              <button
                type="button"
                disabled={busyId === item.id}
                onClick={() => removeItem(item.id)}
                aria-label="Remove item"
                className="text-slate-700 hover:text-red-600 disabled:opacity-50 cursor-pointer"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-base font-medium text-slate-700">Subtotal</span>
        <span className="text-xl font-semibold text-slate-900">{formatCurrency(cart.subtotal)}</span>
      </div>

      <Link href="/checkout">
        <Button fullWidth size="lg">Proceed to checkout</Button>
      </Link>
    </div>
  );
}
