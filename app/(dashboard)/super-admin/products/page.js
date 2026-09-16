"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { Select } from "@/components/ui/Select.js";
import { Badge } from "@/components/ui/Badge.js";
import { SearchInput } from "@/components/ui/SearchInput.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { TableRowSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency } from "@/lib/format.js";

const SUSPENDED_OPTIONS = [
  { value: "", label: "All products" },
  { value: "false", label: "Not suspended" },
  { value: "true", label: "Suspended" },
];

export default function SuperAdminProductsPage() {
  const router = useRouter();
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { confirm, confirmDialog } = useConfirm();

  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [suspended, setSuspended] = useState("");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (q.trim()) params.set("q", q.trim());
    if (suspended) params.set("suspended", suspended);
    apiFetch(`/api/v1/super-admin/products?${params}`)
      .then((data) => {
        setProducts(data.products);
        setPagination(data.pagination);
      })
      .catch((err) => toast.error(err.message || "Failed to load products"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, q, suspended]);

  useEffect(() => {
    setPage(1);
  }, [q, suspended]);

  const handleToggleSuspend = async (product) => {
    const suspending = !product.suspendedAt;
    const reason = await confirm({
      title: suspending ? `Suspend ${product.name}?` : `Unsuspend ${product.name}?`,
      description: suspending ? "It disappears from the storefront immediately - tell the vendor why." : "It becomes visible on the storefront again (if the vendor has it set Live).",
      requireReason: suspending,
      confirmLabel: suspending ? "Suspend" : "Unsuspend",
      variant: suspending ? "danger" : "default",
    });
    if (!reason) return;

    setActingId(product.id);
    try {
      await apiFetch(`/api/v1/super-admin/products/${product.id}/suspend`, {
        method: "POST",
        body: JSON.stringify({ suspended: suspending, reason: suspending ? reason : undefined }),
      });
      toast.success(suspending ? "Product suspended" : "Product unsuspended");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to update product");
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {confirmDialog}
      <h1 className="text-xl font-bold text-slate-900">Products</h1>

      <div className="flex flex-col sm:flex-row gap-4">
        <SearchInput value={q} onSearch={setQ} placeholder="Search products..." className="max-w-sm" />
        <div className="max-w-xs">
          <Select options={SUSPENDED_OPTIONS} value={suspended} onChange={setSuspended} />
        </div>
      </div>

      <div className="bg-surface border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-800 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Store</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableRowSkeleton cols={5} />
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-700">No products match</td>
              </tr>
            ) : (
              products.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/super-admin/products/${p.id}`)}
                  className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                  <td className="px-4 py-3 text-slate-800">{p.storeName}</td>
                  <td className="px-4 py-3 text-slate-800">{formatCurrency(p.price)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge color={p.isActive ? "green" : "slate"}>{p.isActive ? "Live" : "Hidden"}</Badge>
                      {p.suspendedAt && <Badge color="red">Suspended</Badge>}
                    </div>
                    {p.suspendedReason && <p className="text-xs text-slate-700 mt-1">{p.suspendedReason}</p>}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-3">
                      <Link href={`/super-admin/products/${p.id}`} className="text-brand-600 hover:underline">View</Link>
                      <button
                        type="button"
                        disabled={actingId === p.id}
                        onClick={() => handleToggleSuspend(p)}
                        className={`hover:underline disabled:opacity-50 cursor-pointer ${p.suspendedAt ? "text-green-600" : "text-red-600"}`}
                      >
                        {p.suspendedAt ? "Unsuspend" : "Suspend"}
                      </button>
                    </div>
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
