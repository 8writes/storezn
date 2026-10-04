import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OFFLINE_DRIFT_MAX_KOBO, OFFLINE_DRIFT_MAX_PERCENT, offlineDriftWithinStaffAllowance } from "../lib/pos.js";
import { isForeignCustomer } from "../lib/resolveStore.js";
import { isAllowedPushEndpoint } from "../lib/validate.js";
import { invoicePaymentReference } from "../lib/invoicePayments.js";
import { keyBelongsToUser } from "../lib/storage/keyOwnership.js";

// ---------------------------------------------------------------------
// F-08: a staff member must not be able to settle a POS sale at a price
// of their choosing by declaring it an offline replay. `capturedLineTotal`
// was outside the owner-only price gate entirely, so ANY price went
// through with only a review flag.
// ---------------------------------------------------------------------

test("offline price drift within both bounds is allowed for staff", () => {
  // ₦1,000 catalogue line, ₦900 captured: 10% and ₦100 - inside both.
  assert.equal(offlineDriftWithinStaffAllowance(90_000, 100_000), true);
});

test("an exact price match is always allowed", () => {
  assert.equal(offlineDriftWithinStaffAllowance(100_000, 100_000), true);
});

test("drift beyond the percentage bound is refused", () => {
  // 50% off a ₦1,000 line: under the absolute cap, over the percentage.
  assert.equal(offlineDriftWithinStaffAllowance(50_000, 100_000), false);
});

test("drift beyond the absolute bound is refused even when the percentage is small", () => {
  // ₦1,000,000 line, 1% off = ₦10,000 - well past the ₦5,000 cap.
  assert.equal(offlineDriftWithinStaffAllowance(99_000_000, 100_000_000), false);
});

test("the reported attack - a large item settled for one kobo - is refused", () => {
  // The audit's repro: a ₦100,000 item presented as having been rung up
  // offline for ₦0.01.
  assert.equal(offlineDriftWithinStaffAllowance(1, 10_000_000), false);
});

test("a captured price above the catalogue price is bounded the same way", () => {
  // Overcharging is drift too, and just as much a reason to involve the
  // owner - the bound is on the absolute variance, not the direction.
  assert.equal(offlineDriftWithinStaffAllowance(110_000, 100_000), true);
  assert.equal(offlineDriftWithinStaffAllowance(200_000, 100_000), false);
});

test("a zero catalogue price leaves no baseline, so any captured price is refused", () => {
  assert.equal(offlineDriftWithinStaffAllowance(5_000, 0), false);
  // ...but a genuinely free line matching a free catalogue price is fine.
  assert.equal(offlineDriftWithinStaffAllowance(0, 0), true);
});

test("the drift bounds are the documented values", () => {
  assert.equal(OFFLINE_DRIFT_MAX_PERCENT, 20);
  assert.equal(OFFLINE_DRIFT_MAX_KOBO, 500_000);
});

// ---------------------------------------------------------------------
// F-02: a customer belongs to exactly one store, but getUser() resolves a
// token without knowing which host it arrived on.
// ---------------------------------------------------------------------

test("a customer on their own store's host is not foreign", () => {
  assert.equal(isForeignCustomer({ role: "customer", storeId: "store-a" }, { id: "store-a" }), false);
});

test("a customer presenting their token on another store's host is foreign", () => {
  assert.equal(isForeignCustomer({ role: "customer", storeId: "store-a" }, { id: "store-b" }), true);
});

test("a guest is not a customer identity and is left to each route's own rules", () => {
  assert.equal(isForeignCustomer(null, { id: "store-a" }), false);
  assert.equal(isForeignCustomer(undefined, { id: "store-a" }), false);
});

test("vendor, staff and super_admin tokens are not customer identities", () => {
  for (const role of ["vendor", "staff", "super_admin", "admin", "p_staff"]) {
    assert.equal(isForeignCustomer({ role, storeId: null }, { id: "store-b" }), false, role);
  }
});

test("a customer against an unresolved store is foreign", () => {
  assert.equal(isForeignCustomer({ role: "customer", storeId: "store-a" }, null), true);
});

// ---------------------------------------------------------------------
// F-23: lib/push.js POSTs to the stored endpoint from the server, so an
// unrestricted value was an authenticated server-side request primitive.
// ---------------------------------------------------------------------

test("real browser push service endpoints are accepted", () => {
  for (const url of [
    "https://fcm.googleapis.com/fcm/send/abc123",
    "https://android.googleapis.com/gcm/send/abc123",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/Q1bC",
    "https://sin.notify.windows.com/w/?token=abc",
  ]) {
    assert.equal(isAllowedPushEndpoint(url), true, url);
  }
});

test("internal and metadata addresses are refused", () => {
  for (const url of [
    "http://127.0.0.1:3003/api/v1/super-admin/settings",
    "https://127.0.0.1/api",
    "http://169.254.169.254/latest/meta-data/",
    "https://localhost/internal",
    "http://[::1]/",
    "https://10.0.0.5/admin",
  ]) {
    assert.equal(isAllowedPushEndpoint(url), false, url);
  }
});

test("plaintext http is refused even on an allowed host", () => {
  assert.equal(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/abc"), false);
});

test("a hostname that merely contains an allowed host is refused", () => {
  // Suffix matching has to be on a dot boundary, or
  // "fcm.googleapis.com.attacker.test" slips through.
  assert.equal(isAllowedPushEndpoint("https://fcm.googleapis.com.attacker.test/x"), false);
  assert.equal(isAllowedPushEndpoint("https://notfcm.googleapis.com/x"), false);
});

test("junk is refused rather than throwing", () => {
  for (const value of ["", "not a url", "javascript:alert(1)", "file:///etc/passwd", null, undefined]) {
    assert.equal(isAllowedPushEndpoint(value), false, String(value));
  }
});

// ---------------------------------------------------------------------
// F-04: the shared Paystack router forwards by reference prefix, taking
// reference.split("-")[0] and looking it up against PAYSTACK_ROUTE_<PREFIX>.
// An "INV-" prefixed reference matched no route entry at all.
// ---------------------------------------------------------------------

test("an invoice payment reference carries the STOREZN routing prefix", () => {
  const reference = invoicePaymentReference("INV-ABC123-DEF456");
  assert.equal(reference.split("-")[0], "STOREZN");
});

test("an invoice payment reference still contains its invoice number", () => {
  const reference = invoicePaymentReference("INV-ABC123-DEF456");
  assert.ok(reference.includes("INV-ABC123-DEF456"), reference);
});

test("invoice payment references are unique per call", () => {
  const seen = new Set();
  for (let i = 0; i < 50; i += 1) seen.add(invoicePaymentReference("INV-SAME"));
  assert.equal(seen.size, 50);
});

test("an invoice reference is not mistaken for a storefront order reference", () => {
  // The webhook derives an order number from a reference with
  // /^STOREZN-(ORD-[0-9A-Z]+)(?:-[0-9A-Z]+)?$/ - an invoice reference must
  // not match it, or an invoice payment would be hunted for in `orders`.
  const reference = invoicePaymentReference("INV-ABC123-DEF456");
  assert.equal(/^STOREZN-(ORD-[0-9A-Z]+)(?:-[0-9A-Z]+)?$/.test(reference), false);
  // ...and it must not look like a subscription charge either.
  assert.equal(reference.startsWith("STOREZNSUB-"), false);
});

// ---------------------------------------------------------------------
// F-21 / F-22: one upload-key ownership predicate for both storage
// providers. Cloudinary accepted any purpose, S3 accepted only two (one of
// which nothing produces), and deleteVendor called it with no user id.
// ---------------------------------------------------------------------

test("every purpose the app actually uploads under is recognised", () => {
  const user = "11111111-2222-3333-4444-555555555555";
  for (const purpose of ["product-image", "product-video", "store-logo", "store-favicon", "review-image"]) {
    assert.equal(keyBelongsToUser(`schoolapp/${purpose}/${user}/abc.jpg`, user), true, purpose);
  }
});

test("another user's key is not owned", () => {
  const user = "11111111-2222-3333-4444-555555555555";
  assert.equal(keyBelongsToUser(`schoolapp/product-image/99999999/abc.jpg`, user), false);
});

test("a missing user id owns nothing", () => {
  // deleteVendor called isOwnedUploadUrl(url) with no user id, which made
  // the predicate test for "/undefined/" and quietly matched no file at
  // all - so no vendor's media was ever cleaned up.
  assert.equal(keyBelongsToUser("schoolapp/product-image/undefined/abc.jpg", undefined), false);
  assert.equal(keyBelongsToUser("schoolapp/product-image/undefined/abc.jpg", null), false);
  assert.equal(keyBelongsToUser("schoolapp/product-image/undefined/abc.jpg", ""), false);
});

test("a key with no purpose segment is not owned", () => {
  const user = "11111111-2222-3333-4444-555555555555";
  assert.equal(keyBelongsToUser(`schoolapp/${user}/abc.jpg`, user), false);
});

test("a null or empty key is not owned", () => {
  assert.equal(keyBelongsToUser(null, "user"), false);
  assert.equal(keyBelongsToUser("", "user"), false);
});

// ---------------------------------------------------------------------
// F-08 regression guard: the security fix must not strand a real sale.
//
// The POS sell screen computes the tenders on the device from its CACHED
// line prices, and validateTenders requires them to match the server's
// total to the kobo. So if the server re-prices a queued sale from the
// current catalogue, a device whose cache went stale doesn't get a
// slightly different receipt - the totals disagree and the sale is
// rejected outright, with the cash already taken.
//
// An earlier version of this fix gated captured pricing on the sale being
// more than 90 seconds old, which broke exactly that: reconnect promptly
// after a ring-up and the sale bounced.
// ---------------------------------------------------------------------
const salesRoute = readFileSync(
  new URL("../app/api/v1/vendor/stores/[storeId]/pos/sales/route.js", import.meta.url),
  "utf8",
);
const salesCode = salesRoute.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("captured offline pricing is not gated on the sale being old", () => {
  assert.match(
    salesCode,
    /const capturedPricingAllowed = isOfflineReplay;/,
    "captured pricing must follow the replay flag, not isDelayedSale - gating on age rejects a queued sale that syncs quickly",
  );
  assert.ok(
    !/capturedPricingAllowed\s*=\s*isDelayedSale/.test(salesCode),
    "gating captured pricing on isDelayedSale strands queued sales whose device cache is stale",
  );
});

test("a drawer shortfall on a replay is recorded and flagged, not refused", () => {
  // The change was handed over at the counter; refusing the sync loses the
  // record without putting the money back. A live sale is still refused,
  // because there the cash has not left the drawer yet.
  assert.match(salesCode, /if \(!isOfflineReplay\) \{[\s\S]{0,200}INSUFFICIENT_DRAWER_CASH/);
  assert.match(salesCode, /drawerWentNegative = true;/);
  assert.match(salesCode, /flaggedAt: offlinePriceDrift \|\| drawerWentNegative/);
});

// ---------------------------------------------------------------------
// Schema drift: a column that exists in the database and is written by the
// code, but was never declared in lib/db/schema.js, is silently dropped by
// drizzle on insert - no error, just missing data.
//
// order_items.customer_fields was exactly that: added by
// INVOICE-FLOW-MIGRATION.sql, written by finalizePaidCheckoutAttempt, never
// declared - so every online order stored '{}' and the custom-field answers
// a shopper typed never showed on either order-detail view.
// ---------------------------------------------------------------------
import { orderItems, invoiceItems, cartItems } from "../lib/db/schema.js";

const columnNames = (table) =>
  Object.values(table[Symbol.for("drizzle:Columns")]).map((column) => column.name);

test("order items carry the buyer's custom-field answers", () => {
  assert.ok(
    columnNames(orderItems).includes("customer_fields"),
    "orderItems must declare customer_fields or drizzle drops it on insert",
  );
});

test("custom-field answers are declared everywhere they are snapshotted", () => {
  // cart -> order and cart -> invoice are the two journeys an answer takes;
  // all three rows have the column in the database.
  for (const [name, table] of [["cartItems", cartItems], ["orderItems", orderItems], ["invoiceItems", invoiceItems]]) {
    assert.ok(columnNames(table).includes("customer_fields"), `${name} is missing customer_fields`);
  }
});

// ---------------------------------------------------------------------
// MEDIA-01/02/03: product images, product video and the store logo/favicon
// are plain z.string().url() on the wire, so nothing tied a URL to the
// store that uploaded it. A vendor could paste a rival store's public
// image URL into their own product, save, then remove it - and our own
// cleanup would destroy the rival's file and drop its metered-usage row.
// The same cleanups also ran as floating promises, so the response
// returning could cut them off and orphan the file instead.
// ---------------------------------------------------------------------
const stripComments = (code) => code.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const readRoute = (path) => stripComments(readFileSync(new URL(path, import.meta.url), "utf8"));

const productPatchRoute = readRoute("../app/api/v1/vendor/stores/[storeId]/products/[id]/route.js");
const productCreateRoute = readRoute("../app/api/v1/vendor/stores/[storeId]/products/route.js");
const storePatchRoute = readRoute("../app/api/v1/vendor/stores/[storeId]/route.js");
const productDeleteLib = readRoute("../lib/productDelete.js");
const storeUploadsLib = readRoute("../lib/storeUploads.js");
const uploadRoute = readRoute("../app/api/v1/uploads/file/route.js");

test("every media write path checks the store owns the URL being attached", () => {
  for (const [name, code] of [
    ["product PATCH", productPatchRoute],
    ["product create", productCreateRoute],
    ["store settings PATCH", storePatchRoute],
  ]) {
    assert.match(
      code,
      /filterStoreOwnedUploadUrls\(storeId, attachedMedia\)/,
      `${name} must reject media this store never uploaded`,
    );
  }
});

test("no media teardown deletes a URL without confirming the store owns it", () => {
  for (const [name, code] of [
    ["product PATCH", productPatchRoute],
    ["store settings PATCH", storePatchRoute],
    ["product delete", productDeleteLib],
  ]) {
    for (const call of code.match(/deletePublicFile\([^)]*\)/g) || []) {
      assert.ok(
        /deletePublicFile\(url\)/.test(call),
        `${name} passes ${call} straight to storage - it must be filtered through filterStoreOwnedUploadUrls first`,
      );
    }
    assert.match(code, /filterStoreOwnedUploadUrls/, `${name} must scope its teardown to this store's uploads`);
  }
});

test("media teardown runs under after(), not as a floating promise", () => {
  for (const [name, code] of [["product PATCH", productPatchRoute], ["store settings PATCH", storePatchRoute]]) {
    assert.doesNotMatch(
      code,
      /^\s*Promise\.all\(/m,
      `${name} must hand its storage teardown to after() - a floating promise is cut off when the response returns`,
    );
  }
});

// ---------------------------------------------------------------------
// MEDIA-04: the new-product page uploads each photo the moment it is
// picked, long before the product row exists. Those uploads were recorded
// as permanent straight away, so closing the tab (or a create that 409'd
// on a duplicate name) left the file counting against the store's storage
// quota forever, with nothing referencing it and no sweep that could ever
// collect it.
// ---------------------------------------------------------------------

test("a finished upload is parked as pending until something references it", () => {
  assert.match(
    uploadRoute,
    /finalizeStoreUpload\(\{[^}]*pending: true[^}]*\}\)/,
    "uploads must land as <purpose>-pending so an abandoned form's files stay sweepable",
  );
});

test("the stale sweep collects every pending purpose, not just review images", () => {
  assert.match(
    storeUploadsLib,
    /like '%-pending'/,
    "cleanupStaleStoreUploads must sweep product-image-pending and friends too",
  );
});

test("uploads are claimed only after the write that references them succeeds", () => {
  for (const [name, code] of [
    ["product PATCH", productPatchRoute],
    ["product create", productCreateRoute],
    ["store settings PATCH", storePatchRoute],
  ]) {
    const claimAt = code.indexOf("claimStoreUploads(storeId");
    const guardAt = code.indexOf("filterStoreOwnedUploadUrls(storeId");
    assert.ok(claimAt > -1, `${name} must claim its pending uploads`);
    assert.ok(
      claimAt > guardAt,
      `${name} claims before the write lands - a claim that survives a failed save orphans the file for good`,
    );
  }
});

// ---------------------------------------------------------------------
// BILLING-01: a Date interpolated into a raw sql`` template reaches
// postgres-js unconverted - there is no column in play, so drizzle never
// runs mapToDriverValue - and the driver throws `The "string" argument
// must be of type string ... Received an instance of Date`. That took the
// whole Paystack subscription webhook to a 500: a store paid, the charge
// was recorded, and because recordSubscriptionTransaction had already
// claimed the reference, every Paystack retry short-circuited before the
// plan update it still needed. Bind a formatted UTC string instead.
// ---------------------------------------------------------------------
import { PgDialect } from "drizzle-orm/pg-core";
import { sql as drizzleSql } from "drizzle-orm";
import { stores } from "../lib/db/schema.js";

const webhookRoute = stripComments(
  readFileSync(new URL("../app/api/v1/webhooks/paystack/route.js", import.meta.url), "utf8"),
);

test("a Date in a raw sql template binds as a Date - which the driver rejects", () => {
  const { params } = new PgDialect().sqlToQuery(drizzleSql`${new Date("2026-11-04T00:29:00Z")}::timestamp`);
  assert.ok(params[0] instanceof Date, "if this ever stops being true, the guard below can be relaxed");
});

test("the renewal helper binds a string, never a Date", () => {
  const utc = (date) => date.toISOString().replace("T", " ").replace("Z", "");
  const literal = utc(new Date("2026-11-04T00:29:00Z"));
  const { params } = new PgDialect().sqlToQuery(
    drizzleSql`greatest(coalesce(${stores.planRenewsAt}, ${literal}::timestamp), ${literal}::timestamp)`,
  );
  assert.equal(literal, "2026-11-04 00:29:00.000");
  for (const param of params) {
    assert.equal(typeof param, "string", "plan_renews_at params must be formatted strings");
  }
});

test("the webhook never interpolates a raw Date into its renewal SQL", () => {
  assert.match(webhookRoute, /utcTimestampLiteral/, "the renewal helper must format its timestamp");
  assert.doesNotMatch(
    webhookRoute,
    /\$\{next\}::timestamp/,
    "binding the Date object directly is what 500'd the subscription webhook",
  );
});
