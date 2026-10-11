import test from "node:test";
import assert from "node:assert/strict";
import { isUniqueViolation, pgConstraint, pgErrorCode, UNIQUE_VIOLATION } from "../lib/dbErrors.js";

// drizzle wraps every failed query in a DrizzleQueryError carrying only
// { query, params, cause }. Verified against production (drizzle-orm
// 0.45.4 + postgres-js): err.code is undefined and the real code sits on
// err.cause. Reading `.code` off the wrapper - the obvious thing to write
// - is therefore always false, which had silently disabled unique-violation
// recovery in twelve places. These tests pin the real shape.

// What drizzle actually throws.
function drizzleWrapped(pgProps) {
  const cause = Object.assign(new Error("duplicate key value violates unique constraint"), pgProps);
  const wrapper = new Error('Failed query: insert into "carts" ...');
  wrapper.cause = cause;
  return wrapper;
}

test("a code on the wrapper itself is still read (direct driver errors)", () => {
  assert.equal(pgErrorCode(Object.assign(new Error("x"), { code: UNIQUE_VIOLATION })), UNIQUE_VIOLATION);
});

test("the code is found through drizzle's wrapper", () => {
  const err = drizzleWrapped({ code: UNIQUE_VIOLATION });
  assert.equal(err.code, undefined, "the wrapper itself must not carry it - that's the whole bug");
  assert.equal(pgErrorCode(err), UNIQUE_VIOLATION);
  assert.equal(isUniqueViolation(err), true);
});

test("it keeps working if another wrapper layer is ever added", () => {
  const inner = drizzleWrapped({ code: UNIQUE_VIOLATION });
  const outer = new Error("something else went wrong");
  outer.cause = inner;
  assert.equal(isUniqueViolation(outer), true);
});

test("a different Postgres error is not mistaken for a duplicate", () => {
  // 23503 = foreign key violation. Treating this as "already exists"
  // would hand the user a cheerful 409 for a genuine data problem.
  assert.equal(isUniqueViolation(drizzleWrapped({ code: "23503" })), false);
  assert.equal(isUniqueViolation(new Error("plain error")), false);
  assert.equal(isUniqueViolation(null), false);
});

test("the constraint is read from either field name drivers use", () => {
  assert.equal(pgConstraint(drizzleWrapped({ code: UNIQUE_VIOLATION, constraint_name: "uq_a" })), "uq_a");
  assert.equal(pgConstraint(drizzleWrapped({ code: UNIQUE_VIOLATION, constraint: "uq_b" })), "uq_b");
  assert.equal(pgConstraint(new Error("nothing")), null);
});

test("narrowing by constraint separates indexes that mean different things", () => {
  // products has unique indexes on both slug and sku, and the user-facing
  // message differs, so the wrong match would show the wrong error.
  const slugErr = drizzleWrapped({ code: UNIQUE_VIOLATION, constraint_name: "uq_products_store_slug" });
  assert.equal(isUniqueViolation(slugErr, "slug"), true);
  assert.equal(isUniqueViolation(slugErr, "sku"), false);
});

test("a constraint named only in `detail` still matches", () => {
  // The checkout cart-conflict path relies on this: Postgres reports the
  // offending key in detail even when the constraint name isn't surfaced.
  const err = drizzleWrapped({ code: UNIQUE_VIOLATION, detail: "Key (cart_id)=(abc) already exists." });
  assert.equal(isUniqueViolation(err, "cart_id"), true);
});
