"use client";

import Image from "next/image";
import { X, Download } from "lucide-react";
import { dismissPwaInstall, installPwa, usePwaInstall } from "@/lib/pwaInstall.js";

// Chrome/Edge/Android fire `beforeinstallprompt` and let us trigger the
// native install dialog directly. iOS Safari never fires that event (no
// programmatic install API exists there), so it gets a static "how to"
// hint instead - the Share-sheet flow is the only way to install there.
export default function InstallPrompt() {
  const { deferredPrompt, ready, isIos, isPlatformHost, standalone, dismissed } = usePwaInstall();

  if (!ready || !isPlatformHost || standalone || dismissed || (!deferredPrompt && !isIos)) return null;

  return (
    <div className="fixed bottom-3 inset-x-3 sm:bottom-6 sm:left-auto sm:right-6 sm:w-[32rem] z-50 bg-surface border-2 border-brand-500 rounded-sm shadow-2xl p-5 sm:p-6 flex items-start gap-4 animate-fade-in">
      <Image src="/icon-192.png" alt="" width={56} height={56} unoptimized className="rounded-sm shrink-0 shadow-sm" />
      <div className="flex-1 min-w-0">
        <p className="text-lg font-bold text-slate-900">Install Storezn</p>
        {isIos ? (
          <p className="text-sm leading-6 text-slate-800 mt-1">
            Tap the Share icon, then &quot;Add to Home Screen&quot; for instant access.
          </p>
        ) : (
          <>
            <p className="text-sm leading-6 text-slate-800 mt-1">Add it to your home screen for faster access and a focused app experience.</p>
            <button
              type="button"
              onClick={installPwa}
              className="mt-4 inline-flex h-11 items-center gap-2 bg-brand-600 text-white px-5 text-sm font-bold rounded-sm hover:bg-brand-700 transition-colors cursor-pointer"
            >
              <Download size={18} />
              Install Storezn
            </button>
          </>
        )}
      </div>
      <button type="button" onClick={dismissPwaInstall} aria-label="Dismiss install prompt" className="-mr-2 -mt-2 inline-flex h-10 w-10 shrink-0 items-center justify-center text-slate-700 hover:bg-slate-100 hover:text-slate-900 cursor-pointer rounded-sm">
        <X size={20} />
      </button>
    </div>
  );
}
