"use client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { Button } from "@/components/ui/Button.js";
import { Select } from "@/components/ui/Select.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";

// Spreadsheet-style bulk add / edit. Loads every product as an editable
// row, lets you change price / cost / stock / category / expiry in place,
// and add brand-new products as extra rows - all saved in one go. Stock
// per row is either "Set" (overwrite) or "Add" (+ to the current count).

const MAX = 500;
const uid = () => `new_${Math.random().toString(36).slice(2, 10)}`;

function blankRow() {
  return {
    _id: uid(),
    isNew: true,
    name: "",
    sku: "",
    categoryId: "",
    price: "",
    costPrice: "",
    stock: "", // opening stock for a new product
    stockMode: "set",
    expiryDate: "",
  };
}

export default function BulkProductsPage() {
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { stores, storeId, loading: storeLoading } = useVendorStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [branchId, setBranchId] = useState(null);
  const [branchName, setBranchName] = useState("");
  const [branchList, setBranchList] = useState(null);
  const [categories, setCategories] = useState([]);
  const [rows, setRows] = useState([]); // existing, editable
  const [newRows, setNewRows] = useState([]);
  const [q, setQ] = useState("");
  // Immutable snapshot at load time - productId -> original values - so we
  // can tell what actually changed. State, not a ref (read during render).
  const [base, setBase] = useState({});

  const load = (bId) => {
    if (!token || !storeId) return;
    setLoading(true);
    const qs = bId ? `?branchId=${bId}` : "";
    apiFetch(`/api/v1/vendor/stores/${storeId}/products/bulk${qs}`)
      .then((data) => {
        setBranchId(data.branchId);
        setBranchName(data.branchName);
        setBranchList(data.branches || null);
        setCategories(data.categories || []);
        const nextBase = {};
        const mapped = (data.products || []).map((p) => {
          const b = {
            name: p.name || "",
            sku: p.sku || "",
            categoryId: p.categoryId || "",
            price: p.price != null ? String(p.price) : "",
            costPrice: p.costPrice != null ? String(p.costPrice) : "",
            expiryDate: p.expiryDate || "",
            stock: data.stock?.[p.id] ?? null,
          };
          nextBase[p.id] = b;
          return {
            _id: p.id,
            id: p.id,
            hasVariants: p.hasVariants,
            productType: p.productType,
            ...b,
            stockInput: "", // "add" mode: the delta; "set" mode: exact count. Blank = unchanged.
            stockMode: "add", // existing rows default to ADD
          };
        });
        setBase(nextBase);
        setRows(mapped);
      })
      .catch((err) => toast.error(err.message || "Couldn't load products"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId]);

  const setRow = (id, patch) => setRows((rs) => rs.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  const setNewRow = (id, patch) => setNewRows((rs) => rs.map((r) => (r._id === id ? { ...r, ...patch } : r)));

  const catOptions = useMemo(
    () => [{ value: "", label: "— none —" }, ...categories.map((c) => ({ value: c.id, label: c.name }))],
    [categories],
  );

  const visibleRows = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(t) || (r.sku || "").toLowerCase().includes(t));
  }, [rows, q]);

  // What actually changed, ready to send.
  const plan = useMemo(() => {
    const fieldPatches = []; // { id, body }
    const stockSets = []; // { productId, stock }
    const stockAdds = []; // { productId, addStock }
    for (const r of rows) {
      const b = base[r.id] || {};
      const body = {};
      if (r.name.trim() && r.name.trim() !== b.name) body.name = r.name.trim();
      if ((r.sku || "").trim() !== (b.sku || "")) body.sku = r.sku.trim() || null;
      if ((r.categoryId || "") !== (b.categoryId || "")) body.categoryId = r.categoryId || null;
      if (r.price !== "" && Number(r.price) > 0 && Number(r.price) !== Number(b.price)) body.price = Number(r.price);
      if (r.costPrice !== b.costPrice) {
        if (r.costPrice === "") body.costPrice = null;
        else if (Number(r.costPrice) >= 0 && Number(r.costPrice) !== Number(b.costPrice)) body.costPrice = Number(r.costPrice);
      }
      if ((r.expiryDate || "") !== (b.expiryDate || "")) body.expiryDate = r.expiryDate || null;
      if (Object.keys(body).length) fieldPatches.push({ id: r.id, body });

      const inp = String(r.stockInput ?? "").trim();
      if (inp !== "" && !r.hasVariants && r.productType === "physical") {
        const n = Number(inp);
        if (Number.isInteger(n)) {
          if (r.stockMode === "add" && n !== 0) stockAdds.push({ productId: r.id, addStock: n });
          else if (r.stockMode === "set" && n >= 0 && n !== (b.stock ?? null)) stockSets.push({ productId: r.id, stock: n });
        }
      }
    }
    const creates = newRows
      .filter((r) => r.name.trim() && r.price !== "" && Number(r.price) > 0)
      .map((r) => ({
        name: r.name.trim(),
        price: Number(r.price),
        sku: r.sku.trim() || undefined,
        costPrice: r.costPrice === "" ? undefined : Number(r.costPrice),
        stock: r.stock === "" ? undefined : Number(r.stock),
        expiryDate: r.expiryDate || undefined,
        categoryId: r.categoryId || undefined,
        productType: "physical",
        condition: "new",
      }));
    return { fieldPatches, stockSets, stockAdds, creates };
  }, [rows, newRows, base]);

  const changeCount = plan.fieldPatches.length + plan.stockSets.length + plan.stockAdds.length + plan.creates.length;

  const save = async () => {
    if (changeCount === 0) return;
    setSaving(true);
    let updated = 0;
    let added = 0;
    let failed = 0;
    try {
      // 1. new products
      if (plan.creates.length) {
        const res = await apiFetch(`/api/v1/vendor/stores/${storeId}/products/bulk`, {
          method: "POST",
          body: JSON.stringify({ rows: plan.creates }),
        });
        added = res.summary?.created || 0;
        failed += res.summary?.failed || 0;
        (res.results || []).filter((x) => x.status === "error").forEach((x) => toast.error(`Row "${x.name || "?"}": ${x.error}`));
      }
      // 2. stock (one call, set + add rows together)
      const stockUpdates = [...plan.stockSets, ...plan.stockAdds];
      if (stockUpdates.length) {
        try {
          await apiFetch(`/api/v1/vendor/stores/${storeId}/branch-stock`, {
            method: "PATCH",
            body: JSON.stringify({ branchId, updates: stockUpdates }),
          });
          updated += stockUpdates.length;
        } catch (err) {
          failed += stockUpdates.length;
          toast.error(err.message || "Stock update failed");
        }
      }
      // 3. field patches, per product
      await Promise.all(
        plan.fieldPatches.map(async (p) => {
          try {
            await apiFetch(`/api/v1/vendor/stores/${storeId}/products/${p.id}`, { method: "PATCH", body: JSON.stringify(p.body) });
            updated += 1;
          } catch {
            failed += 1;
          }
        }),
      );

      const bits = [];
      if (added) bits.push(`${added} added`);
      if (updated) bits.push(`${updated} updated`);
      if (failed) bits.push(`${failed} failed`);
      if (failed) toast.error(bits.join(" · "));
      else toast.success(bits.join(" · ") || "Saved");
      setNewRows([]);
      load(branchId);
    } finally {
      setSaving(false);
    }
  };

  if (user && user.role !== "vendor" && user.role !== "staff" && user.role !== "super_admin") {
    return <p className="text-sm text-slate-500">Only the store team can bulk-edit products.</p>;
  }
  if (!storeLoading && stores.length === 0) {
    return <p className="text-sm text-slate-700">No store set up yet.</p>;
  }

  return (
    <div className="space-y-4">
      <BackLink href="/vendor/products" label="Back to products" />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Bulk edit products</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Edit price, cost, stock, category and expiry in place, or add new products as rows. Stock changes apply to{" "}
            <span className="font-medium text-slate-700">{branchName || "the default branch"}</span>.
          </p>
        </div>
        <div className="flex items-end gap-2">
          {branchList && branchList.length > 1 && (
            <div className="w-48">
              <Select
                label="Stock branch"
                searchable={false}
                options={branchList.map((b) => ({ value: b.id, label: b.name }))}
                value={branchId || ""}
                onChange={(v) => load(v)}
              />
            </div>
          )}
          <Button type="button" onClick={save} loading={saving} disabled={changeCount === 0}>
            Save {changeCount ? `(${changeCount})` : "changes"}
          </Button>
        </div>
      </div>

      {loading ? (
        <FormSkeleton fields={6} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter rows by name or SKU"
                className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
              />
            </div>
            <span className="text-xs text-slate-500">
              {visibleRows.length} of {rows.length} product{rows.length === 1 ? "" : "s"}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => setNewRows((n) => [...n, blankRow(), blankRow(), blankRow()])}
            >
              <Plus size={14} /> Add rows
            </Button>
          </div>

          {rows.length > MAX && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2">
              This store has {rows.length} products. The grid still works but a CSV import may be smoother for very large edits.
            </p>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-sm">
            <table className="w-full text-sm min-w-[1000px]">
              <thead className="bg-slate-50 text-slate-500 text-left sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2 font-medium w-[22%]">Name</th>
                  <th className="px-2 py-2 font-medium w-[12%]">SKU</th>
                  <th className="px-2 py-2 font-medium w-[14%]">Category</th>
                  <th className="px-2 py-2 font-medium w-[10%] text-right">Price</th>
                  <th className="px-2 py-2 font-medium w-[10%] text-right">Cost</th>
                  <th className="px-2 py-2 font-medium w-[20%]">Stock ({branchName})</th>
                  <th className="px-2 py-2 font-medium w-[12%]">Expiry</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {newRows.map((r) => (
                  <GridRow
                    key={r._id}
                    r={r}
                    isNew
                    catOptions={catOptions}
                    onChange={(patch) => setNewRow(r._id, patch)}
                    onRemove={() => setNewRows((n) => n.filter((x) => x._id !== r._id))}
                  />
                ))}
                {newRows.length > 0 && (
                  <tr>
                    <td colSpan={8} className="px-2 py-1.5 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Existing products
                    </td>
                  </tr>
                )}
                {visibleRows.map((r) => (
                  <GridRow key={r._id} r={r} catOptions={catOptions} baseStock={base[r.id]?.stock ?? null} onChange={(patch) => setRow(r._id, patch)} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={save} loading={saving} disabled={changeCount === 0}>
              Save {changeCount ? `(${changeCount} change${changeCount === 1 ? "" : "s"})` : "changes"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function GridRow({ r, isNew, catOptions, baseStock, onChange, onRemove }) {
  const inputCls = "w-full px-1.5 py-1 border border-slate-200 rounded-sm text-sm outline-none focus:border-brand-500 bg-white";

  return (
    <tr className={isNew ? "bg-emerald-50/40" : ""}>
      <td className="px-2 py-1">
        <input
          className={inputCls}
          value={r.name}
          placeholder={isNew ? "New product name" : ""}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </td>
      <td className="px-2 py-1">
        <input className={inputCls} value={r.sku || ""} onChange={(e) => onChange({ sku: e.target.value })} />
      </td>
      <td className="px-2 py-1">
        <select
          className={inputCls}
          value={r.categoryId || ""}
          onChange={(e) => onChange({ categoryId: e.target.value })}
        >
          {catOptions.map((o) => (
            <option key={o.value || "none"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1">
        <input
          type="number"
          min="0"
          step="0.01"
          className={`${inputCls} text-right tabular-nums`}
          value={r.price}
          onChange={(e) => onChange({ price: e.target.value })}
        />
      </td>
      <td className="px-2 py-1">
        <input
          type="number"
          min="0"
          step="0.01"
          className={`${inputCls} text-right tabular-nums`}
          value={r.costPrice}
          onChange={(e) => onChange({ costPrice: e.target.value })}
        />
      </td>
      <td className="px-2 py-1">
        {isNew ? (
          <input
            type="number"
            min="0"
            className={`${inputCls} tabular-nums`}
            placeholder="opening stock"
            value={r.stock}
            onChange={(e) => onChange({ stock: e.target.value })}
          />
        ) : r.hasVariants ? (
          <span className="text-xs text-slate-400">has variants — edit per variant</span>
        ) : r.productType !== "physical" ? (
          <span className="text-xs text-slate-400">not stocked</span>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 tabular-nums w-14 shrink-0">now {baseStock ?? 0}</span>
            <div className="flex rounded-sm border border-slate-200 overflow-hidden text-[11px] shrink-0">
              <button
                type="button"
                onClick={() => onChange({ stockMode: "add" })}
                className={`px-1.5 py-1 ${r.stockMode === "add" ? "bg-brand-600 text-white" : "bg-white text-slate-500"}`}
              >
                +Add
              </button>
              <button
                type="button"
                onClick={() => onChange({ stockMode: "set" })}
                className={`px-1.5 py-1 ${r.stockMode === "set" ? "bg-brand-600 text-white" : "bg-white text-slate-500"}`}
              >
                Set
              </button>
            </div>
            <input
              type="number"
              className={`${inputCls} tabular-nums`}
              placeholder={r.stockMode === "add" ? "+ qty" : "exact"}
              value={r.stockInput || ""}
              onChange={(e) => onChange({ stockInput: e.target.value })}
            />
          </div>
        )}
      </td>
      <td className="px-2 py-1">
        <input
          type="date"
          className={inputCls}
          value={r.expiryDate || ""}
          onChange={(e) => onChange({ expiryDate: e.target.value })}
        />
      </td>
      <td className="px-1 py-1 text-center">
        {isNew && (
          <button type="button" onClick={onRemove} className="text-slate-400 hover:text-red-600" title="Remove row">
            <Trash2 size={14} />
          </button>
        )}
      </td>
    </tr>
  );
}
