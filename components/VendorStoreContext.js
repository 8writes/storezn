"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { toast } from "sonner";

const VendorStoreContext = createContext(null);
const STORE_CACHE_TTL_MS = 30 * 60 * 1000;
const STORE_CACHE_VERSION = 1;

// Only cache the shell fields needed to paint the dashboard quickly. Bank
// details and other private store settings stay in the live API response.
function cacheableStore(store) {
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    logoUrl: store.logoUrl || null,
    faviconUrl: store.faviconUrl || null,
    isOpen: store.isOpen,
    isActive: store.isActive,
    subAccountCode: store.subAccountCode || null,
    state: store.state || null,
    description: store.description || null,
    listOnMarketplace: store.listOnMarketplace,
  };
}

function readCachedStores(userId) {
  if (!userId || typeof window === "undefined") return [];
  try {
    const cached = JSON.parse(localStorage.getItem(`storezn_stores_${userId}`) || "null");
    if (
      cached?.version !== STORE_CACHE_VERSION ||
      !Array.isArray(cached.stores) ||
      Date.now() - Number(cached.savedAt) > STORE_CACHE_TTL_MS
    ) {
      return [];
    }
    return cached.stores.filter((store) => store?.id && store?.name);
  } catch {
    return [];
  }
}

function writeCachedStores(userId, stores) {
  if (!userId || typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `storezn_stores_${userId}`,
      JSON.stringify({ version: STORE_CACHE_VERSION, savedAt: Date.now(), stores: stores.map(cacheableStore) }),
    );
  } catch {
    // Private mode or a full storage quota should never block the live load.
  }
}

// Single fetch of a vendor's store, shared across every page under
// (dashboard) - a vendor has exactly one store (multi-store support was
// tried and reverted - too much surface area for what it added). Every
// page reads storeId from here instead of independently fetching
// /api/v1/vendor/stores itself.
export function VendorStoreProvider({ token, userId, apiFetch, children }) {
  const cachedStores = readCachedStores(userId);
  const [stores, setStores] = useState(cachedStores);
  const [loading, setLoading] = useState(cachedStores.length === 0);

  const load = useCallback(() => {
    if (!token) return;
    apiFetch("/api/v1/vendor/stores")
      .then((data) => {
        setStores(data.stores);
        writeCachedStores(userId, data.stores);
      })
      .catch((err) => toast.error(err.message || "Failed to load your store"))
      .finally(() => setLoading(false));
  }, [token, userId, apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const storeId = stores[0]?.id || "";

  // For pages that PATCH the store and already have the fresh row back in
  // the response (settings' logo/socials saves, payouts' bank-account
  // link) - patches it into the shared list directly so every consumer
  // sees the update immediately, instead of waiting on a full reload()
  // round-trip.
  const updateStore = (updated) => {
    setStores((prev) => {
      const next = prev.map((s) => (s.id === updated.id ? updated : s));
      writeCachedStores(userId, next);
      return next;
    });
  };

  const value = { stores, storeId, loading, reload: load, updateStore };
  return <VendorStoreContext.Provider value={value}>{children}</VendorStoreContext.Provider>;
}

export function useVendorStore() {
  const ctx = useContext(VendorStoreContext);
  if (!ctx) throw new Error("useVendorStore must be used within VendorStoreProvider");
  return ctx;
}
