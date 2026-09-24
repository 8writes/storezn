"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Search, X, SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { Button } from "@/components/ui/Button.js";
import { Select } from "@/components/ui/Select.js";
import { PageHeader } from "@/components/ui/PageHeader.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { BarcodeScanButton } from "@/components/pos/BarcodeScanButton.js";
import { EXPIRY_LABEL, FEATURED_LABEL, FilterChip, ProductFiltersModal, SORT_LABEL, STATUS_LABEL, STOCK_LABEL } from "@/components/products/ProductFilters.js";

// Spreadsheet-style bulk add / edit. Loads products 20 at a time ("load
// more"), lets you change price / cost / stock / category / expiry in
// place, and add new products as rows - scanned or typed. Edits live in
// their own map so paging / searching never drops them. Stock per row is
// "Set" (overwrite) or "Add" (+ to the current count).

const PAGE_SIZE = 20;
const uid = () => `new_${Math.random().toString(36).slice(2, 10)}`;

function blankRow(sku = "") {
  return { _id: uid(), name: "", sku, categoryId: "", price: "", costPrice: "", stock: "", stockMode: "set", expiryDate: "" };
}

export default function BulkProductsPage() {
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { stores, storeId, loading: storeLoading } = useVendorStore();

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [branchId, setBranchId] = useState(null);
  const [branchName, setBranchName] = useState("");
  const [branchList, setBranchList] = useState(null);
  const [categories, setCategories] = useState([]);

  const [serverRows, setServerRows] = useState([]); // {id, name, sku, price, costPrice, categoryId, expiryDate, productType, hasVariants}
  const [base, setBase] = useState({}); // id -> original values (accumulates, never cleared while on the page)
  const [meta, setMeta] = useState({}); // id -> { hasVariants, productType }
  const [edits, setEdits] = useState({}); // id -> { field: value } - only changed fields
  const [newRows, setNewRows] = useState([]);
  const [pagination, setPagination] = useState(null);

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [expiryFilter, setExpiryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [featuredFilter, setFeaturedFilter] = useState("");
  const [sort, setSort] = useState("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [lastScan, setLastScan] = useState("");
  const tableRef = useRef(null);

  // Debounce the search box / scan-to-find.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const fetchPage = useCallback(
    async ({ page, bId, query, append }) => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (bId) params.set("branchId", bId);
      if (query) params.set("q", query);
      if (categoryFilter) params.set("category", categoryFilter);
      if (stockFilter) params.set("stock", stockFilter);
      if (expiryFilter) params.set("expiry", expiryFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (featuredFilter) params.set("featured", featuredFilter);
      if (sort !== "newest") params.set("sort", sort);
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/products/bulk?${params}`);

      setBranchId(data.branchId);
      setBranchName(data.branchName);
      if (data.branches) setBranchList(data.branches);
      if (data.categories) setCategories(data.categories);
      setPagination(data.pagination || null);

      setBase((prev) => {
        const next = { ...prev };
        for (const p of data.products) {
          if (!next[p.id]) {
            next[p.id] = {
              name: p.name || "",
              sku: p.sku || "",
              categoryId: p.categoryId || "",
              price: p.price != null ? String(p.price) : "",
              costPrice: p.costPrice != null ? String(p.costPrice) : "",
              expiryDate: p.expiryDate || "",
              stock: data.stock?.[p.id] ?? null,
            };
          } else if (data.stock && p.id in data.stock) {
            // Branch changed - refresh the base stock for this row.
            next[p.id] = { ...next[p.id], stock: data.stock[p.id] };
          }
        }
        return next;
      });
      setMeta((prev) => {
        const next = { ...prev };
        for (const p of data.products) next[p.id] = { hasVariants: p.hasVariants, productType: p.productType };
        return next;
      });

      const incoming = data.products.map((p) => ({ id: p.id }));
      setServerRows((prev) => {
        if (!append) return incoming;
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...incoming.filter((r) => !seen.has(r.id))];
      });
    },
    [apiFetch, storeId, categoryFilter, stockFilter, expiryFilter, statusFilter, featuredFilter, sort],
  );

  // Initial load + branch switch + search all replace the list from page 1.
  useEffect(() => {
    if (!token || !storeId) return;
    const timer = window.setTimeout(() => {
      fetchPage({ page: 1, bId: branchId, query: debouncedQ, append: false })
        .catch((err) => toast.error(err.message || "Couldn't load products"))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
    // branchId is deliberately excluded: owners change it through
    // changeBranch, while staff are pinned by the API.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId, debouncedQ, fetchPage]);

  const changeBranch = (bId) => {
    setLoading(true);
    fetchPage({ page: 1, bId, query: debouncedQ, append: false })
      .catch((err) => toast.error(err.message || "Couldn't load products"))
      .finally(() => setLoading(false));
  };

  const loadMore = () => {
    if (!pagination || pagination.page >= pagination.totalPages) return;
    setLoadingMore(true);
    fetchPage({ page: pagination.page + 1, bId: branchId, query: debouncedQ, append: true })
      .catch((err) => toast.error(err.message || "Couldn't load more"))
      .finally(() => setLoadingMore(false));
  };

  const editRow = (id, patch) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
  const setNewRow = (id, patch) => setNewRows((rs) => rs.map((r) => (r._id === id ? { ...r, ...patch } : r)));

  const scanNewRow = (code) => {
    const row = blankRow(code);
    setNewRows((n) => [row, ...n]);
    toast.success(`Row added for ${code}`);
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const scanFind = (code) => {
    setQ(code);
    setLastScan(code.toLowerCase());
  };

  const catOptions = useMemo(
    () => [{ value: "", label: "None" }, ...categories.map((c) => ({ value: c.id, label: c.name }))],
    [categories],
  );

  // Merge base + edits for a row id.
  const merged = useCallback(
    (id) => {
      const b = base[id] || {};
      const e = edits[id] || {};
      return {
        _id: id,
        id,
        name: e.name ?? b.name ?? "",
        sku: e.sku ?? b.sku ?? "",
        categoryId: e.categoryId ?? b.categoryId ?? "",
        price: e.price ?? b.price ?? "",
        costPrice: e.costPrice ?? b.costPrice ?? "",
        expiryDate: e.expiryDate ?? b.expiryDate ?? "",
        stockInput: e.stockInput ?? "",
        stockMode: e.stockMode ?? "add",
        hasVariants: meta[id]?.hasVariants,
        productType: meta[id]?.productType,
      };
    },
    [base, edits, meta],
  );

  const plan = useMemo(() => {
    const fieldPatches = [];
    const stockSets = [];
    const stockAdds = [];
    for (const [id, e] of Object.entries(edits)) {
      const b = base[id] || {};
      const m = meta[id] || {};
      const body = {};
      const name = (e.name ?? b.name ?? "").trim();
      if (e.name != null && name && name !== b.name) body.name = name;
      if (e.sku != null && (e.sku || "").trim() !== (b.sku || "")) body.sku = e.sku.trim() || null;
      if (e.categoryId != null && (e.categoryId || "") !== (b.categoryId || "")) body.categoryId = e.categoryId || null;
      if (e.price != null && e.price !== "" && Number(e.price) > 0 && Number(e.price) !== Number(b.price)) body.price = Number(e.price);
      if (e.costPrice != null && e.costPrice !== b.costPrice) {
        if (e.costPrice === "") body.costPrice = null;
        else if (Number(e.costPrice) >= 0 && Number(e.costPrice) !== Number(b.costPrice)) body.costPrice = Number(e.costPrice);
      }
      if (e.expiryDate != null && (e.expiryDate || "") !== (b.expiryDate || "")) body.expiryDate = e.expiryDate || null;
      if (Object.keys(body).length) fieldPatches.push({ id, body });

      const inp = String(e.stockInput ?? "").trim();
      if (inp !== "" && !m.hasVariants && m.productType === "physical") {
        const n = Number(inp);
        const mode = e.stockMode ?? "add";
        if (Number.isInteger(n)) {
          if (mode === "add" && n !== 0) stockAdds.push({ productId: id, addStock: n });
          else if (mode === "set" && n >= 0 && n !== (b.stock ?? null)) stockSets.push({ productId: id, stock: n });
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
  }, [edits, base, meta, newRows]);

  const changeCount = plan.fieldPatches.length + plan.stockSets.length + plan.stockAdds.length + plan.creates.length;

  const save = async () => {
    if (changeCount === 0) return;
    setSaving(true);
    let updated = 0;
    let added = 0;
    let failed = 0;
    try {
      if (plan.creates.length) {
        const res = await apiFetch(`/api/v1/vendor/stores/${storeId}/products/bulk`, {
          method: "POST",
          body: JSON.stringify({ rows: plan.creates }),
        });
        added = res.summary?.created || 0;
        failed += res.summary?.failed || 0;
        (res.results || []).filter((x) => x.status === "error").forEach((x) => toast.error(`Row "${x.name || "?"}": ${x.error}`));
      }
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

      // Reset everything and reload from page 1.
      setEdits({});
      setNewRows([]);
      setBase({});
      setMeta({});
      setLoading(true);
      await fetchPage({ page: 1, bId: branchId, query: debouncedQ, append: false }).finally(() => setLoading(false));
    } finally {
      setSaving(false);
    }
  };

  if (user && user.role !== "vendor" && user.role !== "staff" && user.role !== "super_admin") {
    return <p className="text-sm text-slate-800">Only the store team can bulk-edit products.</p>;
  }
  if (!storeLoading && stores.length === 0) {
    return <p className="text-sm text-slate-700">No store set up yet.</p>;
  }

  const canLoadMore = pagination && pagination.page < pagination.totalPages;
  const activeFilterCount = [categoryFilter, stockFilter, expiryFilter, statusFilter, featuredFilter, sort !== "newest" ? sort : ""].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <BackLink href="/vendor/products" label="Back to products" />

      <PageHeader
        title="Bulk edit products"
        description={
          <>
            Edit price, cost, stock, category and expiry in place, or add new products as rows. Stock changes apply to{" "}
            <span className="font-medium text-slate-700">{branchName || "the default branch"}</span>.
          </>
        }
        actions={
          <>
          {branchList && branchList.length > 1 && (
            <div className="w-48">
              <Select
                label="Stock branch"
                searchable={false}
                options={branchList.map((b) => ({ value: b.id, label: b.name }))}
                value={branchId || ""}
                onChange={changeBranch}
              />
            </div>
          )}
          <Button type="button" onClick={save} loading={saving} disabled={changeCount === 0}>
            Save {changeCount ? `(${changeCount})` : "changes"}
          </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or SKU"
            className="w-full pl-8 pr-8 py-2 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500"
          />
          {q && (
            <button type="button" onClick={() => { setQ(""); setLastScan(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
              <X size={14} />
            </button>
          )}
        </div>
        <BarcodeScanButton onScan={scanFind} className="!py-1.5" />
        <button type="button" onClick={() => setFiltersOpen(true)} className="relative inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-sm border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <SlidersHorizontal size={15} />
          Filters
          {activeFilterCount > 0 && <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-xs font-bold text-white">{activeFilterCount}</span>}
        </button>
        <span className="text-xs text-slate-800">
          {q ? `${serverRows.length} match${serverRows.length === 1 ? "" : "es"}` : pagination ? `${serverRows.length} of ${pagination.total}` : ""}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <BarcodeScanButton onScan={scanNewRow} className="!py-1.5" />
          <Button type="button" size="sm" variant="outline" onClick={() => setNewRows((n) => [blankRow(), blankRow(), blankRow(), ...n])}>
            <Plus size={14} /> Add rows
          </Button>
        </div>
      </div>

      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {statusFilter && <FilterChip label={STATUS_LABEL[statusFilter]} onClear={() => setStatusFilter("")} />}
          {featuredFilter && <FilterChip label={FEATURED_LABEL[featuredFilter]} onClear={() => setFeaturedFilter("")} />}
          {stockFilter && <FilterChip label={STOCK_LABEL[stockFilter]} onClear={() => setStockFilter("")} />}
          {expiryFilter && <FilterChip label={EXPIRY_LABEL[expiryFilter]} onClear={() => setExpiryFilter("")} />}
          {categoryFilter && <FilterChip label={categories.find((category) => category.id === categoryFilter)?.name || "Category"} onClear={() => setCategoryFilter("")} />}
          {sort !== "newest" && <FilterChip label={SORT_LABEL[sort]} onClear={() => setSort("newest")} />}
          <button type="button" onClick={() => { setCategoryFilter(""); setStockFilter(""); setExpiryFilter(""); setStatusFilter(""); setFeaturedFilter(""); setSort("newest"); }} className="cursor-pointer text-slate-800 underline hover:text-slate-900">Clear all</button>
        </div>
      )}

      {filtersOpen && (
        <ProductFiltersModal
          categories={categories}
          categoryId={categoryFilter}
          setCategoryId={setCategoryFilter}
          sort={sort}
          setSort={setSort}
          stockLevel={stockFilter}
          setStockLevel={setStockFilter}
          expiry={expiryFilter}
          setExpiry={setExpiryFilter}
          status={statusFilter}
          setStatus={setStatusFilter}
          featured={featuredFilter}
          setFeatured={setFeaturedFilter}
          branches={branchList || []}
          branchId={branchId || ""}
          setBranchId={changeBranch}
          allowAllBranches={false}
          onClose={() => setFiltersOpen(false)}
        />
      )}

      {loading ? (
        <FormSkeleton fields={6} />
      ) : (
        <>
          <div ref={tableRef} className="overflow-x-auto border border-slate-200 rounded-sm">
            <table className="w-full text-sm min-w-[1000px]">
              <thead className="bg-slate-50 text-slate-800 text-left sticky top-0 z-10">
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
                {newRows.length > 0 && serverRows.length > 0 && (
                  <tr>
                    <td colSpan={8} className="px-2 py-1.5 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Existing products
                    </td>
                  </tr>
                )}
                {serverRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                      {q ? `No product matches "${q}"` : "No products yet"}
                    </td>
                  </tr>
                ) : (
                  serverRows.map((sr) => {
                    const row = merged(sr.id);
                    const touched = !!edits[sr.id] && Object.keys(edits[sr.id]).length > 0;
                    const hit = lastScan && (row.sku || "").toLowerCase() === lastScan;
                    return (
                      <GridRow
                        key={sr.id}
                        r={row}
                        catOptions={catOptions}
                        baseStock={base[sr.id]?.stock ?? null}
                        touched={touched}
                        highlight={hit}
                        onChange={(patch) => editRow(sr.id, patch)}
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3">
            {canLoadMore ? (
              <Button type="button" variant="outline" size="sm" onClick={loadMore} loading={loadingMore}>
                Load 20 more ({pagination.total - serverRows.length} left)
              </Button>
            ) : (
              <span className="text-xs text-slate-400">
                {q ? "" : pagination && serverRows.length >= pagination.total ? "All products loaded" : ""}
              </span>
            )}
            <Button type="button" onClick={save} loading={saving} disabled={changeCount === 0}>
              Save {changeCount ? `(${changeCount} change${changeCount === 1 ? "" : "s"})` : "changes"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function GridRow({ r, isNew, catOptions, baseStock, touched, highlight, onChange, onRemove }) {
  const inputCls = "w-full px-1.5 py-1 border border-slate-200 rounded-sm text-sm outline-none focus:border-brand-500 bg-surface";
  const rowCls = isNew ? "bg-emerald-50/40" : highlight ? "bg-amber-50 ring-1 ring-amber-300" : touched ? "bg-blue-50/40" : "";

  return (
    <tr className={rowCls}>
      <td className="px-2 py-1">
        <input className={inputCls} value={r.name} placeholder={isNew ? "New product name" : ""} onChange={(e) => onChange({ name: e.target.value })} />
      </td>
      <td className="px-2 py-1">
        <input className={inputCls} value={r.sku || ""} onChange={(e) => onChange({ sku: e.target.value })} />
      </td>
      <td className="px-2 py-1">
        <select className={inputCls} value={r.categoryId || ""} onChange={(e) => onChange({ categoryId: e.target.value })}>
          {catOptions.map((o) => (
            <option key={o.value || "none"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1">
        <input type="number" min="0" step="0.01" className={`${inputCls} text-right tabular-nums`} value={r.price} onChange={(e) => onChange({ price: e.target.value })} />
      </td>
      <td className="px-2 py-1">
        <input type="number" min="0" step="0.01" className={`${inputCls} text-right tabular-nums`} value={r.costPrice} onChange={(e) => onChange({ costPrice: e.target.value })} />
      </td>
      <td className="px-2 py-1">
        {isNew ? (
          <input type="number" min="0" className={`${inputCls} tabular-nums`} placeholder="opening stock" value={r.stock} onChange={(e) => onChange({ stock: e.target.value })} />
        ) : r.hasVariants ? (
          <span className="text-xs text-slate-400">has variants, edit per variant</span>
        ) : r.productType !== "physical" ? (
          <span className="text-xs text-slate-400">not stocked</span>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-800 tabular-nums w-14 shrink-0">now {baseStock ?? 0}</span>
            <div className="flex rounded-sm border border-slate-200 overflow-hidden text-[11px] shrink-0">
              <button type="button" onClick={() => onChange({ stockMode: "add" })} className={`px-1.5 py-1 ${r.stockMode === "add" ? "bg-brand-600 text-white" : "bg-surface text-slate-800"}`}>
                +Add
              </button>
              <button type="button" onClick={() => onChange({ stockMode: "set" })} className={`px-1.5 py-1 ${r.stockMode === "set" ? "bg-brand-600 text-white" : "bg-surface text-slate-800"}`}>
                Set
              </button>
            </div>
            <input type="number" className={`${inputCls} tabular-nums`} placeholder={r.stockMode === "add" ? "+ qty" : "exact"} value={r.stockInput || ""} onChange={(e) => onChange({ stockInput: e.target.value })} />
          </div>
        )}
      </td>
      <td className="px-2 py-1">
        <input type="date" className={inputCls} value={r.expiryDate || ""} onChange={(e) => onChange({ expiryDate: e.target.value })} />
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
