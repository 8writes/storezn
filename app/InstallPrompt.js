"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import { X, Download } from "lucide-react";

// Module-level singleton store, read via useSyncExternalStore below - this
// (not a mount-flag useEffect) is the project's lint-approved way to read
// browser-only state (matchMedia/the beforeinstallprompt
// event) without a hydration mismatch: getServerSnapshot always returns
// this frozen default, so the server render and the client's hydration
// pass agree; the real values only take over on the client's next render.
const SERVER_SNAPSHOT = { deferredPrompt: null, ready: false, isIos: false, standaloneOrDismissed: true };

let state = SERVER_SNAPSHOT;
const listeners = new Set();

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

if (typeof window !== "undefined") {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  // A storefront (a vendor's own subdomain or custom domain, see
  // resolveStoreByHost in lib/resolveStore.js) has no branding of its own
  // in the install prompt yet - it would show Storezn's name/icon on a
  // customer's home screen for someone else's store, which is wrong. Until
  // there's a per-store manifest (its own name + an icon generated from
  // the vendor's logo), suppress the prompt entirely off-platform rather
  // than show it mis-branded.
  const isPlatformHost = window.location.hostname === (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost");

  state = {
    deferredPrompt: null,
    ready: true,
    isIos,
    standaloneOrDismissed: !isPlatformHost || standalone,
  };

  window.addEventListener("beforeinstallprompt", (e) => {
    // Always suppress Chrome's own mini-infobar (which would use the same
    // mis-branded manifest) - only actually surface our UI on-platform.
    e.preventDefault();
    // A fresh event is the browser's signal that the app is not currently
    // installed. It must also clear an earlier in-memory dismissal so the
    // prompt returns after an uninstall.
    if (isPlatformHost) setState({ deferredPrompt: e, standaloneOrDismissed: false });
  });
  window.addEventListener("appinstalled", () => {
    setState({ deferredPrompt: null, standaloneOrDismissed: true });
  });
}

function dismiss() {
  // Dismiss only for this loaded page. Persisting this flag prevents the
  // prompt from returning if the user later uninstalls the app.
  setState({ standaloneOrDismissed: true });
}

async function install() {
  const { deferredPrompt } = state;
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  setState({ deferredPrompt: null });
}

// Chrome/Edge/Android fire `beforeinstallprompt` and let us trigger the
// native install dialog directly. iOS Safari never fires that event (no
// programmatic install API exists there), so it gets a static "how to"
// hint instead - the Share-sheet flow is the only way to install there.
export default function InstallPrompt() {
  const { deferredPrompt, ready, isIos, standaloneOrDismissed } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  if (!ready || standaloneOrDismissed || (!deferredPrompt && !isIos)) return null;

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
              onClick={install}
              className="mt-4 inline-flex h-11 items-center gap-2 bg-brand-600 text-white px-5 text-sm font-bold rounded-sm hover:bg-brand-700 transition-colors cursor-pointer"
            >
              <Download size={18} />
              Install Storezn
            </button>
          </>
        )}
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss install prompt" className="-mr-2 -mt-2 inline-flex h-10 w-10 shrink-0 items-center justify-center text-slate-700 hover:bg-slate-100 hover:text-slate-900 cursor-pointer rounded-sm">
        <X size={20} />
      </button>
    </div>
  );
}
