import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import postgres from "postgres";

// These specs insert, update and delete real rows, so "which database am
// I pointed at?" has to be answered deliberately, never inferred.
//
// The previous version guessed: it accepted any hostname in
// (localhost|127.0.0.1|::1), or any URL whose host/path matched
// /(test|temp|dev|local|e2e)/. Both are unsafe guesses. A loopback address
// is exactly what a tunnel or a connection proxy to a REMOTE database
// looks like, and the "temp" substring matches a production database
// branch named e.g. "<app>-temp". The default DATABASE_URL in this repo
// resolves to 127.0.0.1/postgres, so the old guard passed on it without
// anyone having said it was safe to write to.
//
// Now the test database must be named explicitly, in its own variable that
// nothing else in the app reads, so the app's own DATABASE_URL can never
// be picked up by accident.
export function resolveE2EDatabaseUrl() {
  const raw = process.env.E2E_DATABASE_URL;
  if (!raw) {
    throw new Error(
      "E2E_DATABASE_URL is required to run E2E tests. Set it to a throwaway database - these specs write and delete rows. " +
        "It is deliberately NOT read from DATABASE_URL so the app's own (possibly live) database can't be used by accident.",
    );
  }
  try {
    new URL(raw);
  } catch {
    throw new Error("E2E_DATABASE_URL is not a valid URL.");
  }
  if (process.env.DATABASE_URL && process.env.DATABASE_URL === raw) {
    throw new Error(
      "E2E_DATABASE_URL is identical to DATABASE_URL. Point the tests at a separate throwaway database.",
    );
  }
  if (process.env.E2E !== "1") {
    throw new Error("E2E tests must be run with E2E=1 (the Playwright config sets this).");
  }
  return raw;
}

export function assertSafeE2EDatabase() {
  resolveE2EDatabaseUrl();
}

export function createSql() {
  return postgres(resolveE2EDatabaseUrl(), {
    max: 3,
    idle_timeout: 5,
    connect_timeout: 20,
    prepare: false,
  });
}

export function e2eId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function slugSuffix() {
  return crypto.randomUUID().slice(0, 8).toLowerCase();
}

export async function createVerifiedVendorFixture(sql, options = {}) {
  const suffix = slugSuffix();
  const userId = e2eId("usr");
  const storeId = e2eId("store");
  const branchId = e2eId("branch");
  const registerId = e2eId("register");
  const email = `vendor-${suffix}@example.test`;
  const password = "StoreznE2E!123";
  const passwordHash = await bcrypt.hash(password, 10);
  const storeSlug = `e2e-store-${suffix}`;
  const storeName = `E2E Store ${suffix}`;

  await sql.begin(async (tx) => {
    await tx`
      insert into users (
        id, first_name, last_name, email, password_hash, role, email_verified,
        approval_status, terms_accepted_at, marketing_opt_in
      )
      values (
        ${userId}, 'E2E', 'Vendor', ${email}, ${passwordHash}, 'vendor', true,
        'approved', now(), false
      )
    `;

    await tx`
      insert into stores (
        id, owner_id, name, slug, state, plan, is_active, is_open,
        list_on_marketplace, sub_account_code, commission_rate_percent,
        default_shipping_fee, default_shipping_is_tbd
      )
      values (
        ${storeId}, ${userId}, ${storeName}, ${storeSlug}, 'Lagos', ${options.plan || "enterprise"},
        true, true, true, 'ACCT_e2e_test', 5, 0, false
      )
    `;

    await tx`
      insert into branches (id, store_id, name, is_default)
      values (${branchId}, ${storeId}, 'Main branch', true)
    `;

    await tx`
      insert into pos_registers (id, store_id, branch_id, name, is_active)
      values (${registerId}, ${storeId}, ${branchId}, 'Main register', true)
    `;
  });

  return { userId, storeId, branchId, registerId, email, password, storeSlug, storeName };
}

export async function seedProduct(sql, fixture, overrides = {}) {
  const suffix = slugSuffix();
  const productId = e2eId("product");
  const name = overrides.name || `E2E Product ${suffix}`;
  const slug = overrides.slug || `e2e-product-${suffix}`;
  const price = overrides.price ?? 2500;
  const stock = overrides.stock === undefined ? 25 : overrides.stock;
  const sku = overrides.sku ?? `SKU-${suffix.toUpperCase()}`;
  const saleMode = overrides.saleMode || "fixed_price";

  await sql`
    insert into products (
      id, store_id, name, slug, sku, description, price, product_type,
      sale_mode, stock, condition, images, customer_fields, is_active
    )
    values (
      ${productId}, ${fixture.storeId}, ${name}, ${slug}, ${sku},
      ${overrides.description || "Seeded by Storezn browser E2E."},
      ${price}, 'physical', ${saleMode}, ${stock}, 'new', ${JSON.stringify([])},
      ${JSON.stringify([])}, true
    )
  `;

  await sql`
    insert into product_branch_stock (id, product_id, branch_id, stock)
    values (${e2eId("pbs")}, ${productId}, ${fixture.branchId}, ${stock})
  `;

  return { id: productId, name, slug, price, stock, sku };
}

export async function cleanupFixture(sql, fixture) {
  if (!fixture?.storeId || !fixture?.userId) return;
  await sql.begin(async (tx) => {
    await tx`delete from product_branch_stock where product_id in (select id from products where store_id = ${fixture.storeId})`;
    await tx`delete from product_variants where product_id in (select id from products where store_id = ${fixture.storeId})`;
    await tx`delete from products where store_id = ${fixture.storeId}`;
    await tx`delete from pos_registers where store_id = ${fixture.storeId}`;
    await tx`delete from branches where store_id = ${fixture.storeId}`;
    await tx`delete from stores where id = ${fixture.storeId}`;
    await tx`delete from users where id = ${fixture.userId}`;
  });
}
