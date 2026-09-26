import test from "node:test";
import assert from "node:assert/strict";
import {
  addCartItemSchema,
  checkoutSchema,
  createInvoiceRequestSchema,
  createInvoiceSchema,
  createOfflineOrderSchema,
  createProductSchema,
  createReviewSchema,
  posSaleSchema,
  updateProductSchema,
} from "../lib/validate.js";

test("add product UI payload with every optional product field blank is valid", () => {
  const result = createProductSchema.safeParse({
    name: "Plain shirt",
    slug: "plain-shirt",
    sku: "",
    description: "",
    categoryId: "",
    price: "1000",
    productType: "physical",
    saleMode: "fixed_price",
    customerFields: [],
    condition: "new",
    stock: "0",
    images: [],
    variants: [
      { options: { Size: "Large" }, sku: " ", price: null, stock: null, isActive: true },
    ],
  });

  assert.equal(result.success, true);
  assert.equal(result.data.sku, undefined);
  assert.equal(result.data.description, undefined);
  assert.equal(result.data.categoryId, undefined);
  assert.equal(result.data.stock, 0);
  assert.equal(result.data.variants[0].sku, undefined);
});

test("edit product UI clear payload uses nulls and blank text without raw validation errors", () => {
  const result = updateProductSchema.safeParse({
    sku: "",
    description: "",
    categoryId: null,
    expiryDate: null,
    videoUrl: "",
    images: [],
    price: "2500",
    saleMode: "fixed_price",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.sku, undefined);
  assert.equal(result.data.description, undefined);
  assert.equal(result.data.categoryId, null);
  assert.equal(result.data.expiryDate, null);
});

test("cart and checkout schemas accept UI blank optional selectors as absent", () => {
  const cart = addCartItemSchema.safeParse({ productId: "product-1", variantId: "", quantity: "1", customerFields: {} });
  assert.equal(cart.success, true);
  assert.equal(cart.data.variantId, undefined);

  const checkout = checkoutSchema.safeParse({ guestEmail: "", addressId: "", note: "" });
  assert.equal(checkout.success, true);
  assert.equal(checkout.data.guestEmail, undefined);
  assert.equal(checkout.data.addressId, undefined);
});

test("invoice request and invoice creation accept UI blank optional ids/email as absent", () => {
  const request = createInvoiceRequestSchema.safeParse({
    branchId: "",
    guestEmail: "buyer@example.com",
    buyerName: "Ada Buyer",
    buyerPhone: "+2348000000000",
    note: "",
    items: [{ productId: "product-1", variantId: "", quantity: "1", customerFields: {} }],
  });
  assert.equal(request.success, true);
  assert.equal(request.data.branchId, undefined);
  assert.equal(request.data.items[0].variantId, undefined);

  const invoice = createInvoiceSchema.safeParse({
    requestId: "request-1",
    guestEmail: "",
    plan: "full",
    items: [{ productId: "product-1", variantId: "", quantity: "1", unitPrice: "5000" }],
  });
  assert.equal(invoice.success, true);
  assert.equal(invoice.data.guestEmail, undefined);
  assert.equal(invoice.data.items[0].variantId, undefined);
});

test("offline order and POS sale schemas accept queued UI blank optional fields as absent", () => {
  const offlineOrder = createOfflineOrderSchema.safeParse({
    buyerName: "Walk In Customer",
    buyerEmail: "",
    buyerPhone: "",
    note: "",
    delivered: true,
    paymentMethod: "cash",
    paymentProvider: "",
    branchId: "",
    items: [{ productId: "product-1", variantId: "", quantity: 1 }],
  });
  assert.equal(offlineOrder.success, true);
  assert.equal(offlineOrder.data.buyerEmail, undefined);
  assert.equal(offlineOrder.data.branchId, undefined);
  assert.equal(offlineOrder.data.items[0].variantId, undefined);

  const sale = posSaleSchema.safeParse({
    sessionId: "session-1",
    idempotencyKey: "sale-key-123",
    orderNumber: "ORD-ABC123",
    soldAt: new Date().toISOString(),
    heldSaleId: "",
    buyerEmail: "",
    buyerName: "",
    buyerPhone: "",
    note: "",
    items: [{ productId: "product-1", variantId: "", quantity: 1, capturedLineTotal: "1000" }],
    tenders: [{ method: "cash", amount: "1000", provider: "", reference: "" }],
  });
  assert.equal(sale.success, true);
  assert.equal(sale.data.heldSaleId, undefined);
  assert.equal(sale.data.buyerEmail, undefined);
  assert.equal(sale.data.items[0].variantId, undefined);
});

test("review form optional comment and image can be blank", () => {
  const result = createReviewSchema.safeParse({ rating: "5", comment: "", imageUrl: "" });
  assert.equal(result.success, true);
  assert.equal(result.data.comment, undefined);
  assert.equal(result.data.imageUrl, undefined);
});
