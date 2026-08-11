# Storezn, Technical Documentation

## Tech stack

- Next.js 16 (App Router, Turbopack) - see `AGENTS.md`, this version renamed `middleware.js` to `proxy.js` and other conventions may differ from training data.
- Postgres via Drizzle ORM, push-based schema workflow (`npx drizzle-kit push`, no migration files).
- Multi-tenant: every store gets a `<slug>.<root-domain>` subdomain or a custom domain, resolved per-request in `proxy.js` + `lib/resolveStore.js`.
- Paystack sub-account split payments - the platform never holds vendor money, every order's payout goes straight to the vendor's own Paystack sub-account at checkout time (see `lib/paystack.js`, `app/api/v1/storefront/checkout/route.js`).
- Cloudinary for image storage (`lib/storage/`).
- SendPulse SMTP for transactional email (`lib/email/`).

## Suggested future features

Not built yet, to revisit once the platform has real revenue/usage to justify the work. Roughly ordered by expected impact:

1. **Order-event emails.** Right now email only fires on signup/reset/verify and a paid-order confirmation to the *customer*. Nothing tells the vendor "you got a sale," and nothing tells the customer when their order ships, gets delivered, or when their refund request gets decided. Vendors currently have to keep refreshing the dashboard to know they sold something - this is the single biggest "feels unfinished" gap.
2. **Reviews UI.** The `reviews` table (`lib/db/schema.js`) and `createReviewSchema` (`lib/validate.js`) already exist, with rating + comment - nothing on the storefront actually lets a customer leave one or see them on a product page. This is finishing something half-built, not new scope, and is probably the cheapest win on this list.
3. **Discount/coupon codes.** No table or checkout logic for this exists at all. Direct driver of conversion for vendors running promos.
4. **Abandoned cart recovery.** `cartStatusEnum` already includes `"abandoned"` as a value, but nothing ever sets it or acts on it. Needs a daily job that flags stale carts past some threshold + a nudge email ("you left something in your cart") - a well-known e-commerce revenue lever.
5. **Related/recommended products.** Storefronts currently dead-end after a purchase or an out-of-stock product with no "you might also like." Doesn't need to be smart to start - same-category products is enough.
6. **Low-stock email alert to vendor.** The vendor dashboard already shows a "Low stock" `StatCard`, but it's pull-only (the vendor has to notice it). A threshold-crossing email would make it actually actionable.

### Note on refunds specifically

Refunds are **already built** and don't belong on the list above - `refundRequests` (schema) + `POST /api/v1/customer/orders/[id]/refund-request` (customer-initiated) + the vendor's order PATCH route's `refundDecision` handling (`approved`/`rejected`) already exist. Deliberately **not automated**: since payouts split straight to the vendor's own Paystack sub-account, the platform never holds the money, so there's no API call this app can make that actually moves money back to the customer. Approving a refund request just marks the order `"refunded"` and expects the vendor to have already sent the money back manually (bank transfer or their own Paystack dashboard) - it's a record-keeping action, not a payment action. Tixzn's future refund flow (see its own `DOCUMENTATION.md`) should follow this exact same pattern rather than inventing a new one.
