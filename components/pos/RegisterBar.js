"use client";
import { Calculator, Wallet, FileText, LockKeyhole, RefreshCw, Database } from "lucide-react";
import { formatKobo } from "@/lib/money.js";

function ago(iso) {
  if (!iso) return "not saved";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

// Sticky status strip on the till: which register/shift is open, the
// live expected-cash figure, offline readiness, and the shift actions.
export function RegisterBar({
  registerName,
  session,
  summary,
  heldCount = 0,
  pendingSync = 0,
  onSync,
  catalog,
  onSyncCatalog,
  onCashDrawer,
  onXReport,
  onCloseRegister,
}) {
  const expected = summary?.drawer?.expectedCash ?? session?.openingFloat ?? 0;
  return (
    <div className="bg-white border border-slate-200 rounded-sm px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <span className="flex items-center gap-1.5 font-semibold text-slate-900">
        <Calculator size={15} className="text-brand-600" />
        {registerName}
      </span>
      {pendingSync > 0 && (
        <button
          type="button"
          onClick={onSync}
          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800 cursor-pointer"
          title="Sales saved offline, waiting to sync"
        >
          <RefreshCw size={12} />
          {pendingSync} to sync
        </button>
      )}
      <span className="text-slate-500">
        Open since{" "}
        {new Date(session.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="text-slate-500">
        Drawer <span className="font-medium text-slate-900 tabular-nums">{formatKobo(expected)}</span>
      </span>
      {summary && (
        <span className="text-slate-500">
          {summary.saleCount} sale{summary.saleCount === 1 ? "" : "s"} ·{" "}
          <span className="font-medium text-slate-900 tabular-nums">{formatKobo(summary.grossSales)}</span>
        </span>
      )}
      {heldCount > 0 && <span className="text-amber-600 font-medium">{heldCount} held</span>}
      {catalog && (
        <button
          type="button"
          onClick={onSyncCatalog}
          disabled={catalog.syncing}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 cursor-pointer disabled:cursor-default"
          title="Products saved on this device for offline use - tap to refresh"
        >
          <Database size={12} className={catalog.syncing ? "animate-pulse text-brand-600" : ""} />
          {catalog.syncing
            ? "saving catalogue…"
            : `offline: ${catalog.count ? catalog.count.toLocaleString() : "0"} · ${ago(catalog.savedAt)}`}
        </button>
      )}

      <span className="ml-auto flex items-center gap-1.5">
        <button type="button" onClick={onCashDrawer} className="inline-flex items-center gap-1 px-2 py-1 rounded-sm border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
          <Wallet size={13} /> Cash
        </button>
        <button type="button" onClick={onXReport} className="inline-flex items-center gap-1 px-2 py-1 rounded-sm border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
          <FileText size={13} /> X report
        </button>
        <button type="button" onClick={onCloseRegister} className="inline-flex items-center gap-1 px-2 py-1 rounded-sm border border-slate-300 text-xs font-medium text-red-600 hover:bg-red-50 cursor-pointer">
          <LockKeyhole size={13} /> Close
        </button>
      </span>
    </div>
  );
}
