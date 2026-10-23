import test from "node:test";
import assert from "node:assert/strict";
import { isPriceDrop } from "../lib/wishlistAlerts.js";

const live = { isActive: true, suspendedAt: null, saleMode: "fixed_price" };

test("a new or bigger discount, or a lower price, is a price drop", () => {
  assert.equal(isPriceDrop({ price: 10000, discountPercent: null }, { ...live, price: 10000, discountPercent: 20 }), true);
  assert.equal(isPriceDrop({ price: 10000, discountPercent: 10 }, { ...live, price: 10000, discountPercent: 25 }), true);
  assert.equal(isPriceDrop({ price: 10000, discountPercent: null }, { ...live, price: 8000, discountPercent: null }), true);
});

test("no email for price rises, no change, hidden, suspended or quote-only products", () => {
  assert.equal(isPriceDrop({ price: 8000 }, { ...live, price: 10000 }), false);
  assert.equal(isPriceDrop({ price: 8000 }, { ...live, price: 8000 }), false);
  assert.equal(isPriceDrop({ price: 10000 }, { ...live, price: 8000, isActive: false }), false);
  assert.equal(isPriceDrop({ price: 10000 }, { ...live, price: 8000, suspendedAt: new Date() }), false);
  assert.equal(isPriceDrop({ price: 10000 }, { ...live, price: 0, saleMode: "invoice_required" }), false);
});
