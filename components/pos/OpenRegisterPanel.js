"use client";
import { useState } from "react";
import Link from "next/link";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { Select } from "@/components/ui/Select.js";

// Shown on the till when no shift is open. Pick a register, count the
// notes you count, open. Registers already running a session elsewhere
// are shown as busy.
//
// The opening count asks for the SAME pile the close counts: notes of
// ₦500 and up, change pot excluded. It used to ask for "cash physically
// in drawer now", which swept the pot in on this side only - so over/
// short came out as minus the pot on every shift and every close got
// flagged. See REGISTER-CASH-BASIS-MIGRATION.sql.
const COUNTED_DENOMS = [1000, 500];
const POT_DENOMS = [200, 100, 50, 20, 10, 5];

export function OpenRegisterPanel({ registers, isOwner, onOpen, onResume, opening }) {
  const free = registers.filter((r) => r.isActive);
  const [picked, setPicked] = useState("");
  const [float, setFloat] = useState("");
  const [mode, setMode] = useState("notes"); // "notes" | "total"
  const [qtys, setQtys] = useState({});
  const [potOpen, setPotOpen] = useState(false);

  const [drawerEmpty, setDrawerEmpty] = useState(false);

  const breakdown = {};
  for (const d of [...COUNTED_DENOMS, ...POT_DENOMS]) if (Number(qtys[d]) > 0) breakdown[d] = Number(qtys[d]);
  const countedNaira = COUNTED_DENOMS.reduce((sum, d) => sum + d * (Number(qtys[d]) || 0), 0);
  const potNaira = POT_DENOMS.reduce((sum, d) => sum + d * (Number(qtys[d]) || 0), 0);
  // null = nothing entered yet, which is not the same as a counted zero.
  const openingNaira = mode === "notes" ? countedNaira : (float === "" ? null : Number(float));
  // Opening on zero has to be a deliberate statement, not the path of
  // least resistance. 38 of the first 41 shifts opened at ₦0 into a
  // drawer that plainly wasn't empty - the old screen asked for "cash
  // physically in drawer now" and then said "Enter 0 only when the drawer
  // is empty" - so every one of those closes read over by the cash nobody
  // declared, and the over/short meant nothing all the way through.
  const needsEmptyConfirm = openingNaira === 0;
  const hasCount = openingNaira != null && (openingNaira > 0 || drawerEmpty);

  // Derived, not stored: the picked id if it's still valid, else the
  // first free register, else the first of any.
  const registerId =
    (picked && free.some((r) => r.id === picked) && picked) ||
    free.find((r) => !r.openSession)?.id ||
    free[0]?.id ||
    "";

  const selected = free.find((r) => r.id === registerId);
  const busy = selected?.openSession;

  if (registers.length === 0) {
    return (
      <div className="max-w-md mx-auto bg-surface border border-slate-200 rounded-sm p-8 text-center space-y-3">
        <Calculator size={28} className="mx-auto text-slate-300" />
        <h2 className="text-lg font-bold text-slate-900">No register set up</h2>
        <p className="text-sm text-slate-800">
          {isOwner
            ? "Add a register to run a proper till - open a shift with a cash float, take split payments, and close out with a Z report."
            : "Ask the store owner to add a register for this branch."}
        </p>
        {isOwner && (
          <Link href="/vendor/pos/registers">
            <Button type="button">Set up a register</Button>
          </Link>
        )}
        <p className="text-xs text-slate-400">
          Just logging a sale that already happened?{" "}
          <Link href="/vendor/orders/new" className="underline hover:text-slate-600">
            Record a past sale
          </Link>
        </p>
      </div>
    );
  }

  if (free.length === 0) {
    return (
      <div className="max-w-md mx-auto bg-surface border border-slate-200 rounded-sm p-8 text-center space-y-3">
        <Calculator size={28} className="mx-auto text-slate-300" />
        <h2 className="text-lg font-bold text-slate-900">No active register</h2>
        <p className="text-sm text-slate-800">
          {isOwner ? "Reactivate a register or create a new one before opening a shift." : "Ask the store owner to activate a register for this branch."}
        </p>
        {isOwner && (
          <Link href="/vendor/pos/registers">
            <Button type="button">Manage registers</Button>
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-surface border border-slate-200 rounded-sm p-6 space-y-4">
      <div className="text-center space-y-1">
        <Calculator size={26} className="mx-auto text-brand-600" />
        <h2 className="text-lg font-bold text-slate-900">Open a register</h2>
        <p className="text-sm text-slate-800">Start a shift to begin selling.</p>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700">Register</label>
        <Select
          value={registerId}
          onChange={setPicked}
          options={free.map((r) => ({
            value: r.id,
            label: `${r.name}${r.branchName ? ` · ${r.branchName}` : ""}${r.openSession ? " (in use)" : ""}`,
          }))}
        />
      </div>

      {busy ? (
        <p className="rounded-sm border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          This register already has an open shift. Resume it on this device without changing its opening balance.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm font-medium text-slate-700">Count the ₦500 and ₦1,000 notes</label>
            <div className="flex gap-1 text-xs">
              <button
                type="button"
                onClick={() => setMode("notes")}
                className={`px-2 py-1 rounded-sm border cursor-pointer ${mode === "notes" ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-800"}`}
              >
                By notes
              </button>
              <button
                type="button"
                onClick={() => setMode("total")}
                className={`px-2 py-1 rounded-sm border cursor-pointer ${mode === "total" ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-800"}`}
              >
                Total
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-800">
            ₦500 and ₦1,000 notes only. Leave the change bowl out of this &ndash; the small
            notes for giving change aren&apos;t counted here or at close.
          </p>

          {mode === "total" ? (
            <input
              type="number"
              inputMode="decimal"
              value={float}
              onChange={(e) => setFloat(e.target.value)}
              placeholder="Total of ₦500 and ₦1,000 notes"
              min="0"
              className="w-full px-3 py-2 border border-slate-300 rounded-sm text-base tabular-nums outline-none focus:border-brand-500"
            />
          ) : (
            <div className="border border-slate-200 rounded-sm divide-y divide-slate-100">
              {COUNTED_DENOMS.map((d) => (
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
                    className="w-20 px-2 py-1 border border-slate-300 rounded-sm tabular-nums outline-none focus:border-brand-500"
                  />
                  <span className="ml-auto text-slate-700 tabular-nums">
                    ₦{(d * (Number(qtys[d]) || 0)).toLocaleString()}
                  </span>
                </div>
              ))}
              <div className="flex justify-between px-3 py-2 text-sm font-semibold">
                <span>Counted (₦500 &amp; ₦1,000)</span>
                <span className="tabular-nums">₦{countedNaira.toLocaleString()}</span>
              </div>
              {/* Optional on purpose: the shop doesn't count the bowl, and a
                  guessed figure printed on a Z is worse than none. */}
              <div className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => setPotOpen((v) => !v)}
                  className="text-xs text-slate-800 hover:underline cursor-pointer"
                >
                  {potOpen ? "Hide the change bowl" : "Counting the change bowl today? (optional)"}
                </button>
                {potOpen && (
                  <div className="mt-2 space-y-1">
                    {POT_DENOMS.map((d) => (
                      <div key={d} className="flex items-center gap-3 text-sm">
                        <span className="w-16 text-slate-600 tabular-nums">₦{d.toLocaleString()}</span>
                        <span className="text-slate-300">×</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          value={qtys[d] ?? ""}
                          onChange={(e) => setQtys((q) => ({ ...q, [d]: e.target.value }))}
                          placeholder="0"
                          className="w-20 px-2 py-1 border border-slate-300 rounded-sm tabular-nums outline-none focus:border-brand-500"
                        />
                        <span className="ml-auto text-slate-700 tabular-nums">
                          ₦{(d * (Number(qtys[d]) || 0)).toLocaleString()}
                        </span>
                      </div>
                    ))}
                    <p className="pt-1 text-xs text-slate-700">
                      Change bowl: <span className="tabular-nums">₦{potNaira.toLocaleString()}</span> &ndash; recorded only,
                      not part of the opening figure.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Zero has to be said out loud. Without this the till opens at
              ₦0 by default and every close that follows reads over by the
              cash that was really there. */}
          {needsEmptyConfirm && (
            <label className="flex items-start gap-2 rounded-sm border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 cursor-pointer">
              <input
                type="checkbox"
                checked={drawerEmpty}
                onChange={(e) => setDrawerEmpty(e.target.checked)}
                className="mt-0.5 cursor-pointer"
              />
              <span>
                <span className="font-semibold">The drawer is completely empty.</span>
                <span className="block">
                  Tick this only if there is genuinely no cash in the till. If there is any &ndash; even just
                  change &ndash; count the ₦500 and ₦1,000 notes above instead, or every close this shift will
                  read over by it.
                </span>
              </span>
            </label>
          )}
        </div>
      )}

      <Button
        type="button"
        fullWidth
        size="lg"
        loading={opening}
        disabled={!registerId || opening || (!busy && !hasCount)}
        onClick={() => busy
          ? onResume?.({ registerId, sessionId: busy.id })
          // A note count goes up as the breakdown so the server derives
          // the split itself, exactly as the close does.
          : onOpen(mode === "notes"
            ? { registerId, openingCountBreakdown: breakdown }
            : { registerId, openingFloat: Number(float || 0) })}
      >
        {busy
          ? "Resume register"
          : needsEmptyConfirm && !drawerEmpty
            ? "Count the cash in the drawer"
            : !hasCount
              ? "Count the ₦500 / ₦1,000 notes"
              : "Open register"}
      </Button>

      {isOwner && (
        <p className="text-center text-xs text-slate-400">
          <Link href="/vendor/pos/registers" className="hover:text-slate-600 underline">
            Manage registers
          </Link>
        </p>
      )}
    </div>
  );
}
