import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { products, productVariants } from "@/lib/db/schema.js";
import { resolveStoreByHost } from "@/lib/resolveStore.js";
import { AddToCartButton } from "@/components/storefront/AddToCartButton.js";
import { ReviewsSection } from "@/components/storefront/ReviewsSection.js";
import { ProductGallery } from "@/components/storefront/ProductGallery.js";

export default async function StorefrontProductPage({ params }) {
  const { host, slug } = await params;
  const store = await resolveStoreByHost(decodeURIComponent(host));
  if (!store) return null;

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.storeId, store.id), eq(products.slug, slug), eq(products.isActive, true), isNull(products.suspendedAt)))
    .limit(1);
  if (!product) return notFound();

  const variants = await db
    .select()
    .from(productVariants)
    .where(and(eq(productVariants.productId, product.id), eq(productVariants.isActive, true)));

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16">
        <ProductGallery images={product.images || []} name={product.name} />

        <div className="space-y-6 md:pt-2">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">{product.name}</h1>
              {product.productType === "physical" && product.condition === "used" && (
                <span className="shrink-0 px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-sm uppercase tracking-wide">Used</span>
              )}
            </div>
            {product.sku && <p className="text-xs text-slate-400">SKU: {product.sku}</p>}
          </div>

          {product.description && <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{product.description}</p>}

          <p className="text-xs text-slate-400 uppercase tracking-wide">
            {product.productType === "physical" ? "Ships to your address" : "Digital delivery"}
            {product.productType === "physical" && variants.length === 0 && product.stock != null && ` · ${product.stock} in stock`}
          </p>

          <div className="pt-2 border-t border-slate-100">
            <AddToCartButton productId={product.id} basePrice={product.price} productType={product.productType} variants={variants} />
          </div>
        </div>
      </div>

      <ReviewsSection productId={product.id} />
    </div>
  );
}
