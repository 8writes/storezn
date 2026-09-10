"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { Badge } from "@/components/ui/Badge.js";
import { Button } from "@/components/ui/Button.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency, formatDateTime, formatCondition } from "@/lib/format.js";
import { getStorefrontUrl } from "@/lib/storeUrl.js";

export default function SuperAdminProductDetailPage({ params }) {
  const { id } = use(params);
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { confirm, confirmDialog } = useConfirm();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = () => {
    apiFetch(`/api/v1/super-admin/products/${id}`)
      .then(setData)
      .catch((err) => toast.error(err.message || "Could not load product"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  const handleToggleSuspend = async () => {
    const suspending = !data.product.suspendedAt;
    const reason = await confirm({
      title: suspending ? `Suspend ${data.product.name}?` : `Unsuspend ${data.product.name}?`,
      description: suspending ? "It disappears from the storefront immediately - tell the vendor why." : "It becomes visible on the storefront again (if the vendor has it set Live).",
      requireReason: suspending,
      confirmLabel: suspending ? "Suspend" : "Unsuspend",
      variant: suspending ? "danger" : "default",
    });
    if (!reason) return;

    setActing(true);
    try {
      await apiFetch(`/api/v1/super-admin/products/${id}/suspend`, {
        method: "POST",
        body: JSON.stringify({ suspended: suspending, reason: suspending ? reason : undefined }),
      });
      toast.success(suspending ? "Product suspended" : "Product unsuspended");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to update product");
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <BackLink href="/super-admin/products" label="Back to products" />
        <FormSkeleton fields={6} />
      </div>
    );
  }
  if (!data) return null;

  const { product, variants } = data;

  return (
    <div className="max-w-2xl space-y-6">
      {confirmDialog}
      <BackLink href="/super-admin/products" label="Back to products" />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{product.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {product.storeName} · Listed {formatDateTime(product.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge color={product.isActive ? "green" : "slate"}>{product.isActive ? "Live" : "Hidden"}</Badge>
          {product.suspendedAt && <Badge color="red">Suspended</Badge>}
        </div>
      </div>

      {product.suspendedAt && (
        <div className="bg-red-50 border border-red-200 rounded-sm p-4 text-sm text-red-800">
          <p className="font-medium">Suspended {formatDateTime(product.suspendedAt)}</p>
          {product.suspendedReason && <p>{product.suspendedReason}</p>}
        </div>
      )}

      {product.images?.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {product.images.map((url) => (
            <img key={url} src={url} alt="" className="w-20 h-20 object-cover rounded-sm border border-slate-200" />
          ))}
        </div>
      )}

      <div className="bg-surface border border-slate-200 rounded-sm p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-slate-700">Price</p>
          <p className="text-slate-900 font-medium">{formatCurrency(product.price)}</p>
        </div>
        <div>
          <p className="text-slate-700">SKU</p>
          <p className="text-slate-900 font-medium">{product.sku || "-"}</p>
        </div>
        <div>
          <p className="text-slate-700">Type</p>
          <p className="text-slate-900 font-medium capitalize">{product.productType}</p>
        </div>
        {product.productType === "physical" && (
          <>
            <div>
              <p className="text-slate-700">Condition</p>
              <p className="text-slate-900 font-medium">{formatCondition(product.condition)}</p>
            </div>
            <div>
              <p className="text-slate-700">Stock</p>
              <p className="text-slate-900 font-medium">{product.stock ?? "Unlimited"}</p>
            </div>
          </>
        )}
        <div>
          <p className="text-slate-700">Category</p>
          <p className="text-slate-900 font-medium">{product.categoryName || "-"}</p>
        </div>
      </div>

      {product.description && (
        <div className="bg-surface border border-slate-200 rounded-sm p-5 text-sm text-slate-700 whitespace-pre-line">
          {product.description}
        </div>
      )}

      {variants.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">Variants</p>
          <div className="bg-surface border border-slate-200 rounded-sm divide-y divide-slate-100">
            {variants.map((v) => (
              <div key={v.id} className="flex items-center justify-between p-3 text-sm">
                <p className="text-slate-900">{Object.entries(v.options).map(([k, val]) => `${k}: ${val}`).join(", ")}</p>
                <p className="text-slate-500">
                  {v.sku && `SKU ${v.sku} · `}
                  {v.price != null ? formatCurrency(v.price) : "uses product price"} · {v.stock != null ? `${v.stock} in stock` : "no stock limit"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Link
        href={`${getStorefrontUrl({ slug: product.storeSlug, customDomain: product.storeCustomDomain, domainStatus: product.storeDomainStatus })}/products/${product.slug}`}
        target="_blank"
        className="text-sm text-brand-600 hover:underline block"
      >
        View on storefront 
      </Link>

      <Button variant={product.suspendedAt ? "primary" : "danger"} onClick={handleToggleSuspend} loading={acting}>
        {product.suspendedAt ? "Unsuspend product" : "Suspend product"}
      </Button>
    </div>
  );
}
