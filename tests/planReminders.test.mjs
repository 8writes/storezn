import test from "node:test";
import assert from "node:assert/strict";
import { endingSoonMessage, endedMessage } from "../lib/planReminders.js";
import { customDomainRedirectHost } from "../lib/storeUrl.js";

const renewsAt = "2026-11-04T09:00:00Z";

test("a live subscription is told it will renew; cancelled or manual ones that they end", () => {
  const live = { plan: "plus", planRenewsAt: renewsAt, paystackSubscriptionCode: "SUB_1", planCancelled: false };
  assert.match(endingSoonMessage(live, { manual: false }).subject, /renews/);
  assert.match(endingSoonMessage({ ...live, planCancelled: true }, { manual: false }).subject, /ends/);
  const manual = endingSoonMessage({ plan: "enterprise", planRenewsAt: renewsAt, planCancelled: true }, { manual: true });
  assert.match(manual.subject, /Enterprise ends/);
  assert.match(manual.body, /Contact Storezn/);
});

test("the ended notice says nothing is lost and names the till only for Enterprise", () => {
  assert.match(endedMessage({ plan: "plus" }, { manual: false }).body, /still there/);
  assert.doesNotMatch(endedMessage({ plan: "plus" }, { manual: false }).body, /shop till/);
  assert.match(endedMessage({ plan: "enterprise" }, { manual: true }).body, /shop till/);
});

test("subdomain sends visitors to a verified custom domain, never the domain to itself", () => {
  const store = { customDomain: "Shop.Brand.com", domainStatus: "verified" };
  assert.equal(customDomainRedirectHost(store, "brand.storezn.com"), "shop.brand.com");
  assert.equal(customDomainRedirectHost(store, "shop.brand.com"), null);
  assert.equal(customDomainRedirectHost(store, "SHOP.BRAND.COM:443"), null);
  assert.equal(customDomainRedirectHost({ ...store, domainStatus: "pending_dns" }, "brand.storezn.com"), null);
  assert.equal(customDomainRedirectHost({ domainStatus: "verified" }, "brand.storezn.com"), null);
});
