"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import { X, Download } from "lucide-react";

const DISMISSED_KEY = "pwa_install_dismissed";

// Module-level singleton store, read via useSyncExternalStore below - this
// (not a mount-flag useEffect) is the project's lint-approved way to read
// browser-only state (matchMedia/localStorage/the beforeinstallprompt
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
    standaloneOrDismissed: !isPlatformHost || standalone || !!localStorage.getItem(DISMISSED_KEY),
  };

  window.addEventListener("beforeinstallprompt", (e) => {
    // Always suppress Chrome's own mini-infobar (which would use the same
    // mis-branded manifest) - only actually surface our UI on-platform.
    e.preventDefault();
    if (isPlatformHost) setState({ deferredPrompt: e });
  });
  window.addEventListener("appinstalled", () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setState({ deferredPrompt: null, standaloneOrDismissed: true });
  });
}

function dismiss() {
  localStorage.setItem(DISMISSED_KEY, "1");
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
    <div className="fixed bottom-4 inset-x-4 sm:left-auto sm:right-4 sm:w-96 z-50 bg-surface border border-slate-200 rounded-sm shadow-lg p-4 flex items-start gap-3 animate-fade-in">
      <Image src="/icon-192.png" alt="" width={40} height={40} unoptimized className="rounded-sm shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900">Install Storezn</p>
        {isIos ? (
          <p className="text-xs text-slate-800 mt-0.5">
            Tap the Share icon, then &quot;Add to Home Screen&quot; for instant access.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-800 mt-0.5">Add it to your home screen for instant access.</p>
            <button
              type="button"
              onClick={install}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold bg-brand-600 text-white px-3 py-1.5 rounded-sm hover:bg-brand-700 transition-colors cursor-pointer"
            >
              <Download size={14} />
              Install
            </button>
          </>
        )}
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-slate-700 hover:text-slate-700 cursor-pointer">
        <X size={16} />
      </button>
    </div>
  );
}
