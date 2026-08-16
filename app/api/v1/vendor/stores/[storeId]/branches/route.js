import { NextResponse } from "next/server";
import { db } from "../../../../../../../lib/db/index.js";
import { stores, branches, platformSettings } from "../../../../../../../lib/db/schema.js";
import { and, count, eq } from "drizzle-orm";
import { getUser, isStoreOwner } from "../../../../../../../lib/auth.js";
import { validate, createBranchSchema } from "../../../../../../../lib/validate.js";
import { getBranchLimit } from "../../../../../../../lib/storePlan.js";
import { seedNewBranchStock } from "../../../../../../../lib/inventory.js";

async function loadStore(storeId) {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return store;
}

async function loadSettings() {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, "singleton")).limit(1);
  return row || { freeBranchLimit: 1, plusBranchLimit: 5 };
}

// Branch management is owner-only, same as staff (see isStoreOwner vs
// canManageStore in lib/auth.js) - a branch-scoped staff member helps
// run their own location day-to-day, but doesn't manage the branch list
// itself.
export async function GET(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.select().from(branches).where(eq(branches.storeId, storeId)).orderBy(branches.createdAt);
  const settings = await loadSettings();
  return NextResponse.json({ branches: rows, max: getBranchLimit(store, settings) });
}

export async function POST(req, { params }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storeId } = await params;
  const store = await loadStore(storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!isStoreOwner(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await loadSettings();
  const branchLimit = getBranchLimit(store, settings);
  const [{ branchCount }] = await db.select({ branchCount: count() }).from(branches).where(eq(branches.storeId, storeId));
  if (branchCount >= branchLimit) {
    return NextResponse.json(
      { error: `You can have at most ${branchLimit} branch${branchLimit === 1 ? "" : "es"}${branchLimit <= 1 ? " on the free plan - upgrade to Storezn+ for more" : ""}` },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(createBranchSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const created = await db.transaction(async (tx) => {
    const [branch] = await tx.insert(branches).values({ storeId, ...result.data, isDefault: false }).returning();
    // Every existing product/variant needs an explicit 0 row at the new
    // branch - see seedNewBranchStock's own comment in lib/inventory.js
    // for why "no row" can't just be left to mean the same thing.
    await seedNewBranchStock(tx, storeId, branch.id);
    return branch;
  });

  return NextResponse.json({ branch: created }, { status: 201 });
}
