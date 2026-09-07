"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { formatCurrency } from "@/lib/format.js";
import { formatKobo } from "@/lib/money.js";
import { ZReport } from "./ZReport.js";

// Two steps: count the drawer -> confirm -> the Z report is shown for
// printing. onSubmit(countedCashNaira) resolves to the closed session's
// zReport (or throws).
export function CloseRegisterModal({ open, onClose, expectedCashKobo, heldCount, pendingSync = 0, syncing = false, onSync, onSubmit }) {
  const [counted, setCounted] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [zReport, setZReport] = useState(null);

  if (!open) return null;

  const countedKobo = Math.round(Number(counted || 0) * 100);
  const overShort = countedKobo - expectedCashKobo;

  const submit = async () => {
    setSubmitting(true);
    try {
      const z = await onSubmit(Number(counted || 0));
      setZReport(z);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={submitting ? undefined : onClose} />
      <div className="relative bg-white rounded-t-sm sm:rounded-sm shadow-xl w-full sm:max-w-md max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-900">{zReport ? "Register closed" : "Close register"}</p>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto">
          {zReport ? (
            <ZReport summary={zReport} />
          ) : pendingSync > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-sm p-3">
                {pendingSync} sale{pendingSync === 1 ? "" : "s"} still to sync. The Z report is built from what the server
                has, so send these up first.
              </p>
              <Button type="button" fullWidth onClick={onSync} loading={syncing}>
                {syncing ? "Syncing…" : `Sync ${pendingSync} now`}
              </Button>
            </div>
          ) : heldCount > 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-sm p-3">
              {heldCount} held sale{heldCount === 1 ? "" : "s"} still parked. Recall and finish (or discard) them before closing.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Count all the cash in the drawer and enter the total.</p>
              <input
                type="number"
                inputMode="decimal"
                autoFocus
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                placeholder="Counted cash"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-sm text-lg tabular-nums outline-none focus:border-brand-500"
              />
              <div className="text-sm border border-slate-200 rounded-sm divide-y divide-slate-100">
                <div className="flex justify-between px-3 py-2 text-slate-600">
                  <span>Expected</span>
                  <span className="tabular-nums">{formatKobo(expectedCashKobo)}</span>
                </div>
                <div className="flex justify-between px-3 py-2 font-semibold">
                  <span>{overShort === 0 ? "Balanced" : overShort > 0 ? "Over" : "Short"}</span>
                  <span className={`tabular-nums ${overShort === 0 ? "text-slate-900" : "text-red-600"}`}>
                    {formatCurrency(overShort / 100)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100">
          {zReport ? (
            <div className="flex gap-2">
              <Button type="button" variant="outline" fullWidth onClick={() => window.print()}>
                Print Z report
              </Button>
              <Button type="button" fullWidth onClick={onClose}>
                Done
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              fullWidth
              size="lg"
              variant="danger"
              loading={submitting}
              disabled={heldCount > 0 || pendingSync > 0 || counted === ""}
              onClick={submit}
            >
              Close register &amp; run Z
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
