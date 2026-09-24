import test from "node:test";
import assert from "node:assert/strict";
import { barcodeCandidates, barcodeMatches, normalizeBarcode } from "../lib/barcode.js";

test("barcode normalization removes scanner framing without changing the code", () => {
  assert.equal(normalizeBarcode("\u0002]E06991108801054\r\n"), "6991108801054");
});

test("UPC-A and its leading-zero EAN-13 representation match", () => {
  assert.deepEqual(barcodeCandidates("0123456789012"), ["0123456789012", "123456789012"]);
  assert.equal(barcodeMatches("0123456789012", "123456789012"), true);
  assert.equal(barcodeMatches("ABC-123", "abc-123"), true);
  assert.equal(barcodeMatches("123", "124"), false);
});
