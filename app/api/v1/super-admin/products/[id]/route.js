import { NextResponse } from "next/server";
import { db } from "../../../../../../lib/db/index.js";
import { products, productVariants, stores, categories } from "../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../../lib/auth.js";

// Full detail view for one product, for the admin moderation queue - see
// app/(dashboard)/super-admin/products/page.js's "View" link.
export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin", "p_staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [row] = await db
    .select({
      product: products,
      storeName: stores.name,
      storeSlug: stores.slug,
      storeCustomDomain: stores.customDomain,
      storeDomainStatus: stores.domainStatus,
      categoryName: categories.name,
    })
    .from(products)
    .innerJoin(stores, eq(products.storeId, stores.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const variants = await db.select().from(productVariants).where(eq(productVariants.productId, id));

  return NextResponse.json({
    product: {
      ...row.product,
      storeName: row.storeName,
      storeSlug: row.storeSlug,
      storeCustomDomain: row.storeCustomDomain,
      storeDomainStatus: row.storeDomainStatus,
      categoryName: row.categoryName,
    },
    variants,
  });
}
