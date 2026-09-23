import test from "node:test";
import assert from "node:assert/strict";
import { validateCustomerFieldAnswers } from "../lib/validate.js";

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
