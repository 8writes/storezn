import test from "node:test";
import assert from "node:assert/strict";
import { filterNavForStore } from "../lib/navFilter.js";

const groups = [
  { title: "Store", items: [{ href: "/a" }, { href: "/pos", plan: "enterprise" }] },
  { title: "Setup", items: [{ href: "/branches", plan: "plus" }] },
  { title: "Money", items: [{ href: "/safe", plan: "enterprise" }] },
];
const hrefs = (out) => out.flatMap((g) => g.items.map((i) => i.href));

test("free store sees no plan-gated links, and empty groups disappear", () => {
  const out = filterNavForStore(groups, { plan: "free" });
  assert.deepEqual(hrefs(out), ["/a"]);
  assert.deepEqual(out.map((g) => g.title), ["Store"]);
});

test("plus store sees plus links but not enterprise ones", () => {
  assert.deepEqual(hrefs(filterNavForStore(groups, { plan: "plus" })), ["/a", "/branches"]);
});

test("enterprise store sees everything", () => {
  assert.deepEqual(hrefs(filterNavForStore(groups, { plan: "enterprise" })), ["/a", "/pos", "/branches", "/safe"]);
});

test("a lapsed enterprise plan is treated as free", () => {
  const lapsed = { plan: "enterprise", planCancelled: true, planRenewsAt: "2020-01-01" };
  assert.deepEqual(hrefs(filterNavForStore(groups, lapsed)), ["/a"]);
});

test("no store loaded yet hides gated links", () => {
  assert.deepEqual(hrefs(filterNavForStore(groups, undefined)), ["/a"]);
});
