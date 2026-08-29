"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Upload, ImageOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Button } from "@/components/ui/Button.js";
import { Badge } from "@/components/ui/Badge.js";
import { Select } from "@/components/ui/Select.js";
import { SearchInput } from "@/components/ui/SearchInput.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { TableRowSkeleton, CardListSkeleton } from "@/components/ui/Skeleton.js";
import { InfoTip } from "@/components/ui/InfoTip.js";
import { formatCurrency, formatCondition } from "@/lib/format.js";
import { parseCsv, downloadCsv } from "@/lib/csv.js";

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
  const [loading, setLoading] = useState(true);

  const [bulkRows, setBulkRows] = useState([]);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkResults, setBulkResults] = useState(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const loadProducts = () => {
    if (!token || !storeId) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "5" });
    if (q.trim()) params.set("q", q.trim());
    if (categoryId) params.set("category", categoryId);
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
  }, [token, storeId, page, q, categoryId]);

  useEffect(() => {
    setPage(1);
  }, [q, categoryId, storeId]);

  useEffect(() => {
    if (!token || !storeId) return;
    apiFetch(`/api/v1/vendor/stores/${storeId}/categories`)
      .then((data) => setCategories(data.categories))
      .catch(() => {});
    setCategoryId("");
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
        <Link href={`/vendor/products/new${storeId ? `?storeId=${storeId}` : ""}`}>
          <Button type="button" size="sm">
            <Plus size={16} />
            Add product
          </Button>
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            Bulk import (CSV)
            <InfoTip>
              Migrating a catalog from a spreadsheet? Columns: {BULK_HEADERS.join(", ")}. Only <code>name</code> and <code>price</code> are
              required - <code>categoryName</code> must match an existing category exactly. No images or variants here - add those
              afterward by editing each product.
            </InfoTip>
          </p>
          <button type="button" onClick={downloadTemplate} className="text-sm text-brand-600 hover:underline cursor-pointer">
            Download template
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".csv,text/csv" onChange={handleBulkFile} className="text-sm" />
          {bulkRows.length > 0 && (
            <>
              <span className="text-sm text-slate-500">{bulkRows.length} row{bulkRows.length === 1 ? "" : "s"} ready from {bulkFileName}</span>
              <Button size="sm" onClick={handleBulkImport} loading={bulkSubmitting}>
                <Upload size={14} /> Import {bulkRows.length} row{bulkRows.length === 1 ? "" : "s"}
              </Button>
            </>
          )}
        </div>

        {bulkResults && (
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <p className="text-sm">
              <span className="text-green-700 font-medium">{bulkResults.filter((r) => r.status === "created").length} created</span>
              {" · "}
              <span className="text-red-700 font-medium">{bulkResults.filter((r) => r.status === "error").length} failed</span>
            </p>
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

      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end sm:justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3">
          <SearchInput value={q} onSearch={setQ} placeholder="Search products..." className="w-full sm:max-w-sm" />
          {categories.length > 0 && (
            <div className="w-full sm:w-48">
              <Select
                options={[{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
                value={categoryId}
                onChange={setCategoryId}
                placeholder="All categories"
              />
            </div>
          )}
        </div>
        <Link href="/vendor/categories" className="text-sm text-brand-600 hover:underline">
          Manage categories
        </Link>
      </div>

      {/* Mobile: stacked cards - the desktop table has too many columns to
          fit a phone without horizontal scrolling that hides half of it. */}
      <div className="space-y-3 sm:hidden">
        {loading ? (
          <CardListSkeleton count={5} />
        ) : products.length === 0 ? (
          <p className="bg-white border border-slate-200 rounded-sm px-4 py-6 text-center text-sm text-slate-700">
            {q || categoryId ? "No products match your filters" : "No products yet"}
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
                <td colSpan={7} className="px-4 py-6 text-center text-slate-700">{q || categoryId ? "No products match your filters" : "No products yet"}</td>
              </tr>
            ) : (
              products.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/vendor/products/${p.id}?storeId=${storeId}`)}
                  className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3 text-slate-500">{p.categoryName || "-"}</td>
                  <td className="px-4 py-3 text-slate-500">{formatCurrency(p.price)}</td>
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
