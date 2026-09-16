import { Clock, PauseCircle } from "lucide-react";
import { getPlatformUrl } from "@/lib/storeUrl.js";

// Rendered by app/storefront/[host]/layout.js when a store resolves (the
// host is real) but isn't live - distinct from not-found.js, which only
// covers a host matching no store at all. Two flavors depending on why:
// still being verified (a new vendor, nothing shady) vs deliberately
// closed (admin-disabled or the vendor's own "go offline" toggle) - kept
// deliberately vague either way, since the specific reason is nobody
// browsing the store's business but the vendor.
export function StoreOfflineNotice({ store }) {
  const pendingApproval = store.isActive && store.ownerApprovalStatus !== "approved";

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 text-center">
      <div className="max-w-md space-y-4">
        {store.logoUrl ? (
          <img src={store.logoUrl} alt={store.name} className="h-14 mx-auto object-contain" />
        ) : (
          <span className="flex items-center justify-center h-14 w-14 rounded-full bg-slate-900 text-white text-lg font-bold mx-auto">
            {store.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="flex items-center justify-center h-10 w-10 rounded-full bg-amber-50 text-amber-600 mx-auto">
          {pendingApproval ? <Clock size={18} /> : <PauseCircle size={18} />}
        </span>
        <h1 className="text-xl font-bold text-slate-900">
          {pendingApproval ? `${store.name} is still getting set up` : `${store.name} isn't taking orders right now`}
        </h1>
        <p className="text-sm text-slate-800">
          {pendingApproval
            ? "This store hasn't finished setting up yet. Check back soon."
            : "This store is temporarily closed. Please check back later."}
        </p>
        <a
          href={getPlatformUrl("/")}
          className="inline-block text-sm font-semibold text-slate-900 underline underline-offset-4"
        >
          Go to Storezn
        </a>
      </div>
    </div>
  );
}
