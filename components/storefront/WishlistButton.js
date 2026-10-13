"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { useCustomerAuth } from "@/hooks/useCustomerAuth.js";
import { safeFetch } from "@/lib/fetchError.js";

// Which products this shopper has saved, fetched ONCE per page however
// many hearts are on it.
//
// A grid can hold twenty cards and a rail another ten; each asking the
// server whether its own product is saved would be thirty requests to
// draw one screen. They share this instead: the first button to mount
// starts the fetch, the rest wait on it, and a toggle anywhere updates
// every heart for that product at once.
let savedIds = null;
let inflight = null;
const listeners = new Set();

function publish(next) {
  savedIds = next;
  for (const listener of listeners) listener(next);
}

// An external store rather than effect-plus-state: the saved set lives
// outside React (one shared fetch for every heart on the page), which is
// exactly what useSyncExternalStore is for. It also avoids setting state
// from an effect, which cascades renders across every card in a grid.
// Same shape as lib/navGroups.js.
const subscribe = (onChange) => {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
};
// Stable by identity: publish() swaps in a whole new Set, so this only
// changes when the data actually changed.
const getSnapshot = () => savedIds;
const getServerSnapshot = () => null;

function useSavedIds(token) {
  const ids = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    // The effect only kicks off the fetch - the store above is what
    // drives re-renders.
    if (!token || savedIds || inflight) return;
    inflight = safeFetch("/api/v1/storefront/wishlist", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) publish(new Set((data.items || []).map((item) => item.product.id)));
      })
      // Silent: a heart that can't load its state just starts empty,
      // which is no worse than before it existed.
      .catch(() => {})
      .finally(() => { inflight = null; });
  }, [token]);

  return token ? ids : null;
}

// Save/unsave a product. Logged-in shoppers only - a list that lives in
// one browser and vanishes when it's cleared isn't a wishlist - so a guest
// is sent to sign in and returned to where they were.
export function WishlistButton({ productId, className = "", size = 18 }) {
  const { user, token } = useCustomerAuth();
  const router = useRouter();
  const ids = useSavedIds(token);
  const [pending, setPending] = useState(null); // optimistic override
  const [busy, setBusy] = useState(false);

  const saved = pending !== null ? pending : Boolean(ids?.has(productId));

  const toggle = async (event) => {
    // These sit on top of a product card that is itself a link.
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;

    if (!user || !token) {
      toast.info("Sign in to save items");
      const next = typeof window !== "undefined" ? window.location.pathname : "/";
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    // Optimistic - a heart that waits on the network feels broken.
    const next = !saved;
    setPending(next);
    setBusy(true);
    try {
      const res = await safeFetch(
        next ? "/api/v1/storefront/wishlist" : `/api/v1/storefront/wishlist?productId=${encodeURIComponent(productId)}`,
        {
          method: next ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          ...(next ? { body: JSON.stringify({ productId }) } : {}),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Couldn't update your wishlist");
      }
      // Tell every other heart for this product, and keep the shared set
      // honest for anything that mounts later.
      const updated = new Set(savedIds || []);
      if (next) updated.add(productId);
      else updated.delete(productId);
      publish(updated);
      setPending(null);
    } catch (err) {
      setPending(null); // falls back to the shared set, so the heart reverts
      toast.error(err.message || "Couldn't update your wishlist");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
      title={saved ? "Remove from wishlist" : "Save to wishlist"}
      disabled={busy}
      className={`inline-flex items-center justify-center rounded-full bg-white/90 p-2 shadow-sm transition-colors hover:bg-white disabled:opacity-60 ${className}`}
    >
      <Heart size={size} className={saved ? "fill-red-500 text-red-500" : "text-slate-600"} />
    </button>
  );
}
