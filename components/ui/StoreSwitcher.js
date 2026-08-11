"use client";
import { useVendorStore } from "@/components/VendorStoreContext.js";

// Sits where the sidebar's static "Storezn" logo used to be (see
// (dashboard)/layout.js) - just displays the vendor's store name. Used to
// be an actual dropdown switcher when multi-store was supported; reverted
// (too much surface area for what it added) but kept as its own component
// since the truncation behavior on the mobile header still needs the same
// flex-1/min-w-0 handling.
export function StoreSwitcher({ textClassName }) {
  const { stores, storeId } = useVendorStore();
  const current = stores.find((s) => s.id === storeId);
  if (!current) return null;

  return (
    <div className="flex-1 min-w-0">
      <span className={`block truncate ${textClassName}`}>{current.name}</span>
    </div>
  );
}
