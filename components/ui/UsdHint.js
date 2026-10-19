"use client";
import { formatUsdFromNgn } from "@/lib/fxDisplay.js";

// "≈ $9.68" under a naira price field, so a vendor whose storefront offers
// dollar prices sees what customers will see before the product goes live.
// Display only - the naira figure is what gets charged. Renders nothing
// without a rate or a positive price, so it can be dropped in anywhere.
export function UsdHint({ ngn, rate, className = "" }) {
  const amount = Number(ngn);
  if (!rate || !Number.isFinite(amount) || amount <= 0) return null;
  const usd = formatUsdFromNgn(amount, rate);
  if (!usd) return null;
  return <p className={`text-xs text-slate-500 tabular-nums ${className}`}>≈ {usd}</p>;
}
