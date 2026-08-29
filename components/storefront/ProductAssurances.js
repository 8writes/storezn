"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Truck, ShieldCheck, RotateCcw } from "lucide-react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth.js";

// The trust/logistics block under the buy box: where it ships to (the
// shopper's own saved address if they're signed in), a payment/privacy
// reassurance, and the store's return policy derived from
// stores.returnWindowDays (0 = no returns).
export function ProductAssurances({ returnWindowDays, productType }) {
  const { token } = useCustomerAuth();
  const [address, setAddress] = useState(null);

  useEffect(() => {
    if (!token) {
      setAddress(null);
      return;
    }
    let cancelled = false;
    fetch("/api/v1/customer/addresses", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setAddress(data?.addresses?.[0] || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  const physical = productType === "physical";
  const days = Number(returnWindowDays) || 0;

  return (
    <div className="space-y-2.5 text-xs text-slate-600 border-t border-slate-100 pt-4">
      {physical && (
        <p className="flex items-start gap-2">
          <Truck size={14} className="shrink-0 mt-0.5 text-slate-400" />
          {address ? (
            <span>
              Shipping to{" "}
              <span className="font-medium text-slate-900">
                {[address.line1, address.city, address.state].filter(Boolean).join(", ")}
              </span>{" "}
              ·{" "}
              <Link href="/account/addresses" className="text-brand-600 hover:underline">
                Change
              </Link>
            </span>
          ) : (
            <span>Shipping to your delivery address — you&apos;ll add it at checkout.</span>
          )}
        </p>
      )}

      <p className="flex items-start gap-2">
        <ShieldCheck size={14} className="shrink-0 mt-0.5 text-slate-400" />
        <span>Safe payment &amp; privacy protection — your card and personal details are encrypted and never shared.</span>
      </p>

      <p className="flex items-start gap-2">
        <RotateCcw size={14} className="shrink-0 mt-0.5 text-slate-400" />
        {days >= 1 ? (
          <span>
            Returns accepted within {days} day{days === 1 ? "" : "s"} of delivery.
          </span>
        ) : (
          <span>No returns accepted.</span>
        )}
      </p>
    </div>
  );
}
