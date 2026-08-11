"use client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button.js";
import { formatCurrency } from "@/lib/format.js";

// Guest identity for the cart is an httpOnly cookie the API sets itself -
// this component doesn't need to know about auth at all, just fire the
// request and let the server sort out whose cart it is.
//
// Doubles as the variant picker when `variants` is non-empty. The base
// product (its own price/stock, from before any variant existed) is
// offered as its own "Standard" choice alongside the real variants - a
// vendor adding a Color variant later shouldn't silently make the plain
// item unbuyable just because they never created an explicit "no color"
// variant row for it.
export function AddToCartButton({ productId, basePrice, baseStock, productType, variants = [] }) {
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState({});
  const [useBase, setUseBase] = useState(false);

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

  const chooseVariant = (name, value) => {
    setUseBase(false);
    setSelected((s) => ({ ...s, [name]: value }));
  };

  const chooseBase = () => {
    setUseBase(true);
    setSelected({});
  };

  const needsSelection = variants.length > 0;
  const hasChosen = useBase || !!matchedVariant;
  const price = matchedVariant ? (matchedVariant.price ?? basePrice) : basePrice;
  const stock = useBase ? baseStock : matchedVariant ? matchedVariant.stock : null;
  const inStock = needsSelection
    ? hasChosen
      ? productType === "digital" || stock == null || stock > 0
      : true // unknown until fully selected - button disabled by needsSelection instead
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

  return (
    <div className="space-y-5">
      <p className="text-2xl font-medium text-slate-900">{formatCurrency(price)}</p>

      {needsSelection && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-700 uppercase tracking-wide">Options</p>
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

      {optionGroups.map((group) => (
        <div key={group.name} className="space-y-2">
          <p className="text-xs font-medium text-slate-700 uppercase tracking-wide">{group.name}</p>
          <div className="flex flex-wrap gap-2">
            {group.values.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => chooseVariant(group.name, value)}
                className={`px-4 py-2 text-sm border cursor-pointer transition-colors ${
                  !useBase && selected[group.name] === value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 text-slate-700 hover:border-slate-900"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      ))}

      {needsSelection && hasChosen && stock != null && productType === "physical" && (
        <p className="text-sm text-slate-400">{stock} in stock</p>
      )}

      {needsSelection && !hasChosen ? (
        <Button disabled fullWidth size="lg" variant="secondary">Select options</Button>
      ) : !inStock ? (
        <Button disabled fullWidth size="lg" variant="secondary">Out of stock</Button>
      ) : (
        <Button onClick={handleClick} loading={loading} fullWidth size="lg">Add to cart</Button>
      )}
    </div>
  );
}
