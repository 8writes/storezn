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

test("a vendor's invoice can leave customer details blank; a storefront request can't", async () => {
  const { createVendorInvoiceRequestSchema } = await import("../lib/validate.js");
  const items = [{ customName: "Sofa", quantity: 1 }];
  assert.equal(validate(createVendorInvoiceRequestSchema, { items }).ok, true);
  assert.equal(validate(createVendorInvoiceRequestSchema, { items, buyerName: "", guestEmail: "", buyerPhone: "" }).ok, true);
  assert.equal(validate(createVendorInvoiceRequestSchema, { items, guestEmail: "not-an-email" }).ok, false);
  assert.equal(validate(createInvoiceRequestSchema, { items: [{ productId: "p1", quantity: 1 }] }).ok, false);
});

test("deposit percent: optional, whole number, 10-90", () => {
  const base = { requestId: "r1", plan: "deposit", items: [{ requestItemId: "l1", quantity: 1, unitPrice: 1000 }] };
  assert.equal(validate(createInvoiceSchema, base).ok, true);
  assert.equal(validate(createInvoiceSchema, { ...base, depositPercent: 30 }).ok, true);
  assert.equal(validate(createInvoiceSchema, { ...base, depositPercent: 5 }).ok, false);
  assert.equal(validate(createInvoiceSchema, { ...base, depositPercent: 95 }).ok, false);
  assert.equal(validate(createInvoiceSchema, { ...base, depositPercent: 33.5 }).ok, false);
});

test("editing an invoice: every line needs a positive price; plan + deposit rules apply", async () => {
  const { updateInvoiceSchema } = await import("../lib/validate.js");
  const base = { action: "update", plan: "full", items: [{ id: "i1", unitPrice: 5000 }] };
  assert.equal(validate(updateInvoiceSchema, base).ok, true);
  assert.equal(validate(updateInvoiceSchema, { ...base, items: [{ id: "i1", unitPrice: 0 }] }).ok, false);
  assert.equal(validate(updateInvoiceSchema, { ...base, plan: "deposit", depositPercent: 30 }).ok, true);
  assert.equal(validate(updateInvoiceSchema, { ...base, plan: "deposit", depositPercent: 95 }).ok, false);
  assert.equal(validate(updateInvoiceSchema, { ...base, guestEmail: "" }).ok, true);
  assert.equal(validate(updateInvoiceSchema, { ...base, action: "cancel" }).ok, false);
});

test("size guide presets: a name and a valid table; products can link one or clear it", async () => {
  const { createSizeGuidePresetSchema, updateSizeGuidePresetSchema, updateProductSchema } = await import("../lib/validate.js");
  const guide = { unit: "cm", columns: ["Bust"], rows: [{ size: "S", values: ["86"] }] };
  assert.equal(validate(createSizeGuidePresetSchema, { name: "Dresses", guide }).ok, true);
  assert.equal(validate(createSizeGuidePresetSchema, { name: " ", guide }).ok, false);
  assert.equal(validate(createSizeGuidePresetSchema, { name: "Bad", guide: { ...guide, rows: [{ size: "S", values: [] }] } }).ok, false);
  assert.equal(validate(updateSizeGuidePresetSchema, { name: "Renamed" }).ok, true);
  assert.equal(validate(updateProductSchema, { sizeGuidePresetId: "p1" }).ok, true);
  assert.equal(validate(updateProductSchema, { sizeGuidePresetId: null }).ok, true);
});
