"use client";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { formatKobo } from "@/lib/money.js";
import { CHANGE_FLOAT_BELOW, splitCountBreakdown } from "@/lib/pos.js";
import { ZReport } from "./ZReport.js";

// Nigerian cash denominations, high to low (naira).
const DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5];

// Close flow: count the drawer -> confirm -> the Z report is shown for
// printing. It is a BLIND count - the expected figure and the over/short
// are hidden until the count is submitted, so the number entered is an
// honest count and not one typed to "balance".
//
// onSubmit is called with one of:
//   { countedCash }                  plain total (naira)
//   { countBreakdown: {denom: qty} } note-by-note count
//   { forced: true, forcedReason }   couldn't count - use the system figure
// and resolves to the closed session's zReport (or throws).
export function CloseRegisterModal({ open, onClose, expectedCashKobo, offlineCashDeltaKobo = 0, rejectedCount = 0, heldCount, pendingSync = 0, syncing = false, onSync, onSubmit }) {
  const [mode, setMode] = useState("total"); // "total" | "notes"
  const [counted, setCounted] = useState("");
  const [qtys, setQtys] = useState({});
  const [forcing, setForcing] = useState(false);
  const [forcedReason, setForcedReason] = useState("");
  const [changeFloat, setChangeFloat] = useState("");
  const [ackProvisional, setAckProvisional] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [zReport, setZReport] = useState(null);

  // Notes under ₦500 are the change float, not takings - the same split
  // the server applies when it stores the close (splitCountBreakdown), so
  // the figure shown while counting is the figure that gets recorded.
  const split = useMemo(() => {
    const breakdown = {};
    for (const d of DENOMS) if (Number(qtys[d]) > 0) breakdown[d] = Number(qtys[d]);
    return splitCountBreakdown(breakdown);
  }, [qtys]);
  const breakdownKobo = split.countedKobo;
  const changeFloatKobo = split.changeFloatKobo;
  const countedKobo = mode === "notes" ? breakdownKobo : Math.round(Number(counted || 0) * 100);

  if (!open) return null;

  const blocked = heldCount > 0;
  const needsAck = pendingSync > 0 && !ackProvisional;
  const canSubmit = forcing
    ? forcedReason.trim().length > 0
    : mode === "notes"
      ? breakdownKobo > 0 || changeFloatKobo > 0
      : counted !== "";

  const submit = async () => {
    setSubmitting(true);
    try {
      let payload;
      if (forcing) payload = { forced: true, forcedReason: forcedReason.trim() };
      else if (mode === "notes") {
        const countBreakdown = {};
        for (const d of DENOMS) if (Number(qtys[d]) > 0) countBreakdown[d] = Number(qtys[d]);
        payload = { countBreakdown };
      } else {
        payload = { countedCash: Number(counted || 0) };
        if (changeFloat !== "") payload.closingChangeCash = Number(changeFloat || 0);
      }
      const z = await onSubmit(payload);
      if (z) setZReport(z);
    } finally {
      setSubmitting(false);
    }
  };

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
          <p className="text-sm font-bold text-slate-900">{zReport ? "Register closed" : "Close register"}</p>
          <button
            type="button"
            onClick={submitting ? undefined : onClose}
            className="text-slate-400 hover:text-slate-700 cursor-pointer disabled:opacity-40"
            disabled={submitting}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-3">
          {zReport ? (
            <ZReport summary={zReport} />
          ) : blocked ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-sm p-3">
              {heldCount} held sale{heldCount === 1 ? "" : "s"} still parked. Recall and finish (or discard) them before closing.
            </p>
          ) : (
            <>
              {pendingSync > 0 && (
                <div className="text-sm bg-amber-50 border border-amber-200 rounded-sm p-3 space-y-2">
                  <p className="text-amber-800">
                    {pendingSync} sale{pendingSync === 1 ? "" : "s"} on this device {pendingSync === 1 ? "hasn't" : "haven't"} synced.
                    You can still close, the Z will be marked <strong>provisional</strong> and will update when they sync.
                  </p>
                  {offlineCashDeltaKobo !== 0 && (
                    // The count stays blind - this is not what the drawer
                    // should hold, it is how much of the cash in front of
                    // them the server hasn't been told about, which is what
                    // makes a provisional Z read short later.
                    <p className="text-xs text-amber-800">
                      That accounts for <strong className="tabular-nums">{formatKobo(offlineCashDeltaKobo)}</strong> of cash in this drawer.
                    </p>
                  )}
                  <Button type="button" size="sm" variant="outline" onClick={onSync} loading={syncing}>
                    {syncing ? "Syncing…" : `Try sync again`}
                  </Button>
                  <label className="flex items-start gap-2 text-xs text-amber-900">
                    <input type="checkbox" checked={ackProvisional} onChange={(e) => setAckProvisional(e.target.checked)} className="mt-0.5" />
                    Close anyway, with provisional figures
                  </label>
                </div>
              )}

              {rejectedCount > 0 && (
                // Different from "not synced yet": the server has refused
                // these outright, so waiting will not bring them in and
                // this Z will never contain them.
                <div className="text-sm bg-red-50 border border-red-200 rounded-sm p-3">
                  <p className="text-red-800">
                    {rejectedCount} sale{rejectedCount === 1 ? " was" : "s were"} refused by the server and <strong>will not be in this Z report</strong>.
                    Open Offline setup to see why.
                  </p>
                </div>
              )}

              {forcing ? (
                <div className="space-y-2">
                  <p className="text-sm text-slate-700 font-medium">Can&apos;t count the drawer?</p>
                  <p className="text-xs text-slate-800">
                    The system&apos;s expected figure will be recorded and this shift will be flagged for the owner to review.
                    Say what stopped you counting.
                  </p>
                  <textarea
                    autoFocus
                    rows={3}
                    value={forcedReason}
                    onChange={(e) => setForcedReason(e.target.value)}
                    placeholder="e.g. till jammed, had to leave, system wouldn't let me close"
                    className="w-full px-3 py-2 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
                  />
                  <button type="button" onClick={() => setForcing(false)} className="text-xs text-brand-700 hover:underline">
                    ← Back to counting
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-600">Count the cash in the drawer.</p>
                    <div className="flex gap-1 text-xs">
                      <button
                        type="button"
                        onClick={() => setMode("total")}
                        className={`px-2 py-1 rounded-sm border ${mode === "total" ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-800"}`}
                      >
                        Total
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode("notes")}
                        className={`px-2 py-1 rounded-sm border ${mode === "notes" ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-800"}`}
                      >
                        By notes
                      </button>
                    </div>
                  </div>

                  {mode === "total" ? (
                    <input
                      type="number"
                      inputMode="decimal"
                      autoFocus
                      value={counted}
                      onChange={(e) => setCounted(e.target.value)}
                      placeholder="Counted cash total"
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-sm text-lg tabular-nums outline-none focus:border-brand-500"
                    />
                  ) : null}
                  {mode === "total" ? (
                    <div className="space-y-1">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={changeFloat}
                        onChange={(e) => setChangeFloat(e.target.value)}
                        placeholder="Change in drawer (optional)"
                        className="w-full px-3 py-2 border border-slate-300 rounded-sm text-base tabular-nums outline-none focus:border-brand-500"
                      />
                      <p className="text-xs text-slate-700">
                        The small notes kept for giving change. Recorded separately - it is not counted as takings.
                      </p>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-sm divide-y divide-slate-100">
                      {DENOMS.map((d) => (
                        <div key={d} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                          <span className="w-16 text-slate-600 tabular-nums">₦{d.toLocaleString()}</span>
                          <span className="text-slate-300">×</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            value={qtys[d] ?? ""}
                            onChange={(e) => setQtys((q) => ({ ...q, [d]: e.target.value }))}
                            placeholder="0"
                            className="w-16 px-2 py-1 border border-slate-300 rounded-sm text-sm tabular-nums outline-none focus:border-brand-500"
                          />
                          <span className="ml-auto tabular-nums text-slate-800">
                            {formatKobo(d * 100 * (Number(qtys[d]) || 0))}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between px-3 py-2 text-sm font-semibold">
                        <span>Drawer cash</span>
                        <span className="tabular-nums">{formatKobo(breakdownKobo)}</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2 px-3 py-2 text-sm">
                        <span className="text-slate-700">
                          Change float
                          <span className="block text-[11px] text-slate-600">Notes under ₦{CHANGE_FLOAT_BELOW} - recorded, not counted as takings</span>
                        </span>
                        <span className="tabular-nums text-slate-800">{formatKobo(changeFloatKobo)}</span>
                      </div>
                    </div>
                  )}

                  {/* Deliberately NO expected / over-short shown here - it's a
                      blind count. Both appear on the Z report after submit. */}
                  <button type="button" onClick={() => setForcing(true)} className="text-xs text-slate-800 hover:text-slate-700 hover:underline">
                    I can&apos;t count the drawer right now
                  </button>
                </>
              )}
            </>
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
              disabled={blocked || needsAck || !canSubmit}
              onClick={submit}
            >
              {forcing ? "Close without a count" : "Close register & run Z"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
