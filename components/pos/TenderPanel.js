"use client";
import { useMemo, useState } from "react";
import {
  X,
  Banknote,
  CreditCard,
  ArrowLeftRight,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { formatCurrency } from "@/lib/format.js";
import { roundCashKobo, toKobo, toNaira } from "@/lib/money.js";

const METHODS = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "transfer", label: "Transfer", icon: ArrowLeftRight },
  { value: "card", label: "POS", icon: CreditCard },
];
const POS_PROVIDERS = ["Moniepoint", "Opay", "Other"];
// The notes a customer actually hands over. Only ones BELOW the balance
// are offered - a note worth more than what's left can't be a part
// payment, and the exact/half chips already cover paying it off.
const NOTES = [500, 1000, 2000, 5000, 10000];
const round2 = (number) => Math.round(number * 100) / 100;

export function TenderPanel({ open, onClose, total, onComplete, submitting }) {
  const [tenders, setTenders] = useState([]);
  const [method, setMethod] = useState("cash");
  const [amountInput, setAmountInput] = useState("");
  const [reference, setReference] = useState("");
  const [providerPick, setProviderPick] = useState("Moniepoint");
  const [providerOther, setProviderOther] = useState("");

  const paid = round2(
    tenders.reduce(
      (sum, tender) => sum + tender.amount - (tender.changeGiven || 0),
      0,
    ),
  );
  const remaining = round2(Math.max(0, total - paid));
  const provider =
    providerPick === "Other" ? providerOther.trim() : providerPick;
  const needsProvider = method !== "cash";
  const typedAmount =
    amountInput.trim() === "" ? remaining : round2(Number(amountInput) || 0);
  const change = round2(Math.max(0, typedAmount - remaining));
  const canAdd =
    remaining > 0 && typedAmount > 0 && (!needsProvider || provider);
  const canComplete = total > 0 && remaining === 0 && tenders.length > 0;
  const methodLabel = useMemo(
    () => Object.fromEntries(METHODS.map((item) => [item.value, item.label])),
    [],
  );

  if (!open) return null;

  const addTender = () => {
    if (!canAdd) return;
    const entry = {
      method,
      amount: typedAmount,
      changeGiven: change,
      ...(needsProvider ? { provider } : {}),
      ...(reference.trim() ? { reference: reference.trim() } : {}),
    };
    const stillOwed = round2(
      Math.max(0, total - round2(paid + entry.amount - entry.changeGiven)),
    );
    setTenders((current) => [...current, entry]);
    setAmountInput("");
    setReference("");
    // A split is nearly always one method then the other ("half on the POS
    // machine, finish with cash"), so pre-select the other one rather than
    // leaving the cashier on a method they've just finished using.
    if (stillOwed > 0) setMethod(entry.method === "cash" ? "card" : "cash");
  };

  // Part-payment amounts, not round-up-to-a-note amounts. The previous
  // version was `Math.ceil(remaining / note) * note`, which on a ₦7,500
  // balance produced ₦7,500 / ₦8,000 / ₦10,000 - every chip paid the
  // balance off or overpaid it, so there was no one-tap way to take a
  // part payment and the split feature was effectively hidden.
  const quickAmounts = [
    { key: "exact", label: "Exact", value: remaining },
    // Nigeria has no sub-naira coin, so half of an odd balance is snapped
    // to whole naira (roundCashKobo) rather than offering ₦3,750.005.
    {
      key: "half",
      label: "Half",
      value: toNaira(roundCashKobo(toKobo(remaining / 2))),
    },
    // Biggest usable note first: the list is capped at 5 chips, and on a
    // ₦50,000 balance ₦10,000 and ₦5,000 are the ones worth a tap, not ₦500.
    ...NOTES.filter((note) => note < remaining)
      .sort((a, b) => b - a)
      .map((note) => ({ key: `n${note}`, label: null, value: note })),
  ]
    .map((chip) => ({ ...chip, value: round2(chip.value) }))
    .filter(
      (chip, index, all) =>
        chip.value > 0 &&
        all.findIndex((other) => other.value === chip.value) === index,
    )
    .slice(0, 5);

  const addLabel =
    typedAmount <= 0
      ? "Add payment"
      : typedAmount < remaining
        ? `Add ${formatCurrency(typedAmount)} · ${formatCurrency(round2(remaining - typedAmount))} still owed`
        : `Add ${formatCurrency(typedAmount)} · pays the balance`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Deliberately not click-to-dismiss. This is a till: a cashier
              rests a palm on the screen, or taps past the sheet while the
              customer is still talking, and a half-filled count / refund /
              tender would vanish with no undo. The X (or Cancel) is the
              only way out of a POS dialog. */}
      <div className="fixed inset-0 bg-black/50" />
      <div className="relative bg-surface rounded-t-sm sm:rounded-sm shadow-xl w-full sm:max-w-md max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-900">Take payment</p>
          <button
            type="button"
            title="Close"
            onClick={onClose}
            disabled={submitting}
            className="text-slate-400 hover:text-slate-700 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Total and paid stay on screen the whole time. Previously only
              the balance showed, and it was replaced by "Paid in full" the
              moment it hit zero - so nothing on the sheet ever revealed
              that a sale could be paid in more than one go. */}
          <div className="rounded-sm bg-slate-50 border border-slate-200 p-3">
            <div className="flex items-center justify-between text-xs text-slate-700">
              <span>Total</span>
              <span className="tabular-nums font-medium text-slate-900">
                {formatCurrency(total)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-700">
              <span>Paid so far</span>
              <span className="tabular-nums font-medium text-slate-900">
                {formatCurrency(paid)}
              </span>
            </div>
            <div className="mt-2 border-t border-slate-200 pt-2 text-center">
              <p className="text-[11px] font-semibold uppercase text-slate-700">
                {remaining > 0 ? "Balance due" : "Paid in full"}
              </p>
              <p
                className={`text-2xl font-bold tabular-nums ${remaining > 0 ? "text-red-600" : "text-emerald-700"}`}
              >
                {formatCurrency(remaining)}
              </p>
            </div>
          </div>

          {tenders.length === 0 && (
            <p className="text-xs text-slate-700">
              You can take this in more than one payment - add one now and the
              balance stays here.
            </p>
          )}

          {tenders.length > 0 && (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-sm">
              {tenders.map((tender, index) => (
                <div
                  key={`${tender.method}-${index}`}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {methodLabel[tender.method]}
                      {tender.provider ? ` - ${tender.provider}` : ""}
                    </p>
                    {/* Tendered and change kept visible as their own figures.
                        A single "₦X applied" hid how much was actually handed
                        over, which is the number a cashier is reconciling
                        against the cash in their hand. */}
                    <p className="text-xs text-slate-600 tabular-nums">
                      {tender.changeGiven > 0
                        ? `Tendered ${formatCurrency(tender.amount)} · Change ${formatCurrency(tender.changeGiven)} · Applied ${formatCurrency(round2(tender.amount - tender.changeGiven))}`
                        : `${formatCurrency(tender.amount)} applied`}
                    </p>
                  </div>
                  <button
                    type="button"
                    title="Remove payment"
                    onClick={() =>
                      setTenders((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                    className="text-slate-400 hover:text-red-600 shrink-0"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {tenders.length > 0 && remaining > 0 && (
            <p className="rounded-sm border border-amber-200 bg-amber-100 px-3 py-2 text-sm text-amber-900">
              {formatCurrency(remaining)} still to pay - choose how.
            </p>
          )}

          {remaining > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {METHODS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setMethod(item.value)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-sm border text-xs font-medium ${method === item.value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"}`}
                  >
                    <item.icon size={16} />
                    {item.label}
                  </button>
                ))}
              </div>

              {needsProvider && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-700">
                    {method === "transfer"
                      ? "Receiving account"
                      : "POS machine"}
                  </p>
                  <div className="flex gap-2">
                    {POS_PROVIDERS.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setProviderPick(name)}
                        className={`px-3 py-1.5 rounded-sm border text-sm ${providerPick === name ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300"}`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  {providerPick === "Other" && (
                    <input
                      value={providerOther}
                      onChange={(event) => setProviderOther(event.target.value)}
                      placeholder="Provider name"
                      className="w-full px-3 py-2 border border-slate-300 rounded-sm text-sm"
                    />
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {quickAmounts.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setAmountInput(String(chip.value))}
                    className="px-3 py-1.5 rounded-sm border border-slate-300 text-sm tabular-nums hover:bg-slate-50 cursor-pointer"
                  >
                    {chip.label ? `${chip.label} · ` : ""}
                    {formatCurrency(chip.value)}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                placeholder={`Amount received (${formatCurrency(remaining)})`}
                className="w-full px-3 py-2 border border-slate-300 rounded-sm text-base"
              />
              {false && (
                <input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder={
                    method === "transfer"
                      ? "Bank reference (optional)"
                      : "Terminal ref / RRN (optional)"
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-sm text-sm"
                />
              )}
              {change > 0 && (
                <div className="rounded-sm border border-amber-200 bg-amber-100 px-3 py-2 text-sm text-amber-900">
                  <div className="flex items-center justify-between tabular-nums">
                    <span>Tendered</span>
                    <span className="font-medium">
                      {formatCurrency(typedAmount)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between tabular-nums">
                    <span>Change to hand back</span>
                    <span className="font-semibold">
                      {formatCurrency(change)}
                    </span>
                  </div>
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                fullWidth
                disabled={!canAdd}
                onClick={addTender}
              >
                <Plus size={16} /> {addLabel}
              </Button>
            </>
          ) : (
            // Kept mounted at a zero balance so the sheet never looks like
            // it has silently finished with you - removing a payment above
            // brings the composer straight back.
            <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              Balance is {formatCurrency(0)}. Remove a payment above to change
              how this was paid.
            </p>
          )}
        </div>

        <div className="p-4 border-t border-slate-100">
          <Button
            type="button"
            fullWidth
            size="lg"
            loading={submitting}
            disabled={!canComplete}
            onClick={() => onComplete(tenders)}
          >
            Complete - {formatCurrency(total)}
          </Button>
        </div>
      </div>
    </div>
  );
}
