"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Button } from "@/components/ui/Button.js";
import { Badge } from "@/components/ui/Badge.js";
import { SearchInput } from "@/components/ui/SearchInput.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { TableRowSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency, formatCondition } from "@/lib/format.js";

export default function VendorProductsPage() {
  const router = useRouter();
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const { stores, storeId, loading: storesLoading } = useVendorStore();
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const loadProducts = () => {
    if (!token || !storeId) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "5" });
    if (q.trim()) params.set("q", q.trim());
    apiFetch(`/api/v1/vendor/stores/${storeId}/products?${params.toString()}`)
      .then((data) => {
        setProducts(data.products);
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
  }, [token, storeId, page, q]);

  useEffect(() => {
    setPage(1);
  }, [q, storeId]);

  if (!storesLoading && stores.length === 0) {
    return <p className="text-sm text-slate-400">No store set up yet.</p>;
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

      <SearchInput value={q} onSearch={setQ} placeholder="Search products..." className="max-w-sm" />

      <div className="bg-white border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableRowSkeleton cols={6} />
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">{q ? "No products match your search" : "No products yet"}</td>
              </tr>
            ) : (
              products.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/vendor/products/${p.id}?storeId=${storeId}`)}
                  className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3 text-slate-500">{formatCurrency(p.price)}</td>
                  <td className="px-4 py-3 text-slate-500 capitalize">
                    {p.productType}
                    {p.productType === "physical" && p.condition !== "new" && (
                      <span className="text-slate-400"> · {formatCondition(p.condition)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {p.productType === "physical" ? (
                      <span className="inline-flex items-center gap-2">
                        {p.stock ?? "-"}
                        {p.stock != null && p.stock <= 5 && (
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
