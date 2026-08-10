import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { products } from "../../../../../../../lib/db/schema.js";
import { eq } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../../../lib/auth.js";
import { validate, suspendProductSchema } from "../../../../../../../lib/validate.js";

// A product only ever shows on the storefront when isActive AND
// suspendedAt is null - the vendor's own PATCH .../products/[id] route
// never touches suspendedAt/suspendedReason, so only this endpoint can
// clear a suspension, see products.suspendedAt in lib/db/schema.js.
export async function POST(req, { params }) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(suspendProductSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { suspended, reason } = result.data;

  const [updated] = await db
    .update(products)
    .set({
      suspendedAt: suspended ? new Date() : null,
      suspendedReason: suspended ? reason || null : null,
      updatedAt: new Date(),
    })
    .where(eq(products.id, id))
    .returning();

  return NextResponse.json({ product: updated });
}
