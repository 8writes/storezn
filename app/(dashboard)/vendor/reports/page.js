"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
const CASH_KIND = { paid_in: "Paid in", paid_out: "Paid out", drop: "Cash drop" };

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

// One line of the money-reconciliation panel. `value` is naira, already
// signed the way it affects the till (negative = money that left as
// something other than a sale). `flag` = colour a positive amber (an
// over-count is still a discrepancy); `strong` = bold total row.
function Recon({ label, value, flag, strong }) {
  const neg = value < 0;
  const cls = neg
    ? "text-red-600"
    : flag && value > 0
      ? "text-amber-600"
      : "text-slate-900";
  return (
    <div className={`flex items-center justify-between gap-4 ${strong ? "font-bold" : ""}`}>
      <span className="text-slate-600">{label}</span>
      <span className={`tabular-nums ${cls} ${strong ? "font-bold" : "font-medium"}`}>{formatCurrency(value)}</span>
    </div>
  );
}

// A scrolling, line-level audit table. Every row is one action a staff
// member took that moved money away from a plain sale.
function DetailTable({ title, head, rows, render }) {
  if (!rows?.length) return null;
  return (
    <div className="border-t border-slate-100 pt-4">
      <p className="text-sm font-semibold text-slate-700 mb-2">{title}</p>
      <div className="overflow-x-auto border border-slate-200 rounded-sm max-h-96 overflow-y-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-500 text-left sticky top-0">
            <tr>
              {head.map((h, i) => (
                <th key={i} className={`px-3 py-2 font-medium ${i === head.length - 1 ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">{render(r)}</tr>
            ))}
          </tbody>
        </table>
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
  const [locked, setLocked] = useState(false);

  const generate = () => {
    if (!storeId) return;
    setLoading(true);
    setReport(null);
    apiFetch(`/api/v1/vendor/stores/${storeId}/reports/monthly?month=${month}`)
      .then((data) => {
        setReport(data);
        setDenied(false);
        setLocked(false);
      })
      .catch((err) => {
        if (err?.status === 402) setLocked(true);
        else if (/owner/i.test(err.message || "")) setDenied(true);
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
  if (locked) {
    return (
      <div className="max-w-md mx-auto text-center bg-surface border border-slate-200 rounded-sm p-8 space-y-3 mt-6">
        <h1 className="text-lg font-bold text-slate-900">The monthly report is a Storezn Enterprise feature</h1>
        <p className="text-sm text-slate-500">
          Enterprise adds a full month-end business &amp; forensic audit report: sales, tenders, cash reconciliation
          per shift, and who did what. It&apos;s set up by the Storezn team.
        </p>
        <Link href="/vendor/plus" className="inline-block text-sm font-semibold text-brand-600 hover:text-brand-700">See Enterprise</Link>
      </div>
    );
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
        <div className="report-sheet bg-surface border border-slate-200 rounded-sm p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <p className="text-lg font-bold text-slate-900">{report.storeName}</p>
            <p className="text-sm text-slate-600">Monthly report, {report.label}</p>
            <p className="text-xs text-slate-400">Generated {formatDateTime(report.generatedAt)}</p>
          </div>

          {report.reviewFlags?.length > 0 && (
            <div className="rounded-sm border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-bold text-amber-900 mb-1.5">Review these</p>
              <ul className="list-disc pl-5 space-y-1 text-sm text-amber-900">
                {report.reviewFlags.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}

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

          {report.reconciliation && (
            <div className="border border-slate-200 rounded-sm p-4">
              <p className="text-sm font-semibold text-slate-700 mb-2">Money reconciliation</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
                <Recon label="Gross sales" value={report.reconciliation.grossSales} />
                <Recon label="Refunds paid out" value={-report.reconciliation.refundsTotal} />
                <Recon label="Discounts given (order + line)" value={-report.reconciliation.discountsTotal} />
                <Recon label="Price overrides, value off catalogue" value={-report.reconciliation.overridesGivenTotal} />
                <Recon label="Cash paid out / drops" value={-report.reconciliation.paidOutTotal} />
                <Recon label="Cash paid in" value={report.reconciliation.paidInTotal} />
                <Recon label="Drawer over / short (all shifts)" value={report.reconciliation.drawerVarianceTotal} flag />
                <Recon label="Total not collected as sale" value={-report.reconciliation.moneyGivenAway} strong />
              </div>
            </div>
          )}

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

          {report.perStaff?.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-slate-700 mb-2">Who did what</p>
              <div className="overflow-x-auto border border-slate-200 rounded-sm">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-500 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">Staff</th>
                      <th className="px-3 py-2 font-medium text-right">Sales</th>
                      <th className="px-3 py-2 font-medium text-right">Value</th>
                      <th className="px-3 py-2 font-medium text-right">Discounts</th>
                      <th className="px-3 py-2 font-medium text-right">Overrides</th>
                      <th className="px-3 py-2 font-medium text-right">Given away</th>
                      <th className="px-3 py-2 font-medium text-right">Returns</th>
                      <th className="px-3 py-2 font-medium text-right">Cash out</th>
                      <th className="px-3 py-2 font-medium text-right">Shifts</th>
                      <th className="px-3 py-2 font-medium text-right">Over / short</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.perStaff.map((p, i) => {
                      const givenAway = (p.discountsValue || 0) + (p.overridesValue || 0);
                      return (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-700">{p.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{p.salesCount || 0}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(p.salesValue || 0)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                            {p.discountsCount || 0} · {formatCurrency(p.discountsValue || 0)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                            {p.overrideLines || 0} · {formatCurrency(p.overridesValue || 0)}
                          </td>
                          <td className={`px-3 py-2 text-right tabular-nums font-medium ${givenAway > 0 ? "text-amber-600" : "text-slate-400"}`}>
                            {givenAway > 0 ? formatCurrency(givenAway) : "N/A"}
                          </td>
                          <td className={`px-3 py-2 text-right tabular-nums ${p.returnsValue > 0 ? "text-red-600" : "text-slate-400"}`}>
                            {p.returnsCount ? `${p.returnsCount} · ${formatCurrency(p.returnsValue)}` : "N/A"}
                          </td>
                          <td className={`px-3 py-2 text-right tabular-nums ${p.cashOutValue > 0 ? "text-red-600" : "text-slate-400"}`}>
                            {p.cashOutCount ? `${p.cashOutCount} · ${formatCurrency(p.cashOutValue)}` : "N/A"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">{p.shifts || 0}</td>
                          <td className={`px-3 py-2 text-right tabular-nums font-medium ${p.overShort < 0 ? "text-red-600" : p.overShort > 0 ? "text-amber-600" : "text-slate-400"}`}>
                            {p.shifts ? (p.overShort === 0 ? "balanced" : formatCurrency(p.overShort)) : "N/A"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {report.cashReconciliation?.length > 0 && (
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <p className="text-sm font-semibold text-slate-700">Cash reconciliation: every shift closed this month</p>
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
                      <th className="px-3 py-2 font-medium">Close</th>
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
                          {r.overShort === 0 ? "N/A" : formatCurrency(r.overShort)}
                        </td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                          {r.notCounted ? (
                            <span className="text-red-600 font-medium" title={r.forcedReason || ""}>not counted</span>
                          ) : r.provisional ? (
                            <span className="text-amber-600 font-medium">provisional</span>
                          ) : (
                            <span className="text-slate-400">counted</span>
                          )}
                          {r.needsReview && <span className="text-amber-600"> · review</span>}
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

          {report.allProductsSold?.length > 0 && (
            <DetailTable
              title={`Every product sold this month (${report.allProductsSold.length})`}
              head={["Product", "Qty", "Price sold at", "Revenue", "Notes"]}
              rows={report.allProductsSold}
              render={(r) => (
                <>
                  <td className="px-3 py-2 text-slate-700">{r.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.qty}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {r.priceVaried ? `${formatCurrency(r.minPrice)} – ${formatCurrency(r.maxPrice)}` : formatCurrency(r.minPrice)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCurrency(r.revenue)}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {r.overrideLines > 0 && (
                      <span
                        className="text-amber-600 font-medium"
                        title={`${r.overrideLines} line${r.overrideLines === 1 ? "" : "s"} sold off-catalogue · ${formatCurrency(r.givenAway)} given away`}
                      >
                        {r.overrideLines} override{r.overrideLines === 1 ? "" : "s"}
                      </span>
                    )}
                    {r.overrideLines > 0 && r.catalogueChanged && " · "}
                    {r.catalogueChanged && (
                      <span className="text-blue-600 font-medium" title="This product's catalogue price was edited this month - see Stock & price changes below.">
                        price edited
                      </span>
                    )}
                    {!r.overrideLines && !r.catalogueChanged && <span className="text-slate-300">&mdash;</span>}
                  </td>
                </>
              )}
            />
          )}

          {report.detail?.discounts?.length > 0 && (
            <DetailTable
              title={`Every discount given (${report.detail.discounts.length})`}
              head={["When", "Order", "By", "Reason", "Amount"]}
              rows={report.detail.discounts}
              render={(r) => (
                <>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{formatDateTime(r.at)}</td>
                  <td className="px-3 py-2 text-slate-700">{r.orderNumber}</td>
                  <td className="px-3 py-2 text-slate-700">{r.by || "N/A"}</td>
                  <td className="px-3 py-2 text-slate-500">{r.reason || "N/A"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-600 font-medium">{formatCurrency(r.amount)}</td>
                </>
              )}
            />
          )}

          {report.detail?.priceOverrides?.length > 0 && (
            <DetailTable
              title={`Every price override (${report.detail.priceOverrides.length})`}
              head={["When", "Order", "By", "Product", "Qty", "Catalogue", "Charged", "Given away"]}
              rows={report.detail.priceOverrides}
              render={(r) => (
                <>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{formatDateTime(r.at)}</td>
                  <td className="px-3 py-2 text-slate-700">{r.orderNumber}</td>
                  <td className="px-3 py-2 text-slate-700">{r.by || "N/A"}</td>
                  <td className="px-3 py-2 text-slate-700">{r.product}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.qty}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{formatCurrency(r.catalogue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.charged)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${r.givenAway > 0 ? "text-amber-600" : r.givenAway < 0 ? "text-green-700" : "text-slate-400"}`}>
                    {formatCurrency(r.givenAway)}
                  </td>
                </>
              )}
            />
          )}

          {report.detail?.returns?.length > 0 && (
            <DetailTable
              title={`Every return / refund (${report.detail.returns.length})`}
              head={["When", "Order", "By", "Note", "Amount"]}
              rows={report.detail.returns}
              render={(r) => (
                <>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{formatDateTime(r.at)}</td>
                  <td className="px-3 py-2 text-slate-700">{r.orderNumber}</td>
                  <td className="px-3 py-2 text-slate-700">{r.by || "N/A"}</td>
                  <td className="px-3 py-2 text-slate-500">{r.note || "N/A"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-600 font-medium">{formatCurrency(r.amount)}</td>
                </>
              )}
            />
          )}

          {report.detail?.cashMovements?.length > 0 && (
            <DetailTable
              title={`Every cash paid in / out of a drawer (${report.detail.cashMovements.length})`}
              head={["When", "By", "Type", "Reason", "Amount"]}
              rows={report.detail.cashMovements}
              render={(r) => (
                <>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{formatDateTime(r.at)}</td>
                  <td className="px-3 py-2 text-slate-700">{r.by}</td>
                  <td className="px-3 py-2 text-slate-700">{CASH_KIND[r.kind] || r.kind}</td>
                  <td className="px-3 py-2 text-slate-500">{r.reason || "N/A"}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${r.kind === "paid_in" ? "text-green-700" : "text-red-600"}`}>
                    {r.kind === "paid_in" ? "" : "−"}{formatCurrency(r.amount)}
                  </td>
                </>
              )}
            />
          )}
        </div>
      )}

      {report && s.salesCount === 0 && s.returnsCount === 0 && (
        <p className="text-sm text-slate-500 no-print">No sales recorded in {report.label}.</p>
      )}
    </div>
  );
}
