"use client";

// "How should they pay?" - all at once, or part now and the rest later
// with the first payment as a whole percent (10-90). Shared by creating an
// invoice (QuotePricingModal) and changing one (EditInvoiceModal).
const PRESETS = [20, 30, 50, 70];

export function isValidDepositPercent(value) {
  return Number.isInteger(value) && value >= 10 && value <= 90;
}

const choice = (on) =>
  `rounded-sm border text-sm font-medium cursor-pointer transition-colors ${
    on ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-700 hover:bg-slate-50"
  }`;

export function PlanPicker({ plan, onPlanChange, depositPercent, onDepositPercentChange }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">How should they pay?</p>
      <div className="grid grid-cols-2 gap-2">
        {[["full", "All at once"], ["deposit", "Part now, rest later"]].map(([value, text]) => (
          <button key={value} type="button" aria-pressed={plan === value} onClick={() => onPlanChange(value)} className={`px-3 py-2.5 ${choice(plan === value)}`}>
            {text}
          </button>
        ))}
      </div>
      {plan === "deposit" && (
        <div className="rounded-sm border border-slate-200 p-3 space-y-2">
          <p className="text-sm text-slate-700">How much do they pay first?</p>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((pct) => (
              <button key={pct} type="button" aria-pressed={depositPercent === pct} onClick={() => onDepositPercentChange(pct)} className={`h-9 min-w-14 px-3 ${choice(depositPercent === pct)}`}>
                {pct}%
              </button>
            ))}
            <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
              <span>Other</span>
              {/* Text, not type="number": no spinner arrows, digits only. */}
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={depositPercent || ""}
                onChange={(event) => onDepositPercentChange(Number(event.target.value.replace(/\D/g, "")) || 0)}
                aria-label="First payment percent"
                className="h-9 w-16 rounded-sm border border-slate-300 bg-surface px-2 text-sm text-slate-900 tabular-nums"
              />
              <span>%</span>
            </label>
          </div>
          {!isValidDepositPercent(depositPercent) && <p className="text-xs text-red-700">Choose between 10% and 90%.</p>}
        </div>
      )}
    </div>
  );
}

// The totals box under the prices: items, fee, what the customer pays (with
// the dollar hint), the two payments on a part-payment plan, and what the
// vendor receives.
export function InvoiceTotalsSummary({ subtotal, totals, feeChargedToCustomer, plan, depositPercent, usdHint = null, formatCurrency }) {
  const first = plan === "deposit" && isValidDepositPercent(depositPercent) ? Math.round(totals.totalAmount * depositPercent) / 100 : null;
  return (
    <div className="rounded-sm bg-slate-50 border border-slate-200 p-3 space-y-1.5 text-sm">
      <div className="flex justify-between text-slate-700"><span>Items</span><span className="tabular-nums">{formatCurrency(subtotal)}</span></div>
      {feeChargedToCustomer && totals.platformFeeAmount > 0 && <div className="flex justify-between text-slate-700"><span>Processing Fee</span><span className="tabular-nums">+{formatCurrency(totals.platformFeeAmount)}</span></div>}
      <div className="flex justify-between font-semibold text-slate-900"><span>Customer pays</span><span className="text-right tabular-nums">{formatCurrency(totals.totalAmount)}{usdHint}</span></div>
      {first != null && (
        <>
          <div className="flex justify-between text-slate-700"><span>First payment ({depositPercent}%)</span><span className="tabular-nums">{formatCurrency(first)}</span></div>
          <div className="flex justify-between text-slate-700"><span>Later</span><span className="tabular-nums">{formatCurrency(totals.totalAmount - first)}</span></div>
        </>
      )}
      <div className="flex justify-between text-slate-700 pt-1.5 border-t border-slate-200"><span>You receive</span><span className="tabular-nums">{formatCurrency(totals.vendorPayoutAmount)}</span></div>
    </div>
  );
}
