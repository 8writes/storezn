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
// admin: platform team member with the same access as super_admin except
// platform settings and team management. p_staff: platform staff scoped
// to products (full access) plus read-only orders/transactions. Both live
// in `users` (storeId/branchId null, same as super_admin) and are
// provisioned via /super-admin/team, not self-signup - see
// lib/activityLog.js, whose actions are logged for these two roles only.
export const roleEnum = pgEnum("role", ["customer", "vendor", "staff", "super_admin", "admin", "p_staff"]);
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
  // Payment never completed and the order was swept as stale (see
  // lib/failStaleTransactions.js) - distinct from a deliberate
  // "cancelled" so the vendor/admin can tell an abandoned checkout apart
  // from an order someone actively called off. Appended last to match
  // the live enum (Postgres can't reorder enum values).
  "abandoned",
]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "paid", "failed"]);
export const refundStatusEnum = pgEnum("refund_status", ["pending", "approved", "rejected"]);
// Only meaningful for role = "vendor" - identity verification (NIN) gating
// whether their store can actually go live, see users.nin below. Defaults
// to "approved" so it's a no-op for every other role (and for vendor rows
// that predate this column) rather than needing a role check wherever
// this is read.
export const approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected"]);

// ---------- POINT OF SALE ----------
// How an order came to be. "online" = storefront checkout (the default,
// covers every order placed before this column existed). "pos" = rung up
// live on a register during a shift (see posSessions below), money taken
// in person. "manual" = a vendor typed up a past sale after the fact (the
// original "record an offline order" flow) - no register, no live drawer.
// Both non-"online" values also carry isOffline = true so the ~dozen
// existing places that branch on that column keep working unchanged.
export const orderChannelEnum = pgEnum("order_channel", ["online", "pos", "manual"]);
export const posSessionStatusEnum = pgEnum("pos_session_status", ["open", "closed"]);
// Signed cash-drawer events for a session. cash_sale / cash_refund are
// written automatically from a sale's cash tender; the rest are the
// cashier's explicit actions. amount is signed kobo: + into the drawer,
// - out of it. See lib/pos.js computeDrawer.
export const cashMovementKindEnum = pgEnum("cash_movement_kind", [
  "float",
  "cash_sale",
  "cash_refund",
  "paid_in",
  "paid_out",
  "drop",
  // Cash change handed back from the drawer on a POS / transfer
  // overpayment (the customer sent a round number and took the
  // difference in cash). Its own kind so it doesn't read as a negative
  // "cash sale" or count as a discretionary paid-out. See CHANGE-OUT-MIGRATION.sql.
  "change_out",
]);
// How a tender on an order was paid. "cash" touches the physical drawer
// directly; a "card"/"transfer" tender can still pull cash OUT of the
// drawer when the customer overpays and takes the difference in cash
// (change_given > 0 -> a `change_out` movement).
export const tenderMethodEnum = pgEnum("tender_method", ["cash", "card", "transfer", "wallet", "store_credit"]);

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
    // Short vendor-written blurb - used as the storefront's meta
    // description (app/storefront/[host]/layout.js's generateMetadata)
    // when set, falling back to an auto-generated one otherwise.
    description: text("description"),
    // Free-text physical/pickup address, optional - shown in the
    // storefront footer (components/storefront/Footer.js) when set.
    address: text("address"),
    // Nigerian state the store operates/ships from (see
    // lib/nigeria.js's NIGERIA_STATE_OPTIONS) - collected at vendor
    // signup, editable from /vendor/settings. Shown as the item's
    // location on storefront/marketplace product cards and detail pages,
    // since a shopper choosing between similar listings often cares
    // where it's actually coming from. Store-level, not per-product -
    // every product a vendor lists ships from the same place.
    state: text("state"),
    // Whether the "Ships from <state>" line is shown on storefront
    // product cards and detail pages - vendors who'd rather not surface
    // their location can hide it from /vendor/settings. Defaults on, so
    // existing stores keep showing it exactly as before.
    showShipsFrom: boolean("show_ships_from").notNull().default(true),
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
    // Same override pattern as commissionRatePercent above, for Storezn+
    // instead: null means "use platformSettings.plusMonthlyPrice". Set by
    // a super_admin (see /api/v1/super-admin/stores/[id]) for a
    // discounted/negotiated rate on this one store - resolved wherever the
    // effective price is needed (GET /api/v1/vendor/stores/[storeId],
    // POST .../subscribe) so the vendor is never shown or charged a
    // different amount than each other. Doesn't retroactively change an
    // already-active subscription's charge amount - only applies the next
    // time this store subscribes.
    subscriptionPriceOverride: real("subscription_price_override"),
    // A Paystack Plan created just for this store at subscriptionPrice-
    // Override's amount. Needed because Paystack renews a subscription at
    // its PLAN's amount, not whatever `amount` the initialize call
    // passed - so without a per-store plan, an overridden store would
    // subscribe fine but then renew at platformSettings.plusMonthlyPrice.
    // Created/updated by the super-admin store PATCH whenever the
    // override is set; null means "use platformSettings.paystackPlanCode"
    // (the shared plan).
    paystackPlanCodeOverride: text("paystack_plan_code_override"),
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
    // AND defaultShippingIsTBD (below) is false - see lib/shipping.js's
    // resolveShippingFee.
    defaultShippingFee: real("default_shipping_fee").notNull().default(0),
    // Most vendors don't actually know their delivery cost upfront (it's
    // negotiated with a rider/driver at dispatch) - true (the platform
    // default) means resolveShippingFee's fallback is "to be determined"
    // instead of defaultShippingFee's value, so checkout doesn't force a
    // guessed number. A vendor can flip this off to go back to a fixed
    // default; per-state/city shippingRates rows are unaffected either way
    // (they're always a fixed, known-cost escape hatch).
    defaultShippingIsTBD: boolean("default_shipping_is_tbd").notNull().default(true),
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
    // Vendor's own opt-out (default on) from the cross-store Storezn
    // marketplace (app/stores/page.js) - every store is listed there by
    // default, on top of the usual isStoreLive checks (see
    // lib/marketplace.js's getMarketplaceProducts), and a vendor can turn
    // it off from /vendor/settings if they'd rather only be found through
    // their own store link. Clicking a product there always hands off to
    // the vendor's own storefront to actually buy - the marketplace is
    // discovery-only, not a shared cart/checkout.
    listOnMarketplace: boolean("list_on_marketplace").notNull().default(true),
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

// A vendor's physical location(s). Every store gets exactly one
// isDefault branch (created alongside the store, see stores' own POST
// route, and backfilled for stores that existed before this table did) -
// that's what keeps a single-location vendor's experience identical to
// before this existed, both in the UI (per-branch stock/staff/order
// scoping only ever shows up once a second branch exists) and in the
// data (see productBranchStock below). Only the store owner manages
// this list (see /vendor/branches, isStoreOwner-gated like /vendor/staff)
// - creating more than one is a Storezn+ feature, see
// lib/storePlan.js's getBranchLimit.
export const branches = pgTable(
  "branches",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id").notNull().references(() => stores.id),
    name: text("name").notNull(),
    address: text("address"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    storeIdIdx: index("idx_branches_store_id").on(table.storeId),
  }),
);

export const branchesRelations = relations(branches, ({ one }) => ({
  store: one(stores, { fields: [branches.storeId], references: [stores.id] }),
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
    // Only meaningful when role = "staff" - which of the store's
    // branches this staff member is scoped to (see canManageStore/
    // lib/auth.js and the vendor orders routes' branch-filtering). Null
    // for every other role, and null for staff at a single-branch store
    // (nothing to scope to yet) - see /vendor/staff's invite form.
    branchId: text("branch_id").references(() => branches.id),
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
    // Ticked the "occasional marketing emails" box at signup. Separate
    // from emailNotificationsEnabled (which is transactional).
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    // The device + IP this account signed up from - anti-abuse only (see
    // lib/device.js, the abuse triggers in the signup routes, and the
    // privacy policy). Null for admin-created accounts.
    signupDeviceId: text("signup_device_id"),
    signupIp: text("signup_ip"),
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
    // Throttled "last seen" heartbeat - written by getUser (lib/auth.js)
    // at most once every 2 min per account, for the super-admin's
    // vendor/team views. Null until the account's next authenticated
    // request after this shipped.
    lastActiveAt: timestamp("last_active_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    storeIdIdx: index("idx_users_store_id").on(table.storeId),
  }),
);

export const usersRelations = relations(users, ({ one }) => ({
  store: one(stores, { fields: [users.storeId], references: [stores.id] }),
  branch: one(branches, { fields: [users.branchId], references: [branches.id] }),
}));

// Accountability trail for the admin/p_staff platform roles (see roleEnum
// above) - super_admin's own actions aren't logged here, only theirs, per
// lib/activityLog.js. actorName/actorRole are denormalized at write time
// so the log stays readable even after a team member is removed.
export const activityLogs = pgTable(
  "activity_logs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    // Nullable + set-null on delete, unlike most FKs here - removing a
    // team member (DELETE .../team/[id]) must not be blocked by their own
    // history, and the log has to survive them regardless (that's the
    // whole point of denormalizing actorName/actorRole below).
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorName: text("actor_name").notNull(),
    actorRole: roleEnum("actor_role").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    createdAtIdx: index("idx_activity_logs_created_at").on(table.createdAt),
  }),
);

// Store-level audit trail - important staff/owner actions, readable by
// the store owner (isStoreOwner). Separate from activity_logs above,
// which is platform-team-only and users-keyed; here the actor can be a
// vendor (users.id) OR a staff member (staff.id), so actorId is a plain
// reference and actorName/actorRole are denormalised at write time. See
// lib/storeActivity.js.
export const storeActivityLogs = pgTable(
  "store_activity_logs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id").notNull().references(() => stores.id),
    actorId: text("actor_id"),
    actorName: text("actor_name").notNull(),
    actorRole: text("actor_role").notNull(), // 'vendor' | 'staff'
    branchId: text("branch_id"),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    storeCreatedIdx: index("idx_store_activity_store_created").on(table.storeId, table.createdAt),
  }),
);

// A store's team, split out from `users` (see that table's email comment)
// so the same email can be staff at one store, a customer at another, and
// a vendor of their own, all at once - unique per (storeId, email) rather
// than platform-wide. Removing a staff member is a real DELETE from this
// table (see DELETE /api/v1/vendor/stores/[storeId]/staff/[staffId]), not
// a soft-delete - there's no other role sharing this table to protect
// against reusing the row. A staff member can also leave a store
// themselves (DELETE /api/v1/vendor/staff/me).
export const staff = pgTable(
  "staff",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id").notNull().references(() => stores.id),
    // Which of the store's branches this staff member is scoped to (see
    // canManageStore/lib/auth.js and the vendor orders routes'
    // branch-filtering) - null for staff at a single-branch store
    // (nothing to scope to yet), see /vendor/staff's invite form.
    branchId: text("branch_id").references(() => branches.id),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    isBanned: boolean("is_banned").notNull().default(false),
    profilePictureUrl: text("profile_picture_url"),
    emailNotificationsEnabled: boolean("email_notifications_enabled").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    storeIdIdx: index("idx_staff_store_id").on(table.storeId),
    storeEmailIdx: uniqueIndex("uq_staff_store_email").on(table.storeId, table.email),
  }),
);

export const staffRelations = relations(staff, ({ one }) => ({
  store: one(stores, { fields: [staff.storeId], references: [stores.id] }),
  branch: one(branches, { fields: [staff.branchId], references: [branches.id] }),
}));

// A store's shoppers, split out from `users` for the same reason as
// `staff` above - unique per (storeId, email), not platform-wide, so the
// same email can be an independent customer account at every store it
// shops at (deliberately not a unified cross-store identity - see the
// migration plan's discussion of this).
export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id").notNull().references(() => stores.id),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email").notNull(),
    // Canonical form of `email` with +tags and (for Gmail) dots removed -
    // see lib/emailNormalize.js. Backs the real uniqueness check so one
    // mailbox can't self-signup many times with foo+1@, foo+2@, ...
    normalizedEmail: text("normalized_email"),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    isBanned: boolean("is_banned").notNull().default(false),
    bannedReason: text("banned_reason"),
    bannedBy: text("banned_by"),
    bannedAt: timestamp("banned_at"),
    deletedAt: timestamp("deleted_at"),
    profilePictureUrl: text("profile_picture_url"),
    emailNotificationsEnabled: boolean("email_notifications_enabled").notNull().default(true),
    // Ticked the "occasional marketing emails" box at signup.
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    // Device + IP the account signed up from - anti-abuse only.
    signupDeviceId: text("signup_device_id"),
    signupIp: text("signup_ip"),
    termsAcceptedAt: timestamp("terms_accepted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    storeIdIdx: index("idx_customers_store_id").on(table.storeId),
    signupDeviceIdx: index("idx_customers_signup_device").on(table.signupDeviceId),
    storeEmailIdx: uniqueIndex("uq_customers_store_email").on(table.storeId, table.email),
    storeNormalizedEmailIdx: uniqueIndex("uq_customers_store_normalized_email")
      .on(table.storeId, table.normalizedEmail)
      .where(sql`${table.deletedAt} is null and ${table.normalizedEmail} is not null`),
  }),
);

// Emails / domains a super-admin has barred from signing up (spam-account
// farming). `value` is a normalized email (kind 'email') or a bare
// domain (kind 'domain'). Checked in both signup routes - see
// lib/emailNormalize.js isEmailBlocked.
export const blockedEmails = pgTable(
  "blocked_emails",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    value: text("value").notNull(),
    kind: text("kind").notNull(), // 'email' | 'domain'
    reason: text("reason"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    valueKindIdx: uniqueIndex("uq_blocked_emails_value_kind").on(table.value, table.kind),
  }),
);

// A barred device (auto-flagged by the abuse triggers or banned by hand).
// A device is barred if it has a row here with `unbannedAt` null matching
// EITHER its cookie/localStorage id OR its browser fingerprint. See
// lib/device.js + lib/deviceBan.js. Enforced in the login + signup routes.
export const bannedDevices = pgTable(
  "banned_devices",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    deviceId: text("device_id"),
    fingerprint: text("fingerprint"),
    reason: text("reason"),
    autoFlagged: boolean("auto_flagged").notNull().default(false),
    // Whichever account was tied to it when the ban went on (for the
    // review UI); not a hard FK - the account may be a customer or a user.
    subjectEmail: text("subject_email"),
    // The exact customer row this ban was placed alongside, so lifting
    // the device ban un-bans only that one account (not every customers
    // row sharing the email string). Null for a pure device/fingerprint ban.
    customerId: text("customer_id"),
    bannedBy: text("banned_by"),
    bannedAt: timestamp("banned_at").notNull().defaultNow(),
    unbannedAt: timestamp("unbanned_at"),
    unbannedBy: text("unbanned_by"),
  },
  (table) => ({
    deviceIdIdx: index("idx_banned_devices_device_id").on(table.deviceId),
    fingerprintIdx: index("idx_banned_devices_fingerprint").on(table.fingerprint),
  }),
);

// Every device (by its localStorage id) that has signed in or signed up,
// with a rolling last-seen. device_accounts links it to the accounts seen
// on it, so a super-admin can browse "device -> emails" and ban straight
// from the list. See lib/deviceLog.js. Written best-effort on login /
// signup only (30-day tokens mean it isn't every request).
export const devices = pgTable(
  "devices",
  {
    deviceId: text("device_id").primaryKey(),
    fingerprint: text("fingerprint"),
    firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    lastIp: text("last_ip"),
    lastUserAgent: text("last_user_agent"),
    seenCount: integer("seen_count").notNull().default(1),
  },
  (table) => ({
    lastSeenIdx: index("idx_devices_last_seen").on(table.lastSeenAt),
    fingerprintIdx: index("idx_devices_fingerprint").on(table.fingerprint),
  }),
);

export const deviceAccounts = pgTable(
  "device_accounts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    deviceId: text("device_id").notNull(),
    accountType: text("account_type").notNull(), // 'customer' | 'user' | 'staff'
    accountId: text("account_id").notNull(),
    email: text("email"),
    firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  },
  (table) => ({
    uq: uniqueIndex("uq_device_accounts").on(table.deviceId, table.accountType, table.accountId),
    deviceIdx: index("idx_device_accounts_device").on(table.deviceId),
  }),
);

// One row per rejected/suspicious signup attempt - the auto-ban triggers
// count these per device over a rolling 24h window, and the review UI
// shows the recent stream. kind: 'blocked_email' | 'banned_device' |
// 'rate_burst' | 'signup_flood'.
export const signupAbuseEvents = pgTable(
  "signup_abuse_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    deviceId: text("device_id"),
    fingerprint: text("fingerprint"),
    ip: text("ip"),
    normalizedEmail: text("normalized_email"),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    deviceCreatedIdx: index("idx_signup_abuse_device_created").on(table.deviceId, table.createdAt),
    createdIdx: index("idx_signup_abuse_created").on(table.createdAt),
  }),
);

export const customersRelations = relations(customers, ({ one }) => ({
  store: one(stores, { fields: [customers.storeId], references: [stores.id] }),
}));

// Web Push (VAPID) subscriptions - one row per browser/device a user has
// opted into notifications on, not one per user (the same account can be
// subscribed on a phone and a desktop at once, each with its own
// endpoint). See lib/push.js for how these get sent to and pruned.
// userId/staffId/customerId are mutually exclusive - exactly one is set
// per row, depending on which table the subscribing account lives in
// (see lib/db/schema.js's users/staff/customers split). A single FK
// can't target more than one table, so this is three nullable FKs
// instead of one, rather than dropping referential integrity entirely.
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => users.id),
    staffId: text("staff_id").references(() => staff.id),
    customerId: text("customer_id").references(() => customers.id),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("idx_push_subscriptions_user_id").on(table.userId),
    staffIdIdx: index("idx_push_subscriptions_staff_id").on(table.staffId),
    customerIdIdx: index("idx_push_subscriptions_customer_id").on(table.customerId),
  }),
);

// Same mutually-exclusive-FK shape as pushSubscriptions above, and for
// the same reason - verify/reset tokens are issued to vendor/super_admin
// (users), staff, and customer accounts alike.
export const tokens = pgTable(
  "tokens",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => users.id),
    staffId: text("staff_id").references(() => staff.id),
    customerId: text("customer_id").references(() => customers.id),
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
    // Structured sizing chart, shown as a real table behind a "Size
    // guide" link on the product page (with a cm/in toggle). Shape:
    // { unit: "cm"|"in", columns: string[], rows: { size, values[] }[],
    //   note?: string } - see sizeGuideSchema in lib/validate.js and
    // components/ui/SizeGuideEditor.js. Null means no size-guide link.
    sizeGuide: jsonb("size_guide"),
    price: real("price").notNull(),
    // What the vendor paid for it - internal only, for margin/profit
    // figures. NEVER include this in a storefront/marketplace/public
    // response: every public read of a products row must run it through
    // stripInternalProductFields (lib/pricing.js).
    costPrice: real("cost_price"),
    // Wholesale / bundle pricing: [{ bundleQty, unitPrice }], bundleQty
    // >= 2. Every whole group of bundleQty units is charged unitPrice
    // each; the remainder is charged the discount-adjusted base price -
    // see computeWholesalePrice in lib/pricing.js. Customer-facing
    // (shown on the product page), unlike costPrice.
    priceTiers: jsonb("price_tiers"),
    // `price` is the regular/"was" price. When set (1-99), this ACTUALLY
    // reduces what's charged - see lib/pricing.js's getEffectivePrice,
    // which every price-computing call site (cart, checkout, offline
    // orders) reads through instead of `price` directly. Only applies to
    // the base product price, not a variant's own price override (see
    // productVariants.price below) - a variant sale isn't discounted just
    // because the base product is. Null means no discount.
    discountPercent: real("discount_percent"),
    productType: productTypeEnum("product_type").notNull().default("physical"),
    // Only meaningful for physical products - null/ignored for digital
    // ones, which aren't stock-limited the same way. Also ignored once a
    // product has variants (each variant tracks its own stock instead).
    stock: integer("stock"),
    // Perishable goods: a single "use by" date for the whole product
    // (not per-batch - see PRODUCT-EXPIRY-MIGRATION.sql). Internal only:
    // stripInternalProductFields drops it from public/storefront reads.
    // The products list surfaces "expires in N days" / "expired" badges.
    expiryDate: date("expiry_date"),
    // Same "only meaningful for physical" caveat as stock above - shown
    // to shoppers on the storefront so a used item isn't mistaken for new.
    condition: productConditionEnum("condition").notNull().default("new"),
    // Simple list of image URLs rather than a separate productImages
    // table - keeps the MVP from needing its own reordering/management
    // UI just to show a few photos per listing.
    images: jsonb("images").notNull().default([]),
    // One short clip per product (see MAX_VIDEO_SIZE/MAX_VIDEO_SECONDS in
    // app/api/v1/uploads/file/route.js) - kept separate from images
    // rather than mixed into that array, since it needs different
    // upload validation, a <video> player instead of <img>, and a
    // different Cloudinary resource type throughout.
    videoUrl: text("video_url"),
    isActive: boolean("is_active").notNull().default(true),
    // Only meaningful once the product has variants: whether the plain
    // base product (its own price/stock) is still offered on the
    // storefront as a "Standard" choice next to the variants (see
    // components/storefront/AddToCartButton.js). Off means a shopper must
    // pick one of the variants. Defaults on - the pre-existing behaviour.
    allowStandardVariant: boolean("allow_standard_variant").notNull().default(true),
    // Admin-only moderation, separate from the vendor's own isActive
    // Live/Hidden toggle above - a product is only ever visible/sellable
    // on the storefront when BOTH isActive is true AND suspendedAt is
    // null (see the storefront home/product-detail queries), and only a
    // super_admin can clear suspendedAt (POST /api/v1/super-admin/
    // products/[id]/suspend), the vendor's own product PATCH route never
    // touches it - so flipping isActive back on can't undo a suspension.
    suspendedAt: timestamp("suspended_at"),
    suspendedReason: text("suspended_reason"),
    // Vendor-curated "Featured" rail on the storefront home page: null =
    // not featured, otherwise a 0-based position in the rail (lower shows
    // first). Capped at 10 per store by the vendor featured route, not the
    // column. See STOREFRONT-RAILS-AND-REVIEWS-MIGRATION.sql.
    featuredOrder: integer("featured_order"),
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

// Per-branch stock - the real source of truth for reservation (see
// lib/inventory.js's reserveStock/restockItems, which read/write this
// table, not products.stock/productVariants.stock directly anymore).
// Those two columns stay in place as a cached SUM across a product's/
// variant's branches, kept in sync by the same helpers, so the ~15
// display-only places that read them (storefront, vendor dashboard,
// super-admin) never needed to change. A row with variantId null tracks
// the base product at that branch; a row with variantId set tracks that
// specific variant there instead (variants have fully independent stock
// from their parent product, same as productVariants.stock always has).
// stock null means unlimited at that branch, same meaning as today.
export const productBranchStock = pgTable(
  "product_branch_stock",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    productId: text("product_id").notNull().references(() => products.id),
    variantId: text("variant_id").references(() => productVariants.id),
    branchId: text("branch_id").notNull().references(() => branches.id),
    stock: integer("stock"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    branchIdIdx: index("idx_product_branch_stock_branch_id").on(table.branchId),
    // Same two-partial-unique-index shape as shippingRates' (state, city)
    // above - Postgres never treats two NULLs as equal, so a plain
    // unique index over (productId, variantId, branchId) would happily
    // let a base-product row (variantId null) duplicate per branch.
    productBranchUnique: uniqueIndex("uq_product_branch_stock_product_branch")
      .on(table.productId, table.branchId)
      .where(sql`${table.variantId} is null`),
    variantBranchUnique: uniqueIndex("uq_product_branch_stock_variant_branch")
      .on(table.productId, table.variantId, table.branchId)
      .where(sql`${table.variantId} is not null`),
  }),
);

export const productBranchStockRelations = relations(productBranchStock, ({ one }) => ({
  product: one(products, { fields: [productBranchStock.productId], references: [products.id] }),
  variant: one(productVariants, { fields: [productBranchStock.variantId], references: [productVariants.id] }),
  branch: one(branches, { fields: [productBranchStock.branchId], references: [branches.id] }),
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
    // A customer, not a users/staff row - only customers can buy and
    // review a product (see the reviews route's role gate).
    userId: text("user_id").notNull().references(() => customers.id),
    orderId: text("order_id").notNull().references(() => orders.id),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    // One optional customer-uploaded photo with the review. Uploaded
    // through /api/v1/storefront/reviews/upload (customer-auth, image
    // only, 3MB). See STOREFRONT-RAILS-AND-REVIEWS-MIGRATION.sql.
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    productIdIdx: index("idx_reviews_product_id").on(table.productId),
    productUserUnique: uniqueIndex("uq_reviews_product_user").on(table.productId, table.userId),
  }),
);

export const reviewsRelations = relations(reviews, ({ one }) => ({
  product: one(products, { fields: [reviews.productId], references: [products.id] }),
  user: one(customers, { fields: [reviews.userId], references: [customers.id] }),
  order: one(orders, { fields: [reviews.orderId], references: [orders.id] }),
}));

// ---------- PLATFORM SETTINGS (super-admin only) ----------

export const platformSettings = pgTable("platform_settings", {
  id: text("id").primaryKey().$default(() => "singleton"),
  defaultCommissionRatePercent: real("default_commission_rate_percent").notNull().default(5),
  // Ceiling on the platform's TOTAL take per order - commission + flat
  // fee combined (see lib/orders.js's computeOrderTotals) - regardless of
  // subtotal or the configured rate. The flat fee always stays fully
  // intact; the percentage commission shrinks to make room under the cap.
  // null means uncapped, the commission is always exactly subtotal ×
  // rate%. Admin-editable any time from /super-admin/settings, not a
  // fixed code constant.
  maxCommissionAmount: real("max_commission_amount"),
  // Flat ₦ charged per order on top of the percentage commission (e.g. a
  // fixed processing fee) - counts toward maxCommissionAmount above (the
  // commission is what absorbs the reduction, this stays intact). 0 by
  // default, meaning existing behavior (percentage-only) is unchanged
  // until an admin sets one.
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
  // Multi-branch - see lib/storePlan.js's getBranchLimit. Every store
  // always has at least its one default branch, this caps how many MORE
  // a vendor can create.
  freeBranchLimit: integer("free_branch_limit").notNull().default(1),
  plusBranchLimit: integer("plus_branch_limit").notNull().default(5),
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

// ---------- STOREZN+ SUBSCRIPTION TRANSACTIONS ----------

// One row per successful Storezn+ charge - the initial subscribe payment
// (matched via the "STOREZNSUB-" reference we generate, see
// /api/v1/vendor/stores/[storeId]/subscribe) and every Paystack-initiated
// renewal after that (matched via data.plan/subscription_code instead,
// since Paystack generates its own reference for renewals - see
// handleSubscriptionCharge in the webhook route). Shown to the vendor on
// /vendor/plus so they can see what they've actually been charged.
export const storeSubscriptionTransactions = pgTable(
  "store_subscription_transactions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id").notNull().references(() => stores.id),
    amount: real("amount").notNull(),
    paystackReference: text("paystack_reference").notNull().unique(),
    paidAt: timestamp("paid_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    storeIdIdx: index("idx_store_subscription_transactions_store_id").on(table.storeId),
  }),
);

// ---------- ADDRESSES ----------

export const addresses = pgTable(
  "addresses",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => customers.id),
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
  user: one(customers, { fields: [addresses.userId], references: [customers.id] }),
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
    userId: text("user_id").references(() => customers.id),
    guestToken: text("guest_token").unique(),
    status: cartStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    storeIdIdx: index("idx_carts_store_id").on(table.storeId),
    userIdIdx: index("idx_carts_user_id").on(table.userId),
    // Backs resolveCart's find-or-create (lib/cart.js) with a real
    // constraint - without this, two near-simultaneous first requests for
    // the same logged-in user can each fail to find an existing cart and
    // each insert one, fragmenting items across two active carts.
    activeUserCartUnique: uniqueIndex("uq_carts_store_user_active")
      .on(table.storeId, table.userId)
      .where(sql`${table.status} = 'active'`),
  }),
);

export const cartsRelations = relations(carts, ({ one, many }) => ({
  store: one(stores, { fields: [carts.storeId], references: [stores.id] }),
  user: one(customers, { fields: [carts.userId], references: [customers.id] }),
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
    // Which branch this order was fulfilled from - resolved automatically
    // at checkout (the first branch with enough stock for every item in
    // the cart, see resolveFulfillingBranch in lib/inventory.js) for an
    // online order, or picked explicitly by whoever recorded it for an
    // offline one. Nullable only for orders placed before this column
    // existed; every store has at least a default branch, so a new order
    // always gets one. Used to scope a branch-assigned staff member's
    // order visibility, see lib/auth.js.
    branchId: text("branch_id").references(() => branches.id),
    // Null for a guest order - identified instead by guestEmail.
    userId: text("user_id").references(() => customers.id),
    // The cart this order was created from (guest or logged-in, either
    // way) - lets the webhook clear/convert the exact right cart on
    // payment success without re-resolving by identity, which previously
    // only worked for logged-in users and silently left every guest
    // cart active and re-checkoutable after payment. Null for
    // isOffline orders (never went through a cart at all) and for
    // orders placed before this column existed.
    cartId: text("cart_id").references(() => carts.id),
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
    // True when this order's shipping was "to be determined" at checkout
    // (see stores.defaultShippingIsTBD) - shippingFee above was 0 and
    // excluded from totalAmount/the Paystack charge in that case. The
    // vendor must fill in the real amount (see
    // PATCH .../orders/[id] and shippingFeeConfirmedAt below) before
    // moving the order's status forward - record-keeping only, it's
    // never re-charged since the buyer already paid via Paystack.
    shippingFeeTBD: boolean("shipping_fee_tbd").notNull().default(false),
    shippingFeeConfirmedAt: timestamp("shipping_fee_confirmed_at"),
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
    // Finer-grained than isOffline (which stays in sync: true for pos +
    // manual). See orderChannelEnum. Defaults to "online" so every
    // pre-existing row reads correctly without a backfill.
    channel: orderChannelEnum("channel").notNull().default("online"),
    // The register shift this sale was rung up on (channel = "pos" only).
    // Null for online and manual orders. No FK cascade - a session is
    // never deleted, only closed.
    posSessionId: text("pos_session_id"),
    // Who rang this up - the cashier for a POS sale, the recorder for a
    // manual offline order. Plain reference (staff.id or users.id) + a
    // denormalised name so it survives the staff member being removed.
    // Null for online orders (the buyer places those themselves).
    soldById: text("sold_by_id"),
    soldByName: text("sold_by_name"),
    // A whole-order markdown applied at the till (kobo, always >= 0),
    // already reflected in totalAmount. discountReason is a free-text
    // audit note, required by the sell screen above a configurable
    // threshold. 0 / null for every non-POS order.
    discountAmount: integer("discount_amount").notNull().default(0),
    discountReason: text("discount_reason"),
    // Set on a POS return: this order is the negative counter-entry to
    // the original sale (see the returns flow). The original is never
    // mutated - history stays additive.
    originalOrderId: text("original_order_id"),
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
    cartIdIdx: index("idx_orders_cart_id").on(table.cartId),
    // The actual idempotency guard for checkout (see POST /api/v1/
    // storefront/checkout) - caps a cart at one "pending" order at a
    // time, so a double-click or a client retry racing the same cart has
    // its second INSERT collide with this instead of creating a second
    // order. cartId is null for isOffline orders and for orders placed
    // before this column existed - a unique index never treats two NULLs
    // as colliding, so those are correctly left unconstrained. Once an
    // order resolves (paid, or paymentStatus flipped to "failed" by the
    // webhook/stale sweep/a failed Paystack-init), it stops matching this
    // partial index and the same cart is free to check out again.
    cartPendingOrderUnique: uniqueIndex("uq_orders_cart_pending")
      .on(table.cartId)
      .where(sql`${table.paymentStatus} = 'pending'`),
  }),
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  store: one(stores, { fields: [orders.storeId], references: [stores.id] }),
  branch: one(branches, { fields: [orders.branchId], references: [branches.id] }),
  user: one(customers, { fields: [orders.userId], references: [customers.id] }),
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
    // POS line adjustments. originalUnitPrice holds the catalogue price
    // when a cashier typed a different unitPrice (priceOverridden then
    // true); lineDiscount is a per-line markdown in kobo, already
    // reflected in lineTotal. All null/0/false for a normal order line.
    originalUnitPrice: real("original_unit_price"),
    lineDiscount: integer("line_discount").notNull().default(0),
    priceOverridden: boolean("price_overridden").notNull().default(false),
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
    // The customer who asked for the refund - reviewedBy below (whoever
    // approves/declines it) is store-side (vendor/staff/super_admin) and
    // stays pointed at users.id, this is the buyer.
    requestedBy: text("requested_by").notNull().references(() => customers.id),
    reason: text("reason").notNull(),
    status: refundStatusEnum("status").notNull().default("pending"),
    // Whoever approved/declined it, store-side. NOT FK'd: a reviewer can
    // be a vendor/super_admin (users.id) OR a staff member (staff.id, a
    // separate table since the auth split - see lib/auth.js), so this is
    // a plain audit reference, not a constrained relation. A users.id FK
    // here threw a constraint violation on every staff refund decision.
    reviewedBy: text("reviewed_by"),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at"),
  },
  (table) => ({
    // Unique, not just indexed: one refund request per order. The request
    // route check-then-inserts, which two concurrent submits could both
    // pass; this makes the second insert fail cleanly instead. Also
    // covers the orderId lookup the old plain index did.
    orderIdUnique: uniqueIndex("uq_refund_requests_order_id").on(table.orderId),
  }),
);

export const refundRequestsRelations = relations(refundRequests, ({ one }) => ({
  order: one(orders, { fields: [refundRequests.orderId], references: [orders.id] }),
  requester: one(customers, { fields: [refundRequests.requestedBy], references: [customers.id] }),
}));

// ---------- POINT OF SALE TABLES ----------

// A named till at a branch. A shop with two counters has two registers;
// a single-counter shop has one. Selling requires an open session on a
// register (see posSessions), and a cashier only ever sees registers at
// their own branch (branch scoping, see lib/auth.js / staff.branchId).
export const posRegisters = pgTable(
  "pos_registers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id").notNull().references(() => stores.id),
    branchId: text("branch_id").notNull().references(() => branches.id),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    storeIdIdx: index("idx_pos_registers_store_id").on(table.storeId),
    branchIdIdx: index("idx_pos_registers_branch_id").on(table.branchId),
  }),
);

// One cashier's shift on one register. openingFloat is the cash already
// in the drawer at open. At close (a "Z report") the cashier counts the
// drawer into countedCash; expectedCash is frozen from the drawer maths
// (see lib/pos.js computeDrawer) and overShort = counted - expected.
// zReport is the full immutable snapshot (totals by tender, by category,
// counts, first/last sale). openedBy/closedBy are a plain staff.id or
// users.id reference, NOT FK'd - same reasoning as refundRequests.
// reviewedBy. A partial unique index enforces one open session per
// register.
export const posSessions = pgTable(
  "pos_sessions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    registerId: text("register_id").notNull().references(() => posRegisters.id),
    status: posSessionStatusEnum("status").notNull().default("open"),
    openedBy: text("opened_by").notNull(),
    openedAt: timestamp("opened_at").notNull().defaultNow(),
    openingFloat: integer("opening_float").notNull().default(0),
    closedBy: text("closed_by"),
    closedAt: timestamp("closed_at"),
    countedCash: integer("counted_cash"),
    expectedCash: integer("expected_cash"),
    overShort: integer("over_short"),
    zReport: jsonb("z_report"),
    // How the drawer was closed (see CLOSE-CONTROLS-MIGRATION.sql):
    //   'blind_count'      - a real count entered without seeing expected
    //   'forced_uncounted' - couldn't count, system's expected figure used
    // Null on shifts closed before these controls landed.
    closeMethod: text("close_method"),
    // Optional note-by-note count: { "1000": 12, "500": 3, ... } (naira -> qty).
    countBreakdown: jsonb("count_breakdown"),
    // Why the cashier couldn't count (required when closeMethod is forced_uncounted).
    forcedReason: text("forced_reason"),
    // Sales still unsynced from a device when the shift closed - the
    // figures are provisional until they land and reconcile.
    provisional: boolean("provisional").notNull().default(false),
    pendingSyncCount: integer("pending_sync_count").notNull().default(0),
    // Owner sign-off. 'pending' whenever the close was forced, provisional,
    // or off by more than the review threshold; the owner moves it to
    // 'approved'. 'ok' needs no review.
    reviewStatus: text("review_status").notNull().default("ok"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at"),
    reviewNote: text("review_note"),
  },
  (table) => ({
    registerIdIdx: index("idx_pos_sessions_register_id").on(table.registerId),
    oneOpenPerRegister: uniqueIndex("uq_pos_sessions_open_register")
      .on(table.registerId)
      .where(sql`${table.status} = 'open'`),
  }),
);

// Every cash-drawer event for a session. cash_sale / cash_refund rows are
// written automatically at settle / return time; float / paid_in /
// paid_out / drop are the cashier's explicit actions (reason required for
// the last three). amount is signed kobo. The drawer is
// openingFloat + SUM(amount) - see lib/pos.js.
export const cashMovements = pgTable(
  "cash_movements",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    sessionId: text("session_id").notNull().references(() => posSessions.id),
    kind: cashMovementKindEnum("kind").notNull(),
    amount: integer("amount").notNull(),
    reason: text("reason"),
    orderId: text("order_id").references(() => orders.id),
    createdBy: text("created_by").notNull(),
    // Client-generated idempotency key for a cashier's explicit drawer
    // action (paid_in / paid_out / drop). One value per button press, kept
    // across retries, so a flaky network or a double-tap can't record the
    // same payout twice (uq_cash_movements_client_ref). Null for the
    // system-written cash_sale / cash_refund / float rows.
    clientRef: text("client_ref"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    sessionIdIdx: index("idx_cash_movements_session_id").on(table.sessionId),
    clientRefIdx: uniqueIndex("uq_cash_movements_client_ref")
      .on(table.sessionId, table.clientRef)
      .where(sql`${table.clientRef} is not null`),
  }),
);

// A payment line against an order - one row for a single-method payment,
// several for a split. amount is kobo received in this tender;
// changeGiven is > 0 when the customer overpaid and got cash back from
// the drawer - usually cash, but also a transfer/POS overpayment settled
// in cash (see drawerDeltaFromTenders). The invariant, enforced in
// lib/pos.js at settle: SUM(amount - changeGiven) === order.totalAmount
// (in kobo).
export const orderTenders = pgTable(
  "order_tenders",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id").notNull().references(() => orders.id),
    method: tenderMethodEnum("method").notNull(),
    // For method = "card": which POS terminal / provider took it
    // (Moniepoint, Opay, ...), so an owner can reconcile per machine.
    // Null for cash / transfer.
    provider: text("provider"),
    amount: integer("amount").notNull(),
    changeGiven: integer("change_given").notNull().default(0),
    reference: text("reference"),
    sessionId: text("session_id").references(() => posSessions.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    orderIdIdx: index("idx_order_tenders_order_id").on(table.orderId),
    sessionIdIdx: index("idx_order_tenders_session_id").on(table.sessionId),
  }),
);

// A sale the cashier parked to serve the next customer. Purely a
// client-cart snapshot - no order row, no stock reserved - so an
// abandoned park never pollutes order history. Recalling one re-hydrates
// the sell screen and deletes this row. Any left open when a session
// closes are surfaced before the Z report can run.
export const posHeldSales = pgTable(
  "pos_held_sales",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    sessionId: text("session_id").notNull().references(() => posSessions.id),
    label: text("label"),
    cart: jsonb("cart").notNull(),
    customer: jsonb("customer"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    sessionIdIdx: index("idx_pos_held_sales_session_id").on(table.sessionId),
  }),
);

export const posSessionsRelations = relations(posSessions, ({ one, many }) => ({
  register: one(posRegisters, { fields: [posSessions.registerId], references: [posRegisters.id] }),
  movements: many(cashMovements),
}));
