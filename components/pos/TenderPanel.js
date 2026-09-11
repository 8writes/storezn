"use client";
import { useState } from "react";
import { X, Banknote, CreditCard, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { formatCurrency } from "@/lib/format.js";

// "POS" is what a card-machine payment is called in Nigeria (the value
// stays "card" - it's the tender_method enum). Its reference field takes
// the terminal's transaction/RRN.
const METHODS = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "transfer", label: "Transfer", icon: ArrowLeftRight },
  { value: "card", label: "POS", icon: CreditCard },
];

// The provider account money landed in - a POS terminal for a card swipe,
// the same provider's bank account for a transfer - so every stream
// reconciles per account. Free-text on the server; "Other" lets the
// cashier type one.
const POS_PROVIDERS = ["Moniepoint", "Opay", "Other"];

const round2 = (n) => Math.round(n * 100) / 100;

// One payment per sale. Emits a single tender in naira:
// [{ method, provider, amount, changeGiven, reference }]. Any method can be over
// the total - the excess is handed back as cash (changeGiven), e.g. a
// customer who transfers a round number and collects the difference from
// the drawer. A blank amount means "exactly the total".
export function TenderPanel({ open, onClose, total, onComplete, submitting }) {
  // Mounted fresh each time it opens (the parent gates on `open`), so
  // these initialisers are the reset.
  const [method, setMethod] = useState("cash");
  const [amountInput, setAmountInput] = useState("");
  const [reference, setReference] = useState("");
  const [providerPick, setProviderPick] = useState("Moniepoint"); // one of POS_PROVIDERS
  const [providerOther, setProviderOther] = useState("");
  const provider = providerPick === "Other" ? providerOther.trim() : providerPick;

  const typed = amountInput.trim();
  // Blank = pay exactly the total. A typed value is what was handed over
  // (for any method - a bank transfer of a round number counts too).
  const amount = typed === "" ? round2(total) : round2(Number(amountInput) || 0);
  const isCash = method === "cash";
  const change = round2(Math.max(0, amount - total));
  const shortBy = round2(Math.max(0, total - amount));
  // Both card (POS terminal) and transfer (provider bank account) need
  // the provider so the money traces back to an account.
  const needsProvider = method === "card" || method === "transfer";
  const canComplete = total > 0 && amount > 0 && shortBy === 0 && (!needsProvider || !!provider);

  if (!open) return null;

  const complete = () => {
    onComplete([
      {
        method,
        provider: needsProvider ? provider : undefined,
        amount,
        changeGiven: change,
        reference: reference.trim() || undefined,
      },
    ]);
  };

  const quickAmounts = () => {
    const chips = [round2(total)];
    for (const step of [500, 1000, 2000, 5000, 10000]) {
      const up = Math.ceil(total / step) * step;
      if (up > total && !chips.includes(up)) chips.push(up);
    }
    return chips.slice(0, 4);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={submitting ? undefined : onClose} />
      <div className="relative bg-surface rounded-t-sm sm:rounded-sm shadow-xl w-full sm:max-w-md max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-900">Take payment</p>
          <button type="button" onClick={onClose} disabled={submitting} className="text-slate-400 hover:text-slate-700 cursor-pointer disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="rounded-sm bg-slate-50 border border-slate-200 p-3 text-center">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
              {shortBy > 0 ? "Balance due" : change > 0 ? "Change due" : "Paid in full"}
            </p>
            <p className={`text-2xl font-bold tabular-nums ${change > 0 ? "text-emerald-700" : shortBy > 0 ? "text-red-600" : "text-slate-900"}`}>
              {formatCurrency(shortBy > 0 ? shortBy : change > 0 ? change : total)}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Total {formatCurrency(total)}</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                className={`flex flex-col items-center gap-1 py-2 rounded-sm border text-xs font-medium cursor-pointer transition-colors ${
                  method === m.value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <m.icon size={16} />
                {m.label}
              </button>
            ))}
          </div>

          {needsProvider && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600">
                {method === "transfer" ? "Which account was it transferred to?" : "Which POS machine?"}
              </p>
              <div className="flex flex-wrap gap-2">
                {POS_PROVIDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProviderPick(p)}
                    className={`px-3 py-1.5 rounded-sm border text-sm font-medium cursor-pointer ${
                      providerPick === p ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {providerPick === "Other" && (
                <input
                  type="text"
                  value={providerOther}
                  onChange={(e) => setProviderOther(e.target.value)}
                  placeholder="Provider name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
                />
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {quickAmounts().map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setAmountInput(String(c))}
                className={`px-3 py-1.5 rounded-sm border text-sm font-medium cursor-pointer tabular-nums ${
                  typed !== "" && Number(amountInput) === c
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {formatCurrency(c)}
              </button>
            ))}
          </div>

          <input
            type="number"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder={`Amount ${isCash ? "tendered" : "received"} (₦${Math.round(total).toLocaleString()})`}
            className="w-full px-3 py-2 border border-slate-300 rounded-sm text-base outline-none focus:border-brand-500"
          />

          {!isCash && (
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={method === "transfer" ? "Bank reference (optional)" : "POS terminal ref / RRN (optional)"}
              className="w-full px-3 py-2 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
            />
          )}

          {change > 0 && !isCash && (
            <p className="text-xs text-slate-500">
              Customer overpaid by {method === "transfer" ? "transfer" : "POS"}
              {provider ? ` (${provider})` : ""}: {formatCurrency(change)} change to hand back in cash from the drawer.
            </p>
          )}
        </div>

        <div className="p-4 border-t border-slate-100">
          <Button type="button" fullWidth size="lg" loading={submitting} disabled={!canComplete} onClick={complete}>
            {change > 0 ? `Complete · ${formatCurrency(change)} change` : `Complete · ${formatCurrency(total)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
