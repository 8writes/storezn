const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3003";
const storefrontBaseUrl = process.env.AUDIT_STOREFRONT_BASE_URL || baseUrl;
const platformHost = process.env.AUDIT_PLATFORM_HOST || "storezn.com";
const storefrontHost = process.env.AUDIT_STOREFRONT_HOST || "teststore.storezn.com";
const storeId = process.env.AUDIT_STORE_ID;
const token = process.env.AUDIT_TOKEN;

if (!storeId || !token) throw new Error("AUDIT_STORE_ID and AUDIT_TOKEN are required");

const missingId = "00000000-0000-4000-8000-000000000000";
const store = `/api/v1/vendor/stores/${storeId}`;
const guarded = [400, 401, 402, 403, 404, 409, 429];
const results = [];

async function check(name, path, { method = "GET", body, host = platformHost, auth = true, expected = [200] } = {}) {
  const headers = { Host: host };
  if (auth) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${host === storefrontHost ? storefrontBaseUrl : baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  const ok = expected.includes(response.status);
  results.push({ name, method, path, status: response.status, ok, error: ok ? undefined : data?.error || text.slice(0, 180) });
  if (!ok) throw new Error(`${name}: expected ${expected.join("/")}, got ${response.status}: ${data?.error || text.slice(0, 180)}`);
}

const calls = [
  ["version", "/api/version", {}],
  ["domain availability validation", "/api/v1/domain-check", { expected: guarded, auth: false }],
  ["marketplace", "/api/v1/public/marketplace?page=1&pageSize=20", { auth: false }],
  ["storefront catalogue", "/api/v1/storefront/products?page=1&pageSize=20", { host: storefrontHost, auth: false }],
  ["storefront empty cart", "/api/v1/storefront/cart", { host: storefrontHost, auth: false }],
  ["storefront cart validation", "/api/v1/storefront/cart", { method: "POST", body: {}, host: storefrontHost, auth: false, expected: guarded }],
  ["storefront cart item update guard", `/api/v1/storefront/cart/items/${missingId}`, { method: "PATCH", body: { quantity: 1 }, host: storefrontHost, auth: false, expected: guarded }],
  ["storefront cart item delete guard", `/api/v1/storefront/cart/items/${missingId}`, { method: "DELETE", host: storefrontHost, auth: false, expected: guarded }],
  ["storefront quote validation", "/api/v1/storefront/invoice-requests", { method: "POST", body: {}, host: storefrontHost, auth: false, expected: guarded }],
  ["storefront invoice lookup validation", "/api/v1/storefront/invoices/lookup", { method: "POST", body: {}, auth: false, expected: guarded }],
  ["storefront invoice detail guard", `/api/v1/storefront/invoices/${missingId}`, { auth: false, expected: guarded }],
  ["storefront order detail guard", `/api/v1/storefront/orders/AUDIT-MISSING`, { auth: false, expected: guarded }],
  ["storefront reviews read guard", `/api/v1/storefront/products/${missingId}/reviews?page=1&pageSize=20`, { host: storefrontHost, auth: false, expected: guarded }],
  ["storefront review create guard", `/api/v1/storefront/products/${missingId}/reviews`, { method: "POST", body: {}, host: storefrontHost, auth: false, expected: guarded }],
  ["storefront review upload validation", "/api/v1/storefront/reviews/upload", { method: "POST", body: {}, host: storefrontHost, auth: false, expected: guarded }],

  ["auth login validation", "/api/v1/auth/login", { method: "POST", body: {}, auth: false, expected: guarded }],
  ["auth signup validation", "/api/v1/auth/signup", { method: "POST", body: {}, host: storefrontHost, auth: false, expected: guarded }],
  ["auth current user", "/api/v1/auth/me", {}],
  ["auth current user update guard", "/api/v1/auth/me", { method: "PATCH", body: {}, expected: guarded }],
  ["auth forgot-password validation", "/api/v1/auth/forgot-password", { method: "POST", body: {}, auth: false, expected: guarded }],
  ["auth reset-password validation", "/api/v1/auth/reset-password", { method: "POST", body: {}, auth: false, expected: guarded }],
  ["auth verify-email validation", "/api/v1/auth/verify-email", { method: "POST", body: {}, auth: false, expected: guarded }],
  ["auth resend-verification validation", "/api/v1/auth/resend-verification", { method: "POST", body: {}, auth: false, expected: guarded }],
  ["vendor signup validation", "/api/v1/vendor/signup", { method: "POST", body: {}, auth: false, expected: guarded }],

  ["vendor stores", "/api/v1/vendor/stores", {}],
  ["vendor store detail", store, {}],
  ["vendor store update guard", store, { method: "PATCH", body: {}, expected: guarded }],
  ["vendor activity", `${store}/activity?page=1&pageSize=20`, {}],
  ["vendor activity update guard", `${store}/activity/${missingId}`, { method: "PATCH", body: { action: "flag" }, expected: guarded }],
  ["vendor analytics", `${store}/analytics`, {}],
  ["vendor stats", `${store}/stats`, {}],
  ["vendor monthly report", `${store}/reports/monthly`, {}],
  ["vendor branches", `${store}/branches`, {}],
  ["vendor branch create validation", `${store}/branches`, { method: "POST", body: {}, expected: guarded }],
  ["vendor branch update guard", `${store}/branches/${missingId}`, { method: "PATCH", body: { name: "Missing" }, expected: guarded }],
  ["vendor branch delete guard", `${store}/branches/${missingId}`, { method: "DELETE", expected: guarded }],
  ["vendor branch stock", `${store}/branch-stock?page=1&pageSize=20`, {}],
  ["vendor branch stock validation", `${store}/branch-stock`, { method: "PATCH", body: {}, expected: guarded }],
  ["vendor categories", `${store}/categories`, {}],
  ["vendor category create validation", `${store}/categories`, { method: "POST", body: {}, expected: guarded }],
  ["vendor category update guard", `${store}/categories/${missingId}`, { method: "PATCH", body: { name: "Missing" }, expected: guarded }],
  ["vendor category delete guard", `${store}/categories/${missingId}`, { method: "DELETE", expected: guarded }],
  ["vendor customers", `${store}/customers?page=1&pageSize=20`, {}],
  ["vendor customer detail guard", `${store}/customers/${missingId}`, { expected: guarded }],
  ["vendor domain validation", `${store}/domain`, { method: "POST", body: { customDomain: "not a domain" }, expected: guarded }],
  ["vendor domain verify guard", `${store}/domain/verify`, { method: "POST", expected: guarded }],
  ["vendor quote requests", `${store}/invoice-requests?page=1&pageSize=20`, {}],
  ["vendor quote request validation", `${store}/invoice-requests`, { method: "POST", body: {}, expected: guarded }],
  ["vendor quote update guard", `${store}/invoice-requests/${missingId}`, { method: "PATCH", body: { action: "cancel" }, expected: guarded }],
  ["vendor invoices", `${store}/invoices?page=1&pageSize=20`, {}],
  ["vendor invoice create validation", `${store}/invoices`, { method: "POST", body: {}, expected: guarded }],
  ["vendor invoice detail guard", `${store}/invoices/${missingId}`, { expected: guarded }],
  ["vendor invoice update guard", `${store}/invoices/${missingId}`, { method: "PATCH", body: { action: "cancel" }, expected: guarded }],
  ["vendor orders", `${store}/orders?page=1&pageSize=20`, {}],
  ["vendor order detail guard", `${store}/orders/${missingId}`, { expected: guarded }],
  ["vendor order update guard", `${store}/orders/${missingId}`, { method: "PATCH", body: { status: "shipped" }, expected: guarded }],
  ["vendor offline order validation", `${store}/orders/offline`, { method: "POST", body: {}, expected: guarded }],
  ["vendor product preferences", `${store}/product-form-preferences`, {}],
  ["vendor product preferences validation", `${store}/product-form-preferences`, { method: "PATCH", body: {}, expected: guarded }],
  ["vendor products", `${store}/products?page=1&pageSize=20`, {}],
  ["vendor product create validation", `${store}/products`, { method: "POST", body: {}, expected: guarded }],
  ["vendor product detail guard", `${store}/products/${missingId}`, { expected: guarded }],
  ["vendor product update guard", `${store}/products/${missingId}`, { method: "PATCH", body: { isActive: false }, expected: guarded }],
  ["vendor product delete guard", `${store}/products/${missingId}`, { method: "DELETE", expected: guarded }],
  ["vendor product branch stock guard", `${store}/products/${missingId}/branch-stock`, { expected: guarded }],
  ["vendor product branch stock update guard", `${store}/products/${missingId}/branch-stock`, { method: "PATCH", body: {}, expected: guarded }],
  ["vendor product feature guard", `${store}/products/${missingId}/feature`, { method: "PATCH", body: { featured: false }, expected: guarded }],
  ["vendor product history guard", `${store}/products/${missingId}/history`, { expected: guarded }],
  ["vendor variants guard", `${store}/products/${missingId}/variants`, { expected: guarded }],
  ["vendor variant create guard", `${store}/products/${missingId}/variants`, { method: "POST", body: {}, expected: guarded }],
  ["vendor variants delete guard", `${store}/products/${missingId}/variants`, { method: "DELETE", expected: guarded }],
  ["vendor variant update guard", `${store}/products/${missingId}/variants/${missingId}`, { method: "PATCH", body: {}, expected: guarded }],
  ["vendor variant delete guard", `${store}/products/${missingId}/variants/${missingId}`, { method: "DELETE", expected: guarded }],
  ["vendor bulk grid", `${store}/products/bulk?page=1&pageSize=20`, {}],
  ["vendor bulk import validation", `${store}/products/bulk`, { method: "POST", body: { rows: [] }, expected: guarded }],
  ["vendor bulk delete validation", `${store}/products/bulk-delete`, { method: "POST", body: {}, expected: guarded }],
  ["vendor shipping rates", `${store}/shipping-rates`, {}],
  ["vendor shipping create validation", `${store}/shipping-rates`, { method: "POST", body: {}, expected: guarded }],
  ["vendor shipping delete guard", `${store}/shipping-rates/${missingId}`, { method: "DELETE", expected: guarded }],
  ["vendor staff", `${store}/staff`, {}],
  ["vendor staff invite validation", `${store}/staff`, { method: "POST", body: {}, expected: guarded }],
  ["vendor staff update guard", `${store}/staff/${missingId}`, { method: "PATCH", body: {}, expected: guarded }],
  ["vendor staff delete guard", `${store}/staff/${missingId}`, { method: "DELETE", expected: guarded }],
  ["vendor verification", "/api/v1/vendor/verification", {}],
  ["vendor verification validation", "/api/v1/vendor/verification", { method: "POST", body: {}, expected: guarded }],
  ["vendor payout list read", `${store}/payouts?page=1&pageSize=20`, {}],
  ["vendor plus transaction read", `${store}/plus-transactions?page=1&pageSize=20`, {}],
  ["vendor POS registers", `${store}/pos/registers`, {}],
  ["vendor POS register validation", `${store}/pos/registers`, { method: "POST", body: {}, expected: guarded }],
  ["vendor POS register update guard", `${store}/pos/registers/${missingId}`, { method: "PATCH", body: {}, expected: guarded }],
  ["vendor POS register delete guard", `${store}/pos/registers/${missingId}`, { method: "DELETE", expected: guarded }],
  ["vendor POS sessions", `${store}/pos/sessions?page=1&pageSize=20`, {}],
  ["vendor POS session validation", `${store}/pos/sessions`, { method: "POST", body: {}, expected: guarded }],
  ["vendor POS session detail guard", `${store}/pos/sessions/${missingId}`, { expected: guarded }],
  ["vendor POS session review guard", `${store}/pos/sessions/${missingId}`, { method: "PATCH", body: {}, expected: guarded }],
  ["vendor POS close guard", `${store}/pos/sessions/${missingId}/close`, { method: "POST", body: {}, expected: guarded }],
  ["vendor POS movement guard", `${store}/pos/sessions/${missingId}/movements`, { method: "POST", body: {}, expected: guarded }],
  ["vendor POS held sales validation", `${store}/pos/held`, { expected: guarded }],
  ["vendor POS hold validation", `${store}/pos/held`, { method: "POST", body: {}, expected: guarded }],
  ["vendor POS held delete guard", `${store}/pos/held/${missingId}`, { method: "DELETE", expected: guarded }],
  ["vendor POS sale validation", `${store}/pos/sales`, { method: "POST", body: {}, expected: guarded }],
  ["vendor POS return validation", `${store}/pos/returns`, { method: "POST", body: {}, expected: guarded }],
  ["upload create validation", "/api/v1/uploads/file", { method: "POST", body: {}, expected: guarded }],
  ["upload delete validation", "/api/v1/uploads/file", { method: "DELETE", body: {}, expected: guarded }],
];

const customerCalls = [
  ["customer addresses", "/api/v1/customer/addresses", "GET"],
  ["customer address create", "/api/v1/customer/addresses", "POST"],
  ["customer address update", `/api/v1/customer/addresses/${missingId}`, "PATCH"],
  ["customer address delete", `/api/v1/customer/addresses/${missingId}`, "DELETE"],
  ["customer invoices", "/api/v1/customer/invoices?page=1&pageSize=20", "GET"],
  ["customer orders", "/api/v1/customer/orders?page=1&pageSize=20", "GET"],
  ["customer order detail", `/api/v1/customer/orders/${missingId}`, "GET"],
  ["customer refund request", `/api/v1/customer/orders/${missingId}/refund-request`, "POST"],
  ["push subscribe boundary", "/api/v1/push/subscribe", "POST"],
  ["push unsubscribe boundary", "/api/v1/push/subscribe", "DELETE"],
];
for (const [name, path, method] of customerCalls) calls.push([name, path, { method, body: ["POST", "PATCH", "DELETE"].includes(method) ? {} : undefined, expected: guarded }]);

const adminCalls = [
  ["admin activity", "/api/v1/super-admin/activity-log?page=1&pageSize=20", "GET"],
  ["admin analytics", "/api/v1/super-admin/analytics", "GET"],
  ["admin API monitoring", "/api/v1/super-admin/api-monitoring?page=1&pageSize=20", "GET"],
  ["admin API monitoring delete", "/api/v1/super-admin/api-monitoring", "DELETE"],
  ["admin app errors", "/api/v1/super-admin/app-errors?page=1&pageSize=20", "GET"],
  ["admin app errors update", "/api/v1/super-admin/app-errors", "PATCH"],
  ["admin app errors delete", "/api/v1/super-admin/app-errors", "DELETE"],
  ["admin bans", "/api/v1/super-admin/bans?page=1&pageSize=20", "GET"],
  ["admin ban create", "/api/v1/super-admin/bans", "POST"],
  ["admin ban delete", `/api/v1/super-admin/bans/${missingId}`, "DELETE"],
  ["admin blocked emails", "/api/v1/super-admin/blocked-emails?page=1&pageSize=20", "GET"],
  ["admin blocked email create", "/api/v1/super-admin/blocked-emails", "POST"],
  ["admin blocked email delete", `/api/v1/super-admin/blocked-emails/${missingId}`, "DELETE"],
  ["admin customers", "/api/v1/super-admin/customers?page=1&pageSize=20", "GET"],
  ["admin customer update", `/api/v1/super-admin/customers/${missingId}`, "PATCH"],
  ["admin devices", "/api/v1/super-admin/devices?page=1&pageSize=20", "GET"],
  ["admin notifications", "/api/v1/super-admin/notifications?page=1&pageSize=20", "GET"],
  ["admin notification create", "/api/v1/super-admin/notifications", "POST"],
  ["admin orders", "/api/v1/super-admin/orders?page=1&pageSize=20", "GET"],
  ["admin products", "/api/v1/super-admin/products?page=1&pageSize=20", "GET"],
  ["admin product detail", `/api/v1/super-admin/products/${missingId}`, "GET"],
  ["admin product suspend", `/api/v1/super-admin/products/${missingId}/suspend`, "POST"],
  ["admin settings", "/api/v1/super-admin/settings", "GET"],
  ["admin settings update", "/api/v1/super-admin/settings", "PATCH"],
  ["admin stores", "/api/v1/super-admin/stores?page=1&pageSize=20", "GET"],
  ["admin store detail", `/api/v1/super-admin/stores/${storeId}`, "GET"],
  ["admin store update", `/api/v1/super-admin/stores/${storeId}`, "PATCH"],
  ["admin team", "/api/v1/super-admin/team?page=1&pageSize=20", "GET"],
  ["admin team create", "/api/v1/super-admin/team", "POST"],
  ["admin team update", `/api/v1/super-admin/team/${missingId}`, "PATCH"],
  ["admin team delete", `/api/v1/super-admin/team/${missingId}`, "DELETE"],
  ["admin vendors", "/api/v1/super-admin/vendors?page=1&pageSize=20", "GET"],
  ["admin vendor update", `/api/v1/super-admin/vendors/${missingId}`, "PATCH"],
  ["admin vendor delete", `/api/v1/super-admin/vendors/${missingId}`, "DELETE"],
  ["admin vendor NIN", `/api/v1/super-admin/vendors/${missingId}/nin`, "GET"],
  ["admin vendor email verify", `/api/v1/super-admin/vendors/${missingId}/verify-email`, "PATCH"],
];
for (const [name, path, method] of adminCalls) calls.push([name, path, { method, body: ["POST", "PATCH", "DELETE"].includes(method) ? {} : undefined, expected: [401, 403] }]);

for (const name of ["cleanup-stale-data", "fail-stale-transactions", "invoice-maintenance", "settlement-poll"]) {
  calls.push([`cron ${name} authorization`, `/api/cron/${name}`, { auth: false, expected: [401, 403] }]);
}

async function main() {
  for (const [name, path, options] of calls) await check(name, path, options);
  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ passed: results.filter((row) => row.ok).length, failed: 1, error: error.message, results }, null, 2));
  process.exitCode = 1;
});
