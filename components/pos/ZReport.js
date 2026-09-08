"use client";
import { formatKobo } from "@/lib/money.js";

const METHOD_LABEL = {
  cash: "Cash",
  card: "POS",
  transfer: "Transfer",
  wallet: "Wallet",
  store_credit: "Store credit",
};

function Row({ label, value, strong, tone }) {
  return (
    <div className={`flex justify-between gap-4 py-1.5 text-sm ${strong ? "font-semibold text-slate-900" : "text-slate-700"}`}>
      <span>{label}</span>
      <span
        className={`tabular-nums ${
          tone === "pos" ? "text-emerald-700" : tone === "neg" ? "text-red-600" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// Renders an X-report summary (live) or a stored z_report snapshot - the
// shape is the same (see lib/pos.js buildSessionSummary). `counted` /
// `expected` / `overShort` are only present on a Z.
export function ZReport({ summary, title = "X report" }) {
  if (!summary) return null;
  const d = summary.drawer || {};
  const byMethod = summary.byTenderMethod || {};
  const byProvider = summary.byCardProvider || {};
  const nonCashChangeOut = summary.nonCashChangeOut || 0;
  const isZ = summary.countedCash != null;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{isZ ? "Z report" : title}</h3>
        <span className="text-[11px] text-slate-500 tabular-nums">
          {new Date(summary.generatedAt).toLocaleString()}
        </span>
      </div>

      <div className="border border-slate-200 rounded-sm divide-y divide-slate-100">
        <div className="px-3 py-2">
          <Row label="Sales" value={summary.saleCount} strong />
          <Row label="Gross sales" value={formatKobo(summary.grossSales)} />
          {summary.discountsGiven > 0 && <Row label="Discounts given" value={`- ${formatKobo(summary.discountsGiven)}`} tone="neg" />}
          {summary.returnCount > 0 && (
            <>
              <Row label="Returns" value={summary.returnCount} />
              <Row label="Refunded" value={formatKobo(summary.returnsTotal)} tone="neg" />
            </>
          )}
        </div>

        <div className="px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Taken by method</p>
          {Object.keys(byMethod).length === 0 ? (
            <p className="text-sm text-slate-500 py-1">Nothing yet</p>
          ) : (
            Object.entries(byMethod).map(([m, amt]) => (
              <Row key={m} label={METHOD_LABEL[m] || m} value={formatKobo(amt)} />
            ))
          )}
        </div>

        {Object.keys(byProvider).length > 0 && (
          <div className="px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">POS terminals</p>
            {Object.entries(byProvider).map(([p, amt]) => (
              <Row key={p} label={p} value={formatKobo(amt)} />
            ))}
          </div>
        )}

        <div className="px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Cash drawer</p>
          <Row label="Opening float" value={formatKobo(d.openingFloat)} />
          <Row label="Cash sales" value={formatKobo(d.cashSales)} tone="pos" />
          {d.cashRefunds !== 0 && <Row label="Cash refunds" value={formatKobo(d.cashRefunds)} tone="neg" />}
          {d.paidIn !== 0 && <Row label="Paid in" value={formatKobo(d.paidIn)} tone="pos" />}
          {d.paidOut !== 0 && <Row label="Paid out" value={formatKobo(d.paidOut)} tone="neg" />}
          {d.drops !== 0 && <Row label="Cash drops" value={formatKobo(d.drops)} tone="neg" />}
          <Row label="Expected in drawer" value={formatKobo(isZ ? summary.expectedCash : d.expectedCash)} strong />
          {nonCashChangeOut > 0 && (
            <p className="text-[11px] text-slate-400 pt-1">
              Cash sales above are net of {formatKobo(nonCashChangeOut)} change handed back on POS / transfer overpayments.
            </p>
          )}
          {isZ && (
            <>
              <Row label="Counted" value={formatKobo(summary.countedCash)} strong />
              <Row
                label={summary.overShort === 0 ? "Balanced" : summary.overShort > 0 ? "Over" : "Short"}
                value={formatKobo(summary.overShort)}
                strong
                tone={summary.overShort === 0 ? undefined : "neg"}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
