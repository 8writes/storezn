import jwt from "jsonwebtoken";
import { db } from "./db/index.js";
import { users, staff, customers, stores } from "./db/schema.js";
import { eq } from "drizzle-orm";

// Vendor/super_admin still live in `users`; staff and customers each got
// their own table (see lib/db/schema.js) so the same email can be staff
// at one store, a customer at another, and a vendor of their own, without
// colliding on a single global-unique email column. A bare id is no
// longer enough to know where to look, so the JWT carries a `kind`
// alongside it (see the three jwt.sign call sites: auth/login,
// vendor/signup, auth/signup). Every branch below normalizes its return
// shape to the same `{ ...row, role }` fields a `users` row always had,
// so the ~25 call sites across the app that read `.role`/`.storeId`/
// `.branchId` off whatever getUser returns don't need to change.
export async function getUser(req) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;

  let payload;
  try {
    // Pin the algorithm - jwt.sign (auth/login, vendor/signup, auth/signup)
    // always uses HS256, so accepting anything else just widens the attack
    // surface for no reason.
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    return null;
  }

  // Old tokens issued before this field existed only ever pointed at
  // `users` (vendor/super_admin/staff/customer all lived there back
  // then) - defaulting to "user" here, and to the old `.userId` payload
  // shape, keeps them working through their natural 30-day expiry
  // instead of forcing every signed-in session to re-login the moment
  // this ships.
  const kind = payload.kind || "user";
  const id = payload.id ?? payload.userId;

  if (kind === "staff") {
    const [row] = await db.select().from(staff).where(eq(staff.id, id)).limit(1);
    if (!row || row.isBanned) return null;
    // A disabled store's tokens stop working immediately, not just at
    // the next login - otherwise an already-issued JWT would keep
    // working right through a super_admin disabling the store.
    const [store] = await db.select({ isActive: stores.isActive }).from(stores).where(eq(stores.id, row.storeId)).limit(1);
    if (store && !store.isActive) return null;
    return { ...row, role: "staff" };
  }

  if (kind === "customer") {
    const [row] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
    if (!row || row.isBanned || row.deletedAt) return null;
    const [store] = await db.select({ isActive: stores.isActive }).from(stores).where(eq(stores.id, row.storeId)).limit(1);
    if (store && !store.isActive) return null;
    return { ...row, role: "customer" };
  }

  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user || user.isBanned || user.deletedAt) return null;

  // Legacy fallback for a still-valid old-shape token issued to a staff/
  // customer row that predates the split and hasn't been backfilled out
  // of `users` yet - same store-active check the old single-table
  // getUser always did for them.
  if ((user.role === "customer" || user.role === "staff") && user.storeId) {
    const [store] = await db.select({ isActive: stores.isActive }).from(stores).where(eq(stores.id, user.storeId)).limit(1);
    if (store && !store.isActive) return null;
  }
  if (user.role === "vendor") {
    const owned = await db.select({ isActive: stores.isActive }).from(stores).where(eq(stores.ownerId, user.id));
    if (owned.length > 0 && owned.every((s) => !s.isActive)) return null;
  }

  return user;
}

export function requireRole(user, roles) {
  return !!user && roles.includes(user.role);
}

// super_admin manages every store; a vendor manages store(s) they own; a
// staff member manages only the one store they were invited to (see
// /api/v1/vendor/stores/[storeId]/staff) - but never the money-moving or
// team-management routes, which check isStoreOwner instead.
export function canManageStore(user, store) {
  if (!user || !store) return false;
  if (user.role === "super_admin") return true;
  if (user.role === "vendor") return store.ownerId === user.id;
  if (user.role === "staff") return store.id === user.storeId;
  return false;
}

// Stricter than canManageStore - excludes staff. Use for anything that
// moves money (linking/changing a payout account) or manages the staff
// roster itself, neither of which a staff member should be able to touch
// even though they can manage everything else about the store.
export function isStoreOwner(user, store) {
  if (!user || !store) return false;
  return user.role === "super_admin" || (user.role === "vendor" && store.ownerId === user.id);
}
