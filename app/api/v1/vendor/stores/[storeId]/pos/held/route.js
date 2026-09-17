import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { posHeldSales } from "@/lib/db/schema.js";
import { validate, holdSaleSchema } from "@/lib/validate.js";
import { posContext, loadSession } from "@/lib/posAccess.js";
import { lockPosSession } from "@/lib/posSession.js";

// GET  ?sessionId= -> parked sales for that session.
// POST             -> park the current cart (client-side snapshot only,
//                     no order row, no stock held).
export async function GET(req, { params }) {
  const { storeId } = await params;
  const ctx = await posContext(req, storeId);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  const row = await loadSession(storeId, sessionId, ctx.user);
  if (!row) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const held = await db
    .select()
    .from(posHeldSales)
    .where(eq(posHeldSales.sessionId, sessionId))
    .orderBy(desc(posHeldSales.createdAt));
  return NextResponse.json({ heldSales: held });
}

export async function POST(req, { params }) {
  const { storeId } = await params;
  const ctx = await posContext(req, storeId);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json().catch(() => null);
  const result = validate(holdSaleSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const row = await loadSession(storeId, result.data.sessionId, ctx.user);
  if (!row) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  let held;
  try {
    held = await db.transaction(async (tx) => {
      const session = await lockPosSession(tx, result.data.sessionId);
      if (!session || session.status !== "open") {
        throw Object.assign(new Error("This session is closed"), { code: "SESSION_CLOSED" });
      }
      const [created] = await tx.insert(posHeldSales).values({
        sessionId: result.data.sessionId, label: result.data.label || null,
        cart: result.data.cart, customer: result.data.customer || null, createdBy: ctx.user.id,
      }).returning();
      return created;
    });
  } catch (error) {
    if (error.code === "SESSION_CLOSED") return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
  return NextResponse.json({ heldSale: held }, { status: 201 });
}
