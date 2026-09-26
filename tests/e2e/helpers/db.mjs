import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import postgres from "postgres";

const SAFE_DB_RE = /(test|temp|dev|local|e2e)/i;

export function assertSafeE2EDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required for E2E tests.");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }

  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const safeName = SAFE_DB_RE.test(url.pathname) || SAFE_DB_RE.test(url.hostname);
  if (process.env.E2E !== "1" || (!local && !safeName)) {
    throw new Error("Refusing to run E2E tests against a database that does not look like a test/temp/local database.");
  }
}

export function createSql() {
  assertSafeE2EDatabase();
  return postgres(process.env.DATABASE_URL, {
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
