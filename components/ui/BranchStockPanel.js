"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/Input.js";

// Only rendered once a store has more than one branch (see the product
// edit page) - a single-branch store keeps today's plain "Stock" field,
// which routes straight to the default branch server-side (see PATCH
// .../products/[id]), so this panel would just be a redundant second way
// to edit the same one number.
export function BranchStockPanel({ apiFetch, storeId, productId, onTotalBranches }) {
  const [data, setData] = useState(null);
  const [variants, setVariants] = useState([]);
  const [saving, setSaving] = useState(null);

  const load = () => {
    apiFetch(`/api/v1/vendor/stores/${storeId}/products/${productId}/branch-stock`)
      .then((d) => {
        setData(d);
        onTotalBranches?.(d.totalBranches);
      })
      .catch((err) => toast.error(err.message || "Failed to load branch stock"));
  };

  useEffect(load, [storeId, productId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    apiFetch(`/api/v1/vendor/stores/${storeId}/products/${productId}/variants`)
      .then((d) => setVariants(d.variants))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, productId]);

  const save = async (branchId, variantId, value, previousStock) => {
    const stock = value.trim() === "" ? null : Number(value);
    if (stock != null && (Number.isNaN(stock) || stock < 0)) return;
    if (stock === (previousStock ?? null)) return; // unchanged - no need to save or toast
    const key = `${variantId || "base"}-${branchId}`;
    setSaving(key);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/products/${productId}/branch-stock`, {
        method: "PATCH",
        body: JSON.stringify({ branchId, variantId: variantId || undefined, stock }),
      });
      toast.success("Stock updated");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to save stock");
    } finally {
      setSaving(null);
    }
  };

  if (!data || data.totalBranches <= 1) return null;

  return (
    <div className="bg-surface border border-slate-200 rounded-sm p-5 space-y-5">
      <div>
        <p className="text-sm font-semibold text-slate-700">Stock by branch</p>
        <p className="text-xs text-slate-500 mt-0.5">Leave blank for unlimited at that branch.</p>
      </div>

      <BranchStockRows label={null} rows={data.productStock} saving={saving} onSave={(branchId, value, prev) => save(branchId, null, value, prev)} />

      {variants.map((v) => (
        <div key={v.id} className="pt-4 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
            {Object.entries(v.options).map(([k, val]) => `${k}: ${val}`).join(", ")}
          </p>
          <BranchStockRows label={v.id} rows={data.variantStock[v.id] || []} saving={saving} onSave={(branchId, value, prev) => save(branchId, v.id, value, prev)} />
        </div>
      ))}
    </div>
  );
}

function BranchStockRows({ rows, saving, onSave }) {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.branchId} className="flex items-center gap-3">
          <span className="text-sm text-slate-700 flex-1">{row.branchName}</span>
          <Input
            type="number"
            min="0"
            placeholder="Unlimited"
            defaultValue={row.stock ?? ""}
            className="w-32"
            disabled={saving === `${row.variantId || "base"}-${row.branchId}`}
            onBlur={(e) => onSave(row.branchId, e.target.value, row.stock)}
          />
        </div>
      ))}
    </div>
  );
}
