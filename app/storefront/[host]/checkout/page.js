"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useCustomerAuth } from "@/hooks/useCustomerAuth.js";
import { Input } from "@/components/ui/Input.js";
import { Textarea } from "@/components/ui/Textarea.js";
import { Select } from "@/components/ui/Select.js";
import { Button } from "@/components/ui/Button.js";
import { formatCurrency } from "@/lib/format.js";
import { NIGERIA_STATE_OPTIONS, getLgaOptions } from "@/lib/nigeria.js";

const EMPTY_ADDRESS = { fullName: "", phone: "", line1: "", line2: "", city: "", state: "", country: "Nigeria" };

export default function CheckoutPage() {
  const { user, token, loading: authLoading } = useCustomerAuth();

  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guestEmail, setGuestEmail] = useState("");
  const [note, setNote] = useState("");
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState("");
  const [manualAddress, setManualAddress] = useState(EMPTY_ADDRESS);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/v1/storefront/cart")
      .then((res) => res.json())
      .then(setCart)
      .catch(() => toast.error("Could not load your cart"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch("/api/v1/customer/addresses", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        setAddresses(data.addresses || []);
        const def = data.addresses?.find((a) => a.isDefault) || data.addresses?.[0];
        if (def) setAddressId(def.id);
      })
      .catch(() => {});
  }, [token]);

  const needsShipping = cart?.items?.some((i) => i.product.productType === "physical");
  const selectedAddress = user ? addresses.find((a) => a.id === addressId) : null;
  const effectiveState = needsShipping ? (selectedAddress?.state || manualAddress.state) : "";
  const effectiveCity = needsShipping ? (selectedAddress?.city || manualAddress.city) : "";

  // Refetches the cart's totals with the currently selected/entered
  // delivery address, so the shipping fee (and dependent Total) update
  // live as the shopper picks a saved address or types one in - see
  // GET /api/v1/storefront/cart's ?state=&city= handling.
  useEffect(() => {
    if (!needsShipping || !effectiveState) return;
    const params = new URLSearchParams({ state: effectiveState });
    if (effectiveCity) params.set("city", effectiveCity);
    fetch(`/api/v1/storefront/cart?${params}`)
      .then((res) => res.json())
      .then(setCart)
      .catch(() => {});
  }, [needsShipping, effectiveState, effectiveCity]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {};
      if (!user) payload.guestEmail = guestEmail;
      if (note.trim()) payload.note = note.trim();
      if (needsShipping) {
        if (user && addressId) payload.addressId = addressId;
        else if (!user) payload.shippingAddress = manualAddress;
      }

      const res = await fetch("/api/v1/storefront/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");

      window.location.href = data.authorizationUrl;
    } catch (err) {
      toast.error(err.message || "Checkout failed");
      setSubmitting(false);
    }
  };

  if (loading || authLoading) return <p className="text-center text-slate-700 py-20">Loading…</p>;

  if (!cart || cart.items.length === 0) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-slate-700">Your cart is empty.</p>
        <Link href="/" className="text-brand-600 hover:underline text-sm">Continue shopping</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Checkout</h1>

      <form onSubmit={handleSubmit} className="space-y-8">
        {!user && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-700 uppercase tracking-wide">Contact</p>
            <Input label="Email" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} required />
            <p className="text-xs text-slate-700">
              Have an account?{" "}
              <Link href="/login?next=checkout" className="text-slate-900 underline underline-offset-2">Sign in</Link> for faster checkout.
            </p>
          </div>
        )}

        {needsShipping && (
          <div className="space-y-3 pt-6 border-t border-slate-200">
            <p className="text-xs font-medium text-slate-700 uppercase tracking-wide">Shipping address</p>

            {user && addresses.length > 0 ? (
              <Select
                label="Deliver to"
                options={addresses.map((a) => ({ value: a.id, label: `${a.fullName}, ${a.line1}, ${a.city}` }))}
                value={addressId}
                onChange={setAddressId}
                required
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Full name" value={manualAddress.fullName} onChange={(e) => setManualAddress((a) => ({ ...a, fullName: e.target.value }))} required />
                <Input label="Phone" value={manualAddress.phone} onChange={(e) => setManualAddress((a) => ({ ...a, phone: e.target.value }))} required />
                <Input label="Address line 1" className="sm:col-span-2" value={manualAddress.line1} onChange={(e) => setManualAddress((a) => ({ ...a, line1: e.target.value }))} required />
                <Input label="Address line 2 (optional)" className="sm:col-span-2" value={manualAddress.line2} onChange={(e) => setManualAddress((a) => ({ ...a, line2: e.target.value }))} />
                <Select
                  label="State"
                  options={NIGERIA_STATE_OPTIONS}
                  value={manualAddress.state}
                  onChange={(v) => setManualAddress((a) => ({ ...a, state: v, city: "" }))}
                  required
                />
                <Select
                  label="City/LGA"
                  options={getLgaOptions(manualAddress.state)}
                  value={manualAddress.city}
                  onChange={(v) => setManualAddress((a) => ({ ...a, city: v }))}
                  disabled={!manualAddress.state}
                  required
                />
              </div>
            )}
          </div>
        )}

        <div className="pt-6 border-t border-slate-200">
          <Textarea label="Order note (optional)" placeholder="Special instructions for this order..." rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <div className="space-y-2 pt-6 border-t border-slate-200">
          <p className="text-xs font-medium text-slate-700 uppercase tracking-wide mb-3">Order summary</p>
          {cart.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm text-slate-700">
              <span>{item.product.name}{item.variant ? ` (${Object.values(item.variant.options).join(", ")})` : ""} × {item.quantity}</span>
              <span>{formatCurrency(item.lineTotal)}</span>
            </div>
          ))}
          {needsShipping && (
            <div className="flex justify-between pt-2 border-t border-slate-100 text-sm text-slate-700">
              <span>Shipping</span>
              <span>
                {!effectiveState
                  ? "Enter your address"
                  : cart.shippingFeeTBD
                  ? "To be determined"
                  : formatCurrency(cart.shippingFee || 0)}
              </span>
            </div>
          )}
          {needsShipping && effectiveState && cart.shippingFeeTBD && (
            <p className="text-xs text-slate-500 -mt-1">
              This seller confirms delivery pricing after you order. You won&apos;t be charged for shipping now, it&apos;s arranged directly with the seller.
            </p>
          )}
          {cart.feeChargedToCustomer && cart.platformFee > 0 && (
            <div className="flex justify-between text-sm text-slate-700">
              <span>Platform fee</span>
              <span>{formatCurrency(cart.platformFee)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-slate-100 font-semibold text-slate-900 text-base">
            <span>Total</span>
            <span>{formatCurrency(cart.total ?? cart.subtotal)}</span>
          </div>
        </div>

        <Button type="submit" fullWidth size="lg" loading={submitting}>Pay now</Button>
      </form>
    </div>
  );
}
