import jwt from "jsonwebtoken";
import { db } from "./db/index.js";
import { users, stores } from "./db/schema.js";
import { and, eq } from "drizzle-orm";

export async function getUser(req) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }

  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!user || user.isBanned || user.deletedAt) return null;

  // A disabled store's tokens stop working immediately, not just at the
  // next login - otherwise an already-issued JWT would keep working
  // right through a super-admin disabling the store.
  if (user.role === "customer" && user.storeId) {
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

// super_admin manages every store; a vendor only manages store(s) they own.
export function canManageStore(user, store) {
  if (!user || !store) return false;
  return user.role === "super_admin" || (user.role === "vendor" && store.ownerId === user.id);
}
