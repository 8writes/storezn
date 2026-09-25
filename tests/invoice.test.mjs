import test from "node:test";
import assert from "node:assert/strict";
import { createInvoiceRequestSchema, createInvoiceSchema, createProductSchema, updateProductSchema, validateCustomerFieldAnswers } from "../lib/validate.js";
import { isInvoicePaymentAuthorizationExpired } from "../lib/invoicePayments.js";

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

test("product creation treats blank optional product and variant text as absent", () => {
  const result = createProductSchema.safeParse({
    name: "Variant shirt",
    slug: "variant-shirt",
    price: 100,
    sku: "",
    description: "",
    categoryId: "",
    variants: [
      { options: { Size: "Large" }, sku: "", price: null, stock: null },
    ],
  });
  assert.equal(result.success, true);
  assert.equal(result.data.sku, undefined);
  assert.equal(result.data.description, undefined);
  assert.equal(result.data.categoryId, undefined);
  assert.equal(result.data.variants[0].sku, undefined);
});

test("partial product updates do not inject create-time defaults", () => {
  const result = updateProductSchema.safeParse({ categoryId: null, isActive: false });
  assert.equal(result.success, true);
  assert.deepEqual(result.data, { categoryId: null, isActive: false });
});

test("partial invoice-product updates may retain the persisted zero price", () => {
  const result = updateProductSchema.safeParse({ saleMode: "invoice_required", price: 0, isActive: false });
  assert.equal(result.success, true);
});

test("invoice requests reject duplicate product options", () => {
  const result = createInvoiceRequestSchema.safeParse({
    buyerName: "Ada Customer",
    guestEmail: "ada@example.com",
    buyerPhone: "+2348000000000",
    items: [
      { productId: "product-1", variantId: "variant-1", quantity: 1 },
      { productId: "product-1", variantId: "variant-1", quantity: 2 },
    ],
  });
  assert.equal(result.success, false);
});

test("invoice requests require customer name, email, and phone", () => {
  const item = { productId: "product-1", quantity: 1 };
  assert.equal(createInvoiceRequestSchema.safeParse({ guestEmail: "ada@example.com", buyerPhone: "+2348000000000", items: [item] }).success, false);
  assert.equal(createInvoiceRequestSchema.safeParse({ buyerName: "Ada", buyerPhone: "+2348000000000", items: [item] }).success, false);
  assert.equal(createInvoiceRequestSchema.safeParse({ buyerName: "Ada", guestEmail: "ada@example.com", items: [item] }).success, false);
  assert.equal(createInvoiceRequestSchema.safeParse({ buyerName: "Ada", guestEmail: "ada@example.com", buyerPhone: "+2348000000000", items: [item] }).success, true);
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

test("invoice payment links expire only after their stored authorization window", () => {
  const now = new Date("2026-09-24T12:00:00.000Z");
  assert.equal(isInvoicePaymentAuthorizationExpired({ authorizationExpiresAt: new Date("2026-09-24T11:59:59.000Z") }, now), true);
  assert.equal(isInvoicePaymentAuthorizationExpired({ authorizationExpiresAt: new Date("2026-09-24T12:01:00.000Z") }, now), false);
  assert.equal(isInvoicePaymentAuthorizationExpired({ authorizationExpiresAt: null }, now), false);
});
