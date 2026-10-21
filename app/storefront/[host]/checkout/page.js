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
import { useMoney } from "@/components/storefront/Money.js";
import { NIGERIA_STATE_OPTIONS, getLgaOptions } from "@/lib/nigeria.js";
import { COUNTRY_OPTIONS, NIGERIA, normaliseCountry } from "@/lib/countries.js";
import { safeFetch } from "@/lib/fetchError.js";

const EMPTY_ADDRESS = {
  fullName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  country: NIGERIA,
  postalCode: "",
};
const MANUAL_ADDRESS_ID = "__manual__";

export default function CheckoutPage() {
  const { user, token, loading: authLoading } = useCustomerAuth();
  // ₦ or $ for display; formatNaira for the amount actually charged.
  const { format, formatNaira, isUsd, rate } = useMoney();

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
  // "Paying with a card from outside Nigeria" (stores that accept
  // international payments only). null = the customer hasn't touched it,
  // so it follows the view: on while browsing in $, off in ₦. Derived
  // rather than copied into state, so it's right even when the view only
  // settles after hydration.
  const [foreignCardChoice, setForeignCardChoice] = useState(null);
  const foreignCard = foreignCardChoice ?? isUsd;
  // Read inside loadCart via a ref so loadCart's identity (and the effects
  // keyed on it) doesn't change when the switch flips - the dedicated
  // effect below refetches instead.
  const internationalRef = useRef(false);

  const loadCart = useCallback(
    async ({ country = "", state = "", city = "" } = {}) => {
      const params = new URLSearchParams();
      if (country && country !== NIGERIA) params.set("country", country);
      if (state) params.set("state", state);
      if (city) params.set("city", city);
      if (internationalRef.current) params.set("international", "1");
      const url = params.toString()
        ? `/api/v1/storefront/cart?${params}`
        : "/api/v1/storefront/cart";
      const res = await safeFetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not load your cart");
      setCart(data);
      return data;
    },
    [token],
  );

  useEffect(() => {
    if (authLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCart()
      .catch(() => toast.error("Could not load your cart"))
      .finally(() => setLoading(false));
  }, [authLoading, loadCart]);

  useEffect(() => {
    if (!token) return;
    safeFetch("/api/v1/customer/addresses", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setAddresses(data.addresses || []);
        const def =
          data.addresses?.find((a) => a.isDefault) || data.addresses?.[0];
        if (def) setAddressId(def.id);
      })
      .catch(() => {});
  }, [token]);

  const needsShipping = cart?.items?.some(
    (i) => i.product.productType === "physical",
  );
  const usesSavedAddress =
    !!user && addresses.length > 0 && addressId !== MANUAL_ADDRESS_ID;
  const selectedAddress = usesSavedAddress
    ? addresses.find((a) => a.id === addressId)
    : null;
  const effectiveCountry = normaliseCountry(
    selectedAddress ? selectedAddress.country : manualAddress.country,
  );
  const abroad = effectiveCountry !== NIGERIA;
  const effectiveState = needsShipping
    ? selectedAddress
      ? selectedAddress.state || ""
      : manualAddress.state
    : "";
  const effectiveCity = needsShipping
    ? selectedAddress
      ? selectedAddress.city || ""
      : manualAddress.city
    : "";
  // Enough to price delivery: a Nigerian address needs its state; one
  // abroad can be priced from its country alone (see lib/shipping.js).
  const hasDestination = needsShipping && (abroad || !!effectiveState);
  const destination = {
    country: effectiveCountry,
    state: effectiveState,
    city: effectiveCity,
  };
  // The cart endpoint re-answers this every time the address changes (see
  // its `deliverable`), so the shopper is told before filling in the rest
  // of the form rather than at the payment step. POST /checkout refuses it
  // again regardless - this is UX, not the control.
  const undeliverable = hasDestination && cart?.deliverable === false;
  const undeliverableWhere = abroad ? effectiveCountry : effectiveState;
  // A country picker only when the store delivers abroad - Nigeria plus the
  // countries it ships to (all of them when it hasn't limited the list).
  const intlDelivery = !!cart?.internationalDeliveryEnabled;
  const shipsTo =
    Array.isArray(cart?.deliveryCountries) && cart.deliveryCountries.length > 0
      ? cart.deliveryCountries
      : null;
  const countryOptions = shipsTo
    ? COUNTRY_OPTIONS.filter(
        (o) => o.value === NIGERIA || shipsTo.includes(o.value),
      )
    : COUNTRY_OPTIONS;
  const manualAbroad = normaliseCountry(manualAddress.country) !== NIGERIA;
  // Only stores that accept international payments offer the choice; the
  // server ignores it everywhere else anyway (lib/feePolicy.js).
  const intlAvailable = !!cart?.internationalPaymentsEnabled;
  const international = intlAvailable && foreignCard;

  // Reprice when the foreign-card switch flips, so the gateway fee and the
  // total shown always match what checkout will charge. The ref is synced
  // first (effects run in order), so this fetch - and the address refetch
  // below - read the new value.
  const cartLoaded = !!cart;
  useEffect(() => {
    internationalRef.current = international;
    if (!cartLoaded || !intlAvailable) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCart(destination).catch(() => {});
    // Deliberately keyed on the switch only - address changes have their
    // own refetch below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [international]);

  const cleanManualAddress = () => ({
    ...manualAddress,
    fullName: manualAddress.fullName.trim(),
    phone: manualAddress.phone.trim(),
    line1: manualAddress.line1.trim(),
    line2: manualAddress.line2.trim(),
    city: manualAddress.city.trim(),
    state: manualAddress.state.trim(),
    country: normaliseCountry(manualAddress.country),
    postalCode: manualAddress.postalCode.trim(),
  });

  const validateCheckout = () => {
    const errors = {};
    if (!user) {
      const email = guestEmail.trim();
      if (!email) errors.guestEmail = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        errors.guestEmail = "Enter a valid email address";
    }

    if (needsShipping) {
      if (usesSavedAddress) {
        if (!addressId) errors.addressId = "Select a delivery address";
      } else {
        const address = cleanManualAddress();
        if (!address.fullName) errors.fullName = "Full name is required";
        if (!address.phone) errors.phone = "Phone number is required";
        if (!address.line1) errors.line1 = "Address line is required";
        if (manualAbroad) {
          if (!address.city) errors.city = "City / town is required";
        } else {
          if (!address.state) errors.state = "State is required";
          if (!address.city) errors.city = "City/LGA is required";
        }
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Refetches the cart's totals with the currently selected/entered
  // delivery address, so the shipping fee (and dependent Total) update
  // live as the shopper picks a saved address or types one in - see
  // GET /api/v1/storefront/cart's ?country=&state=&city= handling. Abroad,
  // state and city are typed free text, so that refetch waits for a pause
  // in typing instead of firing on every key.
  useEffect(() => {
    if (!hasDestination) return undefined;
    const timer = setTimeout(
      () => {
        loadCart({
          country: effectiveCountry,
          state: effectiveState,
          city: effectiveCity,
        }).catch(() => {});
      },
      abroad ? 400 : 0,
    );
    return () => clearTimeout(timer);
  }, [
    loadCart,
    hasDestination,
    abroad,
    effectiveCountry,
    effectiveState,
    effectiveCity,
  ]);

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
      if (intlAvailable) payload.international = international;
      if (needsShipping) {
        if (usesSavedAddress && addressId) payload.addressId = addressId;
        else payload.shippingAddress = cleanManualAddress();
      }

      const res = await safeFetch("/api/v1/storefront/checkout", {
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
          await loadCart(destination).catch(() => null);
        }
        throw new Error(data.error || "Checkout failed");
      }

      try {
        new URL(data.authorizationUrl);
      } catch {
        throw new Error(
          "The payment link returned by Paystack was invalid. Please try again.",
        );
      }
      window.location.href = data.authorizationUrl;
    } catch (err) {
      toast.error(err.message || "Checkout failed");
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  if (loading || authLoading)
    return (
      <p className="text-center text-slate-700 py-20">Loading checkout…</p>
    );

  if (!cart || cart.items.length === 0) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-slate-700">Your cart is empty.</p>
        <Link href="/" className="text-brand-600 hover:underline text-sm">
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Checkout
      </h1>

      <form onSubmit={handleSubmit} className="space-y-8" noValidate>
        {!user && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-700 uppercase tracking-wide">
              Contact
            </p>
            <Input
              label="Email"
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              error={fieldErrors.guestEmail}
              required
            />
            <p className="text-xs text-slate-700">
              Have an account?{" "}
              <Link
                href="/login?next=checkout"
                className="text-slate-900 underline underline-offset-2"
              >
                Sign in
              </Link>{" "}
              for faster checkout.
            </p>
          </div>
        )}

        {needsShipping && (
          <div className="space-y-3 pt-6 border-t border-slate-200">
            <p className="text-xs font-medium text-slate-700 uppercase tracking-wide">
              Shipping address
            </p>

            {user && addresses.length > 0 ? (
              <Select
                label="Deliver to"
                options={[
                  ...addresses.map((a) => ({
                    value: a.id,
                    label: `${a.fullName}, ${a.line1}, ${a.city}${normaliseCountry(a.country) !== NIGERIA ? `, ${normaliseCountry(a.country)}` : ""}`,
                  })),
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
                <Input
                  label="Full name"
                  value={manualAddress.fullName}
                  onChange={(e) =>
                    setManualAddress((a) => ({
                      ...a,
                      fullName: e.target.value,
                    }))
                  }
                  error={fieldErrors.fullName}
                  required
                />
                <Input
                  label="Phone"
                  value={manualAddress.phone}
                  onChange={(e) =>
                    setManualAddress((a) => ({ ...a, phone: e.target.value }))
                  }
                  error={fieldErrors.phone}
                  required
                />
                <Input
                  label="Address line 1"
                  className="sm:col-span-2"
                  value={manualAddress.line1}
                  onChange={(e) =>
                    setManualAddress((a) => ({ ...a, line1: e.target.value }))
                  }
                  error={fieldErrors.line1}
                  required
                />
                <Input
                  label="Address line 2 (optional)"
                  className="sm:col-span-2"
                  value={manualAddress.line2}
                  onChange={(e) =>
                    setManualAddress((a) => ({ ...a, line2: e.target.value }))
                  }
                />
                {intlDelivery && (
                  <div className="sm:col-span-2">
                    <Select
                      label="Country"
                      options={countryOptions}
                      value={normaliseCountry(manualAddress.country)}
                      onChange={(v) =>
                        setManualAddress((a) => ({
                          ...a,
                          country: v || NIGERIA,
                          state: "",
                          city: "",
                          postalCode: "",
                        }))
                      }
                      required
                    />
                  </div>
                )}
                {manualAbroad ? (
                  <>
                    <Input
                      label="State / province / region (optional)"
                      value={manualAddress.state}
                      onChange={(e) =>
                        setManualAddress((a) => ({
                          ...a,
                          state: e.target.value,
                        }))
                      }
                      error={fieldErrors.state}
                      maxLength={120}
                    />
                    <Input
                      label="City / town"
                      value={manualAddress.city}
                      onChange={(e) =>
                        setManualAddress((a) => ({
                          ...a,
                          city: e.target.value,
                        }))
                      }
                      error={fieldErrors.city}
                      maxLength={120}
                      required
                    />
                  </>
                ) : (
                  <>
                    <Select
                      label="State"
                      options={NIGERIA_STATE_OPTIONS}
                      value={manualAddress.state}
                      onChange={(v) =>
                        setManualAddress((a) => ({ ...a, state: v, city: "" }))
                      }
                      error={fieldErrors.state}
                      required
                    />
                    <Select
                      label="City/LGA"
                      options={getLgaOptions(manualAddress.state)}
                      value={manualAddress.city}
                      onChange={(v) =>
                        setManualAddress((a) => ({ ...a, city: v }))
                      }
                      disabled={!manualAddress.state}
                      error={fieldErrors.city}
                      required
                    />
                  </>
                )}
                {/**   
                <Input
                  label={
                    manualAbroad
                      ? "Postal / ZIP code (optional)"
                      : "Postal code (optional)"
                  }
                  value={manualAddress.postalCode}
                  onChange={(e) =>
                    setManualAddress((a) => ({
                      ...a,
                      postalCode: e.target.value,
                    }))
                  }
                  maxLength={20}
                />*/}
                {undeliverable && (
                  <p className="sm:col-span-2 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Sorry, we aren&apos;t currently delivering to{" "}
                    {undeliverableWhere}. Choose another delivery{" "}
                    {manualAbroad ? "country" : "state"}, or contact us.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {undeliverable && usesSavedAddress && (
          <p className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Sorry, we aren&apos;t currently delivering to{" "}
            {undeliverableWhere}. Pick a different address, or contact us.
          </p>
        )}

        <div className="pt-6 border-t border-slate-200">
          <Textarea
            label="Order note (optional)"
            placeholder="Special instructions for this order..."
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {/* Shown in both views on a store that accepts international
            payments: someone browsing in naira can still be paying with a
            foreign card, and has to be charged the right fee for it. */}
        {intlAvailable && (
          <div className="pt-6 border-t border-slate-200">
            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <span>
                <span className="block text-sm font-medium text-slate-900">
                  Paying with a card from outside Nigeria
                </span>
                <span className="block text-xs text-slate-700 mt-0.5">
                  {international
                    ? "You'll pay by card or Apple Pay. The international card fee applies."
                    : "Turn this on if your card was issued outside Nigeria."}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={international}
                aria-label="Paying with a card from outside Nigeria"
                onClick={() => setForeignCardChoice(!international)}
                className={`shrink-0 relative w-12 h-7 rounded-full transition-colors cursor-pointer ${
                  international ? "bg-brand-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    international ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>
          </div>
        )}

        <div className="space-y-2 pt-6 border-t border-slate-200">
          <p className="text-xs font-medium text-slate-700 uppercase tracking-wide mb-3">
            Order summary
          </p>
          {cart.items.map((item) => (
            <div
              key={item.id}
              className="flex justify-between text-sm text-slate-700"
            >
              <span>
                {item.product.name}
                {item.variant
                  ? ` (${Object.values(item.variant.options).join(", ")})`
                  : ""}{" "}
                × {item.quantity}
              </span>
              <span>{format(item.lineTotal)}</span>
            </div>
          ))}
          {needsShipping && (
            <div className="flex justify-between pt-2 border-t border-slate-100 text-sm text-slate-700">
              <span>Shipping</span>
              <span>
                {!hasDestination
                  ? "Enter your address"
                  : cart.shippingFeeTBD
                    ? "To be determined"
                    : format(cart.shippingFee || 0)}
              </span>
            </div>
          )}
          {hasDestination && cart.shippingFeeTBD && (
            <p className="text-xs text-slate-800 -mt-1">
              You won&apos;t be charged for delivery now, it&apos;s arranged
              directly with the seller.
            </p>
          )}
          {cart.feeChargedToCustomer && cart.platformFee > 0 && (
            <div className="flex justify-between text-sm text-slate-700">
              <span>Processing Fee</span>
              <span>{format(cart.platformFee)}</span>
            </div>
          )}
          {!cart.feeChargedToCustomer &&
            cart.platformFeeShortfall > 0 &&
            (!needsShipping || hasDestination) && (
              <div className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                This order is too small for the store to absorb its full
                Processing Fee. Add more items to continue.
              </div>
            )}
          <div className="flex justify-between pt-2 border-t border-slate-100 font-semibold text-slate-900 text-base">
            <span>Total</span>
            <span>{format(cart.total ?? cart.subtotal)}</span>
          </div>
          {/* Dollars are a guide only - Paystack charges the naira. Said
              plainly here, right above Pay now, so a customer viewing $ is
              never surprised by a naira line on their card statement. */}
          {isUsd && (
            <p className="rounded-sm bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-800">
              You&apos;ll be charged{" "}
              <strong className="tabular-nums">
                {formatNaira(cart.total ?? cart.subtotal)}
              </strong>{" "}
              (naira). Your bank may convert at its own rate.
            </p>
          )}
        </div>

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={submitting}
          disabled={
            undeliverable ||
            (cart.platformFeeShortfall > 0 &&
              (!needsShipping || hasDestination))
          }
        >
          {undeliverable ? "Not delivering to your location" : "Pay now"}
        </Button>
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>
            Powered by{" "}
            <strong className="font-semibold text-slate-700">Storezn</strong>
          </span>
          <span aria-hidden="true">&middot;</span>
          <span className="inline-flex items-center gap-1.5">
            Secured by Paystack
          </span>
        </p>
      </form>
    </div>
  );
}
