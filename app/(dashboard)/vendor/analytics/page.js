"use client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Select } from "@/components/ui/Select.js";
import { Badge } from "@/components/ui/Badge.js";
import { StatCard } from "@/components/ui/StatCard.js";
import { Chart } from "@/components/ui/Chart.js";
import { StatGridSkeleton, Skeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency, compactCurrency } from "@/lib/format.js";
import {
  Wallet,
  ShoppingBag,
  Receipt,
  Package,
  Users,
  TrendingUp,
  TrendingDown,
  ImageOff,
  AlertTriangle,
  RotateCcw,
  CalendarClock,
  FileText,
} from "lucide-react";

const BRAND = "#14915b";
const BRAND_SOFT = "rgba(20, 145, 91, 0.12)";
const AMBER = "#f59e0b";
const STATUS_COLOR = { pending: "amber", processing: "blue", shipped: "blue", delivered: "green", cancelled: "red", refund_requested: "amber", refunded: "slate", refund_declined: "red" };

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}
function today() {
  return isoDate(new Date());
}
function monthRange(offset) {
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  const to = new Date(d.getFullYear(), d.getMonth() + offset + 1, 0);
  return { from: isoDate(from), to: isoDate(to) };
}

const PRESETS = [
  { key: "today", label: "Today", range: () => ({ from: today(), to: today() }) },
  { key: "7d", label: "7 days", range: () => ({ from: daysAgo(6), to: today() }) },
  { key: "30d", label: "30 days", range: () => ({ from: daysAgo(29), to: today() }) },
  { key: "90d", label: "90 days", range: () => ({ from: daysAgo(89), to: today() }) },
  { key: "thisMonth", label: "This month", range: () => monthRange(0) },
  { key: "lastMonth", label: "Last month", range: () => monthRange(-1) },
];

const CHANNEL_OPTIONS = [
  { value: "all", label: "All channels" },
  { value: "online", label: "Online only" },
  { value: "offline", label: "Offline (in-person) only" },
];

function ChangeBadge({ percent }) {
  if (percent === 0) return null;
  const up = percent > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? "text-green-600" : "text-red-600"}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {Math.abs(percent).toFixed(0)}%
    </span>
  );
}

export default function VendorAnalyticsPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { storeId, loading: storeLoading } = useVendorStore();

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [channel, setChannel] = useState("all");
  const [activePreset, setActivePreset] = useState("30d");
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Gated on token, not just storeId - storeId comes from the shared
    // VendorStore context and can be set before this page's own token
    // resolves on a client-side nav, firing the request with no
    // Authorization header (401) and never retrying. See VendorStoreContext.js.
    if (!token || !storeId) return;
    apiFetch(`/api/v1/vendor/stores/${storeId}/branches`)
      .then((d) => setBranches(d.branches))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId]);

  useEffect(() => {
    if (!token || !storeId || !from || !to) return;
    setLoading(true);
    const params = new URLSearchParams({ from, to, channel });
    if (branchId) params.set("branchId", branchId);
    apiFetch(`/api/v1/vendor/stores/${storeId}/analytics?${params}`)
      .then(setData)
      .catch((err) => toast.error(err.message || "Failed to load analytics"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId, from, to, branchId, channel]);

  const applyPreset = (preset) => {
    setActivePreset(preset.key);
    const r = preset.range();
    setFrom(r.from);
    setTo(r.to);
  };

  const dayLabels = useMemo(
    () => data?.daily.map((d) => new Date(d.day).toLocaleDateString("en-NG", { month: "short", day: "numeric" })) || [],
    [data],
  );

  if (storeLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Analytics</h1>

      {/* ---- Filters ---- */}
      <div className="bg-surface border border-slate-200 rounded-sm p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-sm border cursor-pointer transition-colors ${
                activePreset === p.key ? "bg-brand-600 border-brand-600 text-white" : "bg-surface border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-700">From</label>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => {
                setActivePreset(null);
                setFrom(e.target.value);
              }}
              className="px-3 py-2 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-700">To</label>
            <input
              type="date"
              value={to}
              min={from}
              max={today()}
              onChange={(e) => {
                setActivePreset(null);
                setTo(e.target.value);
              }}
              className="px-3 py-2 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
            />
          </div>
          {branches.length > 1 && (
            <div className="w-44">
              <Select
                options={[{ value: "", label: "All branches" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
                value={branchId}
                onChange={setBranchId}
              />
            </div>
          )}
          <div className="w-52">
            <Select options={CHANNEL_OPTIONS} value={channel} onChange={setChannel} />
          </div>
        </div>
      </div>

      {loading || !data ? (
        <>
          <StatGridSkeleton count={5} />
          <Skeleton className="h-72 w-full" />
        </>
      ) : (
        <>
          {/* ---- KPIs ---- */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              icon={Wallet}
              label="Revenue"
              value={compactCurrency(data.summary.revenue)}
              title={formatCurrency(data.summary.revenue)}
              color="green"
              sub={<ChangeBadge percent={data.summary.revenueChangePercent} />}
            />
            <StatCard
              icon={ShoppingBag}
              label="Orders"
              value={data.summary.orderCount}
              sub={<ChangeBadge percent={data.summary.orderCountChangePercent} />}
            />
            <StatCard icon={Receipt} label="Avg. order value" value={compactCurrency(data.summary.averageOrderValue)} title={formatCurrency(data.summary.averageOrderValue)} />
            <StatCard icon={Package} label="Units sold" value={data.summary.unitsSold} />
            <StatCard icon={Users} label="New customers" value={data.summary.newCustomers} color="brand" />
          </div>

          <section className="border-y border-slate-200 py-5 space-y-4">
            <div className="flex items-center gap-2"><FileText size={17} className="text-brand-700" /><h2 className="text-sm font-semibold text-slate-900">Invoice performance</h2></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-5 gap-y-4 text-sm">
              <div><p className="text-slate-600">Quote requests</p><p className="text-lg font-bold text-slate-900">{data.invoices?.requests || 0}</p><p className="text-xs text-slate-600">{data.invoices?.offlineRequests || 0} offline</p></div>
              <div><p className="text-slate-600">Invoices sent</p><p className="text-lg font-bold text-slate-900">{data.invoices?.total || 0}</p><p className="text-xs text-slate-600">{data.invoices?.sent || 0} awaiting payment</p></div>
              <div><p className="text-slate-600">Partially paid</p><p className="text-lg font-bold text-slate-900">{data.invoices?.partiallyPaid || 0}</p></div>
              <div><p className="text-slate-600">Paid in full</p><p className="text-lg font-bold text-slate-900">{data.invoices?.paid || 0}</p></div>
              <div><p className="text-slate-600">Invoice payments</p><p className="text-lg font-bold text-green-700" title={formatCurrency(data.invoices?.received || 0)}>{compactCurrency(data.invoices?.received || 0)}</p></div>
              <div><p className="text-slate-600">Outstanding</p><p className="text-lg font-bold text-amber-700" title={formatCurrency(data.invoices?.outstanding || 0)}>{compactCurrency(data.invoices?.outstanding || 0)}</p></div>
            </div>
          </section>

          {/* ---- Revenue trend ---- */}
          <div className="bg-surface border border-slate-200 rounded-sm p-5">
            <p className="text-sm font-semibold text-slate-700 mb-4">Revenue over time</p>
            {data.daily.every((d) => d.revenue === 0) ? (
              <p className="text-sm text-slate-400 py-16 text-center">No sales in this period.</p>
            ) : (
              <Chart
                type="line"
                height={260}
                data={{
                  labels: dayLabels,
                  datasets: [
                    { label: "Revenue", data: data.daily.map((d) => d.revenue), borderColor: BRAND, backgroundColor: BRAND_SOFT, fill: true, tension: 0.3, pointRadius: 0 },
                  ],
                }}
                options={{
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } },
                    y: { ticks: { callback: (v) => formatCurrency(v) }, grid: { color: "#f1f5f9" } },
                  },
                }}
              />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ---- Orders per day ---- */}
            <div className="bg-surface border border-slate-200 rounded-sm p-5">
              <p className="text-sm font-semibold text-slate-700 mb-4">Orders per day</p>
              <Chart
                type="bar"
                height={220}
                data={{ labels: dayLabels, datasets: [{ label: "Orders", data: data.daily.map((d) => d.orderCount), backgroundColor: AMBER, borderRadius: 3 }] }}
                options={{
                  plugins: { legend: { display: false } },
                  scales: { x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } }, y: { ticks: { precision: 0 }, grid: { color: "#f1f5f9" } } },
                }}
              />
            </div>

            {/* ---- Order status breakdown ---- */}
            <div className="bg-surface border border-slate-200 rounded-sm p-5">
              <p className="text-sm font-semibold text-slate-700 mb-4">Orders by status</p>
              {data.statusBreakdown.length === 0 ? (
                <p className="text-sm text-slate-400 py-16 text-center">No orders in this period.</p>
              ) : (
                <ul className="space-y-2.5">
                  {data.statusBreakdown
                    .sort((a, b) => b.count - a.count)
                    .map((s) => (
                      <li key={s.status} className="flex items-center justify-between gap-3">
                        <Badge color={STATUS_COLOR[s.status] || "slate"}>{s.status.replace("_", " ")}</Badge>
                        <span className="text-sm font-medium text-slate-900">{s.count}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ---- Top products ---- */}
            <div className="bg-surface border border-slate-200 rounded-sm overflow-hidden">
              <p className="text-sm font-semibold text-slate-700 px-5 py-4 border-b border-slate-100">Top products</p>
              {data.topProducts.length === 0 ? (
                <p className="text-sm text-slate-400 py-10 text-center">No sales in this period.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.topProducts.map((p) => (
                    <li key={p.productId} className="flex items-center gap-3 px-5 py-3">
                      {p.image ? (
                        <img src={p.image} alt="" className="w-10 h-10 rounded-sm object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-sm bg-slate-100 shrink-0 flex items-center justify-center text-slate-300">
                          <ImageOff size={14} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                        <p className="text-xs text-slate-800">{p.units} sold</p>
                      </div>
                      <span className="text-sm font-semibold text-slate-900 shrink-0">{formatCurrency(p.revenue)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ---- Category breakdown ---- */}
            <div className="bg-surface border border-slate-200 rounded-sm p-5">
              <p className="text-sm font-semibold text-slate-700 mb-4">Revenue by category</p>
              {data.categoryBreakdown.length === 0 ? (
                <p className="text-sm text-slate-400 py-16 text-center">No sales in this period.</p>
              ) : (
                <Chart
                  type="bar"
                  height={Math.max(180, data.categoryBreakdown.length * 36)}
                  data={{ labels: data.categoryBreakdown.map((c) => c.name), datasets: [{ data: data.categoryBreakdown.map((c) => c.revenue), backgroundColor: BRAND, borderRadius: 4 }] }}
                  options={{
                    indexAxis: "y",
                    plugins: { legend: { display: false } },
                    scales: { x: { ticks: { callback: (v) => formatCurrency(v) }, grid: { color: "#f1f5f9" } }, y: { grid: { display: false } } },
                  }}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ---- Top customers ---- */}
            <div className="bg-surface border border-slate-200 rounded-sm overflow-hidden">
              <p className="text-sm font-semibold text-slate-700 px-5 py-4 border-b border-slate-100">Top customers</p>
              {data.topCustomers.length === 0 ? (
                <p className="text-sm text-slate-400 py-10 text-center">No registered-customer sales in this period.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {data.topCustomers.map((c) => (
                      <tr key={c.customerId}>
                        <td className="px-5 py-3 min-w-0">
                          <p className="font-medium text-slate-900 truncate">{c.name?.trim() || c.email}</p>
                          <p className="text-xs text-slate-800 truncate">{c.email}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-800 text-right whitespace-nowrap">{c.orderCount} orders</td>
                        <td className="px-5 py-3 font-semibold text-slate-900 text-right whitespace-nowrap">{formatCurrency(c.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="space-y-6">
              {/* ---- Channel breakdown ---- */}
              <div className="bg-surface border border-slate-200 rounded-sm p-5">
                <p className="text-sm font-semibold text-slate-700 mb-3">Online vs. offline</p>
                <div className="grid grid-cols-2 gap-3">
                  {["online", "offline"].map((ch) => {
                    const row = data.channelBreakdown.find((c) => c.channel === ch);
                    return (
                      <div key={ch} className="bg-slate-50 rounded-sm p-3">
                        <p className="text-xs text-slate-800 capitalize">{ch}</p>
                        <p className="text-lg font-bold text-slate-900">{formatCurrency(row?.revenue || 0)}</p>
                        <p className="text-xs text-slate-800">{row?.count || 0} orders</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ---- Branch breakdown (multi-branch stores only) ---- */}
              {data.branchBreakdown.length > 0 && (
                <div className="bg-surface border border-slate-200 rounded-sm p-5">
                  <p className="text-sm font-semibold text-slate-700 mb-3">Revenue by branch</p>
                  <ul className="space-y-2">
                    {data.branchBreakdown.map((b) => (
                      <li key={b.branchId} className="flex items-center justify-between text-sm">
                        <span className="text-slate-700">{b.name}</span>
                        <span className="font-medium text-slate-900">{formatCurrency(b.revenue)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ---- Store health ---- */}
              <div className="bg-surface border border-slate-200 rounded-sm p-5 space-y-3">
                <p className="text-sm font-semibold text-slate-700">Store health</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-slate-700"><Wallet size={14} /> Stock value</span>
                  <span
                    className="font-medium text-slate-900 cursor-help"
                    title={`Retail ${formatCurrency(data.products.retailValue)} · Cost ${formatCurrency(data.products.costValue)}`}
                  >
                    {compactCurrency(data.products.retailValue)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-slate-700"><Package size={14} /> Live products</span>
                  <span className="font-medium text-slate-900">{data.products.live} / {data.products.total}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-slate-700"><AlertTriangle size={14} className={data.products.lowStock > 0 ? "text-amber-500" : ""} /> Low stock</span>
                  <span className={`font-medium ${data.products.lowStock > 0 ? "text-amber-600" : "text-slate-900"}`}>{data.products.lowStock}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-slate-700"><AlertTriangle size={14} className={data.products.outOfStock > 0 ? "text-red-500" : ""} /> Out of stock</span>
                  <span className={`font-medium ${data.products.outOfStock > 0 ? "text-red-600" : "text-slate-900"}`}>{data.products.outOfStock}</span>
                </div>
                {(data.products.expiringSoon > 0 || data.products.expired > 0) && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-slate-700">
                      <CalendarClock size={14} className={data.products.expired > 0 ? "text-red-500" : "text-amber-500"} /> Expiring soon
                    </span>
                    <span className={`font-medium ${data.products.expired > 0 ? "text-red-600" : "text-amber-600"}`}>
                      {data.products.expiringSoon}
                      {data.products.expired > 0 && <span className="text-xs font-normal text-slate-800"> ({data.products.expired} expired)</span>}
                    </span>
                  </div>
                )}
                {data.products.negativeStock > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-red-600"><AlertTriangle size={14} className="text-red-500" /> Oversold</span>
                    <span
                      className="font-medium text-red-600 cursor-help"
                      title="Stock has gone below zero - more was sold or adjusted out than was ever recorded as in stock. Worth a recount."
                    >
                      {data.products.negativeStock}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-100">
                  <span className="flex items-center gap-1.5 text-slate-700"><RotateCcw size={14} /> Refund requests (period)</span>
                  <span className="font-medium text-slate-900">{data.refunds.pending} pending, {data.refunds.approved} approved</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
