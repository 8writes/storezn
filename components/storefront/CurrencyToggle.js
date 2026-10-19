"use client";
import { useMoney } from "./Money.js";

// ₦ / $ switch in the storefront header. Only rendered when the store offers
// dollar prices and a current rate exists. Display only - checkout always
// charges naira.
export function CurrencyToggle({ themed = false }) {
  const { available, currency, setCurrency, rate } = useMoney();
  if (!available) return null;

  const base = "px-2 py-1 text-xs font-semibold rounded-full transition-colors cursor-pointer";
  const on = themed ? "bg-white text-brand-700" : "bg-slate-900 text-white";
  const off = themed ? "text-white/80 hover:text-white" : "text-slate-600 hover:text-slate-900";

  return (
    <div
      role="group"
      aria-label="Show prices in"
      title={`Dollar prices use the ${rate.label} rate. You're always charged in naira.`}
      className={`inline-flex items-center gap-0.5 rounded-full p-0.5 ${themed ? "bg-white/15" : "bg-slate-100"}`}
    >
      {[
        { code: "NGN", label: "₦" },
        { code: "USD", label: "$" },
      ].map((option) => (
        <button
          key={option.code}
          type="button"
          aria-pressed={currency === option.code}
          aria-label={option.code === "NGN" ? "Show prices in naira" : "Show prices in dollars"}
          onClick={() => setCurrency(option.code)}
          className={`${base} ${currency === option.code ? on : off}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
