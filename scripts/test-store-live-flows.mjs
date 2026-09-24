const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:3003";
const platformHost = process.env.AUDIT_PLATFORM_HOST || "storezn.com";
const storefrontHost = process.env.AUDIT_STOREFRONT_HOST || "teststore.storezn.com";
const storefrontBaseUrl = process.env.AUDIT_STOREFRONT_BASE_URL || baseUrl;
const storeId = process.env.AUDIT_STORE_ID;
const token = process.env.AUDIT_TOKEN;

if (!storeId || !token) throw new Error("AUDIT_STORE_ID and AUDIT_TOKEN are required");

const marker = `AUDIT-${Date.now()}`;
const results = [];
let guestCookie = "";

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(name, path, { method = "GET", body, host = platformHost, auth = true, expected = [200], cookie = false } = {}) {
  const headers = { Host: host };
  if (auth) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie && guestCookie) headers.Cookie = guestCookie;
  const requestBaseUrl = host === storefrontHost ? storefrontBaseUrl : baseUrl;
  const response = await fetch(`${requestBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.get("set-cookie");
  if (cookie && setCookie) guestCookie = setCookie.split(";")[0];
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!expected.includes(response.status)) {
    results.push({ name, ok: false, status: response.status, error: data?.error || text.slice(0, 200) });
    throw new Error(`${name}: expected ${expected.join("/")}, got ${response.status}: ${data?.error || text.slice(0, 200)}`);
  }
  results.push({ name, ok: true, status: response.status });
  return { data, response };
}

async function main() {
  const storeBase = `/api/v1/vendor/stores/${storeId}`;

  const stores = await request("vendor stores list", "/api/v1/vendor/stores");
  check(stores.data.stores?.some((store) => store.id === storeId), "Test Store missing from vendor store list");
  await request("store detail", storeBase);

  const branches = await request("branches list", `${storeBase}/branches`);
  const branch = branches.data.branches?.find((row) => row.isDefault) || branches.data.branches?.[0];
  check(branch?.id, "Test Store has no branch");

  const branchCreate = await request("branch create", `${storeBase}/branches`, {
    method: "POST", expected: [201], body: { name: `${marker} Branch`, address: "Audit address" },
  });
  const auditBranch = branchCreate.data.branch;
  await request("branch update", `${storeBase}/branches/${auditBranch.id}`, {
    method: "PATCH", body: { name: `${marker} Branch Updated` },
  });
  await request("branch delete", `${storeBase}/branches/${auditBranch.id}`, { method: "DELETE" });

  const categorySlug = marker.toLowerCase();
  const categoryCreate = await request("category create", `${storeBase}/categories`, {
    method: "POST", expected: [201], body: { name: `${marker} Category`, slug: categorySlug },
  });
  const categoryId = categoryCreate.data.category.id;
  await request("category update", `${storeBase}/categories/${categoryId}`, {
    method: "PATCH", body: { name: `${marker} Category Updated` },
  });

  const fixedSku = `${marker}-BASE`;
  const variantSku = `${marker}-BARCODE-001`;
  const fixedCreate = await request("product create with variants", `${storeBase}/products`, {
    method: "POST",
    expected: [201],
    body: {
      name: `${marker} Fixed Product`,
      slug: `${categorySlug}-fixed`,
      sku: fixedSku,
      description: "Live audit fixed-price product",
      price: 1250,
      productType: "physical",
      saleMode: "fixed_price",
      categoryId,
      stock: 50,
      variants: [{ options: { Size: "Small" }, sku: variantSku, price: 1300, stock: 20 }],
    },
  });
  const fixedProduct = fixedCreate.data.product;
  check(fixedProduct?.id, "Product creation returned no product");

  await request("product detail", `${storeBase}/products/${fixedProduct.id}`);
  const variantList = await request("variants list", `${storeBase}/products/${fixedProduct.id}/variants?active=true&branch=${branch.id}`);
  const firstVariant = variantList.data.variants?.find((variant) => variant.sku === variantSku);
  check(firstVariant?.id, "Create-product variant was not persisted");

  const secondVariantCreate = await request("variant create", `${storeBase}/products/${fixedProduct.id}/variants`, {
    method: "POST", expected: [201], body: { options: { Size: "Large" }, sku: `${marker}-LARGE`, price: 1500, stock: 15 },
  });
  const secondVariantId = secondVariantCreate.data.variant.id;
  await request("variant update", `${storeBase}/products/${fixedProduct.id}/variants/${secondVariantId}`, {
    method: "PATCH", body: { sku: `${marker}-LARGE-UPDATED`, stock: 16 },
  });
  await request("variant delete", `${storeBase}/products/${fixedProduct.id}/variants/${secondVariantId}`, { method: "DELETE" });

  const byName = await request("product search by name", `${storeBase}/products?q=${encodeURIComponent(marker + " Fixed")}&status=active&sellable=true&includeVariants=true`);
  check(byName.data.products?.some((product) => product.id === fixedProduct.id), "Name search did not return created product");
  const bySku = await request("product search by SKU", `${storeBase}/products?q=${encodeURIComponent(fixedSku)}&status=active&sellable=true&includeVariants=true`);
  check(bySku.data.products?.some((product) => product.id === fixedProduct.id), "SKU search did not return created product");
  const byVariant = await request("product search by variant barcode", `${storeBase}/products?sku=${encodeURIComponent(variantSku)}&status=active&sellable=true&includeVariants=true&branch=${branch.id}`);
  check(byVariant.data.products?.some((product) => product.id === fixedProduct.id), "Variant barcode search did not return parent product");

  const allIds = [];
  let productPage = 1;
  let productPages = 1;
  let advertisedTotal = 0;
  do {
    const pageResult = await request(`product pagination page ${productPage}`, `${storeBase}/products?page=${productPage}&pageSize=20&status=active&sellable=true&includeVariants=true&branch=${branch.id}`);
    check(pageResult.data.pagination?.pageSize === 20, "Product page size is not 20");
    productPages = pageResult.data.pagination.totalPages;
    advertisedTotal = pageResult.data.pagination.total;
    allIds.push(...pageResult.data.products.map((product) => product.id));
    productPage += 1;
  } while (productPage <= productPages);
  check(allIds.length === advertisedTotal, `Product pagination returned ${allIds.length} of ${advertisedTotal}`);
  check(new Set(allIds).size === allIds.length, "Product pagination returned duplicate rows");

  await request("product branch stock list", `${storeBase}/products/${fixedProduct.id}/branch-stock`);
  await request("product branch stock update", `${storeBase}/products/${fixedProduct.id}/branch-stock`, {
    method: "PATCH", body: { branchId: branch.id, stock: 50 },
  });
  await request("variant branch stock update", `${storeBase}/products/${fixedProduct.id}/branch-stock`, {
    method: "PATCH", body: { branchId: branch.id, variantId: firstVariant.id, stock: 20 },
  });
  await request("product history", `${storeBase}/products/${fixedProduct.id}/history`);
  await request("product feature on", `${storeBase}/products/${fixedProduct.id}/feature`, { method: "PATCH", body: { featured: true } });
  await request("product feature off", `${storeBase}/products/${fixedProduct.id}/feature`, { method: "PATCH", body: { featured: false } });

  const prefsBefore = await request("product form preferences get", `${storeBase}/product-form-preferences`);
  await request("product form preferences update", `${storeBase}/product-form-preferences`, {
    method: "PATCH", body: { visibleFields: ["name", "price", "stock", "variants"], sectionOrder: ["basic", "inventory"], collapsedSections: [] },
  });
  if (prefsBefore.data.preference) {
    await request("product form preferences restore", `${storeBase}/product-form-preferences`, {
      method: "PATCH",
      body: {
        visibleFields: prefsBefore.data.preference.visibleFields || [],
        sectionOrder: prefsBefore.data.preference.sectionOrder || [],
        collapsedSections: prefsBefore.data.preference.collapsedSections || [],
      },
    });
  }

  const shippingCreate = await request("shipping rate create", `${storeBase}/shipping-rates`, {
    method: "POST", expected: [201], body: { state: "Rivers", city: marker, fee: 750 },
  });
  await request("shipping rates list", `${storeBase}/shipping-rates`);
  await request("shipping rate delete", `${storeBase}/shipping-rates/${shippingCreate.data.shippingRate.id}`, { method: "DELETE" });

  const publicSearch = await request("storefront product search", `/api/v1/storefront/products?q=${encodeURIComponent(marker)}&page=1&pageSize=20`, {
    host: storefrontHost, auth: false,
  });
  check(publicSearch.data.products?.some((product) => product.id === fixedProduct.id), "Storefront search did not return created product");

  const bulkPage = await request("bulk product grid pagination", `${storeBase}/products/bulk?page=1&pageSize=200&q=${encodeURIComponent(marker)}`);
  check(bulkPage.data.pagination?.pageSize === 20, "Bulk product grid did not cap pagination at 20");
  const bulkName = `${marker} Bulk Product`;
  const bulkImport = await request("bulk product import", `${storeBase}/products/bulk`, {
    method: "POST",
    body: {
      rows: [
        { name: bulkName, sku: `${marker}-BULK`, price: 2200, stock: 7, categoryId, productType: "physical", condition: "new" },
        { name: `  ${bulkName.toLowerCase()}  `, sku: `${marker}-BULK-DUP`, price: 2200, stock: 7, categoryId, productType: "physical", condition: "new" },
      ],
    },
  });
  check(bulkImport.data.summary?.created === 1 && bulkImport.data.summary?.failed === 1, "Bulk import did not create one row and reject the normalized duplicate");
  const bulkProductId = bulkImport.data.results?.find((row) => row.status === "created")?.productId;
  check(bulkProductId, "Bulk import returned no created product id");
  const bulkSearch = await request("bulk product search", `${storeBase}/products/bulk?page=1&pageSize=20&q=${encodeURIComponent(marker + " Bulk")}`);
  check(bulkSearch.data.products?.some((product) => product.id === bulkProductId), "Bulk grid search did not find imported product");
  const bulkDelete = await request("bulk product delete", `${storeBase}/products/bulk-delete`, {
    method: "POST", body: { productIds: [bulkProductId] },
  });
  check(bulkDelete.data.deleted === 1 && bulkDelete.data.blocked?.length === 0, "Bulk delete did not remove the imported product");

  const emptyCart = await request("guest empty cart read", "/api/v1/storefront/cart", {
    host: storefrontHost, auth: false, cookie: true,
  });
  check(Array.isArray(emptyCart.data.items) && emptyCart.data.items.length === 0, "New guest cart was not empty");
  const cartAdd = await request("guest cart add item", "/api/v1/storefront/cart", {
    method: "POST", host: storefrontHost, auth: false, cookie: true, expected: [201],
    body: { productId: fixedProduct.id, quantity: 2 },
  });
  check(cartAdd.data.cartId, "Guest cart was not created on first valid item");
  const cartItem = cartAdd.data.items?.find((item) => item.product?.id === fixedProduct.id);
  check(cartItem?.id, "Cart add returned no line item");
  await request("guest cart read", "/api/v1/storefront/cart", { host: storefrontHost, auth: false, cookie: true });
  await request("guest cart quantity update", `/api/v1/storefront/cart/items/${cartItem.id}`, {
    method: "PATCH", host: storefrontHost, auth: false, cookie: true, body: { quantity: 3 },
  });
  await request("guest cart item delete", `/api/v1/storefront/cart/items/${cartItem.id}`, {
    method: "DELETE", host: storefrontHost, auth: false, cookie: true,
  });

  const invoiceSku = `${marker}-QUOTE`;
  const invoiceCreateProduct = await request("invoice product create", `${storeBase}/products`, {
    method: "POST", expected: [201],
    body: {
      name: `${marker} Invoice Product`, slug: `${categorySlug}-invoice`, sku: invoiceSku,
      description: "Live audit negotiated product", price: 0, productType: "physical",
      saleMode: "invoice_required", stock: 20, categoryId,
      customerFields: [{ id: "brief", label: "Project brief", type: "text", required: true }],
    },
  });
  const invoiceProduct = invoiceCreateProduct.data.product;

  const requestCreate = await request("vendor quote request create", `${storeBase}/invoice-requests`, {
    method: "POST", expected: [201],
    body: {
      branchId: branch.id, guestEmail: `${categorySlug}@example.invalid`, buyerName: "Audit Customer",
      buyerPhone: "+2348000000000", note: marker,
      items: [{ productId: invoiceProduct.id, quantity: 1, customerFields: { brief: "Audit requirements" } }],
    },
  });
  const quoteRequest = requestCreate.data.request;
  await request("quote requests list", `${storeBase}/invoice-requests?page=1&pageSize=20&q=${encodeURIComponent(marker)}`);
  const invoiceCreate = await request("invoice create from quote", `${storeBase}/invoices`, {
    method: "POST", expected: [201],
    body: {
      requestId: quoteRequest.id, plan: "deposit",
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), note: marker,
      items: [{ productId: invoiceProduct.id, quantity: 1, unitPrice: 5000, customerFields: { brief: "Audit requirements" } }],
    },
  });
  const invoice = invoiceCreate.data.invoice;
  const invoiceDetail = await request("invoice detail with ledger", `${storeBase}/invoices/${invoice.id}`);
  check(Array.isArray(invoiceDetail.data.items) && invoiceDetail.data.items.length === 1, "Invoice detail items missing");
  check(Array.isArray(invoiceDetail.data.payments), "Invoice detail payment ledger missing");
  check(invoiceDetail.data.order?.id === invoiceCreate.data.order.id, "Invoice detail related order missing");
  await request("invoice list", `${storeBase}/invoices?page=1&pageSize=20`);
  await request("public invoice detail", `/api/v1/storefront/invoices/${invoice.shareToken}`, { host: platformHost, auth: false });
  await request("invoice cancel", `${storeBase}/invoices/${invoice.id}`, { method: "PATCH", body: { action: "cancel" } });

  const publicQuote = await request("storefront quote request create", "/api/v1/storefront/invoice-requests", {
    method: "POST", host: storefrontHost, auth: false, expected: [201],
    body: {
      guestEmail: `${categorySlug}-public@example.invalid`, buyerName: "Public Audit Customer", buyerPhone: "+2348111111111",
      note: marker, items: [{ productId: invoiceProduct.id, quantity: 1, customerFields: { brief: "Public audit" } }],
    },
  });
  await request("storefront quote request rate limit", "/api/v1/storefront/invoice-requests", {
    method: "POST", host: storefrontHost, auth: false, expected: [429],
    body: {
      guestEmail: `${categorySlug}-public@example.invalid`, buyerName: "Public Audit Customer", buyerPhone: "+2348111111111",
      note: marker, items: [{ productId: invoiceProduct.id, quantity: 1, customerFields: { brief: "Public audit" } }],
    },
  });
  await request("storefront quote request cancel", `${storeBase}/invoice-requests/${publicQuote.data.request.id}`, {
    method: "PATCH", body: { action: "cancel" },
  });

  const registerCreate = await request("POS register create", `${storeBase}/pos/registers`, {
    method: "POST", expected: [201], body: { name: `${marker} Register`, branchId: branch.id },
  });
  const register = registerCreate.data.register;
  await request("POS register update", `${storeBase}/pos/registers/${register.id}`, { method: "PATCH", body: { name: `${marker} Till` } });
  const sessionCreate = await request("POS session open", `${storeBase}/pos/sessions`, {
    method: "POST", expected: [201], body: { registerId: register.id, openingFloat: 500 },
  });
  const session = sessionCreate.data.session;
  await request("POS session detail", `${storeBase}/pos/sessions/${session.id}`);

  const heldCreate = await request("POS hold sale", `${storeBase}/pos/held`, {
    method: "POST", expected: [201], body: { sessionId: session.id, label: marker, cart: [{ productId: fixedProduct.id, quantity: 1 }] },
  });
  await request("POS held sales list", `${storeBase}/pos/held?sessionId=${session.id}`);
  await request("POS held sale delete", `${storeBase}/pos/held/${heldCreate.data.heldSale.id}`, { method: "DELETE" });

  const movementRef = `${marker}-MOVE`;
  await request("POS cash movement", `${storeBase}/pos/sessions/${session.id}/movements`, {
    method: "POST", expected: [201], body: { kind: "paid_in", amount: 100, reason: marker, clientRef: movementRef },
  });
  const movementReplay = await request("POS cash movement idempotent replay", `${storeBase}/pos/sessions/${session.id}/movements`, {
    method: "POST", body: { kind: "paid_in", amount: 100, reason: marker, clientRef: movementRef },
  });
  check(movementReplay.data.replayed === true, "Cash movement retry was not deduplicated");

  const saleKey = `${marker}-SALE`;
  const saleBody = {
    sessionId: session.id, idempotencyKey: saleKey, buyerName: "POS Audit Customer",
    items: [{ productId: fixedProduct.id, quantity: 1 }],
    tenders: [{ method: "cash", amount: 1250 }],
  };
  const saleCreate = await request("POS sale", `${storeBase}/pos/sales`, { method: "POST", expected: [201], body: saleBody });
  check(saleCreate.data.order?.id, "POS sale returned no order");
  const saleReplay = await request("POS sale idempotent replay", `${storeBase}/pos/sales`, { method: "POST", body: saleBody });
  check(saleReplay.data.replayed === true && saleReplay.data.order.id === saleCreate.data.order.id, "POS sale retry was not deduplicated");
  const soldItem = saleCreate.data.items?.[0];
  check(soldItem?.id, "POS sale returned no order item for return testing");
  const returnBody = {
    sessionId: session.id, idempotencyKey: `${marker}-RETURN`, originalOrderId: saleCreate.data.order.id,
    refundMethod: "transfer", reference: `${marker}-REFUND`, items: [{ orderItemId: soldItem.id, quantity: 1 }],
  };
  const returnCreate = await request("POS return", `${storeBase}/pos/returns`, {
    method: "POST", expected: [201], body: returnBody,
  });
  check(returnCreate.data.order?.originalOrderId === saleCreate.data.order.id, "POS return was not linked to its original sale");
  const returnReplay = await request("POS return idempotent replay", `${storeBase}/pos/returns`, { method: "POST", body: returnBody });
  check(returnReplay.data.replayed === true && returnReplay.data.order.id === returnCreate.data.order.id, "POS return retry was not deduplicated");
  await request("POS session movement pagination", `${storeBase}/pos/sessions/${session.id}?movementsPage=1`);
  await request("POS session order pagination", `${storeBase}/pos/sessions/${session.id}?ordersPage=1`);
  await request("POS session close", `${storeBase}/pos/sessions/${session.id}/close`, {
    method: "POST", body: { countedCash: 1850, pendingSyncCount: 0 },
  });
  await request("POS closed session detail", `${storeBase}/pos/sessions/${session.id}`);
  await request("POS register retire", `${storeBase}/pos/registers/${register.id}`, { method: "DELETE" });

  const offlineOrder = await request("manual offline order", `${storeBase}/orders/offline`, {
    method: "POST", expected: [201],
    body: {
      buyerName: "Manual Audit Customer", buyerEmail: `${categorySlug}-manual@example.invalid`, buyerPhone: "+2348222222222",
      note: marker, delivered: false, paymentMethod: "cash", branchId: branch.id,
      items: [{ productId: fixedProduct.id, quantity: 1 }],
    },
  });
  await request("manual order detail", `${storeBase}/orders/${offlineOrder.data.order.id}`);
  await request("manual order mark shipped", `${storeBase}/orders/${offlineOrder.data.order.id}`, {
    method: "PATCH", body: { status: "shipped" },
  });
  await request("manual order mark delivered", `${storeBase}/orders/${offlineOrder.data.order.id}`, {
    method: "PATCH", body: { status: "delivered" },
  });
  await request("orders list and search", `${storeBase}/orders?page=1&pageSize=20&q=${encodeURIComponent(marker)}`);

  await request("store stats", `${storeBase}/stats`);
  await request("store analytics", `${storeBase}/analytics`);
  const activity = await request("activity search", `${storeBase}/activity?page=1&pageSize=20&q=${encodeURIComponent(marker)}`);
  check(activity.data.pagination?.pageSize === 20 && activity.data.activity?.length > 0, "Activity detail search did not find the audit workflow");
  const activityId = activity.data.activity[0].id;
  await request("activity flag", `${storeBase}/activity/${activityId}`, { method: "PATCH", body: { action: "flag", note: marker } });
  const flagged = await request("activity flagged filter", `${storeBase}/activity?page=1&pageSize=20&flagged=true&q=${encodeURIComponent(marker)}`);
  check(flagged.data.activity?.some((row) => row.id === activityId), "Flagged activity filter did not return the flagged entry");
  await request("activity clear flag", `${storeBase}/activity/${activityId}`, { method: "PATCH", body: { action: "clear" } });

  await request("fixed product detach category", `${storeBase}/products/${fixedProduct.id}`, { method: "PATCH", body: { categoryId: null, isActive: false } });
  await request("invoice product detach category", `${storeBase}/products/${invoiceProduct.id}`, { method: "PATCH", body: { categoryId: null, isActive: false } });
  await request("category delete", `${storeBase}/categories/${categoryId}`, { method: "DELETE" });
  await request("ordered product delete guard", `${storeBase}/products/${fixedProduct.id}`, { method: "DELETE", expected: [409] });
  await request("invoice product delete guard", `${storeBase}/products/${invoiceProduct.id}`, { method: "DELETE", expected: [409] });

  console.log(JSON.stringify({ marker, passed: results.filter((result) => result.ok).length, failed: 0, results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ marker, passed: results.filter((result) => result.ok).length, failed: 1, error: error.message, results }, null, 2));
  process.exitCode = 1;
});
