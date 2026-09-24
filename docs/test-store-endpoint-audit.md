# Test Store Endpoint Audit

Date: 2026-09-24
Store: Test Store (`teststore.storezn.com`)
Account: approved Test Store vendor account
Live build: `e4c1185` (server build generated from the corresponding deployment commits)

## Result

- [x] 138 safe live endpoint checks passed.
- [x] 0 safe live endpoint checks failed.
- [x] User-facing pagination was verified to clamp requests to 20 rows.
- [x] No test records were created. One existing product's already-unfeatured state was written back idempotently by the feature guard check.
- [ ] 11 payment or irreversible-account flows were intentionally excluded for manual testing.

Write endpoints were exercised with invalid or guarded payloads where a successful call would create or change business data. Those checks confirm authentication, validation, route handling, and error status without polluting the Test Store.

## Public and Storefront

- [x] `GET /api/version`
- [x] `GET /api/v1/domain-check`
- [x] `GET /api/v1/public/marketplace`
- [x] `GET /api/v1/storefront/products`
- [x] `GET|POST /api/v1/storefront/cart`
- [x] `PATCH|DELETE /api/v1/storefront/cart/items/[id]` missing-item guards
- [x] `GET|POST /api/v1/storefront/products/[productId]/reviews`
- [x] `POST /api/v1/storefront/reviews/upload` validation guard
- [x] `GET /api/v1/storefront/orders/[orderNumber]` missing-order guard
- [x] `POST /api/v1/storefront/invoices/lookup`
- [x] `GET /api/v1/storefront/invoices/[shareToken]` missing-invoice guard
- [x] `POST /api/v1/storefront/invoice-requests` validation guard

## Authentication

- [x] `POST /api/v1/auth/login` validation
- [x] `POST /api/v1/auth/signup` storefront validation
- [x] `GET /api/v1/auth/me`
- [x] `PATCH /api/v1/auth/me` empty-update guard
- [x] `POST /api/v1/auth/forgot-password` validation
- [x] `POST /api/v1/auth/reset-password` validation
- [x] `POST /api/v1/auth/verify-email` validation
- [x] `POST /api/v1/auth/resend-verification` validation
- [x] `POST /api/v1/vendor/signup` validation

## Vendor Store and Catalogue

- [x] `GET /api/v1/vendor/stores`
- [x] `GET|PATCH /api/v1/vendor/stores/[storeId]` read and empty-update guard
- [x] `GET /api/v1/vendor/stores/[storeId]/activity`
- [x] `PATCH /api/v1/vendor/stores/[storeId]/activity/[activityId]` validation guard
- [x] `GET /api/v1/vendor/stores/[storeId]/analytics`
- [x] `GET /api/v1/vendor/stores/[storeId]/stats`
- [x] `GET /api/v1/vendor/stores/[storeId]/reports/monthly` expected Enterprise gate
- [x] `GET|POST /api/v1/vendor/stores/[storeId]/branches` read and validation
- [x] `PATCH|DELETE /api/v1/vendor/stores/[storeId]/branches/[branchId]` missing-branch guards
- [x] `GET|POST /api/v1/vendor/stores/[storeId]/categories` read and validation
- [x] `PATCH|DELETE /api/v1/vendor/stores/[storeId]/categories/[categoryId]` missing-category guards
- [x] `GET /api/v1/vendor/stores/[storeId]/branch-stock`
- [x] `PATCH /api/v1/vendor/stores/[storeId]/branch-stock` validation
- [x] `GET /api/v1/vendor/stores/[storeId]/customers`
- [x] `GET /api/v1/vendor/stores/[storeId]/customers/[customerId]`
- [x] `GET|PATCH /api/v1/vendor/stores/[storeId]/products` read and validation
- [x] `GET|PATCH|DELETE /api/v1/vendor/stores/[storeId]/products/[id]` read and missing-product guards
- [x] `GET|PATCH /api/v1/vendor/stores/[storeId]/products/[id]/branch-stock`
- [x] `PATCH /api/v1/vendor/stores/[storeId]/products/[id]/feature`
- [x] `GET /api/v1/vendor/stores/[storeId]/products/[id]/history`
- [x] `GET|POST|DELETE /api/v1/vendor/stores/[storeId]/products/[id]/variants` read and validation/guard checks
- [x] `PATCH|DELETE /api/v1/vendor/stores/[storeId]/products/[id]/variants/[variantId]` missing-variant guards
- [x] `GET|POST /api/v1/vendor/stores/[storeId]/products/bulk` read and validation
- [x] `POST /api/v1/vendor/stores/[storeId]/products/bulk-delete` validation
- [x] `GET|PATCH /api/v1/vendor/stores/[storeId]/product-form-preferences`
- [x] `GET|POST /api/v1/vendor/stores/[storeId]/shipping-rates` read and validation
- [x] `DELETE /api/v1/vendor/stores/[storeId]/shipping-rates/[rateId]` missing-rate guard
- [x] `GET /api/v1/uploads/file` route availability through upload validation
- [x] `DELETE /api/v1/uploads/file` validation

## Vendor Orders and Invoices

- [x] `GET /api/v1/vendor/stores/[storeId]/orders`
- [x] `GET|PATCH /api/v1/vendor/stores/[storeId]/orders/[id]` read and missing-order guard
- [x] `POST /api/v1/vendor/stores/[storeId]/orders/offline` validation
- [x] `GET /api/v1/vendor/stores/[storeId]/invoice-requests`
- [x] `POST /api/v1/vendor/stores/[storeId]/invoice-requests` validation
- [x] `PATCH /api/v1/vendor/stores/[storeId]/invoice-requests/[requestId]` validation guard
- [x] `GET|POST /api/v1/vendor/stores/[storeId]/invoices` read and validation
- [x] `GET|PATCH /api/v1/vendor/stores/[storeId]/invoices/[invoiceId]` read and missing-invoice guard
- [x] `GET /api/v1/vendor/stores/[storeId]/payouts` read-only endpoint
- [x] `GET /api/v1/vendor/stores/[storeId]/plus-transactions`
- [x] `GET /api/v1/vendor/verification`

## Vendor Staff and POS

- [x] `GET|POST /api/v1/vendor/stores/[storeId]/staff` read and validation
- [x] `PATCH|DELETE /api/v1/vendor/stores/[storeId]/staff/[staffId]` route guards
- [x] `GET /api/v1/vendor/staff/me` method guard
- [x] `GET|POST /api/v1/vendor/stores/[storeId]/pos/registers` expected Enterprise gate and validation
- [x] `PATCH|DELETE /api/v1/vendor/stores/[storeId]/pos/registers/[id]` expected Enterprise gate
- [x] `GET|POST /api/v1/vendor/stores/[storeId]/pos/sessions` expected Enterprise gate and pagination
- [x] `GET|PATCH /api/v1/vendor/stores/[storeId]/pos/sessions/[id]` expected Enterprise gate
- [x] `POST /api/v1/vendor/stores/[storeId]/pos/sessions/[id]/close` expected Enterprise gate
- [x] `POST /api/v1/vendor/stores/[storeId]/pos/sessions/[id]/movements` expected Enterprise gate
- [x] `GET|POST /api/v1/vendor/stores/[storeId]/pos/held` expected Enterprise gate and validation
- [x] `DELETE /api/v1/vendor/stores/[storeId]/pos/held/[id]` expected Enterprise gate
- [x] `POST /api/v1/vendor/stores/[storeId]/pos/sales` expected Enterprise gate
- [x] `POST /api/v1/vendor/stores/[storeId]/pos/returns` expected Enterprise gate

## Customer and Platform Authorization Boundaries

These were called with the Test Store vendor token. A `401` or method `405` is the expected result; successful customer/admin behavior needs the corresponding account type.

- [x] `/api/v1/customer/invoices`
- [x] `/api/v1/customer/orders`
- [x] `/api/v1/customer/orders/[id]`
- [x] `/api/v1/customer/orders/[id]/refund-request`
- [x] `/api/v1/customer/addresses`
- [x] `/api/v1/customer/addresses/[id]`
- [x] `/api/v1/push/subscribe`
- [x] `/api/v1/super-admin/activity-log`
- [x] `/api/v1/super-admin/analytics`
- [x] `/api/v1/super-admin/api-monitoring`
- [x] `/api/v1/super-admin/app-errors`
- [x] `/api/v1/super-admin/bans` and `/api/v1/super-admin/bans/[id]`
- [x] `/api/v1/super-admin/blocked-emails` and `/api/v1/super-admin/blocked-emails/[id]`
- [x] `/api/v1/super-admin/customers` and `/api/v1/super-admin/customers/[id]`
- [x] `/api/v1/super-admin/devices`
- [x] `/api/v1/super-admin/notifications`
- [x] `/api/v1/super-admin/orders`
- [x] `/api/v1/super-admin/products` and `/api/v1/super-admin/products/[id]`
- [x] `/api/v1/super-admin/products/[id]/suspend`
- [x] `/api/v1/super-admin/settings`
- [x] `/api/v1/super-admin/stores` and `/api/v1/super-admin/stores/[id]`
- [x] `/api/v1/super-admin/team` and `/api/v1/super-admin/team/[id]`
- [x] `/api/v1/super-admin/vendors` and `/api/v1/super-admin/vendors/[id]`

## Cron Authorization

- [x] `GET /api/cron/cleanup-stale-data`
- [x] `GET /api/cron/fail-stale-transactions`
- [x] `GET /api/cron/invoice-maintenance`
- [x] `GET /api/cron/settlement-poll`

## Excluded for Manual Payment or Irreversible Testing

- [ ] `POST /api/v1/storefront/checkout`
- [ ] `POST /api/v1/storefront/invoices/[shareToken]`
- [ ] `POST /api/v1/webhooks/paystack`
- [ ] `POST /api/v1/vendor/stores/[storeId]/subscribe`
- [ ] `POST /api/v1/vendor/stores/[storeId]/unsubscribe`
- [ ] `GET|POST /api/v1/vendor/stores/[storeId]/payout-account`
- [ ] `POST /api/v1/vendor/stores/[storeId]/payout-account/resolve`
- [ ] `POST /api/v1/vendor/stores/[storeId]/payouts/refresh`
- [ ] `POST /api/v1/super-admin/stores/[id]/manual-plus`
- [ ] `POST /api/v1/super-admin/transactions/fail-stale`
- [ ] `DELETE /api/v1/vendor/account` and `DELETE /api/v1/vendor/staff/me`

The Test Store data has not been cleared yet.
