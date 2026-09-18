import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProductName, productNameKey } from "../lib/productName.js";

test("product names preserve casing and collapse display whitespace", () => {
  assert.equal(normalizeProductName("  My\t Product  "), "My Product");
});

test("product name keys ignore casing and all whitespace", () => {
  const expected = productNameKey("My Product");
  assert.equal(productNameKey("MY PRODUCT"), expected);
  assert.equal(productNameKey("myproduct"), expected);
  assert.equal(productNameKey(" my   Product "), expected);
});

test("product names normalize compatible unicode forms", () => {
  assert.equal(productNameKey("ＦＯＯ"), productNameKey("foo"));
});
