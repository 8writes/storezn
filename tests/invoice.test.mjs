import test from "node:test";
import assert from "node:assert/strict";
import { createInvoiceRequestSchema, createInvoiceSchema, createProductSchema, validateCustomerFieldAnswers } from "../lib/validate.js";

const fields = [
  { id: "size", label: "Size", type: "select", required: true, options: ["Small", "Large"] },
  { id: "note", label: "Engraving", type: "text", required: false },
];

test("invoice customer fields reject missing required answers", () => {
  const result = validateCustomerFieldAnswers(fields, {});
  assert.equal(result.ok, false);
  assert.match(result.error, /Size/);
});

test("invoice customer fields reject options outside the vendor definition", () => {
  const result = validateCustomerFieldAnswers(fields, { size: "Medium" });
  assert.equal(result.ok, false);
});

test("invoice customer fields return a clean historical snapshot", () => {
  const result = validateCustomerFieldAnswers(fields, { size: "Large", note: "  gold  ", ignored: "drop me" });
  assert.deepEqual(result, { ok: true, data: { size: "Large", note: "gold" } });
});

test("required checkbox fields must be checked", () => {
  const result = validateCustomerFieldAnswers([{ id: "agree", label: "Approve proof", type: "checkbox", required: true }], { agree: false });
  assert.equal(result.ok, false);
});

test("product customer field ids must be unique", () => {
  const result = createProductSchema.safeParse({
    name: "Custom shirt",
    slug: "custom-shirt",
    price: 100,
    customerFields: [
      { id: "name", label: "First name", type: "text" },
      { id: "name", label: "Second name", type: "text" },
    ],
  });
  assert.equal(result.success, false);
});

test("invoice requests reject duplicate product options", () => {
  const result = createInvoiceRequestSchema.safeParse({
    items: [
      { productId: "product-1", variantId: "variant-1", quantity: 1 },
      { productId: "product-1", variantId: "variant-1", quantity: 2 },
    ],
  });
  assert.equal(result.success, false);
});

test("invoice creation rejects duplicate product options", () => {
  const result = createInvoiceSchema.safeParse({
    requestId: "request-1",
    items: [
      { productId: "product-1", quantity: 1, unitPrice: 100 },
      { productId: "product-1", quantity: 1, unitPrice: 200 },
    ],
  });
  assert.equal(result.success, false);
});
