import test from "node:test";
import assert from "node:assert/strict";
import { normaliseShuffleSeed } from "../lib/storefrontProducts.js";

// The shuffle seed travels in the "Load more" URL, so it's untrusted input
// that ends up in the ORDER BY (as a bound parameter). Only short
// alphanumeric seeds are accepted; anything else falls back to newest.
test("a normal per-visit seed is accepted", () => {
  assert.equal(normaliseShuffleSeed("a1b2c3d4e5f6a7b8"), "a1b2c3d4e5f6a7b8");
});

test("missing, short, long or odd seeds are refused", () => {
  for (const bad of [null, undefined, "", "abc", "x".repeat(33), "abc'; drop table products;--", "a1b2 c3d4", 12345678]) {
    assert.equal(normaliseShuffleSeed(bad), null, String(bad));
  }
});
