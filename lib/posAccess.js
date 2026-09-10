// Shared guards for the POS routes under
// app/api/v1/vendor/stores/[storeId]/pos/*. Every register/session read
// or write goes through these so branch scoping and the Storezn+ gate
// aren't re-implemented (and drifting) per file.
import { and, eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { stores, branches, posRegisters, posSessions } from "./db/schema.js";
import { getUser, canManageStore, isStoreOwner } from "./auth.js";
import { isEnterpriseStore } from "./storePlan.js";

// Auth + store load + manage check + Enterprise gate. `owner` requires the
// stricter isStoreOwner (register CRUD is owner-only, same bar as the
// payout account).
export async function posContext(req, storeId, { owner = false } = {}) {
  const user = await getUser(req);
  if (!user) return { error: "Unauthorized", status: 401 };

  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return { error: "Store not found", status: 404 };

  if (owner ? !isStoreOwner(user, store) : !canManageStore(user, store)) {
    return { error: "Unauthorized", status: 401 };
  }
  if (!isEnterpriseStore(store)) {
    return { error: "This is a Storezn Enterprise feature.", status: 402 };
  }
  return { user, store };
}

// A branch-scoped staff member only ever touches their own branch's
// registers; a vendor/owner (branchId null) sees them all.
function branchAllowed(user, branchId) {
  return !(user.role === "staff" && user.branchId && user.branchId !== branchId);
}

export async function loadRegister(storeId, registerId, user) {
  const [reg] = await db
    .select()
    .from(posRegisters)
    .where(and(eq(posRegisters.id, registerId), eq(posRegisters.storeId, storeId)))
    .limit(1);
  if (!reg || !branchAllowed(user, reg.branchId)) return null;
  return reg;
}

// Loads a session + its register, asserting store and branch access.
// Returns { session, register } or null.
export async function loadSession(storeId, sessionId, user) {
  const [row] = await db
    .select({ session: posSessions, register: posRegisters })
    .from(posSessions)
    .innerJoin(posRegisters, eq(posSessions.registerId, posRegisters.id))
    .where(and(eq(posSessions.id, sessionId), eq(posRegisters.storeId, storeId)))
    .limit(1);
  if (!row || !branchAllowed(user, row.register.branchId)) return null;
  return row;
}

// Store-scoped only (no branch-access check) - for replaying a queued
// offline sale, where the sale genuinely happened and blocking it on a
// since-changed branch assignment would just strand real revenue.
export async function loadSessionAny(storeId, sessionId) {
  const [row] = await db
    .select({ session: posSessions, register: posRegisters })
    .from(posSessions)
    .innerJoin(posRegisters, eq(posSessions.registerId, posRegisters.id))
    .where(and(eq(posSessions.id, sessionId), eq(posRegisters.storeId, storeId)))
    .limit(1);
  return row || null;
}

// The shift currently open on a given register, if any.
export async function openSessionForRegister(registerId) {
  const [row] = await db
    .select({ session: posSessions, register: posRegisters })
    .from(posSessions)
    .innerJoin(posRegisters, eq(posSessions.registerId, posRegisters.id))
    .where(and(eq(posSessions.registerId, registerId), eq(posSessions.status, "open")))
    .limit(1);
  return row || null;
}

export async function storeBranchIds(storeId) {
  const rows = await db.select({ id: branches.id, name: branches.name, isDefault: branches.isDefault }).from(branches).where(eq(branches.storeId, storeId));
  return rows;
}
