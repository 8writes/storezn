import { db } from "./db/index.js";
import { stores, users } from "./db/schema.js";
import { and, eq, count } from "drizzle-orm";

// Same "live" definition as isStoreLive in lib/resolveStore.js, applied as
// a join/filter instead of a per-row host lookup - lists many stores at
// once (public directory, homepage teaser) rather than resolving one by
// host.
export async function getLiveStores({ page = 1, pageSize = 24 } = {}) {
  const where = and(eq(stores.isActive, true), eq(stores.isOpen, true), eq(users.approvalStatus, "approved"));

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ store: stores })
      .from(stores)
      .innerJoin(users, eq(stores.ownerId, users.id))
      .where(where)
      .orderBy(stores.createdAt)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(stores).innerJoin(users, eq(stores.ownerId, users.id)).where(where),
  ]);

  return { list: rows.map((r) => r.store), total };
}
