"use client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Select } from "@/components/ui/Select.js";
import { Button } from "@/components/ui/Button.js";
import { formatCurrency, formatDateTime } from "@/lib/format.js";

const CHANNEL_LABEL = { online: "Online store", pos: "Register (POS)", manual: "Recorded past sales" };
const TENDER_LABEL = { cash: "Cash", card: "POS / card", transfer: "Transfer", wallet: "Wallet", store_credit: "Store credit" };

function lastMonths(n) {
  const out = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = 0; i < n; i++) {
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-NG", { month: "long", year: "numeric", timeZone: "UTC" });
    out.push({ value, label });
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-sm border border-slate-200 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
      <p className="text-lg font-bold text-slate-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Rows({ title, rows, render }) {
  if (!rows?.length) return null;
  return (
    <div>
      <p className="text-sm font-semibold text-slate-700 mb-2">{title}</p>
      <div className="border border-slate-200 rounded-sm divide-y divide-slate-100">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
            {render(r)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function VendorReportsPage() {
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { storeId, loading: storeLoading } = useVendorStore();

  const months = useMemo(() => lastMonths(13).slice(1), []); // exclude the current, in-progress month by default
  const currentMonth = useMemo(() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }, []);
  const [month, setMonth] = useState(months[0]?.value || currentMonth);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);

  const generate = () => {
    if (!storeId) return;
    setLoading(true);
    setReport(null);
    apiFetch(`/api/v1/vendor/stores/${storeId}/reports/monthly?month=${month}`)
      .then((data) => {
        setReport(data);
        setDenied(false);
      })
      .catch((err) => {
        if (/owner/i.test(err.message || "")) setDenied(true);
        else toast.error(err.message || "Failed to generate report");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (token && storeId) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId]);

  if (user && user.role !== "vendor") {
    return <p className="text-sm text-slate-500">Reports are only available to the store owner.</p>;
  }
  if (denied) {
    return <p className="text-sm text-slate-500">Reports are only available to the store owner.</p>;
  }

  const s = report?.summary;

  return (
    <div className="space-y-6">
      <style>{`@media print {
        aside, header, nav, .no-print { display: none !important; }
        main { background: #fff !important; }
        .report-sheet { box-shadow: none !important; border: 0 !important; padding: 0 !important; }
      }`}</style>

      <div className="flex flex-wrap items-end justify-between gap-3 no-print">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Monthly report</h1>
          <p className="text-sm text-slate-500 mt-1">Sales, tenders, top products, cash variance and staff activity for a calendar month.</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-48">
            <Select label="Month" options={months} value={month} onChange={setMonth} />
          </div>
          <Button type="button" onClick={generate} loading={loading}>Generate</Button>
          {report && (
            <Button type="button" variant="outline" onClick={() => window.print()}>
              <Printer size={15} /> Print
            </Button>
          )}
        </div>
      </div>

      {loading && !report && <div className="h-64 bg-slate-100 rounded-sm animate-pulse" />}

      {report && (
        <div className="report-sheet bg-white border border-slate-200 rounded-sm p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <p className="text-lg font-bold text-slate-900">{report.storeName}</p>
            <p className="text-sm text-slate-600">Monthly report &mdash; {report.label}</p>
            <p className="text-xs text-slate-400">Generated {formatDateTime(report.generatedAt)}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Net sales" value={formatCurrency(s.netSales)} sub={`${s.salesCount} sale${s.salesCount === 1 ? "" : "s"}`} />
            <Stat label="Gross sales" value={formatCurrency(s.grossSales)} sub={`avg ${formatCurrency(s.avgOrderValue)}`} />
            <Stat label="Returns" value={formatCurrency(s.returnsTotal)} sub={`${s.returnsCount} return${s.returnsCount === 1 ? "" : "s"}`} />
            <Stat label="Discounts given" value={formatCurrency(s.discountsGiven)} />
            <Stat label="New customers" value={s.newCustomers} />
            <Stat
              label="Cash over / short"
              value={formatCurrency(s.cashOverShort)}
              sub={`${s.registersClosed} register close${s.registersClosed === 1 ? "" : "s"}`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Rows
              title="By channel"
              rows={report.byChannel}
              render={(r) => (
                <>
                  <span className="text-slate-700">{CHANNEL_LABEL[r.channel] || r.channel}</span>
                  <span className="text-slate-900 font-medium tabular-nums">
                    {formatCurrency(r.revenue)} <span className="text-slate-400 font-normal">· {r.count}</span>
                  </span>
                </>
              )}
            />
            <Rows
              title="By payment method"
              rows={report.byTender}
              render={(r) => (
                <>
                  <span className="text-slate-700">{TENDER_LABEL[r.method] || r.method}</span>
                  <span className="text-slate-900 font-medium tabular-nums">{formatCurrency(r.amount)}</span>
                </>
              )}
            />
            <Rows
              title="Into which account (POS / transfer)"
              rows={report.byAccount}
              render={(r) => (
                <>
                  <span className="text-slate-700">
                    {(r.method === "card" ? "POS" : TENDER_LABEL[r.method] || r.method)} &middot; {r.provider}
                  </span>
                  <span className="text-slate-900 font-medium tabular-nums">{formatCurrency(r.amount)}</span>
                </>
              )}
            />
            <Rows
              title="By branch"
              rows={report.byBranch}
              render={(r) => (
                <>
                  <span className="text-slate-700">{r.branch}</span>
                  <span className="text-slate-900 font-medium tabular-nums">
                    {formatCurrency(r.revenue)} <span className="text-slate-400 font-normal">· {r.count}</span>
                  </span>
                </>
              )}
            />
            <Rows
              title="Sales by staff"
              rows={report.byCashier}
              render={(r) => (
                <>
                  <span className="text-slate-700">{r.name}</span>
                  <span className="text-slate-900 font-medium tabular-nums">
                    {formatCurrency(r.revenue)} <span className="text-slate-400 font-normal">· {r.count}</span>
                  </span>
                </>
              )}
            />
            <Rows
              title="Top products (revenue)"
              rows={report.topProductsByRevenue}
              render={(r) => (
                <>
                  <span className="text-slate-700 truncate">{r.name}</span>
                  <span className="text-slate-900 font-medium tabular-nums shrink-0">
                    {formatCurrency(r.revenue)} <span className="text-slate-400 font-normal">· {r.qty}</span>
                  </span>
                </>
              )}
            />
            <Rows
              title="By category"
              rows={report.byCategory}
              render={(r) => (
                <>
                  <span className="text-slate-700 truncate">{r.name}</span>
                  <span className="text-slate-900 font-medium tabular-nums shrink-0">
                    {formatCurrency(r.revenue)} <span className="text-slate-400 font-normal">· {r.qty}</span>
                  </span>
                </>
              )}
            />
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-sm font-semibold text-slate-700 mb-2">Staff activity this month</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <Stat label="Sales rung up" value={report.activity.sales} sub={`${report.activity.adjustedSales} with an override/discount`} />
              <Stat label="Returns processed" value={report.activity.returns} />
              <Stat label="Cash paid out / drops" value={report.activity.cashPaidOut} />
              <Stat label="Stock adjustments" value={report.activity.stockAdjustments} />
              <Stat label="Price / product edits" value={report.activity.priceEdits} />
              <Stat label="Register closes" value={report.activity.registerCloses} />
            </div>
          </div>

          {report.cashReconciliation?.length > 0 && (
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <p className="text-sm font-semibold text-slate-700">Cash reconciliation &mdash; every shift closed this month</p>
              {report.overShortByCashier?.length > 0 && (
                <div className="border border-slate-200 rounded-sm divide-y divide-slate-100">
                  {report.overShortByCashier.map((c) => (
                    <div key={c.name} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
                      <span className="text-slate-700">
                        {c.name} <span className="text-slate-400">· {c.sessions} shift{c.sessions === 1 ? "" : "s"}</span>
                      </span>
                      <span className={`font-medium tabular-nums ${c.overShort < 0 ? "text-red-600" : c.overShort > 0 ? "text-amber-600" : "text-slate-500"}`}>
                        {c.overShort === 0 ? "balanced" : `${c.overShort > 0 ? "over " : "short "}${formatCurrency(Math.abs(c.overShort))}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="overflow-x-auto border border-slate-200 rounded-sm">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">Closed</th>
                      <th className="px-3 py-2 font-medium">Register</th>
                      <th className="px-3 py-2 font-medium">Cashier</th>
                      <th className="px-3 py-2 font-medium text-right">Expected</th>
                      <th className="px-3 py-2 font-medium text-right">Counted</th>
                      <th className="px-3 py-2 font-medium text-right">Over / short</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.cashReconciliation.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{formatDateTime(r.closedAt)}</td>
                        <td className="px-3 py-2 text-slate-700">{r.register}</td>
                        <td className="px-3 py-2 text-slate-700">{r.cashier}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.expected)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.counted)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-medium ${r.overShort < 0 ? "text-red-600" : r.overShort > 0 ? "text-amber-600" : "text-slate-400"}`}>
                          {r.overShort === 0 ? "—" : formatCurrency(r.overShort)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {report.stockAdjustments?.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-slate-700 mb-2">Stock &amp; price changes this month ({report.stockAdjustments.length})</p>
              <div className="border border-slate-200 rounded-sm divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {report.stockAdjustments.map((a, i) => (
                  <div key={i} className="flex items-start justify-between gap-4 px-3 py-2 text-sm">
                    <span className="text-slate-700">{a.what}</span>
                    <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                      {a.by} · {formatDateTime(a.at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {report && s.salesCount === 0 && s.returnsCount === 0 && (
        <p className="text-sm text-slate-500 no-print">No sales recorded in {report.label}.</p>
      )}
    </div>
  );
}
