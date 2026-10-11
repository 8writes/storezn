import test from "node:test";
import assert from "node:assert/strict";
import { getEffectivePlan, isEnterpriseStore, isPlusStore, RENEWAL_GRACE_DAYS } from "../lib/storePlan.js";

// A paid plan gates whether a store is listed, can take orders and can be
// paid out, so "when does it stop" has to be exactly right in both
// directions: never drop a paying store early, never keep serving a store
// that quietly stopped paying.

const NOW = new Date("2026-10-11T12:00:00.000Z");
const daysFromNow = (days) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);

test("a plan with time left is active, cancelled or not", () => {
  assert.equal(getEffectivePlan({ plan: "plus", planCancelled: true, planRenewsAt: daysFromNow(5) }, NOW), "plus");
  assert.equal(getEffectivePlan({ plan: "plus", planCancelled: false, planRenewsAt: daysFromNow(5) }, NOW), "plus");
});

test("a cancelled plan ends on the day - no grace", () => {
  // Nothing is going to renew it, so there is nothing to wait for.
  assert.equal(getEffectivePlan({ plan: "enterprise", planCancelled: true, planRenewsAt: daysFromNow(-1) }, NOW), "free");
});

test("an active subscription gets a grace window for the renewal to land", () => {
  // Paystack charges on the day and the webhook usually arrives in
  // seconds, but a retry or a brief outage must not drop a paying store
  // on the exact minute.
  const justOverdue = { plan: "plus", planCancelled: false, planRenewsAt: daysFromNow(-1) };
  assert.equal(getEffectivePlan(justOverdue, NOW), "plus");
  assert.ok(RENEWAL_GRACE_DAYS >= 1, "the grace window has to be long enough to cover a retry");
});

test("an active subscription that never renewed eventually lapses", () => {
  // The bug this fixes: the lapse check required planCancelled, so a
  // subscription that quietly stopped charging - expired card, a webhook
  // we never received - kept full paid access forever, for free, with
  // nothing flagging it.
  const longOverdue = { plan: "plus", planCancelled: false, planRenewsAt: daysFromNow(-(RENEWAL_GRACE_DAYS + 1)) };
  assert.equal(getEffectivePlan(longOverdue, NOW), "free");
  assert.equal(isPlusStore(longOverdue, NOW), false);
});

test("enterprise lapses the same way and takes the POS with it", () => {
  const lapsed = { plan: "enterprise", planCancelled: false, planRenewsAt: daysFromNow(-30) };
  assert.equal(getEffectivePlan(lapsed, NOW), "free");
  assert.equal(isEnterpriseStore(lapsed, NOW), false);
});

test("a store with no renewal date is left alone", () => {
  // Nothing to compare against - don't invent an expiry.
  assert.equal(getEffectivePlan({ plan: "plus", planCancelled: true, planRenewsAt: null }, NOW), "plus");
  assert.equal(getEffectivePlan({ plan: "free" }, NOW), "free");
  assert.equal(getEffectivePlan(null, NOW), "free");
});

test("an unparseable renewal date never silently downgrades anyone", () => {
  assert.equal(getEffectivePlan({ plan: "plus", planCancelled: true, planRenewsAt: "not a date" }, NOW), "plus");
});
