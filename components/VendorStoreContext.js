"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { toast } from "sonner";

const VendorStoreContext = createContext(null);

// Single fetch of a vendor's store, shared across every page under
// (dashboard) - a vendor has exactly one store (multi-store support was
// tried and reverted - too much surface area for what it added). Every
// page reads storeId from here instead of independently fetching
// /api/v1/vendor/stores itself.
export function VendorStoreProvider({ token, apiFetch, children }) {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!token) return;
    apiFetch("/api/v1/vendor/stores")
      .then((data) => setStores(data.stores))
      .catch((err) => toast.error(err.message || "Failed to load your store"))
      .finally(() => setLoading(false));
  }, [token, apiFetch]);

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
    setStores((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const value = { stores, storeId, loading, reload: load, updateStore };
  return <VendorStoreContext.Provider value={value}>{children}</VendorStoreContext.Provider>;
}

export function useVendorStore() {
  const ctx = useContext(VendorStoreContext);
  if (!ctx) throw new Error("useVendorStore must be used within VendorStoreProvider");
  return ctx;
}
