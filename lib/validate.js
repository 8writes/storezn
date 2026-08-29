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

const productFieldsSchema = z.object({
  name: z.string().trim().min(1, "Product name is required"),
  slug: slugField,
  sku: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  price: z.coerce.number().positive("Price must be greater than 0"),
  // Actually reduces what's charged - see lib/pricing.js's
  // getEffectivePrice, not just a display trick. null/"" clears it (same
  // as the other nullable PATCH fields).
  discountPercent: z.coerce.number().min(1).max(99).nullable().optional(),
  productType: z.enum(["physical", "digital"]).default("physical"),
  condition: z.enum(["new", "used", "fairly_used"]).default("new"),
  stock: z.coerce.number().int().min(0).optional(),
  categoryId: z.string().trim().min(1).nullable().optional(),
  images: z.array(z.string().trim().url()).max(5, "Up to 5 photos and video combined").optional(),
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
export const bulkProductRowSchema = z.object({
  name: z.string().trim().min(1, "Product name is required"),
  price: z.coerce.number().positive("Price must be greater than 0"),
  sku: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  productType: z.enum(["physical", "digital"]).default("physical"),
  condition: z.enum(["new", "used", "fairly_used"]).default("new"),
  stock: z.coerce.number().int().min(0).optional(),
  categoryName: z.string().trim().min(1).optional(),
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
  comment: z.string().trim().min(1).optional(),
});

export const addCartItemSchema = z.object({
  productId: z.string().trim().min(1, "Product is required"),
  variantId: z.string().trim().min(1).optional(),
  quantity: z.coerce.number().int().min(1).default(1),
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
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
  fullName: z.string().trim().min(1, "Full name is required"),
  phone: z.string().trim().min(1, "Phone number is required"),
  line1: z.string().trim().min(1, "Address line is required"),
  line2: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().min(1, "City is required"),
  state: z.string().trim().min(1, "State is required"),
  country: z.string().trim().min(1).optional(),
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
  reason: z.string().trim().min(1, "A reason is required"),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(["processing", "shipped", "delivered", "cancelled"]).optional(),
  refundDecision: z.enum(["approved", "rejected"]).optional(),
  reviewNote: z.string().trim().min(1).optional(),
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
