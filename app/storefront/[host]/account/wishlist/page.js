"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Heart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCustomerAuth } from "@/hooks/useCustomerAuth.js";
import { safeFetch } from "@/lib/fetchError.js";
import { useMoney } from "@/components/storefront/Money.js";
import { getEffectivePrice } from "@/lib/pricing.js";

export default function WishlistPage() {
  const { token, loading: authLoading } = useCustomerAuth();
  // ₦ or $ - whichever the customer is viewing (display only).
  const { format } = useMoney();
  const [items, setItems] = useState(null);
  const [removing, setRemoving] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await safeFetch("/api/v1/storefront/wishlist", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't load your wishlist");
      setItems(data.items || []);
    } catch (err) {
      toast.error(err.message || "Couldn't load your wishlist");
      setItems([]);
    }
  }, [token]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const remove = async (productId) => {
    setRemoving(productId);
    const previous = items;
    setItems((current) => current.filter((item) => item.product.id !== productId));
    try {
      const res = await safeFetch(`/api/v1/storefront/wishlist?productId=${encodeURIComponent(productId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Couldn't remove that");
    } catch (err) {
      setItems(previous); // put it back
      toast.error(err.message || "Couldn't remove that");
    } finally {
      setRemoving("");
    }
  };

  if (authLoading || items === null) {
    return <p className="py-10 text-center text-sm text-slate-600">Loading your wishlist…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="py-12 text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Heart size={22} />
        </span>
        <p className="text-sm font-medium text-slate-900">Nothing saved yet</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-slate-600">
          Tap the heart on anything you like and it&apos;ll be waiting here.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700">
          Browse the store
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const price = getEffectivePrice(item.product.price, item.product.discountPercent);
        const invoiceOnly = item.product.saleMode === "invoice_required";
        return (
          <div key={item.id} className="flex items-center gap-3 rounded-sm border border-slate-200 bg-surface p-3">
            <Link href={`/products/${item.product.slug}`} className="shrink-0">
              {item.product.images?.[0] ? (
                <img src={item.product.images[0]} alt="" className="size-16 rounded-sm object-cover" />
              ) : (
                <span className="flex size-16 items-center justify-center rounded-sm bg-slate-100 text-[11px] text-slate-400">
                  No image
                </span>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/products/${item.product.slug}`} className="text-sm font-medium text-slate-900 hover:underline">
                {item.product.name}
              </Link>
              <p className="mt-0.5 text-sm text-slate-700">
                {invoiceOnly ? "Price on request" : format(price)}
              </p>
              {/* A saved item can be archived or sold out after it was
                  saved. It stays on the list - quietly dropping something
                  the shopper chose would be worse - but it says so. */}
              {item.unavailable ? (
                <p className="mt-0.5 text-xs text-amber-700">No longer available</p>
              ) : item.outOfStock ? (
                <p className="mt-0.5 text-xs text-amber-700">Out of stock right now</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => remove(item.product.id)}
              disabled={removing === item.product.id}
              aria-label={`Remove ${item.product.name} from wishlist`}
              className="shrink-0 p-2 text-slate-400 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
