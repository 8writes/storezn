import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { products, productVariants } from "@/lib/db/schema.js";
import { resolveStoreByHost } from "@/lib/resolveStore.js";
import { getStorefrontUrl } from "@/lib/storeUrl.js";
import { formatCondition, formatCurrency } from "@/lib/format.js";
import { getEffectivePrice, stripInternalProductFields } from "@/lib/pricing.js";
import { MapPin } from "lucide-react";
import { formatStateLabel } from "@/lib/nigeria.js";
import { AddToCartButton } from "@/components/storefront/AddToCartButton.js";
import { ProductAssurances } from "@/components/storefront/ProductAssurances.js";
import { ReviewsSection } from "@/components/storefront/ReviewsSection.js";
import { ProductGallery } from "@/components/storefront/ProductGallery.js";
import { ShareButton } from "@/components/storefront/ShareButton.js";
import { BackButton } from "@/components/storefront/BackButton.js";

async function loadProduct(host, slug) {
  const store = await resolveStoreByHost(decodeURIComponent(host));
  if (!store) return { store: null, product: null };
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.storeId, store.id), eq(products.slug, slug), eq(products.isActive, true), isNull(products.suspendedAt)))
    .limit(1);
  // costPrice must never reach the storefront.
  return { store, product: product ? stripInternalProductFields(product) : null };
}

// So sharing a product (the new Share button below) previews with that
// product's own name/price/photo, not just the store's generic card from
// the parent layout's generateMetadata.
export async function generateMetadata({ params }) {
  const { host, slug } = await params;
  const { store, product } = await loadProduct(host, slug);
  if (!store || !product) return {};

  const title = `${product.name} - ${store.name}`;
  const description = product.description
    ? product.description.slice(0, 200)
    : `${formatCurrency(getEffectivePrice(product.price, product.discountPercent))} at ${store.name}.`;
  const url = `${getStorefrontUrl(store)}/products/${product.slug}`;
  const image = product.images?.[0];

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: store.name,
      images: image ? [{ url: image }] : undefined,
      type: "website",
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function StorefrontProductPage({ params }) {
  const { host, slug } = await params;
  const { store, product } = await loadProduct(host, slug);
  if (!store) return null;
  if (!product) return notFound();

  const variants = await db
    .select()
    .from(productVariants)
    .where(and(eq(productVariants.productId, product.id), eq(productVariants.isActive, true)));

  return (
    <div className="pb-24 sm:pb-0">
      <BackButton className="mb-6" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16">
        <ProductGallery images={product.images || []} videoUrl={product.videoUrl} name={product.name} />

        <div className="space-y-6 md:pt-2">
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">{product.name}</h1>
                {product.productType === "physical" && product.condition !== "new" && (
                  <span className="shrink-0 px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-sm uppercase tracking-wide">
                    {formatCondition(product.condition)}
                  </span>
                )}
              </div>
              <ShareButton url={`${getStorefrontUrl(store)}/products/${product.slug}`} title={product.name} className="shrink-0 mt-1" />
            </div>
            {product.sku && <p className="text-xs text-slate-700">SKU: {product.sku}</p>}
          </div>

          {product.description && <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{product.description}</p>}

          {Array.isArray(product.priceTiers) && product.priceTiers.length > 0 && variants.length === 0 && (
            <div className="rounded-sm border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-700">Buy in bundles, pay less</p>
              <ul className="mt-1.5 space-y-1 text-sm text-slate-700">
                {[...product.priceTiers]
                  .sort((a, b) => (a.bundleQty ?? 0) - (b.bundleQty ?? 0))
                  .map((t, i) => (
                    <li key={i} className="flex justify-between gap-4">
                      <span>Bundle of {t.bundleQty}</span>
                      <span className="font-medium text-slate-900">{formatCurrency(t.unitPrice)} each</span>
                    </li>
                  ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-slate-500">Extra units above a whole bundle are charged the normal price.</p>
            </div>
          )}

          {product.productType === "physical" && variants.length === 0 && product.stock != null && (
            <p className="text-xs text-slate-700 uppercase tracking-wide">{product.stock} in stock</p>
          )}

          {store.showShipsFrom !== false && store.state && (
            <p className="flex items-center gap-1.5 text-xs text-slate-800">
              <MapPin size={13} className="shrink-0" />
              Ships from {formatStateLabel(store.state)}
            </p>
          )}

          <div className="pt-2 border-t border-slate-100">
            <AddToCartButton
              productId={product.id}
              basePrice={product.price}
              baseDiscountPercent={product.discountPercent}
              baseStock={product.stock}
              productType={product.productType}
              variants={variants}
              allowStandardVariant={product.allowStandardVariant}
              sizeGuide={product.sizeGuide}
            />
          </div>

          <ProductAssurances returnWindowDays={store.returnWindowDays} productType={product.productType} />
        </div>
      </div>

      <ReviewsSection productId={product.id} />
    </div>
  );
}
