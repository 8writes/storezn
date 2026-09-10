"use client";
import { useState } from "react";
import Link from "next/link";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { Select } from "@/components/ui/Select.js";

// Shown on the till when no shift is open. Pick a register, enter the
// cash already in the drawer, open. Registers already running a session
// elsewhere are shown as busy.
export function OpenRegisterPanel({ registers, isOwner, onOpen, opening }) {
  const free = registers.filter((r) => r.isActive);
  const [picked, setPicked] = useState("");
  const [float, setFloat] = useState("");

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
        <p className="text-sm text-slate-500">
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

  return (
    <div className="max-w-md mx-auto bg-surface border border-slate-200 rounded-sm p-6 space-y-4">
      <div className="text-center space-y-1">
        <Calculator size={26} className="mx-auto text-brand-600" />
        <h2 className="text-lg font-bold text-slate-900">Open a register</h2>
        <p className="text-sm text-slate-500">Start a shift to begin selling.</p>
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

      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700">Opening cash float</label>
        <input
          type="number"
          inputMode="decimal"
          value={float}
          onChange={(e) => setFloat(e.target.value)}
          placeholder="0"
          className="w-full px-3 py-2 border border-slate-300 rounded-sm text-base tabular-nums outline-none focus:border-brand-500"
        />
        <p className="text-xs text-slate-500">The cash already in the drawer right now.</p>
      </div>

      <Button
        type="button"
        fullWidth
        size="lg"
        loading={opening}
        disabled={!registerId || !!busy}
        onClick={() => onOpen({ registerId, openingFloat: Number(float || 0) })}
      >
        {busy ? "That register is already open" : "Open register"}
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
