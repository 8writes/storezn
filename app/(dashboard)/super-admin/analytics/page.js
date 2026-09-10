"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { StatCard } from "@/components/ui/StatCard.js";
import { StatGridSkeleton, Skeleton } from "@/components/ui/Skeleton.js";
import { Chart } from "@/components/ui/Chart.js";
import { formatCurrency } from "@/lib/format.js";
import { Store, Wallet, TrendingUp, ShoppingBag, Sparkles } from "lucide-react";

// Matches the brand-* ramp in globals.css - Chart.js needs real hex/rgba
// strings, it can't read CSS custom properties itself.
const BRAND = "#14915b";
const BRAND_SOFT = "rgba(20, 145, 91, 0.12)";
const AMBER = "#f59e0b";

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

  const dayLabels = data?.daily.map((d) => new Date(d.day).toLocaleDateString("en-NG", { month: "short", day: "numeric" })) || [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Overview</h1>

      {loading || !data ? (
        <>
          <StatGridSkeleton count={4} />
          <Skeleton className="h-72 w-full" />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard icon={Store} label="Stores" value={data.stores.total} sub={`${data.stores.active} active`} />
            <StatCard icon={Wallet} label="Total GMV" value={formatCurrency(data.revenue.totalGMV)} color="green" />
            <StatCard icon={TrendingUp} label="Commission earned" value={formatCurrency(data.revenue.totalCommission)} color="brand" />
            <StatCard
              icon={ShoppingBag}
              label="Paid orders (30d)"
              value={data.daily.reduce((sum, d) => sum + d.orderCount, 0)}
            />
            <StatCard icon={Sparkles} label="Storezn+ revenue" value={formatCurrency(data.subscriptions.totalRevenue)} color="brand" />
            <StatCard icon={Sparkles} label="Storezn+ stores" value={data.subscriptions.plusStores} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-surface border border-slate-200 rounded-sm p-5">
              <p className="text-sm font-semibold text-slate-700 mb-4">GMV, last 30 days</p>
              <Chart
                type="line"
                height={260}
                data={{
                  labels: dayLabels,
                  datasets: [
                    {
                      label: "GMV",
                      data: data.daily.map((d) => d.gmv),
                      borderColor: BRAND,
                      backgroundColor: BRAND_SOFT,
                      fill: true,
                      tension: 0.3,
                      pointRadius: 0,
                    },
                  ],
                }}
                options={{
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } },
                    y: { ticks: { callback: (v) => formatCurrency(v) }, grid: { color: "#f1f5f9" } },
                  },
                }}
              />
            </div>

            <div className="bg-surface border border-slate-200 rounded-sm p-5">
              <p className="text-sm font-semibold text-slate-700 mb-4">Top stores by GMV</p>
              {data.topStores.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">No sales yet.</p>
              ) : (
                <Chart
                  type="bar"
                  height={260}
                  data={{
                    labels: data.topStores.map((s) => s.name),
                    datasets: [{ data: data.topStores.map((s) => s.gmv), backgroundColor: BRAND, borderRadius: 4 }],
                  }}
                  options={{
                    indexAxis: "y",
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { ticks: { callback: (v) => formatCurrency(v) }, grid: { color: "#f1f5f9" } },
                      y: { grid: { display: false } },
                    },
                  }}
                />
              )}
            </div>
          </div>

          <div className="bg-surface border border-slate-200 rounded-sm p-5">
            <p className="text-sm font-semibold text-slate-700 mb-4">Orders per day, last 30 days</p>
            <Chart
              type="bar"
              height={220}
              data={{
                labels: dayLabels,
                datasets: [{ label: "Orders", data: data.daily.map((d) => d.orderCount), backgroundColor: AMBER, borderRadius: 3 }],
              }}
              options={{
                plugins: { legend: { display: false } },
                scales: {
                  x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } },
                  y: { ticks: { precision: 0 }, grid: { color: "#f1f5f9" } },
                },
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
