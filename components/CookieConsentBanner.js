"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Cookie, Settings2, X } from "lucide-react";

const CONSENT_KEY = "storezn_cookie_consent_v1";
const PLATFORM_ROUTES = /^\/(vendor|super-admin|dashboard|profile)(\/|$)/;

function saveConsent(preferences) {
  const value = {
    version: 1,
    savedAt: new Date().toISOString(),
    essential: true,
    analytics: Boolean(preferences.analytics),
    marketing: Boolean(preferences.marketing),
  };
  localStorage.setItem(CONSENT_KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("storezn:cookie-consent", { detail: value }));
}

export default function CookieConsentBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [preferences, setPreferences] = useState({ analytics: true, marketing: false });

  useEffect(() => {
    if (PLATFORM_ROUTES.test(pathname || "")) return;
    queueMicrotask(() => {
      try {
        setVisible(!localStorage.getItem(CONSENT_KEY));
      } catch {
        setVisible(false);
      }
    });
  }, [pathname]);

  if (!visible) return null;

  const accept = (nextPreferences) => {
    saveConsent(nextPreferences);
    setVisible(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] px-3 pb-3 sm:px-5 sm:pb-5">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-sm border border-slate-200 bg-surface shadow-xl">
        <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-start sm:p-5">
          <div className="flex gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-brand-100 text-brand-700">
              <Cookie size={20} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Storezn uses cookies</p>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                We use essential cookies to keep the site working, and optional cookies to understand what is useful and improve the experience.
                Read our <Link href="/privacy" className="font-medium text-brand-700 hover:text-brand-800">privacy policy</Link>.
              </p>

              {expanded && (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <label className="flex items-start gap-3 rounded-sm border border-slate-200 bg-slate-50 p-3">
                    <input type="checkbox" checked disabled className="mt-1 h-4 w-4 accent-brand-600" />
                    <span>
                      <span className="block text-sm font-medium text-slate-900">Essential cookies</span>
                      <span className="block text-xs leading-5 text-slate-600">Required for login, cart, checkout, and security.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 rounded-sm border border-slate-200 bg-slate-50 p-3">
                    <input
                      type="checkbox"
                      checked={preferences.analytics}
                      onChange={(e) => setPreferences((p) => ({ ...p, analytics: e.target.checked }))}
                      className="mt-1 h-4 w-4 accent-brand-600"
                    />
                    <span>
                      <span className="block text-sm font-medium text-slate-900">Analytics cookies</span>
                      <span className="block text-xs leading-5 text-slate-600">Help us improve pages and flows.</span>
                    </span>
                  </label>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:min-w-44">
            <button
              type="button"
              onClick={() => accept({ analytics: true, marketing: false })}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              <Check size={16} aria-hidden="true" />
              Accept all
            </button>
            <button
              type="button"
              onClick={() => accept({ analytics: false, marketing: false })}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-slate-300 bg-surface px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              <X size={16} aria-hidden="true" />
              Essentials only
            </button>
            <button
              type="button"
              onClick={() => (expanded ? accept(preferences) : setExpanded(true))}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-sm px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <Settings2 size={16} aria-hidden="true" />
              {expanded ? "Save choices" : "Manage"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
