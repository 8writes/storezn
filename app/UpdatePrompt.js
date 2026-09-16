"use client";

import { useEffect, useRef, useState } from "react";

const CURRENT = process.env.NEXT_PUBLIC_BUILD_ID || "";
const POLL_MS = 5 * 60 * 1000;

// Watches for a newer deploy and offers a one-tap reload. A register tab
// can stay open for days; without this it would keep running stale code
// (and stale offline caches) until someone happened to hard-refresh.
export default function UpdatePrompt() {
  const [latest, setLatest] = useState(null);
  const dismissed = useRef(null);
  const reloading = useRef(false);

  useEffect(() => {
    if (!CURRENT) return;

    const check = async () => {
      if (reloading.current || document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { build } = await res.json();
        if (build && build !== CURRENT && build !== dismissed.current) setLatest(build);
      } catch {
        /* offline - nothing to update to anyway */
      }
    };

    const first = setTimeout(check, 12000);
    const iv = setInterval(check, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", check);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", check);
    };
  }, []);

  if (!latest) return null;

  const reload = () => {
    reloading.current = true;
    navigator.serviceWorker
      ?.getRegistration()
      .then((r) => r?.update())
      .catch(() => {})
      .finally(() => window.location.reload());
  };

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 rounded-sm border border-slate-200 bg-surface px-4 py-3 shadow-lg max-w-md w-full sm:w-auto">
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-slate-900">A new version is ready</p>
          <p className="text-xs text-slate-800">Reload to get the latest updates.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            dismissed.current = latest;
            setLatest(null);
          }}
          className="text-xs font-medium text-slate-800 hover:text-slate-800 cursor-pointer shrink-0"
        >
          Later
        </button>
        <button
          type="button"
          onClick={reload}
          className="rounded-sm bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 cursor-pointer shrink-0"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
