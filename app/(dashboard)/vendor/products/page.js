"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
const EXPIRY_OPTIONS = [
  { value: "", label: "Any date" },
  { value: "soon", label: "Expiring within 30 days" },
  { value: "expired", label: "Already expired" },
];
const EXPIRY_LABEL = Object.fromEntries(EXPIRY_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]));

// -> { text, tone } for the expiry chip, or null. tone: red = past, amber
// = within 30 days, slate = further out.
function expiryChip(iso) {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.round((d - today) / 86400000);
  if (days < 0) return { text: days === -1 ? "Expired yesterday" : `Expired ${-days}d ago`, tone: "red" };
  if (days === 0) return { text: "Expires today", tone: "red" };
  if (days <= 30) return { text: `Expires in ${days}d`, tone: "amber" };
  return { text: `Expires ${d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}`, tone: "slate" };
}

const BULK_HEADERS = ["name", "price", "sku", "description", "productType", "condition", "stock", "expiryDate", "categoryName"];
const BULK_TEMPLATE_ROW = {
  name: "Red Tote Bag",
  price: "15000",
  sku: "BAG-RED-01",
  description: "Spacious everyday tote in red canvas",
  productType: "physical",
  condition: "new",
  stock: "20",
  expiryDate: "",
  categoryName: "Bags",
};

export default function VendorProductsPage() {
  const router = useRouter();
  // Deep links from the dashboard cards: ?stock=low , ?expiry=soon|expired
  const sp = useSearchParams();
  const initialStock = sp.get("stock") || "";
  const initialExpiry = sp.get("expiry") || "";
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const { stores, storeId, loading: storesLoading } = useVendorStore();
  const [products, setProducts] = useState([]);
  const loadSeq = useRef(0);
  const [categories, setCategories] = useState([]);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sort, setSort] = useState("newest");
  const [stockLevel, setStockLevel] = useState(["in", "low", "out"].includes(initialStock) ? initialStock : ""); // "" | in | low | out
  const [expiry, setExpiry] = useState(["soon", "expired"].includes(initialExpiry) ? initialExpiry : ""); // "" | soon | expired
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const activeFilterCount = (categoryId ? 1 : 0) + (sort !== "newest" ? 1 : 0) + (stockLevel ? 1 : 0) + (expiry ? 1 : 0);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkResults, setBulkResults] = useState(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const resetBulk = () => {
    setBulkRows([]);
    setBulkFileName("");
    setBulkResults(null);
  };

  const loadProducts = () => {
    if (!token || !storeId) return;
    const myReq = ++loadSeq.current;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (q.trim()) params.set("q", q.trim());
    if (categoryId) params.set("category", categoryId);
    if (sort && sort !== "newest") params.set("sort", sort);
    if (stockLevel) params.set("stock", stockLevel);
    if (expiry) params.set("expiry", expiry);
    apiFetch(`/api/v1/vendor/stores/${storeId}/products?${params.toString()}`)
      .then((data) => {
        // Drop a stale response so a slow search for an earlier term
        // can't overwrite the current results.
        if (myReq !== loadSeq.current) return;
        setProducts(data.products);
        if (data.lowStockThreshold != null) setLowStockThreshold(data.lowStockThreshold);
        setPagination(data.pagination);
      })
      .catch((err) => {
        if (myReq === loadSeq.current) toast.error(err.message || "Failed to load products");
      })
      .finally(() => {
        if (myReq === loadSeq.current) setLoading(false);
      });
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
  }, [token, storeId, page, q, categoryId, sort, stockLevel, expiry]);

  useEffect(() => {
    setPage(1);
  }, [q, categoryId, sort, stockLevel, expiry, storeId]);

  const storeFiltersInit = useRef(false);
  useEffect(() => {
    if (!token || !storeId) return;
    apiFetch(`/api/v1/vendor/stores/${storeId}/categories`)
      .then((data) => setCategories(data.categories))
      .catch(() => {});
    // Don't clobber a filter that came in via the URL (?stock=low from
    // the dashboard) on the first run - only reset when the store
    // actually switches after that.
    if (storeFiltersInit.current) {
      setCategoryId("");
      setStockLevel("");
      setExpiry("");
    }
    storeFiltersInit.current = true;
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
          {/* The full add / edit grid - unusable on a phone, so laptop up. */}
          <Link href="/vendor/products/bulk" className="hidden lg:inline-flex">
            <Button type="button" size="sm" variant="outline">
              Bulk edit
            </Button>
          </Link>
          <Link href={`/vendor/products/new${storeId ? `?storeId=${storeId}` : ""}`}>
            <Button type="button" size="sm">
              <Plus size={16} />
              Add product
            </Button>
          </Link>
        </div>
      </div>

      <div className="bg-surface border border-slate-200 rounded-sm">
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

      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {stockLevel && (
            <FilterChip label={STOCK_LABEL[stockLevel]} onClear={() => setStockLevel("")} />
          )}
          {expiry && (
            <FilterChip label={EXPIRY_LABEL[expiry]} onClear={() => setExpiry("")} />
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
              setExpiry("");
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
          expiry={expiry}
          setExpiry={setExpiry}
          onClose={() => setFiltersOpen(false)}
        />
      )}

      {/* Mobile: stacked cards - the desktop table has too many columns to
          fit a phone without horizontal scrolling that hides half of it. */}
      <div className="space-y-3 sm:hidden">
        {loading ? (
          <CardListSkeleton count={5} />
        ) : products.length === 0 ? (
          <p className="bg-surface border border-slate-200 rounded-sm px-4 py-6 text-center text-sm text-slate-700">
            {q || categoryId || stockLevel ? "No products match your filters" : "No products yet"}
          </p>
        ) : (
          products.map((p) => {
            const lowStock = p.productType === "physical" && p.stock != null && p.stock <= lowStockThreshold;
            const exp = expiryChip(p.expiryDate);
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/vendor/products/${p.id}?storeId=${storeId}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") router.push(`/vendor/products/${p.id}?storeId=${storeId}`);
                }}
                className="flex gap-3 bg-surface border border-slate-200 rounded-sm p-4 cursor-pointer hover:bg-slate-50 transition-colors"
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
                    {exp && exp.tone !== "slate" && <Badge color={exp.tone}>{exp.text}</Badge>}
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
      <div className="hidden sm:block bg-surface border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Cost</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableRowSkeleton cols={8} />
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-700">{q || categoryId || stockLevel ? "No products match your filters" : "No products yet"}</td>
              </tr>
            ) : (
              products.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/vendor/products/${p.id}?storeId=${storeId}`)}
                  className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
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
                  <td className="px-4 py-3 text-slate-500">{p.costPrice != null ? formatCurrency(p.costPrice) : "—"}</td>
                  <td className="px-4 py-3 text-slate-500 capitalize">
                    {p.productType}
                    {p.productType === "physical" && p.condition !== "new" && (
                      <span className="text-slate-700"> · {formatCondition(p.condition)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {p.productType === "physical" ? (
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
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge color={p.isActive ? "green" : "slate"}>{p.isActive ? "Live" : "Archived"}</Badge>
                      {p.suspendedAt && <Badge color="red">Suspended</Badge>}
                      {(() => {
                        const e = expiryChip(p.expiryDate);
                        return e && e.tone !== "slate" ? <Badge color={e.tone}>{e.text}</Badge> : null;
                      })()}
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
function ProductFiltersModal({ categories, categoryId, setCategoryId, sort, setSort, stockLevel, setStockLevel, expiry, setExpiry, onClose }) {
  const anyActive = categoryId || sort !== "newest" || stockLevel || expiry;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface w-full sm:max-w-md rounded-t-sm sm:rounded-sm shadow-xl flex flex-col max-h-[85vh]">
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

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Expiry</p>
            <div className="grid grid-cols-1 gap-2">
              {EXPIRY_OPTIONS.map((o) => (
                <button
                  key={o.value || "any"}
                  type="button"
                  onClick={() => setExpiry(o.value)}
                  className={`px-3 py-2 rounded-sm border text-sm font-medium cursor-pointer transition-colors text-left ${
                    expiry === o.value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
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
              setExpiry("");
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
