"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
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
const MANUAL_ADDRESS_ID = "__manual__";

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
  const [fieldErrors, setFieldErrors] = useState({});
  const submitLockRef = useRef(false);

  const loadCart = useCallback(async ({ state = "", city = "" } = {}) => {
    const params = new URLSearchParams();
    if (state) params.set("state", state);
    if (city) params.set("city", city);
    const url = params.toString() ? `/api/v1/storefront/cart?${params}` : "/api/v1/storefront/cart";
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "Could not load your cart");
    setCart(data);
    return data;
  }, [token]);

  useEffect(() => {
    if (authLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCart()
      .catch(() => toast.error("Could not load your cart"))
      .finally(() => setLoading(false));
  }, [authLoading, loadCart]);

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
  const usesSavedAddress = !!user && addresses.length > 0 && addressId !== MANUAL_ADDRESS_ID;
  const selectedAddress = usesSavedAddress ? addresses.find((a) => a.id === addressId) : null;
  const effectiveState = needsShipping ? (selectedAddress?.state || manualAddress.state) : "";
  const effectiveCity = needsShipping ? (selectedAddress?.city || manualAddress.city) : "";

  const cleanManualAddress = () => ({
    ...manualAddress,
    fullName: manualAddress.fullName.trim(),
    phone: manualAddress.phone.trim(),
    line1: manualAddress.line1.trim(),
    line2: manualAddress.line2.trim(),
    city: manualAddress.city.trim(),
    state: manualAddress.state.trim(),
    country: manualAddress.country || "Nigeria",
  });

  const validateCheckout = () => {
    const errors = {};
    if (!user) {
      const email = guestEmail.trim();
      if (!email) errors.guestEmail = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.guestEmail = "Enter a valid email address";
    }

    if (needsShipping) {
      if (usesSavedAddress) {
        if (!addressId) errors.addressId = "Select a delivery address";
      } else {
        const address = cleanManualAddress();
        if (!address.fullName) errors.fullName = "Full name is required";
        if (!address.phone) errors.phone = "Phone number is required";
        if (!address.line1) errors.line1 = "Address line is required";
        if (!address.state) errors.state = "State is required";
        if (!address.city) errors.city = "City/LGA is required";
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Refetches the cart's totals with the currently selected/entered
  // delivery address, so the shipping fee (and dependent Total) update
  // live as the shopper picks a saved address or types one in - see
  // GET /api/v1/storefront/cart's ?state=&city= handling.
  useEffect(() => {
    if (!needsShipping || !effectiveState) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCart({ state: effectiveState, city: effectiveCity })
      .catch(() => {});
  }, [loadCart, needsShipping, effectiveState, effectiveCity]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitLockRef.current) return;
    if (!validateCheckout()) {
      toast.error("Please complete the highlighted checkout details");
      return;
    }
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const payload = {};
      if (!user) payload.guestEmail = guestEmail.trim();
      if (note.trim()) payload.note = note.trim();
      if (needsShipping) {
        if (usesSavedAddress && addressId) payload.addressId = addressId;
        else payload.shippingAddress = cleanManualAddress();
      }

      const res = await fetch("/api/v1/storefront/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          await loadCart({ state: effectiveState, city: effectiveCity }).catch(() => null);
        }
        throw new Error(data.error || "Checkout failed");
      }

      try {
        new URL(data.authorizationUrl);
      } catch {
        throw new Error("The payment link returned by Paystack was invalid. Please try again.");
      }
      window.location.href = data.authorizationUrl;
    } catch (err) {
      toast.error(err.message || "Checkout failed");
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  if (loading || authLoading) return <p className="text-center text-slate-700 py-20">Loading checkout…</p>;

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

      <form onSubmit={handleSubmit} className="space-y-8" noValidate>
        {!user && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-700 uppercase tracking-wide">Contact</p>
            <Input label="Email" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} error={fieldErrors.guestEmail} required />
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
                options={[
                  ...addresses.map((a) => ({ value: a.id, label: `${a.fullName}, ${a.line1}, ${a.city}` })),
                  { value: MANUAL_ADDRESS_ID, label: "Use a new address" },
                ]}
                value={addressId}
                onChange={setAddressId}
                error={fieldErrors.addressId}
                required
              />
            ) : null}

            {!usesSavedAddress && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Full name" value={manualAddress.fullName} onChange={(e) => setManualAddress((a) => ({ ...a, fullName: e.target.value }))} error={fieldErrors.fullName} required />
                <Input label="Phone" value={manualAddress.phone} onChange={(e) => setManualAddress((a) => ({ ...a, phone: e.target.value }))} error={fieldErrors.phone} required />
                <Input label="Address line 1" className="sm:col-span-2" value={manualAddress.line1} onChange={(e) => setManualAddress((a) => ({ ...a, line1: e.target.value }))} error={fieldErrors.line1} required />
                <Input label="Address line 2 (optional)" className="sm:col-span-2" value={manualAddress.line2} onChange={(e) => setManualAddress((a) => ({ ...a, line2: e.target.value }))} />
                <Select
                  label="State"
                  options={NIGERIA_STATE_OPTIONS}
                  value={manualAddress.state}
                  onChange={(v) => setManualAddress((a) => ({ ...a, state: v, city: "" }))}
                  error={fieldErrors.state}
                  required
                />
                <Select
                  label="City/LGA"
                  options={getLgaOptions(manualAddress.state)}
                  value={manualAddress.city}
                  onChange={(v) => setManualAddress((a) => ({ ...a, city: v }))}
                  disabled={!manualAddress.state}
                  error={fieldErrors.city}
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
            <p className="text-xs text-slate-800 -mt-1">
              This seller confirms delivery pricing after you order. You won&apos;t be charged for shipping now, it&apos;s arranged directly with the seller.
            </p>
          )}
          {cart.feeChargedToCustomer && cart.platformFee > 0 && (
            <div className="flex justify-between text-sm text-slate-700">
              <span>Platform fee</span>
              <span>{formatCurrency(cart.platformFee)}</span>
            </div>
          )}
          {!cart.feeChargedToCustomer && cart.platformFeeShortfall > 0 && (!needsShipping || effectiveState) && (
            <div className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              This order is too small for the store to absorb its full platform fee. Add more items to continue.
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-slate-100 font-semibold text-slate-900 text-base">
            <span>Total</span>
            <span>{formatCurrency(cart.total ?? cart.subtotal)}</span>
          </div>
        </div>

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={submitting}
          disabled={cart.platformFeeShortfall > 0 && (!needsShipping || effectiveState)}
        >
          Pay now
        </Button>
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>Powered by <strong className="font-semibold text-slate-700">Storezn</strong></span>
          <span aria-hidden="true">&middot;</span>
          <span className="inline-flex items-center gap-1.5">Secured by Paystack</span>
        </p>
      </form>
    </div>
  );
}
