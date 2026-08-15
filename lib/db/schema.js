import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
  date,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ---------- ENUMS ----------
// staff: a helper a vendor invites to manage their store day-to-day (see
// /api/v1/vendor/stores/[storeId]/staff) - scoped to one store via
// users.storeId same as customer, capped per store by lib/storePlan.js's
// getStaffLimit (platformSettings.freeStaffLimit/plusStaffLimit), excluded
// from money-moving actions (payout account) and from managing other staff.
export const roleEnum = pgEnum("role", ["customer", "vendor", "staff", "super_admin"]);
export const domainStatusEnum = pgEnum("domain_status", ["none", "pending_dns", "verified"]);
export const tokenTypeEnum = pgEnum("token_type", ["reset", "verify"]);
// Physical needs a shipping address at checkout; digital skips straight
// to delivery/access. Chosen per product, not per store.
export const productTypeEnum = pgEnum("product_type", ["physical", "digital"]);
// Only meaningful for physical products (see products.condition below) -
// a digital product is neither, condition just doesn't apply to it.
export const productConditionEnum = pgEnum("product_condition", ["new", "used", "fairly_used"]);
export const cartStatusEnum = pgEnum("cart_status", ["active", "converted", "abandoned"]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refund_requested",
  "refunded",
  // Distinct from reverting to "delivered" - the customer should still
  // see their request was reviewed and declined (with the vendor's
  // reason, see refundRequests.reviewNote), not have it silently vanish
  // back to looking like nothing ever happened.
  "refund_declined",
]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "paid", "failed"]);
export const refundStatusEnum = pgEnum("refund_status", ["pending", "approved", "rejected"]);
// Only meaningful for role = "vendor" - identity verification (NIN) gating
// whether their store can actually go live, see users.nin below. Defaults
// to "approved" so it's a no-op for every other role (and for vendor rows
// that predate this column) rather than needing a role check wherever
// this is read.
export const approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected"]);

// ---------- STORES (tenants) ----------

export const stores = pgTable(
  "stores",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    // A vendor may eventually own more than one store, so this points
    // at the owner rather than embedding a storeId on the vendor's own
    // user row (which would only support one store per vendor).
    ownerId: text("owner_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    customDomain: text("custom_domain").unique(),
    domainStatus: domainStatusEnum("domain_status").notNull().default("none"),
    // Vercel occasionally requires proving ownership of a domain (e.g. it
    // was already added to a different Vercel project/team) via a TXT
    // record, on top of the usual A/CNAME pointing - see lib/vercel.js's
    // addProjectDomain. Null except in that edge case; shown to the
    // vendor alongside the standard DNS instructions when present.
    domainVerification: jsonb("domain_verification"),
    // Rectangular wordmark/logo shown in the storefront navbar - distinct
    // from faviconUrl, which is a separate round crop meant for the
    // browser tab icon (see generateMetadata in
    // app/storefront/[host]/layout.js).
    logoUrl: text("logo_url"),
    faviconUrl: text("favicon_url"),
    currency: text("currency").notNull().default("NGN"),
    // Short vendor-written blurb - shown on the public store directory
    // (app/stores/page.js) and used as the storefront's meta description
    // (app/storefront/[host]/layout.js's generateMetadata) when set,
    // falling back to an auto-generated one otherwise.
    description: text("description"),
    // Free-text physical/pickup address, optional - shown in the
    // storefront footer (components/storefront/Footer.js) when set.
    address: text("address"),
    // Vendor-supplied contact/social links, all optional. Storefront
    // footer only renders an icon for whichever of these are actually
    // set (see components/storefront/Footer.js). `whatsapp` is a bare
    // phone number (digits, optional leading +), not a URL - it also
    // separately drives the fixed "quick help" WhatsApp button on every
    // storefront page, see components/storefront/WhatsAppButton.js.
    socialLinks: jsonb("social_links").notNull().default({}),
    // Payout account, verified through Paystack's sub-account API (which
    // resolves accountName from bankCode+accountNumber itself, so there's
    // no separate unverified "vendor typed a name" field). Checkout can't
    // split payments to this store until subAccountCode is set, see
    // lib/paystack.js.
    bankCode: text("bank_code"),
    bankName: text("bank_name"),
    accountNumber: text("account_number"),
    accountName: text("account_name"),
    subAccountCode: text("sub_account_code"),
    // Paystack's numeric sub-account id, distinct from subAccountCode
    // ("ACCT_...") above - needed for listSettlements' `subaccount`
    // filter (see lib/settlementSync.js), which silently matches nothing
    // if given the code instead. Backfilled lazily via
    // lib/paystack.js's getSubAccount() for stores linked before this
    // field existed.
    subAccountId: integer("sub_account_id"),
    // Null means "use platformSettings.defaultCommissionRatePercent".
    commissionRatePercent: real("commission_rate_percent"),
    // Who pays the platform's commission at checkout for this store: false
    // (default) means the vendor absorbs it, same as before this field
    // existed - the buyer pays exactly subtotal + shipping, and commission
    // is deducted from the vendor's payout. true adds it on top instead,
    // the buyer pays the extra and the vendor receives the full subtotal +
    // shipping. The vendor's own choice (self-service, see
    // updateVendorStoreSchema), not super_admin-controlled - see
    // lib/orders.js's computeOrderTotals.
    feeChargedToCustomer: boolean("fee_charged_to_customer").notNull().default(false),
    // Flat fallback shipping cost, used whenever an order's delivery
    // state/city doesn't match a more specific row in shippingRates below,
    // see lib/shipping.js's resolveShippingFee.
    defaultShippingFee: real("default_shipping_fee").notNull().default(0),
    // How many days after delivery a customer can request a refund - the
    // vendor's own choice (self-service, see updateVendorStoreSchema),
    // enforced in POST /api/v1/customer/orders/[id]/refund-request
    // against orders.deliveredAt.
    returnWindowDays: integer("return_window_days").notNull().default(7),
    // Admin-controlled enable/disable (suspension for policy violations
    // etc.) - see app/api/v1/super-admin/stores/[id]/route.js, the only
    // writer. Deliberately separate from isOpen below: a vendor closing
    // their own store for a break shouldn't look or behave like an admin
    // suspension, and an admin suspension must not be reversible by the
    // vendor simply flipping their own toggle back on.
    isActive: boolean("is_active").notNull().default(true),
    disabledReason: text("disabled_reason"),
    // Vendor's own "go live / go offline" toggle (e.g. taking a break,
    // restocking) - see app/api/v1/vendor/stores/[storeId]/route.js.
    // Both this and isActive must be true (plus owner approval) for the
    // storefront to be live - see isStoreLive in lib/resolveStore.js.
    isOpen: boolean("is_open").notNull().default(true),
    // Storezn+ subscription state - see lib/storePlan.js's getEffectivePlan,
    // which is what every feature gate actually reads (not this column
    // directly). "plan" only ever gets written by the Paystack webhook
    // handler; getEffectivePlan treats a cancelled-but-not-yet-expired
    // subscription as still "plus" until planRenewsAt passes.
    plan: text("plan").notNull().default("free"),
    planRenewsAt: timestamp("plan_renews_at"),
    planCancelled: boolean("plan_cancelled").notNull().default(false),
    paystackCustomerCode: text("paystack_customer_code"),
    paystackSubscriptionCode: text("paystack_subscription_code"),
    // Paystack's "email token" - required alongside paystackSubscriptionCode
    // to disable a subscription via POST /subscription/disable.
    paystackSubscriptionToken: text("paystack_subscription_token"),
    // Storezn+ only - ignored (falls back to the default brand color) for
    // free stores even if a stale value is present, so a downgrade doesn't
    // need to clear it. See app/storefront/[host]/layout.js.
    storefrontAccentColor: text("storefront_accent_color"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    ownerIdIdx: index("idx_stores_owner_id").on(table.ownerId),
    slugIdx: index("idx_stores_slug").on(table.slug),
  }),
);

export const storesRelations = relations(stores, ({ one }) => ({
  owner: one(users, { fields: [stores.ownerId], references: [users.id] }),
}));

// Per-state or per-city/LGA shipping fee overrides, on top of a store's
// flat defaultShippingFee above. A row with city = null applies to the
// whole state; a row with a city set is a more specific override for just
// that city/LGA within the state - see lib/shipping.js's
// resolveShippingFee for the actual lookup (city match > state-only match
// > store default). State/city are free-text (matching how
// addresses.state/city already work elsewhere in this app, no canonical
// Nigerian-states list is enforced anywhere), matched case-insensitively.
export const shippingRates = pgTable(
  "shipping_rates",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id").notNull().references(() => stores.id),
    state: text("state").notNull(),
    city: text("city"),
    fee: real("fee").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    storeIdIdx: index("idx_shipping_rates_store_id").on(table.storeId),
    // Two separate partial unique indexes rather than one over
    // (storeId, state, city): Postgres never treats two NULLs as equal in
    // a unique index, so a plain unique index would happily let a vendor
    // create duplicate state-only (city = null) rows for the same state.
    storeStateUnique: uniqueIndex("uq_shipping_rates_store_state").on(table.storeId, table.state).where(sql`${table.city} is null`),
    storeStateCityUnique: uniqueIndex("uq_shipping_rates_store_state_city").on(table.storeId, table.state, table.city).where(sql`${table.city} is not null`),
  }),
);

export const shippingRatesRelations = relations(shippingRates, ({ one }) => ({
  store: one(stores, { fields: [shippingRates.storeId], references: [stores.id] }),
}));

// ---------- USERS & AUTH ----------

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    // A customer or staff member belongs to exactly one store (mirrors
    // school-app's students-belong-to-one-school shape). Null for vendor/
    // super_admin - a vendor's store relationship is via stores.ownerId
    // instead, since that supports owning more than one store.
    storeId: text("store_id").references(() => stores.id),
    firstName: text("first_name"),
    lastName: text("last_name"),
    // Email is the login identifier (no separate username, unlike
    // school-app) - unique platform-wide. Known MVP simplification: one
    // email = one account on the whole platform, even though customers
    // conceptually belong to a single store. Revisit with a proper
    // per-store-scoped uniqueness model if "shop at two stores with one
    // email" turns out to matter in practice.
    email: text("email").notNull().unique(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("customer"),
    emailVerified: boolean("email_verified").notNull().default(false),
    isBanned: boolean("is_banned").notNull().default(false),
    deletedAt: timestamp("deleted_at"),
    profilePictureUrl: text("profile_picture_url"),
    emailNotificationsEnabled: boolean("email_notifications_enabled").notNull().default(true),
    // Set at self-signup, when the person themselves checks the terms
    // box - left null for accounts a super_admin creates on someone's
    // behalf (e.g. manual vendor onboarding), since nobody actually
    // clicked "I agree" in that case.
    termsAcceptedAt: timestamp("terms_accepted_at"),
    // Vendor identity verification (see approvalStatusEnum above) - a new
    // vendor signup gets the dashboard immediately (products, store setup,
    // etc all work), but their store stays unlisted/can't take orders (see
    // resolveStoreByHost's ownerApprovalStatus, checked at the storefront
    // layout and checkout routes) until a super_admin approves their NIN
    // here. Resubmitting after a rejection just overwrites nin/
    // ninSubmittedAt and flips approvalStatus back to "pending".
    approvalStatus: approvalStatusEnum("approval_status").notNull().default("approved"),
    nin: text("nin"),
    ninSubmittedAt: timestamp("nin_submitted_at"),
    approvalReviewedBy: text("approval_reviewed_by").references(() => users.id),
    approvalReviewNote: text("approval_review_note"),
    approvalReviewedAt: timestamp("approval_reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    storeIdIdx: index("idx_users_store_id").on(table.storeId),
  }),
);

export const usersRelations = relations(users, ({ one }) => ({
  store: one(stores, { fields: [users.storeId], references: [stores.id] }),
}));

// Web Push (VAPID) subscriptions - one row per browser/device a user has
// opted into notifications on, not one per user (the same account can be
// subscribed on a phone and a desktop at once, each with its own
// endpoint). See lib/push.js for how these get sent to and pruned.
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => users.id),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("idx_push_subscriptions_user_id").on(table.userId),
  }),
);

export const tokens = pgTable(
  "tokens",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => users.id),
    type: tokenTypeEnum("type").notNull(),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tokenIdx: index("idx_tokens_token").on(table.token),
  }),
);

// ---------- CATALOG ----------

export const categories = pgTable(
  "categories",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id").notNull().references(() => stores.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    storeIdIdx: index("idx_categories_store_id").on(table.storeId),
    storeSlugUnique: uniqueIndex("uq_categories_store_slug").on(table.storeId, table.slug),
  }),
);

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  store: one(stores, { fields: [categories.storeId], references: [stores.id] }),
  products: many(products),
}));

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id").notNull().references(() => stores.id),
    categoryId: text("category_id").references(() => categories.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    sku: text("sku"),
    description: text("description"),
    price: real("price").notNull(),
    productType: productTypeEnum("product_type").notNull().default("physical"),
    // Only meaningful for physical products - null/ignored for digital
    // ones, which aren't stock-limited the same way. Also ignored once a
    // product has variants (each variant tracks its own stock instead).
    stock: integer("stock"),
    // Same "only meaningful for physical" caveat as stock above - shown
    // to shoppers on the storefront so a used item isn't mistaken for new.
    condition: productConditionEnum("condition").notNull().default("new"),
    // Simple list of image URLs rather than a separate productImages
    // table - keeps the MVP from needing its own reordering/management
    // UI just to show a few photos per listing.
    images: jsonb("images").notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    // Admin-only moderation, separate from the vendor's own isActive
    // Live/Hidden toggle above - a product is only ever visible/sellable
    // on the storefront when BOTH isActive is true AND suspendedAt is
    // null (see the storefront home/product-detail queries), and only a
    // super_admin can clear suspendedAt (POST /api/v1/super-admin/
    // products/[id]/suspend), the vendor's own product PATCH route never
    // touches it - so flipping isActive back on can't undo a suspension.
    suspendedAt: timestamp("suspended_at"),
    suspendedReason: text("suspended_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    storeIdIdx: index("idx_products_store_id").on(table.storeId),
    storeSlugUnique: uniqueIndex("uq_products_store_slug").on(table.storeId, table.slug),
    storeSkuUnique: uniqueIndex("uq_products_store_sku").on(table.storeId, table.sku),
  }),
);

export const productsRelations = relations(products, ({ one, many }) => ({
  store: one(stores, { fields: [products.storeId], references: [stores.id] }),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  variants: many(productVariants),
  reviews: many(reviews),
}));

// A product either sells as-is (variants stays empty, price/stock live on
// the product row) or through variants (e.g. Size/Color combinations) -
// once it has any variant rows, the storefront always requires picking
// one before add-to-cart, and each variant's own price/stock is what's
// actually sold.
export const productVariants = pgTable(
  "product_variants",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    productId: text("product_id").notNull().references(() => products.id),
    // e.g. {"Size": "L", "Color": "Red"} - a flat option map rather than
    // separate option-type tables, which is more machinery than an MVP
    // storefront needs for "pick a size, pick a color".
    options: jsonb("options").notNull().default({}),
    sku: text("sku"),
    // Null means "use the parent product's price" - lets a vendor only
    // override price for the variants that actually cost more/less.
    price: real("price"),
    stock: integer("stock"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    productIdIdx: index("idx_product_variants_product_id").on(table.productId),
  }),
);

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
}));

// ---------- REVIEWS ----------

// One review per (product, customer), and only from someone who actually
// has a paid order containing that product - orderId is the proof, not
// just a courtesy reference.
export const reviews = pgTable(
  "reviews",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    productId: text("product_id").notNull().references(() => products.id),
    userId: text("user_id").notNull().references(() => users.id),
    orderId: text("order_id").notNull().references(() => orders.id),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    productIdIdx: index("idx_reviews_product_id").on(table.productId),
    productUserUnique: uniqueIndex("uq_reviews_product_user").on(table.productId, table.userId),
  }),
);

export const reviewsRelations = relations(reviews, ({ one }) => ({
  product: one(products, { fields: [reviews.productId], references: [products.id] }),
  user: one(users, { fields: [reviews.userId], references: [users.id] }),
  order: one(orders, { fields: [reviews.orderId], references: [orders.id] }),
}));

// ---------- PLATFORM SETTINGS (super-admin only) ----------

export const platformSettings = pgTable("platform_settings", {
  id: text("id").primaryKey().$default(() => "singleton"),
  defaultCommissionRatePercent: real("default_commission_rate_percent").notNull().default(5),
  // Ceiling on the commission amount per order (see lib/orders.js's
  // computeOrderTotals), regardless of subtotal or the configured rate -
  // null means uncapped, the commission is always exactly
  // subtotal × rate%. Admin-editable any time from /super-admin/settings,
  // not a fixed code constant.
  maxCommissionAmount: real("max_commission_amount"),
  // Flat ₦ charged per order on top of the percentage commission (e.g.
  // a fixed processing fee) - separate from maxCommissionAmount, which
  // only caps the percentage component. 0 by default, meaning existing
  // behavior (percentage-only) is unchanged until an admin sets one.
  defaultFlatFee: real("default_flat_fee").notNull().default(0),
  // When true, proxy.js shows every visitor (storefronts, vendor
  // dashboard, customer auth) a maintenance page instead of the app -
  // super_admin routes/APIs and the login page stay reachable so the
  // admin can still sign in and flip this back off. See
  // lib/maintenanceMode.js for the cached read proxy.js actually uses.
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  // Storezn+ - all admin-editable from /super-admin/settings, same pattern
  // as the commission/fee fields above. See lib/storePlan.js.
  plusMonthlyPrice: real("plus_monthly_price").notNull().default(5000),
  freeStorageMb: integer("free_storage_mb").notNull().default(500),
  plusStorageMb: integer("plus_storage_mb").notNull().default(5000),
  freeStaffLimit: integer("free_staff_limit").notNull().default(1),
  plusStaffLimit: integer("plus_staff_limit").notNull().default(10),
  // Paystack Plan code for the Storezn+ subscription - created once, then
  // kept in sync (amount only) whenever plusMonthlyPrice is saved. See
  // PATCH /api/v1/super-admin/settings.
  paystackPlanCode: text("paystack_plan_code"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------- STORE UPLOADS (storage metering ledger) ----------

// One row per uploaded file still in use, so storage usage can self-correct
// on delete/replace instead of drifting - usage is always
// SUM(sizeBytes) WHERE storeId = ?, never cached on stores itself. See
// lib/storeUploads.js (recordStoreUpload/removeStoreUpload/
// getStoreStorageUsage), wired into POST /api/v1/uploads/file and every
// deletePublicFile call site.
export const storeUploads = pgTable(
  "store_uploads",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id").notNull().references(() => stores.id),
    url: text("url").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    purpose: text("purpose").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    storeIdIdx: index("idx_store_uploads_store_id").on(table.storeId),
    urlIdx: index("idx_store_uploads_url").on(table.url),
  }),
);

// ---------- ADDRESSES ----------

export const addresses = pgTable(
  "addresses",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => users.id),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    line1: text("line1").notNull(),
    line2: text("line2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    country: text("country").notNull().default("Nigeria"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("idx_addresses_user_id").on(table.userId),
  }),
);

export const addressesRelations = relations(addresses, ({ one }) => ({
  user: one(users, { fields: [addresses.userId], references: [users.id] }),
}));

// ---------- CART ----------

export const carts = pgTable(
  "carts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id").notNull().references(() => stores.id),
    // Null for a guest cart, identified instead by guestToken (a cookie
    // value). Once a guest logs in/signs up, their cart is reassigned to
    // userId rather than merged - see checkout route for that handoff.
    userId: text("user_id").references(() => users.id),
    guestToken: text("guest_token").unique(),
    status: cartStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    storeIdIdx: index("idx_carts_store_id").on(table.storeId),
    userIdIdx: index("idx_carts_user_id").on(table.userId),
  }),
);

export const cartsRelations = relations(carts, ({ one, many }) => ({
  store: one(stores, { fields: [carts.storeId], references: [stores.id] }),
  user: one(users, { fields: [carts.userId], references: [users.id] }),
  items: many(cartItems),
}));

export const cartItems = pgTable(
  "cart_items",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    cartId: text("cart_id").notNull().references(() => carts.id),
    productId: text("product_id").notNull().references(() => products.id),
    // Null for a product with no variants. The DB unique index below
    // can't express "one null-variant row per product" on its own
    // (multi-column unique indexes treat NULL as never equal to NULL),
    // so the cart route does that dedup itself instead of relying on
    // onConflictDoUpdate for the no-variant case.
    variantId: text("variant_id").references(() => productVariants.id),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    cartIdIdx: index("idx_cart_items_cart_id").on(table.cartId),
    cartProductVariantUnique: uniqueIndex("uq_cart_items_cart_product_variant").on(table.cartId, table.productId, table.variantId),
  }),
);

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
  product: one(products, { fields: [cartItems.productId], references: [products.id] }),
  variant: one(productVariants, { fields: [cartItems.variantId], references: [productVariants.id] }),
}));

// ---------- ORDERS ----------

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id").notNull().references(() => stores.id),
    // Null for a guest order - identified instead by guestEmail.
    userId: text("user_id").references(() => users.id),
    orderNumber: text("order_number").notNull().unique(),
    guestEmail: text("guest_email"),
    // Only ever set on a vendor-recorded offline order (isOffline below) -
    // an online guest order's contact name/phone already lives in
    // shippingAddress (physical) or is simply unknown (digital, guestEmail
    // is the only identifier). An offline sale has neither, the vendor
    // types the buyer's name/phone directly since there's no address to
    // derive them from.
    buyerName: text("buyer_name"),
    buyerPhone: text("buyer_phone"),
    status: orderStatusEnum("status").notNull().default("pending"),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
    subtotal: real("subtotal").notNull(),
    shippingFee: real("shipping_fee").notNull().default(0),
    totalAmount: real("total_amount").notNull(),
    // Commission fields are snapshotted at order time - a later change to
    // store.commissionRatePercent/platformSettings must never rewrite the
    // economics of an order that already happened.
    commissionRatePercent: real("commission_rate_percent").notNull(),
    commissionAmount: real("commission_amount").notNull(),
    // Flat ₦ portion of the platform fee, snapshotted separately from
    // commissionAmount (the percentage portion) so the two stay
    // independently visible/auditable per order - see
    // platformSettings.defaultFlatFee and lib/orders.js's
    // computeOrderTotals. 0 for every order placed before this existed.
    flatFeeAmount: real("flat_fee_amount").notNull().default(0),
    vendorPayoutAmount: real("vendor_payout_amount").notNull(),
    // Snapshot of stores.feeChargedToCustomer as of when this order was
    // placed (the vendor could change that setting later, this keeps this
    // order's own math self-describing without a join). false means
    // totalAmount = subtotal + shippingFee and commissionAmount came out
    // of vendorPayoutAmount; true means totalAmount also includes
    // commissionAmount and vendorPayoutAmount is the full subtotal +
    // shippingFee, see lib/orders.js's computeOrderTotals.
    feeChargedToCustomer: boolean("fee_charged_to_customer").notNull().default(false),
    // jsonb snapshot, not a live FK to addresses - an edited/deleted
    // address must never alter what an already-placed order shows.
    shippingAddress: jsonb("shipping_address"),
    // Optional free-text note: the customer's own special instructions at
    // checkout, or (on a vendor-recorded offline order, see isOffline
    // below) the vendor's own note to themselves about the sale.
    note: text("note"),
    // A sale the vendor recorded manually (in-person/phone/cash, see
    // POST /api/v1/vendor/stores/[storeId]/orders/offline) rather than one
    // that went through storefront checkout - never has a real Paystack
    // paymentReference (always null) or a buyer-facing session, it's
    // marked paid/processing immediately at creation. Kept as an explicit
    // flag rather than inferred from a null paymentReference so the UI
    // can badge it without that implicit coupling.
    isOffline: boolean("is_offline").notNull().default(false),
    // paymentReference is ours, a "STOREZN-" prefixed variant of
    // orderNumber sent to Paystack as both the idempotency key and the
    // reference the shared webhook router matches on (see
    // lib/paystack.js). transactionReference is unused now that Paystack
    // is the processor - it identified a Monnify transaction attempt
    // separately from our own reference, Paystack has no equivalent
    // second id.
    paymentReference: text("payment_reference").unique(),
    transactionReference: text("transaction_reference").unique(),
    paidAt: timestamp("paid_at"),
    // When Paystack actually settled this order's split to the vendor's
    // bank account - distinct from paidAt (when the customer paid).
    // Null until lib/settlementSync.js's syncStoreSettlements matches this
    // order's paymentReference in a completed settlement batch; never set
    // for isOffline orders, which never went through Paystack at all.
    settledAt: timestamp("settled_at"),
    // Set when the vendor marks the order delivered (see PATCH
    // /api/v1/vendor/stores/[storeId]/orders/[id]) - the anchor for the
    // store's returnWindowDays (see stores.returnWindowDays), since a
    // return window should count from when the customer actually
    // received the item, not from payment.
    deliveredAt: timestamp("delivered_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    storeIdIdx: index("idx_orders_store_id").on(table.storeId),
    userIdIdx: index("idx_orders_user_id").on(table.userId),
    orderNumberIdx: index("idx_orders_order_number").on(table.orderNumber),
  }),
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  store: one(stores, { fields: [orders.storeId], references: [stores.id] }),
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
}));

export const orderItems = pgTable(
  "order_items",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id").notNull().references(() => orders.id),
    productId: text("product_id").notNull().references(() => products.id),
    variantId: text("variant_id").references(() => productVariants.id),
    // Snapshots, same reasoning as shippingAddress above - a later product
    // edit/deletion must never alter historical order line items.
    productName: text("product_name").notNull(),
    productImage: text("product_image"),
    // e.g. "Size: L, Color: Red" - the variant's options flattened to
    // text at order time, same snapshotting reasoning as productName.
    variantLabel: text("variant_label"),
    unitPrice: real("unit_price").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotal: real("line_total").notNull(),
  },
  (table) => ({
    orderIdIdx: index("idx_order_items_order_id").on(table.orderId),
  }),
);

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

// ---------- REFUND REQUESTS ----------

export const refundRequests = pgTable(
  "refund_requests",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id").notNull().references(() => orders.id),
    requestedBy: text("requested_by").notNull().references(() => users.id),
    reason: text("reason").notNull(),
    status: refundStatusEnum("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at"),
  },
  (table) => ({
    orderIdIdx: index("idx_refund_requests_order_id").on(table.orderId),
  }),
);

export const refundRequestsRelations = relations(refundRequests, ({ one }) => ({
  order: one(orders, { fields: [refundRequests.orderId], references: [orders.id] }),
  requester: one(users, { fields: [refundRequests.requestedBy], references: [users.id] }),
  reviewer: one(users, { fields: [refundRequests.reviewedBy], references: [users.id] }),
}));
