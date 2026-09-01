"use client";
import { useMemo, useState } from "react";
import { X, Banknote, CreditCard, ArrowLeftRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { formatCurrency } from "@/lib/format.js";

const METHODS = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "transfer", label: "Transfer", icon: ArrowLeftRight },
  { value: "card", label: "Card", icon: CreditCard },
];

const round2 = (n) => Math.round(n * 100) / 100;

// Split-tender payment. Emits tenders in naira:
// [{ method, amount, changeGiven, reference }]. Only a cash tender ever
// carries change - if the customer overpays with cash, the excess is
// attributed to the last cash line as changeGiven.
export function TenderPanel({ open, onClose, total, onComplete, submitting }) {
  // Mounted fresh each time it opens (the parent gates on `open`), so
  // these initialisers are the reset.
  const [lines, setLines] = useState([]);
  const [amountInput, setAmountInput] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");

  const paid = useMemo(() => round2(lines.reduce((s, l) => s + l.amount, 0)), [lines]);
  const balance = round2(total - paid);
  const overpay = round2(Math.max(0, paid - total));
  const hasCash = lines.some((l) => l.method === "cash");
  const canComplete = paid >= total && (overpay === 0 || hasCash) && lines.length > 0;

  if (!open) return null;

  const addLine = (amt, m = method, ref = reference) => {
    const amount = round2(Number(amt));
    if (!amount || amount <= 0) return;
    setLines((rows) => [...rows, { method: m, amount, reference: ref.trim() }]);
    setAmountInput("");
    setReference("");
  };

  const quickCash = () => {
    const need = Math.max(balance, 0);
    const chips = [need];
    for (const step of [500, 1000, 2000, 5000, 10000]) {
      const up = Math.ceil(need / step) * step;
      if (up > need && !chips.includes(up)) chips.push(up);
    }
    return chips.slice(0, 4);
  };

  const complete = () => {
    let remainingChange = overpay;
    // walk lines from the end, attribute the whole overpay to the last cash line
    const out = [...lines].map((l) => ({ ...l, changeGiven: 0 }));
    for (let i = out.length - 1; i >= 0 && remainingChange > 0; i--) {
      if (out[i].method === "cash") {
        out[i].changeGiven = remainingChange;
        remainingChange = 0;
      }
    }
    onComplete(
      out.map((l) => ({
        method: l.method,
        amount: l.amount,
        changeGiven: l.changeGiven || 0,
        reference: l.reference || undefined,
      })),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={submitting ? undefined : onClose} />
      <div className="relative bg-white rounded-t-sm sm:rounded-sm shadow-xl w-full sm:max-w-md max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-900">Take payment</p>
          <button type="button" onClick={onClose} disabled={submitting} className="text-slate-400 hover:text-slate-700 cursor-pointer disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="rounded-sm bg-slate-50 border border-slate-200 p-3 text-center">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
              {balance > 0 ? "Balance due" : overpay > 0 ? "Change due" : "Paid in full"}
            </p>
            <p className={`text-2xl font-bold tabular-nums ${overpay > 0 ? "text-emerald-700" : "text-slate-900"}`}>
              {formatCurrency(overpay > 0 ? overpay : Math.max(balance, 0))}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Total {formatCurrency(total)}</p>
          </div>

          {lines.length > 0 && (
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-sm text-sm">
              {lines.map((l, i) => (
                <li key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="capitalize text-slate-700">
                    {l.method}
                    {l.reference ? <span className="text-slate-400"> · {l.reference}</span> : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">{formatCurrency(l.amount)}</span>
                    <button type="button" onClick={() => setLines((r) => r.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600 cursor-pointer">
                      <X size={13} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {balance > 0 && (
            <div className="space-y-3">
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

              {method === "cash" && (
                <div className="flex flex-wrap gap-2">
                  {quickCash().map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => addLine(c, "cash", "")}
                      className="px-3 py-1.5 rounded-sm border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer tabular-nums"
                    >
                      {formatCurrency(c)}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder={`Amount (₦${Math.max(balance, 0).toLocaleString()})`}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-sm text-base outline-none focus:border-brand-500"
                />
                <Button type="button" variant="outline" onClick={() => addLine(amountInput || balance)}>
                  <Plus size={15} /> Add
                </Button>
              </div>
              {method !== "cash" && (
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={method === "transfer" ? "Bank reference (optional)" : "Auth / terminal ref (optional)"}
                  className="w-full px-3 py-2 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
                />
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100">
          <Button type="button" fullWidth size="lg" loading={submitting} disabled={!canComplete} onClick={complete}>
            {overpay > 0 ? `Complete · ${formatCurrency(overpay)} change` : `Complete · ${formatCurrency(total)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
