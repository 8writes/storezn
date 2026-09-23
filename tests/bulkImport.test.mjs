import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../lib/csv.js";
import { bulkProductRowSchema } from "../lib/validate.js";

test("CSV import strips an Excel UTF-8 BOM from the first header", () => {
  assert.deepEqual(parseCsv("\uFEFFname,price\nRed Tote,15000"), [{ name: "Red Tote", price: "15000" }]);
});

test("CSV import rejects an unterminated quoted field", () => {
  assert.throws(() => parseCsv("name,description\nRed Tote,\"unfinished"), /Unterminated quoted field/);
});

test("bulk product rows accept cost price and reject oversized fields", () => {
  const valid = bulkProductRowSchema.safeParse({ name: "Red Tote", price: "15000", costPrice: "8500", sku: "BAG-01" });
  assert.equal(valid.success, true);

  const invalid = bulkProductRowSchema.safeParse({ name: "Red Tote", price: "15000", sku: "x".repeat(101) });
  assert.equal(invalid.success, false);
});
