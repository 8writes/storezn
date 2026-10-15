"use client";
import { formatKobo } from "@/lib/money.js";
import { formatDateTime } from "@/lib/format.js";
import { CHANGE_FLOAT_BELOW, DEFAULT_OVER_SHORT_TOLERANCE_KOBO, OPENING_BASIS, openingBasisOf } from "@/lib/pos.js";

const METHOD_LABEL = {
  cash: "Cash",
  card: "POS",
  transfer: "Transfer",
  wallet: "Wallet",
  store_credit: "Store credit",
};

const MOVE_LABEL = {
  cash_refund: "Cash refund",
  paid_in: "Paid in",
  paid_out: "Paid out",
  drop: "Cash drop",
  change_out: "Change given (POS / transfer)",
};
// Everything that moved the drawer other than the plain float / cash
// sales - what the owner needs to see itemised.
const ITEMISED_KINDS = ["paid_in", "paid_out", "drop", "cash_refund", "change_out"];

function Row({ label, value, strong, tone, rule }) {
  return (
    <div
      className={`flex justify-between gap-4 py-1.5 text-sm ${strong ? "font-semibold text-slate-900" : "text-slate-700"} ${
        rule ? "border-t border-slate-300 mt-0.5 pt-1.5" : ""
      }`}
    >
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

// A signed drawer line: positive gets a leading "+", negative keeps the
// "-" formatKobo already renders, so the column visibly sums to Expected.
function signed(kobo) {
  return kobo > 0 ? `+ ${formatKobo(kobo)}` : formatKobo(kobo);
}

// Renders an X-report summary (live) or a stored z_report snapshot - the
// shape is the same (see lib/pos.js buildSessionSummary). `counted` /
// `expected` / `overShort` are only present on a Z.
export function ZReport({ summary, title = "X report", movements = [] }) {
  if (!summary) return null;
  const d = summary.drawer || {};
  // Same-basis per method (every method net of its own change), so this
  // block actually ties to gross sales. Falls back to the mixed-basis
  // original for snapshots stored before it existed.
  const byMethod = summary.byTenderMethodApplied || summary.byTenderMethod || {};
  const byAccount = summary.byAccount || [];
  const nonCashChangeOut = summary.nonCashChangeOut || 0;
  const isZ = summary.countedCash != null;
  // A snapshot with no recorded basis is one of the pre-fix shifts, whose
  // opening figure included the change bowl - openingBasisOf owns that
  // default so every reader agrees on it.
  const countedNotesBasis = openingBasisOf(summary) === OPENING_BASIS.COUNTED_NOTES;
  // Frozen per shift; older snapshots carry none, so fall back to the
  // current default rather than showing no verdict at all.
  const tolerance = Number(summary.overShortToleranceKobo) || DEFAULT_OVER_SHORT_TOLERANCE_KOBO;
  const overTolerance = Math.abs(Number(summary.overShort) || 0) >= tolerance;
  // Line-item every hand-entered cash move so the drawer figure is never
  // a mystery - "Paid out -₦40,000" on its own tells you nothing. Prefer
  // a live movements list (it carries staff names); fall back to the
  // snapshot's own cashEvents for a stored Z / the sell screen.
  const cashEvents = (
    movements && movements.length
      ? movements.filter((m) => ITEMISED_KINDS.includes(m.kind))
      : summary.cashEvents || []
  )
    .slice()
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{isZ ? "Z report" : title}</h3>
        <span className="text-[11px] text-slate-800 tabular-nums">
          {formatDateTime(summary.generatedAt)}
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
            <p className="text-sm text-slate-800 py-1">Nothing yet</p>
          ) : (
            Object.entries(byMethod).map(([m, amt]) => (
              <Row key={m} label={METHOD_LABEL[m] || m} value={formatKobo(amt)} />
            ))
          )}
        </div>

        {byAccount.length > 0 && (
          <div className="px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
              Gross received into account
            </p>
            {byAccount.map((a) => {
              const grossReceived = a.grossReceived ?? a.amount;
              const refunds = a.refunds || 0;
              return (
              <div key={`${a.method}|${a.provider}`} className="py-1 border-b border-slate-100 last:border-0">
                <Row
                  label={`${a.method === "card" ? "POS" : METHOD_LABEL[a.method] || a.method} · ${a.provider}`}
                  value={formatKobo(grossReceived)}
                  strong
                />
                {(a.changeGiven || 0) > 0 && (
                  <p className="text-[11px] text-slate-600 -mt-1 pb-1">
                    Account received {formatKobo(grossReceived)} gross. Cash change given: {formatKobo(a.changeGiven)}. Sale amount: {formatKobo(a.netApplied ?? a.amount - a.changeGiven)}.
                  </p>
                )}
                {refunds > 0 && <p className="text-[11px] text-red-600 -mt-1 pb-1">Refunded from this account: {formatKobo(refunds)}</p>}
              </div>
            );})}
            <p className="text-[11px] text-slate-500 pt-1">
              These are the full amounts credited to each POS or transfer account before cash change was handed out.
            </p>
          </div>
        )}

        <div className="px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Cash drawer</p>
          {/* Which pile these figures describe. Shifts opened before the
              basis was recorded had the change bowl swept into the
              opening figure while the close excluded it, so they read
              short by about the bowl - saying so here explains every
              historical short without altering one stored byte. Same
              old-snapshot treatment as cashSplitTies above. */}
          {countedNotesBasis ? (
            <p className="text-[11px] text-slate-500 mb-1">
              ₦{CHANGE_FLOAT_BELOW} notes and up. The change bowl sits outside these figures on both sides.
            </p>
          ) : (
            <p className="text-[11px] text-amber-700 mb-1">
              Opened before the opening count was asked for properly. On these shifts the cash already in the
              drawer was usually not declared, so the over / short below also contains that money and is not a
              reliable measure of this shift.
            </p>
          )}
          <Row label="Opening float" value={signed(d.openingFloat)} />
          {isZ && summary.openingChangeCash != null && (
            <Row label="Change bowl at open" value={formatKobo(summary.openingChangeCash)} />
          )}
          {/* "Cash sales" is NET of the change handed back, because both
              are written into one cash_sale movement when a sale settles.
              That total is right but unreadable - an owner cannot see how
              much cash crossed the counter. Where the derived pair
              reconciles (cashSplitTies), show the two real figures
              instead; they sum to exactly the same number. Older stored
              snapshots have no such keys, so they keep the single line. */}
          {summary.cashSplitTies ? (
            <>
              <Row label="Gross cash taken in" value={signed(summary.cashTenderedGross)} tone="pos" />
              {(summary.cashChangeGiven || 0) !== 0 && (
                <Row label="Change given (cash)" value={signed(-summary.cashChangeGiven)} tone="neg" />
              )}
            </>
          ) : (
            <Row label="Cash sales (cash in)" value={signed(d.cashSales)} tone="pos" />
          )}
          {d.cashRefunds !== 0 && <Row label="Cash refunds" value={signed(d.cashRefunds)} tone="neg" />}
          {d.paidIn !== 0 && <Row label="Paid in" value={signed(d.paidIn)} tone="pos" />}
          {d.paidOut !== 0 && <Row label="Paid out (cash removed)" value={signed(d.paidOut)} tone="neg" />}
          {d.drops !== 0 && <Row label="Cash drops (to safe)" value={signed(d.drops)} tone="neg" />}
          {(d.changeOut || 0) !== 0 && (
            <Row label="Change given (POS / transfer overpayment)" value={signed(d.changeOut)} tone="neg" />
          )}
          <Row
            label="Expected in drawer"
            value={formatKobo(isZ ? summary.expectedCash : d.expectedCash)}
            strong
            rule
          />
          {/* Older shifts (before the change_out split) folded that change
              into a negative cash-sale figure - keep the note for them. */}
          {!summary.cashSplitTies && !(d.changeOut || 0) && nonCashChangeOut > 0 && (
            <p className="text-[11px] text-slate-400 pt-1">
              Cash sales above are net of {formatKobo(nonCashChangeOut)} change handed back on POS / transfer overpayments.
            </p>
          )}
          {isZ && (
            <>
              <Row
                label="Counted (physically)"
                value={formatKobo(summary.countedCash)}
                strong
                rule
              />
              <Row
                label={summary.overShort === 0 ? "Balanced" : summary.overShort > 0 ? "Over (counted − expected)" : "Short (counted − expected)"}
                value={signed(summary.overShort)}
                strong
                tone={summary.overShort === 0 || !overTolerance ? undefined : "neg"}
              />
              {/* A small over or short every shift is normal on this basis:
                  swapping a ₦1,000 note into the bowl for change moves the
                  counted pile without anything being lost. So say whether
                  it actually cleared the store's threshold rather than
                  colouring every non-zero figure red. The tolerance is read
                  from the frozen snapshot, so changing the setting later
                  never re-judges a past shift. */}
              {summary.overShort !== 0 && tolerance > 0 && (
                <p className={`text-[11px] ${overTolerance ? "text-red-600" : "text-slate-500"}`}>
                  {overTolerance
                    ? `Outside the ${formatKobo(tolerance)} allowance - flagged for the owner.`
                    : `Within the ${formatKobo(tolerance)} change-bowl allowance - normal.`}
                </p>
              )}
              {/* Below the over/short on purpose: the bowl sits outside that
                  comparison entirely, on both sides. null (not 0) means the
                  shift never counted one - don't invent a zero. */}
              {summary.closingChangeCash != null ? (
                <>
                  <Row label="Change bowl at close" value={formatKobo(summary.closingChangeCash)} rule />
                  <p className="text-[11px] text-slate-400">
                    Small notes kept for giving change. Not takings, and not part of any figure above.
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-slate-400 pt-1">Change bowl: not counted this shift.</p>
              )}
            </>
          )}
        </div>

        {cashEvents.length > 0 && (
          <div className="px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
              Money moved in / out of the drawer
            </p>
            <ul className="space-y-1.5">
              {cashEvents.map((m) => (
                <li key={m.id} className="text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-700">{MOVE_LABEL[m.kind] || m.kind}</span>
                    <span className={`tabular-nums ${m.amount < 0 ? "text-red-600" : "text-emerald-700"}`}>
                      {m.amount > 0 ? "+" : ""}{formatKobo(m.amount)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-800">
                    {m.reason || (m.orderNumber ? `Order ${m.orderNumber}` : "No reason given")}
                    {m.by ? ` (${m.by})` : ""}
                    {m.createdAt ? ` · ${formatDateTime(m.createdAt)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
