"use client";
import { useEffect } from "react";
import Link from "next/link";
import { X, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/format.js";

// Quick-view for an order line item, opened from an order detail page
// instead of navigating straight to the product page - keeps the vendor
// or customer on the order they were looking at. The product page is
// still one tap away via the link at the bottom, for whoever actually
// wants to leave.
export function OrderItemModal({ item, productHref, onClose }) {
  useEffect(() => {
    if (!item) return;
    const onKeyDown = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto p-4 py-8">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-sm shadow-xl w-full max-w-sm overflow-hidden my-auto">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-white/90 text-slate-500 hover:text-slate-700 flex items-center justify-center cursor-pointer"
        >
          <X size={16} />
        </button>

        <div className="aspect-square bg-slate-100">
          {item.productImage ? (
            <img src={item.productImage} alt={item.productName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300 text-sm">No photo</div>
          )}
        </div>

        <div className="p-5 space-y-3">
          <div>
            <h2 className="font-semibold text-slate-900">{item.productName}</h2>
            {item.variantLabel && <p className="text-sm text-slate-500">{item.variantLabel}</p>}
          </div>
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between">
              <dt className="text-slate-500">Unit price</dt>
              <dd className="text-slate-900">{formatCurrency(item.unitPrice)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Quantity</dt>
              <dd className="text-slate-900">{item.quantity}</dd>
            </div>
            <div className="flex justify-between font-semibold pt-1.5 border-t border-slate-100">
              <dt className="text-slate-700">Line total</dt>
              <dd className="text-slate-900">{formatCurrency(item.lineTotal)}</dd>
            </div>
          </dl>
          {productHref && (
            <Link
              href={productHref}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              View product page
              <ExternalLink size={14} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
