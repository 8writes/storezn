import jwt from "jsonwebtoken";
import { db } from "./db/index.js";
import { users, staff, customers, stores } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { readDevice } from "./device.js";
import { isDeviceBannedFast } from "./deviceBan.js";

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

  // A token minted before the account's password last changed is dead,
  // whatever its expiry says. jwt.sign stamps `iat` (seconds) on every
  // token we issue; a token old enough to predate this field has no iat
  // and is left alone rather than force-logging everyone out on deploy.
  const issuedAtMs = typeof payload.iat === "number" ? payload.iat * 1000 : null;
  const supersededByPasswordChange = (row) => {
    if (!row?.passwordChangedAt || issuedAtMs == null) return false;
    // One second of slack: `iat` is whole seconds, so a token minted in
    // the same second as the change would otherwise look older than it.
    return issuedAtMs + 1000 < new Date(row.passwordChangedAt).getTime();
  };

  // A banned device is cut off on its very next request, even mid-session
  // - not just at the next login. Cached (15s) so this stays cheap on
  // the hot auth path; fails open on a DB hiccup. See lib/deviceBan.js.
  if (await isDeviceBannedFast(readDevice(req))) return null;

  if (kind === "staff") {
    const [row] = await db.select().from(staff).where(eq(staff.id, id)).limit(1);
    if (!row || row.isBanned) return null;
    if (supersededByPasswordChange(row)) return null;
    // A disabled store's tokens stop working immediately, not just at
    // the next login - otherwise an already-issued JWT would keep
    // working right through a super_admin disabling the store.
    // A missing store row is treated the same as a disabled one - this
    // token is scoped to a store that is no longer there, so there is
    // nothing left for it to be authorized against.
    const [store] = await db.select({ isActive: stores.isActive }).from(stores).where(eq(stores.id, row.storeId)).limit(1);
    if (!store || !store.isActive) return null;
    return { ...row, role: "staff" };
  }

  if (kind === "customer") {
    const [row] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
    if (!row || row.isBanned || row.deletedAt) return null;
    if (supersededByPasswordChange(row)) return null;
    const [store] = await db.select({ isActive: stores.isActive }).from(stores).where(eq(stores.id, row.storeId)).limit(1);
    if (!store || !store.isActive) return null;
    return { ...row, role: "customer" };
  }

  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user || user.isBanned || user.deletedAt) return null;
  if (supersededByPasswordChange(user)) return null;

  // Legacy fallback for a still-valid old-shape token issued to a staff/
  // customer row that predates the split and hasn't been backfilled out
  // of `users` yet - same store-active check the old single-table
  // getUser always did for them.
  if ((user.role === "customer" || user.role === "staff") && user.storeId) {
    const [store] = await db.select({ isActive: stores.isActive }).from(stores).where(eq(stores.id, user.storeId)).limit(1);
    if (!store || !store.isActive) return null;
  }
  if (user.role === "vendor") {
    const owned = await db.select({ isActive: stores.isActive }).from(stores).where(eq(stores.ownerId, user.id));
    if (owned.length > 0 && owned.every((s) => !s.isActive)) return null;
  }

  // Best-effort "last active" heartbeat for the super-admin's vendor/team
  // views. Throttled to once every 2 min per account so the hot auth
  // path is, at worst, one extra indexed single-row write; a failure
  // here must never block a request from authenticating.
  if (["vendor", "super_admin", "admin", "p_staff"].includes(user.role)) {
    const lastMs = user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : 0;
    if (Date.now() - lastMs > 120_000) {
      try {
        await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id));
      } catch {
        /* heartbeat is not worth failing auth over */
      }
    }
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
