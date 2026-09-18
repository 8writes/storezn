import test from "node:test";
import assert from "node:assert/strict";
import { emailBrand, emailButton, emailText, renderEmail } from "../lib/email/templates.js";
import { ADMIN_EMAIL_TEMPLATES, getAdminEmailTemplate } from "../lib/email/adminNotificationTemplates.js";

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
