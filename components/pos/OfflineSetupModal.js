"use client";
import { useState } from "react";
import { X, Check, Loader2, WifiOff, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { prepareOfflineShell, catalogMeta } from "@/lib/posOffline.js";

function StepRow({ state, title, detail }) {
  const icon =
    state === "working" ? (
      <Loader2 size={16} className="animate-spin text-brand-600" />
    ) : state === "ok" ? (
      <Check size={16} className="text-emerald-600" />
    ) : state === "warn" ? (
      <AlertTriangle size={16} className="text-amber-600" />
    ) : (
      <span className="block w-2 h-2 rounded-full bg-slate-300" />
    );
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 w-4 flex justify-center shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{title}</p>
        {detail && <p className="text-xs text-slate-500">{detail}</p>}
      </div>
    </div>
  );
}

// One-tap "make this device ready to sell offline": caches the register
// screen + its files through the service worker, and pulls the whole
// catalogue into local storage.
export function OfflineSetupModal({ storeId, catalog, pendingSync = 0, onSyncCatalog, onClose }) {
  const [phase, setPhase] = useState("idle"); // idle | running | done
  const [shell, setShell] = useState({ state: "pending", detail: "" });
  const [cat, setCat] = useState({
    state: catalog?.count ? "ok" : "pending",
    detail: catalog?.count ? `${catalog.count.toLocaleString()} products saved` : "",
  });
  const online = typeof navigator === "undefined" ? true : navigator.onLine;

  const run = async () => {
    setPhase("running");

    setShell({ state: "working", detail: "" });
    try {
      const r = await prepareOfflineShell();
      setShell(
        r.swReady && r.cached > 0
          ? { state: "ok", detail: `${r.cached} files cached` }
          : { state: "warn", detail: "Couldn't fully cache the app - reload once online and try again" },
      );
    } catch {
      setShell({ state: "warn", detail: "Couldn't cache the app" });
    }

    setCat({ state: "working", detail: "" });
    try {
      await onSyncCatalog();
      const meta = await catalogMeta(storeId).catch(() => null);
      setCat(
        meta?.count
          ? { state: "ok", detail: `${meta.count.toLocaleString()} products saved` }
          : { state: "warn", detail: "Catalogue didn't save - check your connection" },
      );
    } catch {
      setCat({ state: "warn", detail: "Catalogue didn't save" });
    }

    setPhase("done");
  };

  const allOk = shell.state === "ok" && cat.state === "ok";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface rounded-t-sm sm:rounded-sm shadow-xl w-full sm:max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-900">Set up offline</p>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-4">
          <p className="text-xs text-slate-500 mb-2">
            Prepares this device so the register opens and keeps selling with no internet. Do it once per device, and again after an app update.
          </p>

          {!online && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-2.5 py-1.5 mb-2">
              <WifiOff size={13} />
              You&apos;re offline right now - connect to the internet to set this up.
            </p>
          )}

          <div className="divide-y divide-slate-100">
            <StepRow state={shell.state} title="App screen &amp; files" detail={shell.detail} />
            <StepRow state={cat.state} title="Product catalogue" detail={cat.detail} />
            <StepRow
              state={pendingSync > 0 ? "warn" : "ok"}
              title="Unsynced sales"
              detail={pendingSync > 0 ? `${pendingSync} waiting - will sync when back online` : "none"}
            />
          </div>

          {phase === "done" && allOk && (
            <p className="mt-3 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-sm px-3 py-2">
              This device is ready to sell offline.
            </p>
          )}
        </div>

        <div className="p-4 border-t border-slate-100">
          <Button
            type="button"
            fullWidth
            size="lg"
            loading={phase === "running"}
            disabled={!online || phase === "running"}
            onClick={run}
          >
            {phase === "done" ? "Run again" : "Set up now"}
          </Button>
        </div>
      </div>
    </div>
  );
}
