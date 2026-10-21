import test from "node:test";
import assert from "node:assert/strict";
import { validate, createInvoiceRequestSchema, createInvoiceSchema } from "../lib/validate.js";

const buyer = { guestEmail: "a@b.co", buyerName: "Ada", buyerPhone: "08012345678" };

test("an offline quote can mix catalogue products and custom typed-in items", () => {
  const result = validate(createInvoiceRequestSchema, {
    ...buyer,
    items: [
      { productId: "p1", quantity: 2 },
      { customName: "Custom 3-seater sofa", quantity: 1 },
    ],
  });
  assert.equal(result.ok, true);
});

test("a quote line needs exactly one of product or custom name", () => {
  assert.equal(validate(createInvoiceRequestSchema, { ...buyer, items: [{ quantity: 1 }] }).ok, false);
  assert.equal(validate(createInvoiceRequestSchema, { ...buyer, items: [{ productId: "p1", customName: "x", quantity: 1 }] }).ok, false);
});

test("the same custom item twice is refused (case-insensitive)", () => {
  const result = validate(createInvoiceRequestSchema, {
    ...buyer,
    items: [{ customName: "Sofa", quantity: 1 }, { customName: " sofa ", quantity: 2 }],
  });
  assert.equal(result.ok, false);
});

test("pricing a quote: custom lines are named by request line, products still work the old way", () => {
  const ok = validate(createInvoiceSchema, {
    requestId: "r1",
    items: [
      { requestItemId: "line-1", quantity: 1, unitPrice: 50000 },
      { productId: "p1", quantity: 2, unitPrice: 1000 },
    ],
  });
  assert.equal(ok.ok, true);
  assert.equal(validate(createInvoiceSchema, { requestId: "r1", items: [{ quantity: 1, unitPrice: 5 }] }).ok, false);
});
