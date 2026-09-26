import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as schema from "../lib/db/schema.js";

// lib/deleteVendor.js has to delete children before parents by hand,
// because no FK in lib/db/schema.js is ON DELETE CASCADE. That list had
// silently fallen behind the schema by eleven tables - order_tenders,
// store_activity_logs, the POS ledger, the whole invoicing chain,
// checkout_attempts - each of which aborts the transaction with a foreign
// key violation, so deleting a vendor failed for any store that had ever
// taken a single order.
//
// This guards the shape of the problem rather than one instance of it: any
// table that references a row the cascade destroys must be named in that
// file, so adding such a table to the schema without adding it to the
// cascade fails here instead of in production.
const source = readFileSync(new URL("../lib/deleteVendor.js", import.meta.url), "utf8");

// Comments in that file discuss these tables and helpers by name, so
// assertions about what the code actually does have to read past them.
const code = source.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

// The tables deleteVendorAccount() itself removes rows from. Anything
// pointing at one of these has to be handled first.
const DESTROYED_TABLES = new Set([
  "stores",
  "orders",
  "carts",
  "branches",
  "products",
  "product_variants",
  "customers",
  "staff",
  "categories",
  "invoices",
  "invoice_requests",
  "pos_registers",
  "pos_sessions",
  "users",
]);

// Referencing tables the cascade deliberately does not delete, with why.
const INTENTIONALLY_NOT_DELETED = new Map([
  // Nullable + ON DELETE SET NULL, so the FK cannot block the delete and
  // the platform-team audit trail is meant to outlive its subject.
  ["activity_logs", "actorId is ON DELETE SET NULL"],
  ["app_error_logs", "resolvedBy is ON DELETE SET NULL"],
]);

// Drizzle keeps a table's inline foreign keys under this symbol; each
// entry's reference() yields { columns, foreignTable, foreignColumns }.
const FK_SYMBOL = Symbol.for("drizzle:PgInlineForeignKeys");
const NAME_SYMBOL = Symbol.for("drizzle:Name");

function drizzleTables() {
  const out = [];
  for (const value of Object.values(schema)) {
    const name = value?.[NAME_SYMBOL];
    const foreignKeys = value?.[FK_SYMBOL];
    if (typeof name === "string" && Array.isArray(foreignKeys)) out.push({ name, foreignKeys });
  }
  return out;
}

// Which tables this one points at, and with what ON DELETE behaviour.
function referencedTables(foreignKeys) {
  const out = [];
  for (const fk of foreignKeys) {
    const ref = fk.reference();
    const target = ref?.foreignTable?.[NAME_SYMBOL];
    if (target) out.push({ target, onDelete: fk.onDelete });
  }
  return out;
}

test("every table referencing a destroyed table is handled by deleteVendorAccount", () => {
  const tables = drizzleTables();
  assert.ok(tables.length > 20, `expected to introspect the schema, found ${tables.length} tables`);

  const missing = [];
  const covered = [];
  for (const { name, foreignKeys } of tables) {
    if (INTENTIONALLY_NOT_DELETED.has(name)) continue;

    // Does this table reference anything the cascade destroys with an FK
    // that would actually block the delete? "set null"/"cascade" can't.
    const blocking = referencedTables(foreignKeys).some(
      ({ target, onDelete }) =>
        DESTROYED_TABLES.has(target) && target !== name && onDelete !== "set null" && onDelete !== "cascade",
    );
    if (!blocking) continue;
    covered.push(name);

    // The cascade refers to tables by their drizzle export name, so map
    // snake_case back to the camelCase identifier used in the source.
    const exportName = name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (!new RegExp(`\\b${exportName}\\b`).test(code)) missing.push(name);
  }

  // Guard against the guard silently checking nothing (an earlier version
  // read the wrong drizzle internal and passed while examining 0 tables).
  assert.ok(
    covered.length >= 20,
    `expected to find many blocking references, found ${covered.length}: ${covered.join(", ")}`,
  );

  assert.deepEqual(
    missing,
    [],
    `lib/deleteVendor.js does not mention these tables, which reference rows it deletes: ${missing.join(", ")}`,
  );
});

test("the cascade removes storage files without an ownership filter that always fails", () => {
  // isOwnedUploadUrl(url, userId) was called with no userId, so it tested
  // for "/undefined/" in the key and filtered out every single file - no
  // logo, favicon, product image or video was ever deleted with a vendor.
  // The URLs come off rows already proven to belong to the vendor's own
  // stores, so no per-URL ownership check belongs here at all.
  assert.ok(
    !/\bisOwnedUploadUrl\b/.test(code),
    "deleteVendor.js should not filter storage URLs through isOwnedUploadUrl - it was called without a user id and matched nothing",
  );
  assert.match(code, /deletePublicFile\(url\)/);
});
