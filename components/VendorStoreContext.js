"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { toast } from "sonner";

const VendorStoreContext = createContext(null);
const STORAGE_KEY = "vendor_active_store_id";
export const MAX_STORES_PER_VENDOR = 3;

// Single fetch of a vendor's stores, shared across every page under
// (dashboard) via the sidebar's StoreSwitcher - replaces what used to be
// each page independently fetching /api/v1/vendor/stores and defaulting
// to stores[0], which meant switching stores on one page had no effect on
// any other. The selected id is remembered in localStorage so it survives
// a reload/new tab, not just in-session navigation.
export function VendorStoreProvider({ token, apiFetch, children }) {
  const [stores, setStores] = useState([]);
  const [storeIdState, setStoreIdState] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!token) return;
    apiFetch("/api/v1/vendor/stores")
      .then((data) => {
        setStores(data.stores);
        setStoreIdState((current) => {
          if (current && data.stores.some((s) => s.id === current)) return current;
          const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
          const validSaved = saved && data.stores.some((s) => s.id === saved) ? saved : null;
          return validSaved || data.stores[0]?.id || "";
        });
      })
      .catch((err) => toast.error(err.message || "Failed to load your stores"))
      .finally(() => setLoading(false));
  }, [token, apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  // Self-healing: computed at render time from the current stores list
  // rather than trusted as raw state. If storeIdState ever doesn't match
  // any store this account actually owns - a stale localStorage value
  // from another account on the same browser, a store that got removed,
  // anything - every consumer instantly falls back to a real one instead
  // of continuing to hammer every /api/v1/vendor/stores/<bad-id>/* route
  // with 401s.
  const storeId = storeIdState && stores.some((s) => s.id === storeIdState) ? storeIdState : stores[0]?.id || "";

  const setStoreId = (id) => {
    setStoreIdState(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
  };

  // For pages that PATCH a store and already have the fresh row back in
  // the response (settings' logo/socials/payout-account saves) - patches
  // it into the shared list directly so every consumer sees the update
  // immediately, instead of waiting on a full reload() round-trip.
  const updateStore = (updated) => {
    setStores((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const value = { stores, storeId, setStoreId, loading, reload: load, updateStore };
  return <VendorStoreContext.Provider value={value}>{children}</VendorStoreContext.Provider>;
}

export function useVendorStore() {
  const ctx = useContext(VendorStoreContext);
  if (!ctx) throw new Error("useVendorStore must be used within VendorStoreProvider");
  return ctx;
}
