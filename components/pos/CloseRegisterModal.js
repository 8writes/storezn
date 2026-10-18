"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { formatKobo } from "@/lib/money.js";
import { ZReport } from "./ZReport.js";

// Nigerian cash denominations, high to low (naira).
const DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5];

// Close flow: count the whole drawer note by note, ₦1,000 down to ₦5 -
// change included, since the small notes are in the list - then the Z
// report is shown for printing. The count is recorded for what it is;
// nothing is compared with an expected figure.
//
// onSubmit is called with one of:
//   { countBreakdown: {denom: qty} }  the count
//   { forced: true, forcedReason }    couldn't count
// (The API still accepts a plain { countedCash } total and a separate
// closingChangeCash from older clients.)
// and resolves to the closed session's zReport (or throws).
export function CloseRegisterModal({ open, onClose, rejectedCount = 0, heldCount, pendingSync = 0, syncing = false, onSync, onSubmit }) {
  const [qtys, setQtys] = useState({});
  const [forcing, setForcing] = useState(false);
  const [forcedReason, setForcedReason] = useState("");
  const [ackProvisional, setAckProvisional] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [zReport, setZReport] = useState(null);

  // Every note counted is counted cash - the same sum the server makes
  // from the breakdown, so what's shown here is what gets recorded.
  const countedKobo = DENOMS.reduce((sum, d) => sum + d * 100 * (Number(qtys[d]) || 0), 0);

  if (!open) return null;

  const blocked = heldCount > 0;
  const needsAck = pendingSync > 0 && !ackProvisional;
  // Anything typed counts as a count - including a deliberate 0, so a
  // genuinely empty drawer can still be closed.
  const entered = DENOMS.some((d) => qtys[d] != null && qtys[d] !== "");
  const canSubmit = forcing ? forcedReason.trim().length > 0 : entered;

  const submit = async () => {
    setSubmitting(true);
    try {
      let payload;
      if (forcing) payload = { forced: true, forcedReason: forcedReason.trim() };
      else {
        const countBreakdown = {};
        for (const d of DENOMS) if (Number(qtys[d]) > 0) countBreakdown[d] = Number(qtys[d]);
        payload = { countBreakdown };
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
                    The shift will be closed as &quot;not counted&quot; and flagged for the owner to review.
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
                          aria-label={`Number of ₦${d.toLocaleString()} notes`}
                          className="w-16 px-2 py-1 border border-slate-300 rounded-sm text-sm tabular-nums outline-none focus:border-brand-500"
                        />
                        <span className="ml-auto tabular-nums text-slate-800">
                          {formatKobo(d * 100 * (Number(qtys[d]) || 0))}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between px-3 py-2 text-sm font-semibold">
                      <span>Counted cash</span>
                      <span className="tabular-nums">{formatKobo(countedKobo)}</span>
                    </div>
                  </div>

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
