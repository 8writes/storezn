"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Package, ShoppingBag, Wallet, AlertTriangle, Plus, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Select } from "@/components/ui/Select.js";
import { Button } from "@/components/ui/Button.js";
import { StatCard } from "@/components/ui/StatCard.js";
import { CopyableUrl } from "@/components/ui/CopyableUrl.js";
import { StoreQrCodeButton } from "@/components/ui/StoreQrCodeButton.js";
import { Skeleton, StatGridSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency } from "@/lib/format.js";
import { getStorefrontUrl } from "@/lib/storeUrl.js";

export default function VendorDashboardPage() {
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");
  const [stats, setStats] = useState(null);
  const [verification, setVerification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/v1/vendor/stores")
      .then((data) => {
        setStores(data.stores);
        if (data.stores.length > 0) setStoreId(data.stores[0].id);
      })
      .catch((err) => toast.error(err.message || "Failed to load your store"))
      .finally(() => setLoading(false));
    // Fetched fresh rather than read off the cached login user object -
    // approvalStatus can change any time an admin reviews it, and the
    // dashboard should reflect that without requiring a re-login.
    apiFetch("/api/v1/vendor/verification")
      .then(setVerification)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!storeId) return;
    setStatsLoading(true);
    apiFetch(`/api/v1/vendor/stores/${storeId}/stats`)
      .then(setStats)
      .catch(() => {})
      .finally(() => setStatsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const store = stores.find((s) => s.id === storeId);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-40" />
        <StatGridSkeleton count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Welcome, {user?.firstName}</h1>
        {stores.length > 0 && (
          <Link href={`/vendor/products/new${storeId ? `?storeId=${storeId}` : ""}`}>
            <Button type="button" size="sm">
              <Plus size={16} />
              Add product
            </Button>
          </Link>
        )}
      </div>

      {stores.length === 0 ? (
        <p className="text-sm text-slate-400">No store set up yet, contact the platform admin.</p>
      ) : (
        <>
          {stores.length > 1 && (
            <div className="max-w-xs">
              <Select label="Store" options={stores.map((s) => ({ value: s.id, label: s.name }))} value={storeId} onChange={setStoreId} />
            </div>
          )}

          {store && (
            <div className="space-y-1.5 max-w-md">
              <label className="text-sm font-medium text-slate-700">Your storefront</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <CopyableUrl url={getStorefrontUrl(store)} />
                </div>
                <StoreQrCodeButton storeName={store.name} storeUrl={getStorefrontUrl(store)} />
              </div>
            </div>
          )}

          {verification && verification.approvalStatus !== "approved" && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-sm p-4">
              <ShieldAlert size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                {verification.approvalStatus === "rejected" ? (
                  <>
                    <p className="font-medium">Identity verification rejected</p>
                    <p>
                      Your store stays hidden from customers until this is resolved.{" "}
                      <Link href="/vendor/verification" className="underline font-medium">Resubmit your NIN</Link>.
                    </p>
                  </>
                ) : verification.nin ? (
                  <>
                    <p className="font-medium">Identity verification pending</p>
                    <p>Your NIN is under review - your store stays hidden from customers until it&apos;s approved.</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Verify your identity</p>
                    <p>
                      Customers can&apos;t see or order from your store until you&apos;re verified.{" "}
                      <Link href="/vendor/verification" className="underline font-medium">Submit your NIN</Link>.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {store && !store.subAccountCode && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-sm p-4">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Payment setup incomplete</p>
                <p>Customers can&apos;t check out from your store yet. <Link href="/vendor/settings" className="underline font-medium">Finish payment setup</Link>.</p>
              </div>
            </div>
          )}

          {statsLoading || !stats ? (
            <StatGridSkeleton count={4} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon={Wallet} label="Revenue (your payout)" value={formatCurrency(stats.revenue)} color="green" />
              <StatCard icon={ShoppingBag} label="Orders" value={stats.orders.total} sub={`${stats.orders.pending} in progress`} />
              <StatCard icon={Package} label="Products" value={stats.products.total} sub={`${stats.products.live} live`} />
              <StatCard
                icon={AlertTriangle}
                label="Low stock"
                value={stats.products.lowStock}
                color={stats.products.lowStock > 0 ? "amber" : "brand"}
              />
            </div>
          )}

          <div className="flex gap-3">
            <Link href="/vendor/products" className="text-sm text-brand-600 hover:underline">Manage products</Link>
            <Link href="/vendor/orders" className="text-sm text-brand-600 hover:underline">View orders</Link>
          </div>
        </>
      )}
    </div>
  );
}
