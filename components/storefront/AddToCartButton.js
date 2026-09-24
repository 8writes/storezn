"use client";
import { useMemo, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button.js";
import { SizeGuideButton } from "@/components/storefront/SizeGuideButton.js";
import { formatCurrency } from "@/lib/format.js";
import { getEffectivePrice } from "@/lib/pricing.js";
import { useCustomerAuth } from "@/hooks/useCustomerAuth.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { useModalScrollLock } from "@/hooks/useModalScrollLock.js";
import { InfoTip } from "@/components/ui/InfoTip.js";

const LOW_STOCK = 10;
const norm = (v) => String(v ?? "").trim().toLowerCase();

// Guest identity for the cart is an httpOnly cookie the API sets itself -
// this component doesn't need to know about auth at all, just fire the
// request and let the server sort out whose cart it is.
//
// Doubles as the variant picker when `variants` is non-empty. The base
// product (its own price/stock) is offered as its own "Standard" choice
// alongside the real variants unless the vendor turned that off
// (allowStandardVariant). When a size guide is present, the option group
// whose values match its rows is treated as the "size" group: buttons
// pick up the alternate-system label (UK7.5 (EUR41)) and a low-stock
// badge, and the picked size's measurements show inline.
export function AddToCartButton({
  productId,
  basePrice,
  baseDiscountPercent,
  baseStock,
  productType,
  saleMode = "fixed_price",
  variants = [],
  allowStandardVariant = true,
  sizeGuide = null,
  customerFields = [],
}) {
  const { user, token, loading: authLoading } = useCustomerAuth();
  const { confirm, confirmDialog } = useConfirm();
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState({});
  const [useBase, setUseBase] = useState(false);
  const [answers, setAnswers] = useState({});
  const [guestEmail, setGuestEmail] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [invoiceQuantity, setInvoiceQuantity] = useState(1);
  const [quoteOpen, setQuoteOpen] = useState(false);
  useModalScrollLock(quoteOpen);

  const openQuote = () => {
    if (user) {
      setBuyerName((value) => value || [user.firstName, user.lastName].filter(Boolean).join(" "));
      setGuestEmail((value) => value || user.email || "");
      setBuyerPhone((value) => value || user.phone || "");
    }
    setQuoteOpen(true);
  };

  const optionGroups = useMemo(() => {
    const groups = {};
    for (const v of variants) {
      for (const [name, value] of Object.entries(v.options)) {
        groups[name] = groups[name] || new Set();
        groups[name].add(value);
      }
    }
    return Object.entries(groups).map(([name, values]) => ({ name, values: [...values] }));
  }, [variants]);

  const matchedVariant = useMemo(() => {
    if (useBase || variants.length === 0) return null;
    if (optionGroups.some((g) => !selected[g.name])) return null;
    return variants.find((v) => optionGroups.every((g) => v.options[g.name] === selected[g.name])) || null;
  }, [variants, optionGroups, selected, useBase]);

  // Which option group is the "size" one - the one whose values line up
  // with the size guide's rows, falling back to a name match.
  const sizeGroupName = useMemo(() => {
    const rows = sizeGuide?.rows || [];
    if (!rows.length || !optionGroups.length) return null;
    const sizeSet = new Set(rows.map((r) => norm(r.size)));
    let best = null;
    let bestHits = 0;
    for (const g of optionGroups) {
      const hits = g.values.filter((v) => sizeSet.has(norm(v))).length;
      if (hits > bestHits) {
        best = g.name;
        bestHits = hits;
      }
    }
    if (!best) {
      const wanted = norm(sizeGuide?.sizeLabel);
      best = optionGroups.find((g) => norm(g.name) === wanted || norm(g.name).includes("size"))?.name || null;
    }
    return best;
  }, [optionGroups, sizeGuide]);

  const sizeRow = (value) =>
    (sizeGuide?.rows || []).find((r) => norm(r.size) === norm(value)) || null;

  // Variants that match a given size value AND every other group's
  // current selection - used for the per-size stock badge (only shown
  // when it resolves to exactly one variant).
  const loneVariantForSize = (value) => {
    if (!sizeGroupName) return null;
    const matches = variants.filter(
      (v) =>
        norm(v.options[sizeGroupName]) === norm(value) &&
        optionGroups.every((g) => g.name === sizeGroupName || !selected[g.name] || v.options[g.name] === selected[g.name]),
    );
    return matches.length === 1 ? matches[0] : null;
  };

  const chooseVariant = (name, value) => {
    setUseBase(false);
    setSelected((s) => ({ ...s, [name]: value }));
  };

  const chooseBase = () => {
    setUseBase(true);
    setSelected({});
  };

  const needsSelection = variants.length > 0;
  const invoiceRequired = saleMode === "invoice_required";
  const showStandard = allowStandardVariant !== false;
  const hasChosen = useBase || !!matchedVariant;
  const price = matchedVariant ? (matchedVariant.price ?? basePrice) : getEffectivePrice(basePrice, baseDiscountPercent);
  const stock = useBase ? baseStock : matchedVariant ? matchedVariant.stock : null;
  const inStock = needsSelection
    ? hasChosen
      ? productType === "digital" || stock == null || stock > 0
      : true // unknown until fully selected - button disabled by needsSelection instead
    : productType === "digital" || stock == null || stock > 0;

  const pickedSizeRow = sizeGroupName && selected[sizeGroupName] ? sizeRow(selected[sizeGroupName]) : null;

  const submitQuote = async () => {
    const name = buyerName.trim();
    const email = guestEmail.trim();
    const phone = buyerPhone.trim();
    if (!name || !email || !phone) return toast.error("Name, email, and phone are required");
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error("Enter a valid email address");
    const missingField = customerFields.find((field) => field.required && (field.type === "checkbox" ? answers[field.id] !== true : !String(answers[field.id] ?? "").trim()));
    if (missingField) return toast.error(`${missingField.label} is required`);
    const quantity = Number(invoiceQuantity);
    if (!Number.isInteger(quantity) || quantity < 1) return toast.error("Quantity must be at least 1");
    const approved = await confirm({
      title: "Send quote request?",
      description: `The seller will receive your contact details and a request for ${quantity} item${quantity === 1 ? "" : "s"}.`,
      confirmLabel: "Send request",
      storefront: true,
    });
    if (!approved) return;
    setLoading(true);
    try {
      const res = await fetch("/api/v1/storefront/invoice-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ guestEmail: email, buyerName: name, buyerPhone: phone, items: [{ productId, variantId: matchedVariant?.id || null, quantity, customerFields: answers }] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not submit quote request");
      toast.success(`Quote request ${data.request.requestNumber} sent`);
      setQuoteOpen(false);
    } catch (err) {
      toast.error(err.message || "Could not submit quote request");
    } finally {
      setLoading(false);
    }
  };

  const handleClick = async () => {
    if (authLoading) return;
    setLoading(true);
    try {
      const body = { productId, quantity: 1 };
      if (matchedVariant) body.variantId = matchedVariant.id;
      if (customerFields.length > 0) body.customerFields = answers;
      const res = await fetch("/api/v1/storefront/cart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not add to cart");
      toast.success("Added to cart");
      window.dispatchEvent(new Event("cart:updated"));
    } catch (err) {
      toast.error(err.message || "Could not add to cart");
    } finally {
      setLoading(false);
    }
  };

  // discountPercent is base-product-only (see products.discountPercent) -
  // once a specific variant is matched, its own price takes over and the
  // discount doesn't carry over to it.
  const showDiscount = !matchedVariant && baseDiscountPercent > 0;

  const cta = needsSelection && !hasChosen ? (
    <Button disabled fullWidth size="lg" variant="secondary">Select an option</Button>
  ) : invoiceRequired ? (
    <Button onClick={openQuote} disabled={authLoading} fullWidth size="lg">Request a quote</Button>
  ) :
    !inStock ? (
      <Button disabled fullWidth size="lg" variant="secondary">Out of stock</Button>
    ) : (
      <Button onClick={handleClick} loading={loading || authLoading} fullWidth size="lg">Add to cart</Button>
    );

  return (
    <>
    <div className="space-y-5">
      <div className="flex items-baseline gap-2.5">
        <p className="text-2xl font-medium text-slate-900">{invoiceRequired ? "Price on request" : formatCurrency(price)}</p>
        {showDiscount && (
          <>
            <p className="text-base text-slate-400 line-through">{formatCurrency(basePrice)}</p>
            <span className="text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-sm">
              -{baseDiscountPercent}%
            </span>
          </>
        )}
      </div>

      {needsSelection && showStandard && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-700 uppercase tracking-wide">Options</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={chooseBase}
              className={`px-4 py-2 text-sm border rounded-xs capitalize cursor-pointer transition-colors ${
                useBase
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-slate-300 text-slate-700 hover:border-brand-600"
              }`}
            >
              Standard
            </button>
          </div>
        </div>
      )}

      {optionGroups.map((group) => {
        const isSize = group.name === sizeGroupName;
        return (
          <div key={group.name} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-slate-700 uppercase tracking-wide">{group.name}</p>
              {isSize && sizeGuide && <SizeGuideButton guide={sizeGuide} />}
            </div>
            <div className="flex flex-wrap gap-2">
              {group.values.map((value) => {
                const chosen = !useBase && selected[group.name] === value;
                const row = isSize ? sizeRow(value) : null;
                const lone = isSize ? loneVariantForSize(value) : null;
                const soldOut = lone && productType === "physical" && lone.stock != null && lone.stock <= 0;
                const low = !invoiceRequired &&
                  lone && productType === "physical" && lone.stock != null && lone.stock > 0 && lone.stock <= LOW_STOCK;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => chooseVariant(group.name, value)}
                    disabled={soldOut}
                    className={`relative px-4 py-2 text-sm border rounded-xs capitalize transition-colors disabled:cursor-not-allowed ${
                      soldOut ? "line-through opacity-40" : "cursor-pointer"
                    } ${
                      chosen
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-slate-300 text-slate-700 hover:border-brand-600"
                    }`}
                  >
                    {row?.alt ? `${value} (${row.alt})` : value}
                    {low && (
                      <span className="ml-1.5 text-[10px] font-semibold text-red-600">{lone.stock} left</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {pickedSizeRow && (
        <p className="text-xs text-slate-600 leading-relaxed">
          <span className="font-medium text-slate-900">Measurements</span>{" "}
          {sizeGuide.columns
            .map((c, i) => `${c}: ${pickedSizeRow.values[i]}${pickedSizeRow.values[i] ? ` ${sizeGuide.unit}` : ""}`)
            .join(" · ")}
        </p>
      )}

      {sizeGuide && !sizeGroupName && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <SizeGuideButton guide={sizeGuide} />
          {sizeGuide.note && <span className="text-slate-800">{sizeGuide.note}</span>}
        </div>
      )}
      {sizeGuide && sizeGroupName && sizeGuide.note && (
        <p className="text-xs text-slate-800">{sizeGuide.note}</p>
      )}

      {!invoiceRequired && needsSelection && hasChosen && stock != null && productType === "physical" && (
        <p className="text-sm text-slate-700">{stock} in stock</p>
      )}

      {!invoiceRequired && customerFields.length > 0 && (
        <div className="space-y-3 border-t border-slate-200 pt-4">
          <p className="text-sm font-semibold text-slate-900">Product details</p>
          {customerFields.map((field) => (
            <label key={field.id} className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">{field.label}{field.required ? " *" : ""}</span>
              {field.type === "textarea" ? <textarea rows={3} value={answers[field.id] || ""} onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value }))} placeholder={field.placeholder || ""} className="w-full border border-slate-300 rounded-sm px-3 py-2 text-sm" />
                : field.type === "select" ? <select value={answers[field.id] || ""} onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value }))} className="w-full border border-slate-300 rounded-sm px-3 py-2 text-sm"><option value="">Select...</option>{(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select>
                  : field.type === "checkbox" ? <input type="checkbox" checked={answers[field.id] === true} onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.checked }))} />
                    : <input type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} value={answers[field.id] || ""} onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value }))} placeholder={field.placeholder || ""} className="w-full border border-slate-300 rounded-sm px-3 py-2 text-sm" />}
              {field.helpText && <span className="block text-xs text-slate-600">{field.helpText}</span>}
            </label>
          ))}
        </div>
      )}

      {/* Inline on desktop; on mobile the CTA moves into a sticky bar
          pinned to the bottom of the viewport so it's always reachable
          while scrolling the description/reviews. */}
      <div className="hidden sm:block">{cta}</div>

      <div
        className="sm:hidden fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-slate-200 bg-white px-4 pt-3 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="shrink-0">
          <p className="text-lg font-semibold text-slate-900 leading-none">{invoiceRequired ? "Quote" : formatCurrency(price)}</p>
          {showDiscount && (
            <p className="text-xs text-slate-400 line-through leading-none mt-0.5">{formatCurrency(basePrice)}</p>
          )}
        </div>
        <div className="flex-1">{cta}</div>
      </div>
    </div>
    {quoteOpen && (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center overscroll-none">
        <div className="fixed inset-0 bg-black/50" onClick={loading ? undefined : () => setQuoteOpen(false)} />
        <div className="relative bg-white rounded-t-sm sm:rounded-sm shadow-xl w-full sm:max-w-md max-h-[92dvh] flex flex-col overscroll-contain">
          <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-slate-900">Request a quote</h2>
                <InfoTip storefront>The seller will review your requirements, agree the price with you, and send a secure invoice when the quote is ready.</InfoTip>
              </div>
              <p className="text-sm text-slate-600 mt-1">Enter the details the seller should use to contact you.</p>
            </div>
            <button type="button" onClick={() => setQuoteOpen(false)} disabled={loading} aria-label="Close" className="p-1 text-slate-600 hover:text-slate-900 cursor-pointer disabled:cursor-not-allowed"><X size={19} /></button>
          </div>
          <div className="p-4 overflow-y-auto overscroll-contain space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Quantity</label>
              <div className="inline-grid grid-cols-[2.75rem_4rem_2.75rem] h-11 border border-slate-300 rounded-sm overflow-hidden">
                <button type="button" onClick={() => setInvoiceQuantity((q) => Math.max(1, Number(q) - 1))} aria-label="Decrease quantity" className="grid place-items-center text-brand-700 hover:bg-brand-50 cursor-pointer"><Minus size={17} /></button>
                <output className="grid place-items-center border-x border-slate-300 text-sm font-semibold text-slate-900 tabular-nums">{invoiceQuantity}</output>
                <button type="button" onClick={() => setInvoiceQuantity((q) => Math.min(100000, Number(q) + 1))} aria-label="Increase quantity" className="grid place-items-center text-brand-700 hover:bg-brand-50 cursor-pointer"><Plus size={17} /></button>
              </div>
            </div>
            <label className="block space-y-1"><span className="text-sm font-medium text-slate-700">Customer name *</span><input type="text" required value={buyerName} onChange={(e) => setBuyerName(e.target.value)} autoComplete="name" className="w-full border border-slate-300 rounded-sm px-3 py-2 text-base sm:text-sm" /></label>
            <label className="block space-y-1"><span className="text-sm font-medium text-slate-700">Email *</span><input type="email" required value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} autoComplete="email" className="w-full border border-slate-300 rounded-sm px-3 py-2 text-base sm:text-sm" /></label>
            <label className="block space-y-1"><span className="text-sm font-medium text-slate-700">Phone or WhatsApp *</span><input type="tel" required value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} autoComplete="tel" className="w-full border border-slate-300 rounded-sm px-3 py-2 text-base sm:text-sm" /></label>
            {customerFields.map((field) => (
              <label key={field.id} className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">{field.label}{field.required ? " *" : ""}</span>
                {field.type === "textarea" ? <textarea rows={3} value={answers[field.id] || ""} onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value }))} placeholder={field.placeholder || ""} className="w-full border border-slate-300 rounded-sm px-3 py-2 text-base sm:text-sm" />
                  : field.type === "select" ? <select value={answers[field.id] || ""} onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value }))} className="w-full border border-slate-300 rounded-sm px-3 py-2 text-base sm:text-sm"><option value="">Select...</option>{(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select>
                    : field.type === "checkbox" ? <input type="checkbox" checked={answers[field.id] === true} onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.checked }))} />
                      : <input type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} value={answers[field.id] || ""} onChange={(e) => setAnswers((a) => ({ ...a, [field.id]: e.target.value }))} placeholder={field.placeholder || ""} className="w-full border border-slate-300 rounded-sm px-3 py-2 text-base sm:text-sm" />}
                {field.helpText && <span className="block text-xs text-slate-600">{field.helpText}</span>}
              </label>
            ))}
          </div>
          <div className="p-4 border-t border-slate-200 flex gap-3">
            <Button type="button" variant="outline" fullWidth disabled={loading} onClick={() => setQuoteOpen(false)}>Cancel</Button>
            <Button type="button" fullWidth loading={loading} onClick={submitQuote}>Continue</Button>
          </div>
        </div>
      </div>
    )}
    {confirmDialog}
    </>
  );
}
