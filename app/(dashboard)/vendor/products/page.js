"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, Upload, ImageOff, ChevronDown, FileSpreadsheet, CheckCircle2, XCircle, SlidersHorizontal, X, Star, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Button } from "@/components/ui/Button.js";
import { Badge } from "@/components/ui/Badge.js";
import { Select } from "@/components/ui/Select.js";
import { SearchInput } from "@/components/ui/SearchInput.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { ConfirmModal } from "@/components/ui/ConfirmModal.js";
import { EmptyState } from "@/components/ui/EmptyState.js";
import { PageHeader } from "@/components/ui/PageHeader.js";
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
  { value: "oversold", label: "Oversold" },
];
const STOCK_LABEL = Object.fromEntries(STOCK_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]));
const EXPIRY_OPTIONS = [
  { value: "", label: "Any date" },
  { value: "soon", label: "Expiring within 30 days" },
  { value: "expired", label: "Already expired" },
];
const EXPIRY_LABEL = Object.fromEntries(EXPIRY_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]));
const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "active", label: "Live" },
  { value: "archived", label: "Archived" },
];
const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]));
const FEATURED_OPTIONS = [
  { value: "", label: "Any" },
  { value: "yes", label: "Featured" },
  { value: "no", label: "Not featured" },
];
const FEATURED_LABEL = { yes: "Featured", no: "Not featured" };

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

const BULK_HEADERS = ["name", "price", "costPrice", "sku", "description", "productType", "condition", "stock", "expiryDate", "categoryName"];
const BULK_TEMPLATE_ROW = {
  name: "Red Tote Bag",
  price: "15000",
  costPrice: "8500",
  sku: "BAG-RED-01",
  description: "Spacious everyday tote in red canvas",
  productType: "physical",
  condition: "new",
  stock: "20",
  expiryDate: "",
  categoryName: "Bags",
};
const BULK_HEADER_ALIASES = Object.fromEntries(
  BULK_HEADERS.flatMap((header) => [
    [header.toLowerCase(), header],
    [header.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`), header],
  ]),
);
const MAX_BULK_FILE_BYTES = 5 * 1024 * 1024;

export default function VendorProductsPage() {
  const router = useRouter();
  // Deep links from the dashboard cards: ?stock=low , ?expiry=soon|expired
  const sp = useSearchParams();
  const initialStock = sp.get("stock") || "";
  const initialExpiry = sp.get("expiry") || "";
  const initialBranch = sp.get("branch") || "";
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
  const [stockLevel, setStockLevel] = useState(["in", "low", "out", "oversold"].includes(initialStock) ? initialStock : "");
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(initialBranch);
  const [branchName, setBranchName] = useState("");
  const [expiry, setExpiry] = useState(["soon", "expired"].includes(initialExpiry) ? initialExpiry : ""); // "" | soon | expired
  const [status, setStatus] = useState(""); // "" | active | archived
  const [featured, setFeatured] = useState(""); // "" | yes | no
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const activeFilterCount =
    (categoryId ? 1 : 0) + (sort !== "newest" ? 1 : 0) + (stockLevel ? 1 : 0) + (expiry ? 1 : 0) + (status ? 1 : 0) + (featured ? 1 : 0) + (branchId ? 1 : 0);

  const MAX_FEATURED = 10;
  const [featuring, setFeaturing] = useState(null); // productId mid-request
  const featuredCount = products.filter((p) => p.featuredOrder != null).length;

  const toggleFeature = async (p) => {
    const next = p.featuredOrder == null;
    if (next && featuredCount >= MAX_FEATURED) {
      toast.error(`You can feature up to ${MAX_FEATURED} products. Remove one first.`);
      return;
    }
    setFeaturing(p.id);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/products/${p.id}/feature`, {
        method: "PATCH",
        body: JSON.stringify({ featured: next }),
      });
      setProducts((list) => list.map((x) => (x.id === p.id ? { ...x, featuredOrder: next ? 999 : null } : x)));
      toast.success(next ? "Added to Featured" : "Removed from Featured");
    } catch (err) {
      toast.error(err.message || "Couldn't update Featured");
    } finally {
      setFeaturing(null);
    }
  };

  // --- Multi-select + bulk delete ---
  const [selected, setSelected] = useState(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const pageIds = products.map((p) => p.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/products/bulk-delete`, {
        method: "POST",
        body: JSON.stringify({ productIds: [...selected] }),
      });
      const blocked = data.blocked || [];
      if (data.deleted > 0 && blocked.length === 0) {
        toast.success(`Deleted ${data.deleted} product${data.deleted === 1 ? "" : "s"}`);
      } else if (data.deleted > 0) {
        toast.success(`Deleted ${data.deleted}. Kept ${blocked.length} with order history, archive those instead.`);
      } else {
        toast.error(`Nothing deleted, ${blocked.length === 1 ? "that product has" : "those products have"} order history. Archive instead.`);
      }
      setConfirmDelete(false);
      clearSelection();
      // Whole page gone -> step back so we're not stranded on an empty page.
      if (data.deleted >= products.length && page > 1) setPage((p) => p - 1);
      else loadProducts();
    } catch (err) {
      toast.error(err.message || "Bulk delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkResults, setBulkResults] = useState(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const bulkFileInputRef = useRef(null);

  const resetBulk = () => {
    setBulkRows([]);
    setBulkFileName("");
    setBulkResults(null);
    if (bulkFileInputRef.current) bulkFileInputRef.current.value = "";
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
    if (branchId) params.set("branch", branchId);
    if (expiry) params.set("expiry", expiry);
    if (status) params.set("status", status);
    if (featured) params.set("featured", featured);
    apiFetch(`/api/v1/vendor/stores/${storeId}/products?${params.toString()}`)
      .then((data) => {
        // Drop a stale response so a slow search for an earlier term
        // can't overwrite the current results.
        if (myReq !== loadSeq.current) return;
        setProducts(data.products);
        setBranches(data.branches || []);
        if (data.selectedBranch) {
          setBranchName(data.selectedBranch.name);
        } else setBranchName("All branches");
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
  }, [token, storeId, page, q, categoryId, sort, stockLevel, expiry, status, featured, branchId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [q, categoryId, sort, stockLevel, expiry, status, featured, branchId, storeId]);

  // Selection is by id against the currently visible page - drop it
  // whenever the visible set changes so no stale/off-screen id lingers.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(new Set());
  }, [q, categoryId, sort, stockLevel, expiry, status, featured, branchId, storeId, page]);

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
      setStatus("");
      setFeatured("");
      setBranchId("");
    }
    storeFiltersInit.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId]);

  const downloadTemplate = () => downloadCsv("products-import-template.csv", BULK_HEADERS, [BULK_TEMPLATE_ROW]);

  const processBulkFile = async (file) => {
    if (!file) return;
    setBulkResults(null);
    setBulkFileName(file.name);
    try {
      if (file.size > MAX_BULK_FILE_BYTES) {
        throw new Error("That CSV is larger than 5 MB");
      }
      const text = await file.text();
      const rows = parseCsv(text).map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [BULK_HEADER_ALIASES[key.trim().toLowerCase()] || key.trim(), value]),
        ),
      );
      if (rows.length === 0) {
        toast.error("No rows found in that file");
        setBulkRows([]);
        return;
      }
      const headers = new Set(Object.keys(rows[0]));
      const missing = ["name", "price"].filter((header) => !headers.has(header));
      if (missing.length > 0) {
        toast.error(`Missing required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`);
        setBulkRows([]);
        return;
      }
      setBulkRows(rows);
    } catch {
      toast.error("Couldn't read that file. Check that it is a valid CSV under 5 MB.");
      setBulkRows([]);
    }
  };

  const handleBulkFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    processBulkFile(file);
  };

  const handleBulkDrop = (e) => {
    e.preventDefault();
    processBulkFile(e.dataTransfer.files?.[0]);
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
      <PageHeader
        title="Products"
        description={
          <span className="inline-flex items-center gap-1">
            <Star size={12} className={featuredCount > 0 ? "fill-amber-400 text-amber-400" : "text-slate-300"} />
            {featuredCount}/{MAX_FEATURED} featured on your storefront
          </span>
        }
        actions={
          <>
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
          </>
        }
      />

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
              <p className="text-xs text-slate-800 max-w-xl leading-relaxed">
                One product per row. Only <code className="text-slate-700">name</code> and{" "}
                <code className="text-slate-700">price</code> are required.{" "}
                <code className="text-slate-700">categoryName</code> must match one of your existing categories.
                Blank cells are fine. Images and variants are added afterward by editing each product.
              </p>
              <Button type="button" size="sm" variant="outline" onClick={downloadTemplate}>
                Download template
              </Button>
            </div>

            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleBulkDrop}
              className="flex flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed border-slate-300 px-4 py-8 text-center cursor-pointer hover:border-brand-400 hover:bg-slate-50 transition-colors"
            >
              <Upload size={20} className="text-slate-400" />
              <span className="text-sm text-slate-600">
                {bulkFileName ? <span className="font-medium text-slate-900">{bulkFileName}</span> : "Choose a .csv file"}
              </span>
              <span className="text-xs text-slate-400">or drag it here</span>
              <input ref={bulkFileInputRef} type="file" accept=".csv,text/csv" onChange={handleBulkFile} className="hidden" />
            </label>

            {bulkRows.length > 0 && !bulkResults && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">
                    <span className="font-medium text-slate-900">{bulkRows.length}</span> row{bulkRows.length === 1 ? "" : "s"} ready to import
                  </p>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={resetBulk} className="text-sm text-slate-800 hover:text-slate-700 cursor-pointer">
                      Clear
                    </button>
                    <Button size="sm" onClick={handleBulkImport} loading={bulkSubmitting}>
                      <Upload size={14} /> Import {bulkRows.length} row{bulkRows.length === 1 ? "" : "s"}
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-800 text-left">
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
                              {r[h] || <span className="text-slate-300">N/A</span>}
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
                        <thead className="bg-slate-50 text-slate-800 text-left sticky top-0">
                          <tr>
                            <th className="px-3 py-2 font-medium">Row</th>
                            <th className="px-3 py-2 font-medium">Name</th>
                            <th className="px-3 py-2 font-medium">Error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bulkResults.filter((r) => r.status === "error").map((r) => (
                            <tr key={r.row} className="border-t border-slate-100">
                              <td className="px-3 py-2 text-slate-800">{r.row}</td>
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

      <div className="bg-surface border border-slate-200 rounded-sm p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 w-full">
            <SearchInput value={q} onSearch={setQ} placeholder="Search products..." className="flex-1" />
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
          {branchName && <p className="text-xs text-slate-600 sm:ml-auto">Showing stock for <span className="font-medium text-slate-800">{branchName}</span></p>}
        </div>

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {status && (
              <FilterChip label={STATUS_LABEL[status]} onClear={() => setStatus("")} />
            )}
            {featured && (
              <FilterChip label={FEATURED_LABEL[featured]} onClear={() => setFeatured("")} />
            )}
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
                setStatus("");
                setFeatured("");
              }}
              className="text-slate-800 hover:text-slate-800 underline cursor-pointer"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

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
          status={status}
          setStatus={setStatus}
          featured={featured}
          setFeatured={setFeatured}
          branches={branches}
          branchId={branchId}
          setBranchId={setBranchId}
          onClose={() => setFiltersOpen(false)}
        />
      )}

      {selected.size > 0 && (
        <div className="sticky top-2 z-20 flex items-center justify-between gap-3 bg-brand-50 border border-brand-200 rounded-sm px-4 py-2.5 shadow-sm">
          <span className="text-sm font-medium text-brand-800">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-3">
            <button type="button" onClick={clearSelection} className="text-sm text-slate-600 hover:text-slate-900 cursor-pointer">
              Clear
            </button>
            <Button type="button" size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} /> Delete
            </Button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmDelete}
        title={`Delete ${selected.size} product${selected.size === 1 ? "" : "s"}?`}
        description="Their images and videos are deleted too. Any product that's already been ordered is kept (archive those instead). This can't be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      {/* Mobile: stacked cards - the desktop table has too many columns to
          fit a phone without horizontal scrolling that hides half of it. */}
      <div className="space-y-3 sm:hidden">
        {loading ? (
          <CardListSkeleton count={5} />
        ) : products.length === 0 ? (
          <EmptyState
            icon={ImageOff}
            title={q || categoryId || stockLevel || expiry || status || featured ? "No matching products" : "No products yet"}
            description={q || categoryId || stockLevel || expiry || status || featured ? "Try another search or clear a filter." : "Add your first product to start selling from this store."}
          />
        ) : (
          products.map((p) => {
            const oversold = p.productType === "physical" && p.stock != null && p.stock < 0;
            const lowStock = p.productType === "physical" && p.stock != null && p.stock >= 0 && p.stock <= lowStockThreshold;
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
                className={`flex gap-3 bg-surface border rounded-sm p-4 cursor-pointer transition-colors ${
                  selected.has(p.id) ? "border-brand-400 bg-brand-50/60" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <label className="flex items-start shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleSelect(p.id)}
                    aria-label={`Select ${p.name}`}
                    className="w-4 h-4 accent-brand-600 cursor-pointer"
                  />
                </label>
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
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-800">
                    <span className="capitalize">{p.productType}</span>
                    {p.productType === "physical" && p.condition !== "new" && <span>· {formatCondition(p.condition)}</span>}
                    {p.categoryName && <span>· {p.categoryName}</span>}
                    {p.productType === "physical" && <span>· {p.stock ?? "-"} in stock</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <Badge color={p.isActive ? "green" : "slate"}>{p.isActive ? "Live" : "Archived"}</Badge>
                    {p.suspendedAt && <Badge color="red">Suspended</Badge>}
                    {oversold && <Badge color="red">Oversold</Badge>}
                    {lowStock && (
                      <Badge color={p.stock === 0 ? "red" : "amber"}>{p.stock === 0 ? "Out of stock" : "Low stock"}</Badge>
                    )}
                    {exp && exp.tone !== "slate" && <Badge color={exp.tone}>{exp.text}</Badge>}
                    {p.featuredOrder != null && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                        <Star size={11} className="fill-amber-400 text-amber-400" /> Featured
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFeature(p);
                      }}
                      disabled={featuring === p.id}
                      className="ml-auto text-slate-300 disabled:opacity-50 cursor-pointer"
                      aria-label={p.featuredOrder != null ? "Remove from Featured" : "Feature on storefront"}
                    >
                      <Star size={16} className={p.featuredOrder != null ? "fill-amber-400 text-amber-400" : ""} />
                    </button>
                    <Link
                      href={`/vendor/products/${p.id}/edit?storeId=${storeId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-sm font-medium text-brand-600 hover:underline"
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
          <thead className="bg-slate-50 text-slate-800 text-left">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all on this page"
                  className="w-4 h-4 accent-brand-600 cursor-pointer align-middle"
                />
              </th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Cost</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Stock{branchName ? ` (${branchName})` : ""}</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableRowSkeleton cols={9} />
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6">
                  <EmptyState
                    icon={ImageOff}
                    title={q || categoryId || stockLevel || expiry || status || featured ? "No matching products" : "No products yet"}
                    description={q || categoryId || stockLevel || expiry || status || featured ? "Try another search or clear a filter." : "Add your first product to start selling from this store."}
                    className="border-0 bg-transparent py-8"
                  />
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/vendor/products/${p.id}?storeId=${storeId}`)}
                  className={`border-t border-slate-100 cursor-pointer ${selected.has(p.id) ? "bg-brand-50" : "hover:bg-slate-50"}`}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      aria-label={`Select ${p.name}`}
                      className="w-4 h-4 accent-brand-600 cursor-pointer align-middle"
                    />
                  </td>
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
                  <td className="px-4 py-3 text-slate-800">{p.categoryName || "-"}</td>
                  <td className="px-4 py-3 text-slate-800">{formatCurrency(p.price)}</td>
                  <td className="px-4 py-3 text-slate-800">{p.costPrice != null ? formatCurrency(p.costPrice) : "N/A"}</td>
                  <td className="px-4 py-3 text-slate-800 capitalize">
                    {p.productType}
                    {p.productType === "physical" && p.condition !== "new" && (
                      <span className="text-slate-700"> · {formatCondition(p.condition)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    {p.productType === "physical" ? (
                      <span className="inline-flex items-center gap-2">
                        {p.stock ?? "-"}
                        {p.stock != null && p.stock < 0 && <Badge color="red">Oversold</Badge>}
                        {p.stock != null && p.stock >= 0 && p.stock <= lowStockThreshold && (
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
                  <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => toggleFeature(p)}
                      disabled={featuring === p.id}
                      aria-pressed={p.featuredOrder != null}
                      title={p.featuredOrder != null ? "Featured on storefront" : "Feature on storefront"}
                      className="mr-3 align-middle text-slate-300 hover:text-amber-400 disabled:opacity-50 cursor-pointer transition-colors"
                    >
                      <Star size={16} className={p.featuredOrder != null ? "fill-amber-400 text-amber-400" : ""} />
                    </button>
                    <Link href={`/vendor/products/${p.id}/edit?storeId=${storeId}`} className="text-brand-600 hover:underline align-middle">Edit</Link>
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
function ProductFiltersModal({ categories, categoryId, setCategoryId, sort, setSort, stockLevel, setStockLevel, expiry, setExpiry, status, setStatus, featured, setFeatured, branches, branchId, setBranchId, onClose }) {
  const anyActive = categoryId || sort !== "newest" || stockLevel || expiry || status || featured;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface w-full sm:max-w-lg rounded-t-sm sm:rounded-sm shadow-xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
          <p className="text-sm font-bold text-slate-900">Filters</p>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {branches.length > 0 && (
            <div className="space-y-1 sm:col-span-2">
              <p className="text-xs font-semibold text-slate-700">Stock branch</p>
              <Select options={[{ value: "", label: "All branches (store total)" }, ...branches.map((branch) => ({ value: branch.id, label: branch.name }))]} value={branchId} onChange={setBranchId} />
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</p>
            <div className="grid grid-cols-3 gap-2">
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value || "any"}
                  type="button"
                  onClick={() => setStatus(o.value)}
                  className={`px-2 py-1.5 rounded-sm border text-xs font-medium cursor-pointer transition-colors ${
                    status === o.value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Featured</p>
            <div className="grid grid-cols-3 gap-2">
              {FEATURED_OPTIONS.map((o) => (
                <button
                  key={o.value || "any"}
                  type="button"
                  onClick={() => setFeatured(o.value)}
                  className={`px-2 py-1.5 rounded-sm border text-xs font-medium cursor-pointer transition-colors ${
                    featured === o.value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Stock level</p>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {STOCK_OPTIONS.map((o) => (
                <button
                  key={o.value || "any"}
                  type="button"
                  onClick={() => setStockLevel(o.value)}
                  className={`px-2 py-1.5 rounded-sm border text-xs font-medium cursor-pointer transition-colors ${
                    stockLevel === o.value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Expiry</p>
            <div className="grid grid-cols-3 gap-1.5">
              {EXPIRY_OPTIONS.map((o) => (
                <button
                  key={o.value || "any"}
                  type="button"
                  onClick={() => setExpiry(o.value)}
                  className={`px-2 py-1.5 rounded-sm border text-xs font-medium cursor-pointer transition-colors ${
                    expiry === o.value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {categories.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Category</p>
              <Select
                options={[{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
                value={categoryId}
                onChange={setCategoryId}
              />
            </div>
          )}

          <div className="space-y-1">
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
              setStatus("");
              setFeatured("");
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
