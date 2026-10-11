"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { formatCurrency } from "@/lib/format.js";
import { formatKobo } from "@/lib/money.js";

// A fresh id each time the modal mounts (it unmounts on close), reused
// for every retry of THIS action so the server dedupes a flaky-network
// double-submit instead of recording the payout twice.
function newRef() {
  try {
    return crypto.randomUUID();
  } catch {
    return `cm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

const KINDS = [
  { value: "paid_in", label: "Paid in", hint: "Cash added to the drawer (e.g. more change floated in)" },
  { value: "paid_out", label: "Paid out", hint: "Cash taken out (petty cash, supplier paid from the till)" },
  { value: "drop", label: "Cash drop", hint: "Cash moved to the safe mid-shift" },
];

// paid_in / paid_out / drop against the open session. Every one needs a
// reason. Calls onSubmit({ kind, amount, reason }) with amount in naira.
export function CashDrawerModal({ open, onClose, onSubmit, submitting, safeBalanceKobo = null }) {
  const [kind, setKind] = useState("paid_out");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [clientRef] = useState(newRef);
  const [fromSafe, setFromSafe] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  if (!open) return null;
  const active = KINDS.find((k) => k.value === kind);
  const valid = Number(amount) > 0 && reason.trim().length > 0;

  // This can't be edited or undone afterward (see the movements route),
  // so the one guard against a wrong tap - paid in vs paid out is an easy
  // mix-up - is catching it here, before it's sent.
  const handleSubmit = async () => {
    const ok = await confirm({
      title: `Record ${formatCurrency(Number(amount))} as ${active.label}?`,
      description: reason.trim(),
      confirmLabel: `Record ${active.label.toLowerCase()}`,
      variant: kind === "paid_in" ? "brand" : "danger",
    });
    if (ok) onSubmit({ kind, amount: Number(amount), reason: reason.trim(), clientRef, fromSafe: kind === "paid_in" && fromSafe });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Deliberately not click-to-dismiss. This is a till: a cashier
              rests a palm on the screen, or taps past the sheet while the
              customer is still talking, and a half-filled count / refund /
              tender would vanish with no undo. The X (or Cancel) is the
              only way out of a POS dialog. */}
      <div className="fixed inset-0 bg-black/50" />
      <div className="relative bg-surface rounded-t-sm sm:rounded-sm shadow-xl w-full sm:max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-900">Cash drawer</p>
          <button type="button" onClick={onClose} disabled={submitting} className="text-slate-400 hover:text-slate-700 cursor-pointer disabled:opacity-50">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                className={`py-2 rounded-sm border text-xs font-medium cursor-pointer transition-colors ${
                  kind === k.value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-800">{active.hint}</p>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="w-full px-3 py-2 border border-slate-300 rounded-sm text-base outline-none focus:border-brand-500"
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required)"
            className="w-full px-3 py-2 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
          />
          {kind === "paid_in" && (
            // Without this a paid_in is money appearing from nowhere. Tick
            // it and the same amount is taken off the safe's balance in
            // the same transaction, so the two ledgers stay in step.
            <label className="flex items-start gap-2.5 text-sm text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={fromSafe}
                onChange={(e) => setFromSafe(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-brand-600"
              />
              <span>
                This cash came from the safe
                <span className="block text-xs text-slate-600">
                  {safeBalanceKobo != null
                    ? `Safe holds ${formatKobo(safeBalanceKobo)}. It will drop to ${formatKobo(Math.max(0, safeBalanceKobo - Math.round(Number(amount || 0) * 100)))}.`
                    : "Leave unticked if you're replacing missing cash rather than drawing from the safe."}
                </span>
              </span>
            </label>
          )}
          {kind === "drop" && safeBalanceKobo != null && (
            <p className="text-xs text-slate-700">
              Safe holds {formatKobo(safeBalanceKobo)}. This drop will take it to{" "}
              {formatKobo(safeBalanceKobo + Math.round(Number(amount || 0) * 100))}.
            </p>
          )}
          <Button type="button" fullWidth loading={submitting} disabled={!valid || submitting} onClick={handleSubmit}>
            Record {active.label.toLowerCase()}
          </Button>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
