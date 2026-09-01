import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../../../../../lib/db/index.js";
import { stores, users, staff, customers, carts, cartItems } from "../../../../../lib/db/schema.js";
import { and, desc, eq } from "drizzle-orm";
import { validate, loginSchema } from "../../../../../lib/validate.js";
import { checkRateLimit } from "../../../../../lib/rateLimit.js";
import { isPlatformHost, resolveStoreByHost } from "../../../../../lib/resolveStore.js";
import { GUEST_CART_COOKIE, findCartItem } from "../../../../../lib/cart.js";

const INVALID = NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

// Compared against when no account matches, so a bad-email attempt costs
// the same bcrypt time as a bad-password one - without this, response
// timing alone tells an attacker which emails are registered. Generated
// once at module load rather than hardcoded so it's always a valid hash
// for whatever bcrypt version is installed.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

// Shared by the dashboard login form (vendor/staff/super_admin) and the
// storefront's per-store login form - which table(s) get searched
// depends on which host the request came in on (see isPlatformHost),
// since staff/customer accounts no longer share one global-unique email
// with everything else (see lib/db/schema.js's users/staff/customers
// split). Vendor signup issues its own tokens directly; this is the only
// place staff/customer tokens get minted.
export async function POST(req) {
  const limit = checkRateLimit(req, "login", { max: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts, try again shortly" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const result = validate(loginSchema, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const email = result.data.email.toLowerCase();
  const { password } = result.data;

  const host = req.headers.get("host") || "";

  if (isPlatformHost(host)) {
    const [vendorOrAdmin] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    let account = vendorOrAdmin;
    let kind = "user";

    if (!account) {
      // Same email can be staff at more than one store (see the staff
      // table's per-store-scoped uniqueness) - an email match here is
      // ambiguous in that rare case. No multi-account picker exists yet,
      // so the pragmatic call is the most recently added matching row.
      const staffMatches = await db.select().from(staff).where(eq(staff.email, email)).orderBy(desc(staff.createdAt)).limit(1);
      account = staffMatches[0];
      kind = "staff";
    }

    if (!account) {
      await bcrypt.compare(password, DUMMY_HASH);
      return INVALID;
    }

    const valid = await bcrypt.compare(password, account.passwordHash);
    if (!valid) return INVALID;
    // Checked only after the password is confirmed, so a wrong password on
    // a banned account is indistinguishable from a wrong password on any
    // other - "suspended" is never an email-enumeration oracle.
    if (account.isBanned) return NextResponse.json({ error: "This account has been suspended" }, { status: 403 });
    if (!account.emailVerified) {
      return NextResponse.json({ error: "Please verify your email before signing in", code: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }

    if (kind === "staff") {
      const [store] = await db.select({ isActive: stores.isActive }).from(stores).where(eq(stores.id, account.storeId)).limit(1);
      if (store && !store.isActive) {
        return NextResponse.json({ error: "This store is currently unavailable." }, { status: 403 });
      }
    } else {
      const owned = await db.select({ isActive: stores.isActive }).from(stores).where(eq(stores.ownerId, account.id));
      if (owned.length > 0 && owned.every((s) => !s.isActive)) {
        return NextResponse.json({ error: "Your store is currently disabled." }, { status: 403 });
      }
    }

    const token = jwt.sign({ id: account.id, kind }, process.env.JWT_SECRET, { expiresIn: "30d" });
    const { passwordHash, ...safeAccount } = account;
    return NextResponse.json({ token, user: { ...safeAccount, role: kind === "staff" ? "staff" : safeAccount.role } });
  }

  const store = await resolveStoreByHost(host);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const [account] = await db.select().from(customers).where(and(eq(customers.storeId, store.id), eq(customers.email, email))).limit(1);
  if (!account) {
    await bcrypt.compare(password, DUMMY_HASH);
    return INVALID;
  }

  const valid = await bcrypt.compare(password, account.passwordHash);
  if (!valid) return INVALID;
  if (account.isBanned) return NextResponse.json({ error: "This account has been suspended" }, { status: 403 });
  if (!account.emailVerified) {
    return NextResponse.json({ error: "Please verify your email before signing in", code: "EMAIL_NOT_VERIFIED" }, { status: 403 });
  }
  if (!store.isActive) {
    return NextResponse.json({ error: "This store is currently unavailable." }, { status: 403 });
  }

  const token = jwt.sign({ id: account.id, kind: "customer" }, process.env.JWT_SECRET, { expiresIn: "30d" });
  const { passwordHash, ...safeAccount } = account;

  // Guest -> user cart handoff (see carts.userId's comment in
  // lib/db/schema.js) - a guest who added items before logging in
  // shouldn't lose them. Reassigns the guest cart directly if this
  // customer has no active cart of their own yet; otherwise merges its
  // items into their existing cart (same dedup-by-product+variant logic
  // as a normal add-to-cart, since both carts could hold the same
  // product) and retires the guest cart. Never lets a cart-merge hiccup
  // fail the login itself - it's a value-add, not part of auth.
  let clearGuestCookie = false;
  try {
    const guestToken = req.cookies.get(GUEST_CART_COOKIE)?.value;
    if (guestToken) {
      const [guestCart] = await db
        .select()
        .from(carts)
        .where(and(eq(carts.storeId, store.id), eq(carts.guestToken, guestToken), eq(carts.status, "active")))
        .limit(1);
      if (guestCart) {
        const [userCart] = await db
          .select()
          .from(carts)
          .where(and(eq(carts.storeId, store.id), eq(carts.userId, account.id), eq(carts.status, "active")))
          .limit(1);
        if (!userCart) {
          await db.update(carts).set({ userId: account.id, guestToken: null, updatedAt: new Date() }).where(eq(carts.id, guestCart.id));
        } else {
          const guestItems = await db.select().from(cartItems).where(eq(cartItems.cartId, guestCart.id));
          for (const item of guestItems) {
            const existing = await findCartItem(userCart.id, item.productId, item.variantId);
            if (existing) {
              await db.update(cartItems).set({ quantity: existing.quantity + item.quantity }).where(eq(cartItems.id, existing.id));
            } else {
              await db.insert(cartItems).values({ cartId: userCart.id, productId: item.productId, variantId: item.variantId, quantity: item.quantity });
            }
          }
          await db.update(carts).set({ status: "abandoned", updatedAt: new Date() }).where(eq(carts.id, guestCart.id));
        }
        clearGuestCookie = true;
      }
    }
  } catch (err) {
    console.error("Guest cart handoff failed (login):", err);
  }

  const res = NextResponse.json({ token, user: { ...safeAccount, role: "customer" } });
  if (clearGuestCookie) res.cookies.delete(GUEST_CART_COOKIE);
  return res;
}
