import { z } from "zod";

export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message || "Invalid input" };
  }
  return { ok: true, data: result.data };
}

// Bare hostname only - no protocol, no path, no port. Deliberately
// rejects storezn.com and *.storezn.com themselves (see the route) so a
// vendor can't point their "custom" domain at the platform's own root.
const DOMAIN_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

export const setCustomDomainSchema = z.object({
  customDomain: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .regex(DOMAIN_PATTERN, "Enter a valid domain, e.g. example.com")
    .nullable(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Valid email is required"),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(1, "Verification token is required"),
});

export const resendVerificationSchema = z.object({
  email: z.string().trim().toLowerCase().email("Valid email is required"),
});

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(1).optional(),
  profilePictureUrl: z.string().trim().url().optional(),
});

// Public self-signup: stores only get created this way (no super_admin
// onboarding form) - includes a required terms-of-service acceptance,
// since the vendor themselves is the one clicking it.
export const vendorSignupSchema = z.object({
  name: z.string().trim().min(1, "Store name is required"),
  // No hyphens (unlike slugField, used for product/category slugs below) -
  // this becomes the store's actual subdomain (<slug>.storezn.com, see
  // lib/storeUrl.js), where a run of hyphens is easier to mistype/
  // misremember than in a product URL path segment.
  slug: z
    .string()
    .trim()
    .min(2, "Slug must be at least 2 characters")
    .regex(/^[a-z0-9]+$/, "Slug can only contain lowercase letters and numbers")
    .toLowerCase(),
  // Where the store ships from - see stores.state. Required at signup so
  // it's never missing for a new store; older stores that predate this
  // field just show no location until the vendor sets one from settings.
  state: z.string().trim().min(1, "State is required"),
  vendor: z.object({
    firstName: z.string().trim().min(1, "First name is required"),
    lastName: z.string().trim().min(1, "Last name is required"),
    email: z.string().trim().toLowerCase().email("Valid email is required"),
    password: z.string().min(8, "Password must be at least 8 characters"),
  }),
  acceptTerms: z.literal(true, { message: "You must accept the Terms of Service to continue" }),
});

// What a vendor themselves may edit on their own store - deliberately
// excludes isActive/commissionRatePercent, which stay super_admin-only
// (see updateStoreStatusSchema).
export const updateVendorStoreSchema = z.object({
  logoUrl: z.string().trim().url().optional().or(z.literal("")),
  faviconUrl: z.string().trim().url().optional().or(z.literal("")),
  feeChargedToCustomer: z.boolean().optional(),
  defaultShippingFee: z.coerce.number().min(0).optional(),
  defaultShippingIsTBD: z.boolean().optional(),
  returnWindowDays: z.coerce.number().int().min(0).max(365).optional(),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  state: z.string().trim().optional().or(z.literal("")),
  description: z.string().trim().max(240).optional().or(z.literal("")),
  isOpen: z.boolean().optional(),
  listOnMarketplace: z.boolean().optional(),
  showShipsFrom: z.boolean().optional(),
  // Storezn+ only (enforced server-side, see PATCH /api/v1/vendor/stores/
  // [storeId] - a free store's PATCH is rejected before this ever gets
  // written) - hex color driving the storefront's --store-accent CSS var.
  storefrontAccentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Enter a valid hex color, e.g. #7c3aed")
    .optional()
    .or(z.literal("")),
  socialLinks: z
    .object({
      website: z.string().trim().url("Invalid URL").max(300).optional().or(z.literal("")),
      instagram: z.string().trim().url("Invalid URL").max(300).optional().or(z.literal("")),
      twitter: z.string().trim().url("Invalid URL").max(300).optional().or(z.literal("")),
      facebook: z.string().trim().url("Invalid URL").max(300).optional().or(z.literal("")),
      tiktok: z.string().trim().url("Invalid URL").max(300).optional().or(z.literal("")),
      // Bare phone number, not a URL - see stores.socialLinks in
      // lib/db/schema.js.
      whatsapp: z
        .string()
        .trim()
        .regex(/^\+?\d{7,15}$/, "Enter a valid phone number, digits only")
        .optional()
        .or(z.literal("")),
    })
    .partial()
    .optional(),
});

export const linkPayoutAccountSchema = z.object({
  bankCode: z.string().trim().min(1, "Select your bank"),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{10}$/, "Account number must be 10 digits"),
});

export const updateProfileAndNotificationsSchema = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  emailNotificationsEnabled: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export const updateStoreStatusSchema = z.object({
  isActive: z.boolean().optional(),
  commissionRatePercent: z.coerce.number().min(0).max(100).nullable().optional(),
  subscriptionPriceOverride: z.coerce.number().min(0).nullable().optional(),
  // Support-driven action: clears the vendor's linked bank account so
  // they can link a new one (see the vendor payout-account POST route,
  // which otherwise refuses to overwrite an already-linked account).
  unlockPayoutAccount: z.literal(true).optional(),
});

export const updatePlatformSettingsSchema = z.object({
  defaultCommissionRatePercent: z.coerce.number().min(0).max(100).optional(),
  // null means "no cap" - the client sends null explicitly to clear it
  // (not "", which z.coerce.number() would silently read as 0).
  maxCommissionAmount: z.number().min(0).nullable().optional(),
  defaultFlatFee: z.coerce.number().min(0).optional(),
  maintenanceMode: z.boolean().optional(),
  plusMonthlyPrice: z.coerce.number().min(0).optional(),
  freeStorageMb: z.coerce.number().int().min(0).optional(),
  plusStorageMb: z.coerce.number().int().min(0).optional(),
  freeStaffLimit: z.coerce.number().int().min(0).optional(),
  plusStaffLimit: z.coerce.number().int().min(0).optional(),
  freeBranchLimit: z.coerce.number().int().min(1).optional(),
  plusBranchLimit: z.coerce.number().int().min(1).optional(),
});

const slugField = z
  .string()
  .trim()
  .min(1, "Slug is required")
  .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens")
  .toLowerCase();

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required"),
  slug: slugField,
});

export const updateCategorySchema = createCategorySchema.partial();

// city omitted/empty means this rate applies to the whole state - see
// stores.shippingRates in lib/db/schema.js and lib/shipping.js.
export const createShippingRateSchema = z.object({
  state: z.string().trim().min(1, "State is required").max(100),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  fee: z.coerce.number().min(0, "Fee can't be negative"),
});

// Structured product size chart - measurement columns (e.g. Bust, Waist)
// plus one row per size, each carrying exactly one value per column, and
// a unit the storefront's cm/in toggle converts from. See
// components/ui/SizeGuideEditor.js and SizeGuideButton.js.
export const sizeGuideSchema = z
  .object({
    unit: z.enum(["cm", "in"]),
    // Names of the sizing systems. sizeLabel heads the primary "size"
    // column (e.g. "UK"); altLabel, if set, is a second system shown in
    // parens on the storefront size buttons (e.g. "EUR") and as its own
    // column in the chart.
    sizeLabel: z.string().trim().max(24).optional().or(z.literal("")),
    altLabel: z.string().trim().max(24).optional().or(z.literal("")),
    columns: z.array(z.string().trim().min(1).max(40)).min(1, "Add at least one measurement").max(12),
    rows: z
      .array(
        z.object({
          size: z.string().trim().min(1, "Every size needs a name").max(40),
          alt: z.string().trim().max(40).optional().or(z.literal("")),
          values: z.array(z.string().trim().max(20)),
        }),
      )
      .min(1, "Add at least one size")
      .max(60),
    note: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine((g) => g.rows.every((r) => r.values.length === g.columns.length), {
    message: "Every size must have a value for each measurement",
  });

const productFieldsSchema = z.object({
  name: z.string().trim().min(1, "Product name is required").max(200),
  slug: slugField,
  sku: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().min(1).max(5000).optional(),
  // Structured sizing chart (see products.sizeGuide). Every row must
  // carry exactly one value per column. null clears it.
  sizeGuide: sizeGuideSchema.nullable().optional(),
  price: z.coerce.number().positive("Price must be greater than 0"),
  // What the vendor paid - optional, internal only. null/"" clears it.
  costPrice: z.coerce.number().min(0).nullable().optional(),
  // Wholesale / bundle pricing. Each: every whole group of `bundleQty`
  // units is charged `unitPrice` each, leftovers at the normal price -
  // see computeWholesalePrice in lib/pricing.js. [] or null clears.
  priceTiers: z
    .array(
      z.object({
        bundleQty: z.coerce.number().int().min(2, "A bundle is 2 units or more"),
        unitPrice: z.coerce.number().positive(),
      }),
    )
    .max(6)
    .nullable()
    .optional(),
  // Actually reduces what's charged - see lib/pricing.js's
  // getEffectivePrice, not just a display trick. null/"" clears it (same
  // as the other nullable PATCH fields).
  discountPercent: z.coerce.number().min(1).max(99).nullable().optional(),
  productType: z.enum(["physical", "digital"]).default("physical"),
  condition: z.enum(["new", "used", "fairly_used"]).default("new"),
  stock: z.coerce.number().int().min(0).optional(),
  categoryId: z.string().trim().min(1).nullable().optional(),
  images: z.array(z.string().trim().url()).max(10, "Up to 10 photos and video combined").optional(),
  // One short clip, see products.videoUrl. "" clears it, same as the
  // other nullable PATCH fields.
  videoUrl: z.string().trim().url().optional().or(z.literal("")),
  isActive: z.boolean().optional(),
  allowStandardVariant: z.boolean().optional(),
});

export const createProductSchema = productFieldsSchema;
export const updateProductSchema = productFieldsSchema.partial();

// One row of a bulk-import CSV. No `slug` (derived from name server-side,
// same as single-product creation's auto-slugify) and no variant columns
// - a spreadsheet can't reasonably express "N variants with options and
// per-variant stock" as flat cells, so bulk-created products start
// variant-less and images-less; a vendor adds either afterward by
// editing the product like normal.
//
// Every cell arrives as a string (blank -> ""), so optional text columns
// map "" -> undefined rather than tripping .min(1), and the two enum
// columns are lower-cased / de-spaced so "Physical" or "fairly used"
// still land. A blank stock cell means "not tracked", not 0.
const bulkOptText = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().min(1).optional(),
);
const bulkEnum = (values, fallback) =>
  z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const s = v.trim().toLowerCase().replace(/[\s-]+/g, "_");
    return s === "" ? undefined : s;
  }, z.enum(values).default(fallback));

export const bulkProductRowSchema = z.object({
  name: z.string().trim().min(1, "Product name is required"),
  price: z.coerce.number().positive("Price must be greater than 0"),
  costPrice: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().min(0).optional()),
  sku: bulkOptText,
  description: bulkOptText,
  productType: bulkEnum(["physical", "digital"], "physical"),
  condition: bulkEnum(["new", "used", "fairly_used"], "new"),
  stock: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().min(0).optional(),
  ),
  categoryName: bulkOptText,
});

export const createVariantSchema = z.object({
  options: z.record(z.string(), z.string().trim().min(1)).refine((o) => Object.keys(o).length > 0, "At least one option is required"),
  sku: z.string().trim().min(1).optional(),
  // null clears a previously set override back to "use the product price"
  // - price/stock aren't collected when a variant is first added, only
  // when it's edited afterward (see VariantsManager in the edit page).
  price: z.coerce.number().positive().nullable().optional(),
  stock: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const updateVariantSchema = createVariantSchema.partial();

export const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(2000).optional(),
});

// quantity is capped well above any real order - it exists to stop an
// absurd value (overflowing the line-total math, or a junk cart) rather
// than to be a business rule. Real availability is enforced against stock.
export const addCartItemSchema = z.object({
  productId: z.string().trim().min(1, "Product is required"),
  variantId: z.string().trim().min(1).optional(),
  quantity: z.coerce.number().int().min(1).max(100000).default(1),
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").max(100000),
});

// Customer self-signup at a specific store (resolved from the request's
// Host header, not submitted by the client) - no terms/store fields,
// unlike vendorSignupSchema, since the customer isn't creating a store.
export const customerSignupSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().toLowerCase().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const addressFields = {
  fullName: z.string().trim().min(1, "Full name is required").max(150),
  phone: z.string().trim().min(1, "Phone number is required").max(30),
  line1: z.string().trim().min(1, "Address line is required").max(300),
  line2: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().min(1, "City is required").max(120),
  state: z.string().trim().min(1, "State is required").max(120),
  country: z.string().trim().min(1).max(120).optional(),
  isDefault: z.boolean().optional(),
};
export const createAddressSchema = z.object(addressFields);
export const updateAddressSchema = z.object(addressFields).partial();

export const checkoutSchema = z.object({
  guestEmail: z.string().trim().toLowerCase().email("Valid email is required").optional(),
  addressId: z.string().trim().min(1).optional(),
  shippingAddress: z.object(addressFields).optional(),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

// A vendor manually recording an in-person/phone/cash sale that never
// went through storefront checkout - no address/shipping fields (the
// vendor already handed the item over or is arranging delivery
// themselves), and the buyer doesn't need an account or even an email.
export const createOfflineOrderSchema = z.object({
  buyerName: z.string().trim().min(1, "Customer name is required").max(150),
  buyerEmail: z.string().trim().toLowerCase().email("Invalid email address").optional().or(z.literal("")),
  buyerPhone: z.string().trim().max(20).optional().or(z.literal("")),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  delivered: z.boolean().default(false),
  // Required only once a store has more than one branch - a
  // branch-scoped staff member's own branch is used regardless of what's
  // submitted here (see the route).
  branchId: z.string().trim().min(1).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        variantId: z.string().trim().min(1).optional(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, "At least one item is required"),
});

export const requestRefundSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required").max(2000),
});

// ---------- POINT OF SALE ----------
// All money fields below are in naira (what the sell screen collects);
// the routes convert to integer kobo at the edge via lib/money.js.

export const createRegisterSchema = z.object({
  name: z.string().trim().min(1, "Give the register a name").max(60),
  branchId: z.string().trim().min(1, "Pick a branch"),
});
export const updateRegisterSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  isActive: z.boolean().optional(),
});

export const openSessionSchema = z.object({
  registerId: z.string().trim().min(1),
  openingFloat: z.coerce.number().min(0).max(100_000_000).default(0),
});

export const closeSessionSchema = z.object({
  countedCash: z.coerce.number().min(0).max(100_000_000),
});

export const cashMovementSchema = z.object({
  kind: z.enum(["paid_in", "paid_out", "drop"]),
  amount: z.coerce.number().positive("Enter an amount").max(100_000_000),
  reason: z.string().trim().min(1, "A reason is required").max(200),
});

const posLineSchema = z.object({
  productId: z.string().trim().min(1),
  variantId: z.string().trim().min(1).optional(),
  quantity: z.number().int().positive(),
  // A cashier-typed unit price (naira) replacing the catalogue price.
  unitPrice: z.coerce.number().min(0).optional(),
  // Per-line markdown in naira, >= 0.
  lineDiscount: z.coerce.number().min(0).optional(),
});

const posTenderSchema = z.object({
  method: z.enum(["cash", "card", "transfer", "wallet", "store_credit"]),
  amount: z.coerce.number().positive(),
  changeGiven: z.coerce.number().min(0).optional(),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
});

export const posSaleSchema = z.object({
  sessionId: z.string().trim().min(1),
  // Idempotency: the sell screen mints one id per ring-up; a retry with
  // the same key returns the already-created order instead of a second.
  idempotencyKey: z.string().trim().min(8).max(64),
  // The sell screen generates the order number up front (so a receipt
  // printed at the counter matches the row, even for a sale that only
  // syncs later). Server falls back to its own if absent/taken.
  orderNumber: z.string().trim().regex(/^ORD-[A-Z0-9]{6,10}$/).optional(),
  // ISO timestamp of when the sale was actually rung up - set for a sale
  // that was queued offline and is syncing now. Server bounds it.
  soldAt: z.string().trim().datetime().optional(),
  buyerName: z.string().trim().max(150).optional().or(z.literal("")),
  buyerEmail: z.string().trim().toLowerCase().email("Invalid email address").optional().or(z.literal("")),
  buyerPhone: z.string().trim().max(20).optional().or(z.literal("")),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  discountAmount: z.coerce.number().min(0).optional(),
  discountReason: z.string().trim().max(200).optional().or(z.literal("")),
  items: z.array(posLineSchema).min(1, "Add at least one item"),
  tenders: z.array(posTenderSchema).min(1, "Take at least one payment"),
});

export const holdSaleSchema = z.object({
  sessionId: z.string().trim().min(1),
  label: z.string().trim().max(80).optional().or(z.literal("")),
  cart: z.array(z.record(z.string(), z.any())).min(1, "Nothing to hold"),
  customer: z.record(z.string(), z.any()).nullable().optional(),
});

export const posReturnSchema = z.object({
  sessionId: z.string().trim().min(1),
  originalOrderId: z.string().trim().min(1),
  refundMethod: z.enum(["cash", "transfer", "card"]),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
  items: z
    .array(z.object({ orderItemId: z.string().trim().min(1), quantity: z.number().int().positive() }))
    .min(1, "Pick at least one line to return"),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(["processing", "shipped", "delivered", "cancelled"]).optional(),
  refundDecision: z.enum(["approved", "rejected"]).optional(),
  reviewNote: z.string().trim().min(1).max(2000).optional(),
  // Only meaningful on an order with shippingFeeTBD true and no
  // shippingFeeConfirmedAt yet - the vendor recording the real delivery
  // fee once known, for their own records (never re-charged, see
  // PATCH .../orders/[id]).
  shippingFee: z.coerce.number().min(0).optional(),
});

// NIN (National Identification Number) is always exactly 11 digits.
// The client encrypts the raw NIN with the platform's public key before
// it's ever sent (see lib/ninClient.js) - by the time it reaches this
// schema it's RSA-OAEP ciphertext, base64-encoded, not the digits
// themselves. The 11-digit shape is checked after the route decrypts it
// server-side, see lib/nin.js.
export const submitNinSchema = z.object({
  nin: z.string().trim().min(1, "Missing encrypted NIN").max(1000),
});

export const reviewVendorApprovalSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reviewNote: z.string().trim().min(1).optional(),
});

export const suspendProductSchema = z.object({
  suspended: z.boolean(),
  reason: z.string().trim().min(1).optional(),
});

export const pushSubscribeSchema = z.object({
  endpoint: z.string().trim().url(),
  keys: z.object({
    p256dh: z.string().trim().min(1),
    auth: z.string().trim().min(1),
  }),
});

export const createBranchSchema = z.object({
  name: z.string().trim().min(1, "Branch name is required").max(150),
  address: z.string().trim().max(300).optional().or(z.literal("")),
});

export const updateBranchSchema = createBranchSchema.partial();

export const inviteStaffSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  email: z.string().trim().toLowerCase().email("Valid email is required"),
  // Required only once a store has more than one branch (see the route -
  // a single-branch store auto-assigns its one branch, nothing to pick).
  branchId: z.string().trim().min(1).optional(),
});

export const inviteTeamMemberSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  email: z.string().trim().toLowerCase().email("Valid email is required"),
  role: z.enum(["admin", "p_staff"]),
});

export const updateTeamMemberSchema = z.object({
  role: z.enum(["admin", "p_staff"]).optional(),
  // Suspend/reactivate short of outright removal - blocks login
  // immediately (see users.isBanned in getUser/lib/auth.js) without
  // losing the account or its activity history.
  isBanned: z.boolean().optional(),
}).refine((data) => data.role !== undefined || data.isBanned !== undefined, {
  message: "Nothing to update",
});

export const sendNotificationSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(100),
  body: z.string().trim().min(1, "Message is required").max(500),
  url: z.string().trim().max(300).optional(),
  channel: z.enum(["push", "email", "both"]),
  target: z.enum(["single", "all_vendors"]),
  userId: z.string().trim().min(1).optional(),
}).refine((data) => data.target !== "single" || !!data.userId, {
  message: "Pick a vendor to send to",
  path: ["userId"],
});
