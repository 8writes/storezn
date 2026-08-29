"use client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button.js";
import { formatCurrency } from "@/lib/format.js";
import { getEffectivePrice } from "@/lib/pricing.js";

// Guest identity for the cart is an httpOnly cookie the API sets itself -
// this component doesn't need to know about auth at all, just fire the
// request and let the server sort out whose cart it is.
//
// Doubles as the variant picker when `variants` is non-empty. Every
// variant row carries a single { optionName: value } pair (the vendor UI
// adds one dimension's values, one variant per value), so each variant is
// its own selectable choice here - we don't try to intersect selections
// across option groups, which broke the moment a product had variants
// under two different option names. The base product (its own
// price/stock) is offered as a "Standard" choice alongside them, unless
// the vendor turned that off (see products.allowStandardVariant).
export function AddToCartButton({ productId, basePrice, baseDiscountPercent, baseStock, productType, variants = [], allowStandardVariant = true }) {
  const [loading, setLoading] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [useBase, setUseBase] = useState(false);

  // Grouped by option name purely for display - picking a button still
  // selects that one exact variant, not a combination.
  const variantGroups = useMemo(() => {
    const groups = {};
    for (const v of variants) {
      const name = Object.keys(v.options || {})[0] || "Options";
      (groups[name] = groups[name] || []).push(v);
    }
    return Object.entries(groups).map(([name, items]) => ({ name, items }));
  }, [variants]);

  const matchedVariant = useBase ? null : variants.find((v) => v.id === selectedVariantId) || null;

  const chooseVariant = (v) => {
    setUseBase(false);
    setSelectedVariantId(v.id);
  };

  const chooseBase = () => {
    setUseBase(true);
    setSelectedVariantId(null);
  };

  const needsSelection = variants.length > 0;
  const showStandard = allowStandardVariant !== false;
  const hasChosen = useBase || !!matchedVariant;
  const price = matchedVariant ? (matchedVariant.price ?? basePrice) : getEffectivePrice(basePrice, baseDiscountPercent);
  const stock = useBase ? baseStock : matchedVariant ? matchedVariant.stock : null;
  const isOut = (v) => productType === "physical" && v.stock != null && v.stock <= 0;
  const inStock = needsSelection
    ? hasChosen
      ? productType === "digital" || stock == null || stock > 0
      : true // unknown until a choice is made - button disabled by needsSelection instead
    : productType === "digital" || stock == null || stock > 0;

  const handleClick = async () => {
    setLoading(true);
    try {
      const body = { productId, quantity: 1 };
      if (matchedVariant) body.variantId = matchedVariant.id;
      const res = await fetch("/api/v1/storefront/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  return (
    <div className="space-y-5">
      <div className="flex items-baseline gap-2.5">
        <p className="text-2xl font-medium text-slate-900">{formatCurrency(price)}</p>
        {showDiscount && (
          <>
            <p className="text-base text-slate-400 line-through">{formatCurrency(basePrice)}</p>
            <span className="text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-sm">
              -{baseDiscountPercent}%
            </span>
          </>
        )}
      </div>

      {needsSelection && (
        <div className="space-y-4">
          {showStandard && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700 uppercase tracking-wide">Standard</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={chooseBase}
                  className={`px-4 py-2 text-sm border cursor-pointer transition-colors ${
                    useBase
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 text-slate-700 hover:border-slate-900"
                  }`}
                >
                  Standard
                </button>
              </div>
            </div>
          )}

          {variantGroups.map((group) => (
            <div key={group.name} className="space-y-2">
              <p className="text-xs font-medium text-slate-700 uppercase tracking-wide">{group.name}</p>
              <div className="flex flex-wrap gap-2">
                {group.items.map((v) => {
                  const label = Object.values(v.options || {}).join(" / ") || "Option";
                  const out = isOut(v);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => chooseVariant(v)}
                      disabled={out}
                      className={`px-4 py-2 text-sm border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        out ? "line-through" : "cursor-pointer"
                      } ${
                        !useBase && selectedVariantId === v.id
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 text-slate-700 hover:border-slate-900"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {needsSelection && hasChosen && stock != null && productType === "physical" && (
        <p className="text-sm text-slate-700">{stock} in stock</p>
      )}

      {needsSelection && !hasChosen ? (
        <Button disabled fullWidth size="lg" variant="secondary">Select an option</Button>
      ) : !inStock ? (
        <Button disabled fullWidth size="lg" variant="secondary">Out of stock</Button>
      ) : (
        <Button onClick={handleClick} loading={loading} fullWidth size="lg">Add to cart</Button>
      )}
    </div>
  );
}
