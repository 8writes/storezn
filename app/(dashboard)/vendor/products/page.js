"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Upload, ImageOff, ChevronDown, FileSpreadsheet, CheckCircle2, XCircle, SlidersHorizontal, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Button } from "@/components/ui/Button.js";
import { Badge } from "@/components/ui/Badge.js";
import { Select } from "@/components/ui/Select.js";
import { SearchInput } from "@/components/ui/SearchInput.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { TableRowSkeleton, CardListSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency, formatCondition } from "@/lib/format.js";
import { parseCsv, downloadCsv } from "@/lib/csv.js";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
  { value: "price_high", label: "Price: high to low" },
  { value: "price_low", label: "Price: low to high" },
];
const SORT_LABEL = Object.fromEntries(SORT_OPTIONS.map((o) => [o.value, o.label]));
const STOCK_OPTIONS = [
  { value: "", label: "Any stock" },
  { value: "in", label: "In stock" },
  { value: "low", label: "Low stock" },
  { value: "out", label: "Out of stock" },
];
const STOCK_LABEL = Object.fromEntries(STOCK_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]));

const BULK_HEADERS = ["name", "price", "sku", "description", "productType", "condition", "stock", "categoryName"];
const BULK_TEMPLATE_ROW = {
  name: "Red Tote Bag",
  price: "15000",
  sku: "BAG-RED-01",
  description: "Spacious everyday tote in red canvas",
  productType: "physical",
  condition: "new",
  stock: "20",
  categoryName: "Bags",
};

export default function VendorProductsPage() {
  const router = useRouter();
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const { stores, storeId, loading: storesLoading } = useVendorStore();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sort, setSort] = useState("newest");
  const [stockLevel, setStockLevel] = useState(""); // "" | in | low | out
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const activeFilterCount = (categoryId ? 1 : 0) + (sort !== "newest" ? 1 : 0) + (stockLevel ? 1 : 0);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkResults, setBulkResults] = useState(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // Inline "edit stock" mode for the desktop table.
  const [stockEdit, setStockEdit] = useState(false);
  const [stockBranch, setStockBranch] = useState(null); // { id, name, list }
  const [stockDraft, setStockDraft] = useState({}); // productId -> string (as typed)
  const [stockBase, setStockBase] = useState({}); // productId -> current number|null, for the selected branch
  const [stockSaving, setStockSaving] = useState(false);

  const loadBranchStock = (branchId) => {
    if (!token || !storeId) return;
    const qs = branchId ? `?branchId=${branchId}` : "";
    apiFetch(`/api/v1/vendor/stores/${storeId}/branch-stock${qs}`)
      .then((data) => {
        setStockBranch({ id: data.branchId, name: data.branchName, list: data.branches || null });
        setStockBase(data.stock || {});
        setStockDraft({});
      })
      .catch((err) => toast.error(err.message || "Couldn't load stock"));
  };

  const startStockEdit = () => {
    setStockEdit(true);
    loadBranchStock(null);
  };
  const cancelStockEdit = () => {
    setStockEdit(false);
    setStockDraft({});
  };

  const stockChanges = () =>
    Object.entries(stockDraft)
      .filter(([id, v]) => v !== "" && v != null && Number(v) !== (stockBase[id] ?? null))
      .map(([id, v]) => ({ productId: id, stock: Number(v) }));

  const saveStock = async () => {
    const updates = stockChanges();
    if (updates.length === 0) {
      cancelStockEdit();
      return;
    }
    setStockSaving(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/branch-stock`, {
        method: "PATCH",
        body: JSON.stringify({ branchId: stockBranch?.id, updates }),
      });
      toast.success(`${data.updated} product${data.updated === 1 ? "" : "s"} updated`);
      cancelStockEdit();
      loadProducts();
    } catch (err) {
      toast.error(err.message || "Failed to save stock");
    } finally {
      setStockSaving(false);
    }
  };

  const resetBulk = () => {
    setBulkRows([]);
    setBulkFileName("");
    setBulkResults(null);
  };

  const loadProducts = () => {
    if (!token || !storeId) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (q.trim()) params.set("q", q.trim());
    if (categoryId) params.set("category", categoryId);
    if (sort && sort !== "newest") params.set("sort", sort);
    if (stockLevel) params.set("stock", stockLevel);
    apiFetch(`/api/v1/vendor/stores/${storeId}/products?${params.toString()}`)
      .then((data) => {
        setProducts(data.products);
        if (data.lowStockThreshold != null) setLowStockThreshold(data.lowStockThreshold);
        setPagination(data.pagination);
      })
      .catch((err) => toast.error(err.message || "Failed to load products"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // Also gated on token, not just storeId - see VendorStoreContext.js:
    // storeId can already be populated (shared context, not remounted)
    // before this page's own token has resolved on a client-side
    // navigation, which would otherwise fire this fetch with no
    // Authorization header.
    if (!token || !storeId) return;
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId, page, q, categoryId, sort, stockLevel]);

  useEffect(() => {
    setPage(1);
  }, [q, categoryId, sort, stockLevel, storeId]);

  useEffect(() => {
    if (!token || !storeId) return;
    apiFetch(`/api/v1/vendor/stores/${storeId}/categories`)
      .then((data) => setCategories(data.categories))
      .catch(() => {});
    setCategoryId("");
    setStockLevel("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId]);

  const downloadTemplate = () => downloadCsv("products-import-template.csv", BULK_HEADERS, [BULK_TEMPLATE_ROW]);

  const handleBulkFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkResults(null);
    setBulkFileName(file.name);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        toast.error("No rows found in that file");
        setBulkRows([]);
        return;
      }
      setBulkRows(rows);
    } catch {
      toast.error("Couldn't read that file");
      setBulkRows([]);
    }
  };

  const handleBulkImport = async () => {
    setBulkSubmitting(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/products/bulk`, { method: "POST", body: JSON.stringify({ rows: bulkRows }) });
      setBulkResults(data.results);
      toast.success(`${data.summary.created} of ${data.summary.total} rows imported`);
      if (data.summary.created > 0) {
        setSort("newest");
        if (page === 1) loadProducts();
        else setPage(1);
      }
    } catch (err) {
      toast.error(err.message || "Bulk import failed");
    } finally {
      setBulkSubmitting(false);
    }
  };

  const downloadFailedRows = () => {
    const failed = bulkResults.filter((r) => r.status === "error");
    const rowsByNumber = new Map(bulkRows.map((r, i) => [i + 2, r]));
    downloadCsv(
      "products-import-failed.csv",
      [...BULK_HEADERS, "error"],
      failed.map((f) => ({ ...(rowsByNumber.get(f.row) || {}), error: f.error })),
    );
  };

  if (!storesLoading && stores.length === 0) {
    return <p className="text-sm text-slate-700">No store set up yet.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Products</h1>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={stockEdit ? cancelStockEdit : startStockEdit}
            className="hidden sm:inline-flex"
          >
            {stockEdit ? "Done" : "Bulk edit stock"}
          </Button>
          <Link href={`/vendor/products/new${storeId ? `?storeId=${storeId}` : ""}`}>
            <Button type="button" size="sm">
              <Plus size={16} />
              Add product
            </Button>
          </Link>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm">
        <button
          type="button"
          onClick={() => setBulkOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-3 px-5 py-3.5 cursor-pointer"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <FileSpreadsheet size={16} className="text-slate-400" />
            Import products from a CSV
          </span>
          <ChevronDown size={16} className={`text-slate-400 transition-transform ${bulkOpen ? "rotate-180" : ""}`} />
        </button>

        {bulkOpen && (
          <div className="px-5 pb-5 pt-1 space-y-4 border-t border-slate-100">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
                One product per row. Only <code className="text-slate-700">name</code> and{" "}
                <code className="text-slate-700">price</code> are required.{" "}
                <code className="text-slate-700">categoryName</code> must match one of your existing categories.
                Blank cells are fine. Images and variants are added afterward by editing each product.
              </p>
              <Button type="button" size="sm" variant="outline" onClick={downloadTemplate}>
                Download template
              </Button>
            </div>

            <label className="flex flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed border-slate-300 px-4 py-8 text-center cursor-pointer hover:border-brand-400 hover:bg-slate-50 transition-colors">
              <Upload size={20} className="text-slate-400" />
              <span className="text-sm text-slate-600">
                {bulkFileName ? <span className="font-medium text-slate-900">{bulkFileName}</span> : "Choose a .csv file"}
              </span>
              <span className="text-xs text-slate-400">or drag it here</span>
              <input type="file" accept=".csv,text/csv" onChange={handleBulkFile} className="hidden" />
            </label>

            {bulkRows.length > 0 && !bulkResults && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">
                    <span className="font-medium text-slate-900">{bulkRows.length}</span> row{bulkRows.length === 1 ? "" : "s"} ready to import
                  </p>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={resetBulk} className="text-sm text-slate-500 hover:text-slate-700 cursor-pointer">
                      Clear
                    </button>
                    <Button size="sm" onClick={handleBulkImport} loading={bulkSubmitting}>
                      <Upload size={14} /> Import {bulkRows.length} row{bulkRows.length === 1 ? "" : "s"}
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-left">
                      <tr>
                        <th className="px-3 py-2 font-medium w-10">#</th>
                        {BULK_HEADERS.map((h) => (
                          <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bulkRows.slice(0, 8).map((r, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                          {BULK_HEADERS.map((h) => (
                            <td key={h} className="px-3 py-2 text-slate-700 whitespace-nowrap max-w-[16rem] truncate">
                              {r[h] || <span className="text-slate-300">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {bulkRows.length > 8 && (
                  <p className="text-xs text-slate-400">Showing first 8 of {bulkRows.length} rows.</p>
                )}
              </div>
            )}

            {bulkResults && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700">
                    <CheckCircle2 size={15} /> {bulkResults.filter((r) => r.status === "created").length} created
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700">
                    <XCircle size={15} /> {bulkResults.filter((r) => r.status === "error").length} failed
                  </span>
                  <button type="button" onClick={resetBulk} className="text-sm text-brand-600 hover:underline cursor-pointer ml-auto">
                    Import another file
                  </button>
                </div>

                {bulkResults.some((r) => r.status === "error") && (
                  <>
                    <div className="max-h-56 overflow-auto border border-slate-200 rounded-sm">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 text-left sticky top-0">
                          <tr>
                            <th className="px-3 py-2 font-medium">Row</th>
                            <th className="px-3 py-2 font-medium">Name</th>
                            <th className="px-3 py-2 font-medium">Error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bulkResults.filter((r) => r.status === "error").map((r) => (
                            <tr key={r.row} className="border-t border-slate-100">
                              <td className="px-3 py-2 text-slate-500">{r.row}</td>
                              <td className="px-3 py-2">{r.name || "-"}</td>
                              <td className="px-3 py-2 text-red-600">{r.error}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button type="button" onClick={downloadFailedRows} className="text-sm text-brand-600 hover:underline cursor-pointer">
                      Download failed rows (CSV)
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <SearchInput value={q} onSearch={setQ} placeholder="Search products..." className="flex-1 sm:w-72" />
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="relative inline-flex items-center gap-1.5 shrink-0 px-3 py-2 border border-slate-300 rounded-sm text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <SlidersHorizontal size={15} />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-0.5 min-w-5 h-5 px-1 rounded-full bg-brand-600 text-white text-xs font-bold inline-flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
        <Link href="/vendor/categories" className="text-sm text-brand-600 hover:underline">
          Manage categories
        </Link>
      </div>

      {(activeFilterCount > 0 || stockLevel) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {stockLevel && (
            <FilterChip label={STOCK_LABEL[stockLevel]} onClear={() => setStockLevel("")} />
          )}
          {categoryId && (
            <FilterChip
              label={categories.find((c) => c.id === categoryId)?.name || "Category"}
              onClear={() => setCategoryId("")}
            />
          )}
          {sort !== "newest" && (
            <FilterChip label={SORT_LABEL[sort]} onClear={() => setSort("newest")} />
          )}
          <button
            type="button"
            onClick={() => {
              setCategoryId("");
              setSort("newest");
              setStockLevel("");
            }}
            className="text-slate-500 hover:text-slate-800 underline cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}

      {filtersOpen && (
        <ProductFiltersModal
          categories={categories}
          categoryId={categoryId}
          setCategoryId={setCategoryId}
          sort={sort}
          setSort={setSort}
          stockLevel={stockLevel}
          setStockLevel={setStockLevel}
          onClose={() => setFiltersOpen(false)}
        />
      )}

      {/* Mobile: stacked cards - the desktop table has too many columns to
          fit a phone without horizontal scrolling that hides half of it. */}
      <div className="space-y-3 sm:hidden">
        {loading ? (
          <CardListSkeleton count={5} />
        ) : products.length === 0 ? (
          <p className="bg-white border border-slate-200 rounded-sm px-4 py-6 text-center text-sm text-slate-700">
            {q || categoryId || stockLevel ? "No products match your filters" : "No products yet"}
          </p>
        ) : (
          products.map((p) => {
            const lowStock = p.productType === "physical" && p.stock != null && p.stock <= lowStockThreshold;
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/vendor/products/${p.id}?storeId=${storeId}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") router.push(`/vendor/products/${p.id}?storeId=${storeId}`);
                }}
                className="flex gap-3 bg-white border border-slate-200 rounded-sm p-4 cursor-pointer hover:bg-slate-50 transition-colors"
              >
                {p.images?.[0] ? (
                  <img src={p.images[0]} alt="" className="w-16 h-16 rounded-sm object-cover bg-slate-100 shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-sm bg-slate-100 shrink-0 flex items-center justify-center text-slate-300">
                    <ImageOff size={18} />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-slate-900">{p.name}</p>
                    <p className="text-sm font-medium text-slate-900 shrink-0">{formatCurrency(p.price)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span className="capitalize">{p.productType}</span>
                    {p.productType === "physical" && p.condition !== "new" && <span>· {formatCondition(p.condition)}</span>}
                    {p.categoryName && <span>· {p.categoryName}</span>}
                    {p.productType === "physical" && <span>· {p.stock ?? "-"} in stock</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <Badge color={p.isActive ? "green" : "slate"}>{p.isActive ? "Live" : "Archived"}</Badge>
                    {p.suspendedAt && <Badge color="red">Suspended</Badge>}
                    {lowStock && (
                      <Badge color={p.stock === 0 ? "red" : "amber"}>{p.stock === 0 ? "Out of stock" : "Low stock"}</Badge>
                    )}
                    <Link
                      href={`/vendor/products/${p.id}/edit?storeId=${storeId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="ml-auto text-sm font-medium text-brand-600 hover:underline"
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>

      {/* Desktop: table */}
      <div className="hidden sm:block bg-white border border-slate-200 rounded-sm overflow-x-auto">
        {stockEdit && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-slate-700">Editing stock</span>
              {stockBranch?.list && stockBranch.list.length > 1 ? (
                <div className="w-48">
                  <Select
                    value={stockBranch.id || ""}
                    onChange={(v) => loadBranchStock(v)}
                    options={stockBranch.list.map((b) => ({ value: b.id, label: b.name }))}
                  />
                </div>
              ) : (
                stockBranch?.name && <span className="text-slate-500">· {stockBranch.name}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">{stockChanges().length} changed</span>
              <Button type="button" size="sm" variant="outline" onClick={cancelStockEdit} disabled={stockSaving}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={saveStock} loading={stockSaving} disabled={stockChanges().length === 0}>
                Save changes
              </Button>
            </div>
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableRowSkeleton cols={7} />
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-700">{q || categoryId || stockLevel ? "No products match your filters" : "No products yet"}</td>
              </tr>
            ) : (
              products.map((p) => (
                <tr
                  key={p.id}
                  onClick={stockEdit ? undefined : () => router.push(`/vendor/products/${p.id}?storeId=${storeId}`)}
                  className={`border-t border-slate-100 ${stockEdit ? "" : "cursor-pointer hover:bg-slate-50"}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.images?.[0] ? (
                        <img src={p.images[0]} alt="" className="w-9 h-9 rounded-sm object-cover border border-slate-200 shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-sm bg-slate-100 shrink-0 flex items-center justify-center text-slate-300">
                          <ImageOff size={14} />
                        </div>
                      )}
                      <span>{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{p.categoryName || "-"}</td>
                  <td className="px-4 py-3 text-slate-500">{formatCurrency(p.price)}</td>
                  <td className="px-4 py-3 text-slate-500 capitalize">
                    {p.productType}
                    {p.productType === "physical" && p.condition !== "new" && (
                      <span className="text-slate-700"> · {formatCondition(p.condition)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500" onClick={stockEdit ? (e) => e.stopPropagation() : undefined}>
                    {stockEdit && p.productType === "physical" ? (
                      (() => {
                        const branchNow = stockBase[p.id] ?? 0;
                        return (
                          <span className="inline-flex items-center gap-2 whitespace-nowrap">
                            <input
                              type="number"
                              min="0"
                              value={stockDraft[p.id] ?? (stockBase[p.id] ?? "")}
                              onChange={(e) => setStockDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                              className="w-20 rounded-sm border border-slate-300 px-2 py-1 text-sm outline-none focus:border-brand-500"
                            />
                            <span className="text-xs text-slate-400">
                              now {branchNow}
                              {p.stock != null && p.stock !== branchNow && ` · ${p.stock} total`}
                            </span>
                          </span>
                        );
                      })()
                    ) : p.productType === "physical" ? (
                      <span className="inline-flex items-center gap-2">
                        {p.stock ?? "-"}
                        {p.stock != null && p.stock <= lowStockThreshold && (
                          <Badge color={p.stock === 0 ? "red" : "amber"}>{p.stock === 0 ? "Out of stock" : "Low stock"}</Badge>
                        )}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge color={p.isActive ? "green" : "slate"}>{p.isActive ? "Live" : "Archived"}</Badge>
                      {p.suspendedAt && <Badge color="red">Suspended</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <Link href={`/vendor/products/${p.id}/edit?storeId=${storeId}`} className="text-brand-600 hover:underline">Edit</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>
    </div>
  );
}

function FilterChip({ label, onClear }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
      {label}
      <button type="button" onClick={onClear} className="text-slate-400 hover:text-slate-700 cursor-pointer" aria-label={`Clear ${label}`}>
        <X size={12} />
      </button>
    </span>
  );
}

// Filter picker as a screen-safe sheet: a bottom sheet on phones, a
// centred card on desktop, capped at 85vh with its own scrolling body so
// it never runs off the viewport. Filters apply live as they're changed.
function ProductFiltersModal({ categories, categoryId, setCategoryId, sort, setSort, stockLevel, setStockLevel, onClose }) {
  const anyActive = categoryId || sort !== "newest" || stockLevel;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-sm sm:rounded-sm shadow-xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
          <p className="text-sm font-bold text-slate-900">Filters</p>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Stock level</p>
            <div className="grid grid-cols-2 gap-2">
              {STOCK_OPTIONS.map((o) => (
                <button
                  key={o.value || "any"}
                  type="button"
                  onClick={() => setStockLevel(o.value)}
                  className={`px-3 py-2 rounded-sm border text-sm font-medium cursor-pointer transition-colors ${
                    stockLevel === o.value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {categories.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Category</p>
              <Select
                options={[{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
                value={categoryId}
                onChange={setCategoryId}
              />
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sort by</p>
            <Select options={SORT_OPTIONS} value={sort} onChange={setSort} />
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-100 shrink-0">
          <button
            type="button"
            disabled={!anyActive}
            onClick={() => {
              setCategoryId("");
              setSort("newest");
              setStockLevel("");
            }}
            className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Clear all
          </button>
          <Button type="button" onClick={onClose} className="ml-auto" size="sm">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
