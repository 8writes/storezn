"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { StatCard } from "@/components/ui/StatCard.js";
import { StatGridSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency } from "@/lib/format.js";
import { Store, Wallet, TrendingUp } from "lucide-react";

export default function SuperAdminAnalyticsPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/v1/super-admin/analytics")
      .then(setData)
      .catch((err) => toast.error(err.message || "Failed to load overview"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Overview</h1>

      {loading ? (
        <StatGridSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={Store} label="Stores" value={data.stores.total} sub={`${data.stores.active} active`} />
          <StatCard icon={Wallet} label="Total GMV" value={formatCurrency(data.revenue.totalGMV)} color="green" />
          <StatCard icon={TrendingUp} label="Commission earned" value={formatCurrency(data.revenue.totalCommission)} color="brand" />
        </div>
      )}
    </div>
  );
}
