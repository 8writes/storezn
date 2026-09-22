import test from "node:test";
import assert from "node:assert/strict";
import { emailBrand, emailButton, emailText, renderEmail } from "../lib/email/templates.js";
import { ADMIN_EMAIL_TEMPLATES, getAdminEmailTemplate } from "../lib/email/adminNotificationTemplates.js";
import { getStorefrontOrderUrl } from "../lib/storeUrl.js";

test("email shell uses vendor identity and theme safely", () => {
  const html = renderEmail({
    content: "<p>Order received</p>",
    brand: { name: "Jane & Co", storefrontAccentColor: "#123456", logoUrl: "https://example.com/logo.png" },
    preheader: "Order <ready>",
  });
  assert.match(html, /Jane &amp; Co/);
  assert.match(html, /#123456/);
  assert.match(html, /https:\/\/example\.com\/logo\.png/);
  assert.match(html, /Order &lt;ready&gt;/);
});

test("email helpers reject unsafe branding and escape composed text", () => {
  assert.equal(emailBrand({ storefrontAccentColor: "red", logoUrl: "javascript:alert(1)" }).accentColor, "#14915b");
  assert.equal(emailText("Hello <script>\nNext"), "Hello &lt;script&gt;<br>Next");
  assert.doesNotMatch(emailButton('https://example.com/?q="bad"', "Continue"), /href="[^"]*"bad"/);
});

test("admin email templates provide selectable starter copy", () => {
  assert.ok(ADMIN_EMAIL_TEMPLATES.length >= 5);
  assert.equal(getAdminEmailTemplate("maintenance").title, "Scheduled Storezn maintenance");
  assert.equal(getAdminEmailTemplate("missing").id, "custom");
});

test("guest order links use the verified storefront host and checkout email", () => {
  const previousRootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = "storezn.com";
  try {
    assert.equal(
      getStorefrontOrderUrl(
        { slug: "my-shop", customDomain: "shop.example.com", domainStatus: "verified" },
        "ORD-ABC123",
        "buyer+test@example.com",
      ),
      "https://shop.example.com/orders/ORD-ABC123?email=buyer%2Btest%40example.com",
    );
  } finally {
    if (previousRootDomain === undefined) delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
    else process.env.NEXT_PUBLIC_ROOT_DOMAIN = previousRootDomain;
  }
});
