"use client";
import { useMemo, useState } from "react";
import { X, Banknote, CreditCard, ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { formatCurrency } from "@/lib/format.js";

const METHODS = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "transfer", label: "Transfer", icon: ArrowLeftRight },
  { value: "card", label: "POS", icon: CreditCard },
];
const POS_PROVIDERS = ["Moniepoint", "Opay", "Other"];
const round2 = (number) => Math.round(number * 100) / 100;

export function TenderPanel({ open, onClose, total, onComplete, submitting }) {
  const [tenders, setTenders] = useState([]);
  const [method, setMethod] = useState("cash");
  const [amountInput, setAmountInput] = useState("");
  const [reference, setReference] = useState("");
  const [providerPick, setProviderPick] = useState("Moniepoint");
  const [providerOther, setProviderOther] = useState("");

  const paid = round2(tenders.reduce((sum, tender) => sum + tender.amount - (tender.changeGiven || 0), 0));
  const remaining = round2(Math.max(0, total - paid));
  const provider = providerPick === "Other" ? providerOther.trim() : providerPick;
  const needsProvider = method !== "cash";
  const typedAmount = amountInput.trim() === "" ? remaining : round2(Number(amountInput) || 0);
  const change = round2(Math.max(0, typedAmount - remaining));
  const canAdd = remaining > 0 && typedAmount > 0 && (!needsProvider || provider);
  const canComplete = total > 0 && remaining === 0 && tenders.length > 0;
  const methodLabel = useMemo(() => Object.fromEntries(METHODS.map((item) => [item.value, item.label])), []);

  if (!open) return null;

  const addTender = () => {
    if (!canAdd) return;
    setTenders((current) => [...current, {
      method,
      amount: typedAmount,
      changeGiven: change,
      ...(needsProvider ? { provider } : {}),
      ...(reference.trim() ? { reference: reference.trim() } : {}),
    }]);
    setAmountInput("");
    setReference("");
  };

  const quickAmounts = [remaining, 500, 1000, 2000, 5000, 10000]
    .map((value, index) => index === 0 ? round2(value) : Math.ceil(remaining / value) * value)
    .filter((value, index, all) => value > 0 && all.indexOf(value) === index)
    .slice(0, 4);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={submitting ? undefined : onClose} />
      <div className="relative bg-surface rounded-t-sm sm:rounded-sm shadow-xl w-full sm:max-w-md max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-900">Take payment</p>
          <button type="button" title="Close" onClick={onClose} disabled={submitting} className="text-slate-400 hover:text-slate-700 disabled:opacity-50"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="rounded-sm bg-slate-50 border border-slate-200 p-3 text-center">
            <p className="text-[11px] uppercase text-slate-700 font-semibold">{remaining > 0 ? "Balance due" : "Paid in full"}</p>
            <p className={`text-2xl font-bold tabular-nums ${remaining > 0 ? "text-red-600" : "text-emerald-700"}`}>{formatCurrency(remaining)}</p>
            <p className="text-xs text-slate-700 mt-0.5">Total {formatCurrency(total)}</p>
          </div>

          {tenders.length > 0 && (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-sm">
              {tenders.map((tender, index) => (
                <div key={`${tender.method}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div><p className="text-sm font-medium text-slate-900">{methodLabel[tender.method]}{tender.provider ? ` - ${tender.provider}` : ""}</p>
                    <p className="text-xs text-slate-600">{formatCurrency(tender.amount - tender.changeGiven)} applied</p></div>
                  <button type="button" title="Remove payment" onClick={() => setTenders((current) => current.filter((_, i) => i !== index))} className="text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}

          {remaining > 0 && <>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map((item) => <button key={item.value} type="button" onClick={() => setMethod(item.value)} className={`flex flex-col items-center gap-1 py-2 rounded-sm border text-xs font-medium ${method === item.value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"}`}><item.icon size={16} />{item.label}</button>)}
            </div>

            {needsProvider && <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700">{method === "transfer" ? "Receiving account" : "POS machine"}</p>
              <div className="flex gap-2">{POS_PROVIDERS.map((name) => <button key={name} type="button" onClick={() => setProviderPick(name)} className={`px-3 py-1.5 rounded-sm border text-sm ${providerPick === name ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300"}`}>{name}</button>)}</div>
              {providerPick === "Other" && <input value={providerOther} onChange={(event) => setProviderOther(event.target.value)} placeholder="Provider name" className="w-full px-3 py-2 border border-slate-300 rounded-sm text-sm" />}
            </div>}

            <div className="flex flex-wrap gap-2">{quickAmounts.map((amount) => <button key={amount} type="button" onClick={() => setAmountInput(String(amount))} className="px-3 py-1.5 rounded-sm border border-slate-300 text-sm tabular-nums hover:bg-slate-50">{formatCurrency(amount)}</button>)}</div>
            <input type="number" min="0.01" step="0.01" inputMode="decimal" value={amountInput} onChange={(event) => setAmountInput(event.target.value)} placeholder={`Amount received (${formatCurrency(remaining)})`} className="w-full px-3 py-2 border border-slate-300 rounded-sm text-base" />
            {needsProvider && <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder={method === "transfer" ? "Bank reference (optional)" : "Terminal ref / RRN (optional)"} className="w-full px-3 py-2 border border-slate-300 rounded-sm text-sm" />}
            {change > 0 && <p className="text-xs text-amber-800">Hand back {formatCurrency(change)} cash change.</p>}
            <Button type="button" variant="outline" fullWidth disabled={!canAdd} onClick={addTender}><Plus size={16} /> Add payment</Button>
          </>}
        </div>

        <div className="p-4 border-t border-slate-100">
          <Button type="button" fullWidth size="lg" loading={submitting} disabled={!canComplete} onClick={() => onComplete(tenders)}>Complete - {formatCurrency(total)}</Button>
        </div>
      </div>
    </div>
  );
}
