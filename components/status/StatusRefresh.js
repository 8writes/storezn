"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function StatusRefresh() {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();

  const refresh = () => startTransition(() => router.refresh());

  useEffect(() => {
    const timer = window.setInterval(() => startTransition(() => router.refresh()), 60_000);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={refreshing}
      className="inline-flex h-9 items-center gap-2 rounded-sm border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
    >
      <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
      Refresh
    </button>
  );
}
