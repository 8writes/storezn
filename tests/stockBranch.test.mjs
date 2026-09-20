import test from "node:test";
import assert from "node:assert/strict";
import { stockBranchForUser } from "../lib/stockBranch.js";

const branches = [
  { id: "main", isDefault: true },
  { id: "eliozu", isDefault: false },
];

test("staff stock is pinned to the assigned branch", () => {
  assert.equal(stockBranchForUser(branches, { role: "staff", branchId: "eliozu" }).id, "eliozu");
});

test("multi-branch staff without a valid assignment cannot fall back to default", () => {
  assert.equal(stockBranchForUser(branches, { role: "staff", branchId: null }), null);
  assert.equal(stockBranchForUser(branches, { role: "staff", branchId: "missing" }), null);
});

test("a requested branch cannot override a staff assignment", () => {
  const requestedBranch = "main";
  const resolved = stockBranchForUser(branches, { role: "staff", branchId: "eliozu" });

  assert.notEqual(resolved.id, requestedBranch);
  assert.equal(resolved.id, "eliozu");
});

test("unassigned staff may use the only branch in a single-branch store", () => {
  assert.equal(stockBranchForUser([branches[0]], { role: "staff", branchId: null }).id, "main");
});

test("owners use the default branch", () => {
  assert.equal(stockBranchForUser(branches, { role: "vendor" }).id, "main");
});
