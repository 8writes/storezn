"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { Button } from "@/components/ui/Button.js";
import { Badge } from "@/components/ui/Badge.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency, formatCondition } from "@/lib/format.js";

// Read-only detail view - the landing page for clicking a product from
// the list (see (dashboard)/vendor/products/page.js), separate from
// [id]/edit which has the actual editable form. Splitting these means a
// click into a product shows what it looks like before committing to
// changing anything, with Edit/Archive/Delete as explicit next steps
// rather than dropping straight into an edit form.
export default function VendorProductViewPage({ params }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const storeId = searchParams.get("storeId");
  const router = useRouter();
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { confirm, confirmDialog } = useConfirm();

  const [product, setProduct] = useState(null);
  const [category, setCategory] = useState(null);
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!token || !storeId) return;
    Promise.all([
      apiFetch(`/api/v1/vendor/stores/${storeId}/products/${id}`),
      apiFetch(`/api/v1/vendor/stores/${storeId}/categories`),
      apiFetch(`/api/v1/vendor/stores/${storeId}/products/${id}/variants`),
    ])
      .then(([{ product }, categoriesData, variantsData]) => {
        setProduct(product);
        setCategory(categoriesData.categories.find((c) => c.id === product.categoryId) || null);
        setVariants(variantsData.variants);
        setActiveImage(0);
      })
      .catch((err) => toast.error(err.message || "Failed to load product"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId, id]);

  const handleArchiveToggle = async () => {
    setArchiving(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !product.isActive }),
      });
      setProduct(data.product);
      toast.success(data.product.isActive ? "Product unarchived - back on your storefront" : "Product archived - hidden from your storefront");
    } catch (err) {
      toast.error(err.message || "Failed to update product");
    } finally {
      setArchiving(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete ${product.name}?`,
      description: "This removes the product permanently. This can't be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    setDeleting(true);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/products/${id}`, { method: "DELETE" });
      toast.success("Product deleted");
      router.replace("/vendor/products");
    } catch (err) {
      // A product that's already been ordered can't be hard-deleted (see
      // the DELETE route) - the server's own error message already says
      // so and points at archiving instead, so it's shown as-is.
      toast.error(err.message || "Failed to delete product");
      setDeleting(false);
    }
  };

  if (loading || !product) {
    return (
      <div className="space-y-6">
        <BackLink href="/vendor/products" label="Back to products" />
        <FormSkeleton fields={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <BackLink href="/vendor/products" label="Back to products" />

      {product.suspendedAt && (
        <div className="bg-red-50 border border-red-200 rounded-sm p-4 text-sm text-red-800">
          <p className="font-medium">Suspended by admin</p>
          <p>{product.suspendedReason || "No reason given."} It won&apos;t show on your storefront until an admin lifts the suspension.</p>
        </div>
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900">{product.name}</h1>
            <Badge color={product.isActive ? "green" : "slate"}>{product.isActive ? "Live" : "Archived"}</Badge>
            {product.suspendedAt && <Badge color="red">Suspended</Badge>}
          </div>
          {product.sku && <p className="text-xs text-slate-700 mt-1">SKU: {product.sku}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
          <Link href={`/vendor/products/${id}/edit?storeId=${storeId}`}>
            <Button type="button" variant="outline" size="sm">
              <Pencil size={14} />
              Edit
            </Button>
          </Link>
          <Button type="button" variant="outline" size="sm" onClick={handleArchiveToggle} loading={archiving}>
            {product.isActive ? <Archive size={14} /> : <ArchiveRestore size={14} />}
            {product.isActive ? "Archive" : "Unarchive"}
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={handleDelete} loading={deleting}>
            <Trash2 size={14} />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="aspect-square bg-slate-100 rounded-sm overflow-hidden border border-slate-200">
            {product.images?.[activeImage] ? (
              <img src={product.images[activeImage]} alt={product.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-300 text-sm">No photos</div>
            )}
          </div>
          {product.images?.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {product.images.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  className={`w-14 h-14 rounded-sm overflow-hidden border-2 cursor-pointer shrink-0 ${i === activeImage ? "border-brand-500" : "border-transparent"}`}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-3">
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(product.price)}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-700">Type</dt>
              <dd className="text-slate-700 capitalize">{product.productType}</dd>
              {product.productType === "physical" && (
                <>
                  <dt className="text-slate-700">Condition</dt>
                  <dd className="text-slate-700">{formatCondition(product.condition)}</dd>
                  <dt className="text-slate-700">Stock</dt>
                  <dd className="text-slate-700">{product.stock ?? "Unlimited"}</dd>
                </>
              )}
              <dt className="text-slate-700">Category</dt>
              <dd className="text-slate-700">{category?.name || "None"}</dd>
              <dt className="text-slate-700">Sold</dt>
              <dd className="text-slate-700">{product.unitsSold} unit{product.unitsSold === 1 ? "" : "s"}</dd>
            </dl>
          </div>

          {product.description && (
            <div className="bg-white border border-slate-200 rounded-sm p-5">
              <p className="text-sm font-medium text-slate-700 mb-1.5">Description</p>
              <p className="text-sm text-slate-700 whitespace-pre-line">{product.description}</p>
            </div>
          )}

          {variants.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-2">
              <p className="text-sm font-medium text-slate-700">Variants</p>
              <div className="divide-y divide-slate-100">
                {variants.map((v) => (
                  <div key={v.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-slate-700">
                      {Object.entries(v.options).map(([k, val]) => `${k}: ${val}`).join(", ")}
                    </span>
                    <span className="text-slate-500">
                      {v.price != null ? formatCurrency(v.price) : "uses product price"} · {v.stock != null ? `${v.stock} in stock` : "no limit"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmDialog}
    </div>
  );
}
