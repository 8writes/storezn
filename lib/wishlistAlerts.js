import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { customers, wishlistItems } from "./db/schema.js";
import { getEffectivePrice } from "./pricing.js";
import { sendMail } from "./email/sendMail.js";
import { escapeHtml } from "./email/escapeHtml.js";
import { emailButton, emailBrand } from "./email/templates.js";
import { formatCurrency } from "./format.js";
import { getStorefrontUrl } from "./storeUrl.js";
import { isPlusStore } from "./storePlan.js";

// "Price drop" emails to shoppers who saved a product to their wishlist,
// sent when the vendor lowers what it actually costs (a new or bigger
// discount, or a lower price). Called after a product save - see PATCH
// /api/v1/vendor/stores/[storeId]/products/[id].
//
// Not spammy: each wishlist row remembers the price it was last emailed
// about (wishlist_items.sale_notified_price / _at). A shopper is emailed
// again only for a price lower than that, or after REMIND_AFTER_DAYS - so
// switching a sale off and on doesn't send it twice. Shoppers who turned
// off emails in their account, or whose accounts are banned or deleted,
// are skipped. Sends one at a time; failures are logged, not retried.

const REMIND_AFTER_DAYS = 14;
const MAX_PER_DROP = 500;

// Whether a save turned into a price drop worth telling people about.
export function isPriceDrop(before, after) {
  if (!after?.isActive || after.suspendedAt || after.saleMode === "invoice_required") return false;
  const was = getEffectivePrice(Number(before.price), before.discountPercent);
  const now = getEffectivePrice(Number(after.price), after.discountPercent);
  return now > 0 && now < was - 0.5;
}

function dropEmail({ store, product, was, now, link, firstName }) {
  const accent = isPlusStore(store) ? store.storefrontAccentColor : null;
  const image = product.images?.[0];
  const percentOff = Math.round((1 - now / was) * 100);
  return `
    <p>Hi${firstName ? ` ${escapeHtml(firstName)}` : ""},</p>
    <p>Good news - something on your wishlist at <strong>${escapeHtml(store.name)}</strong> just got cheaper.</p>
    ${image ? `<p><img src="${escapeHtml(image)}" alt="" width="240" style="max-width:100%;border-radius:4px"></p>` : ""}
    <p style="font-size:16px;margin:8px 0"><strong>${escapeHtml(product.name)}</strong></p>
    <p style="font-size:18px;margin:4px 0">
      <strong>${escapeHtml(formatCurrency(now))}</strong>
      <span style="color:#64748b;text-decoration:line-through;margin-left:6px">${escapeHtml(formatCurrency(was))}</span>
      ${percentOff >= 1 ? `<span style="color:#15803d;margin-left:6px">${percentOff}% off</span>` : ""}
    </p>
    ${emailButton(link, "View it now", accent || undefined)}
    <p style="color:#64748b;font-size:12px">You're getting this because you saved this item to your wishlist. You can turn these emails off in your account.</p>
  `;
}

export async function notifyWishlistPriceDrop({ store, before, after }) {
  if (!isPriceDrop(before, after)) return { sent: 0 };
  const was = getEffectivePrice(Number(before.price), before.discountPercent);
  const now = getEffectivePrice(Number(after.price), after.discountPercent);
  const remindBefore = new Date(Date.now() - REMIND_AFTER_DAYS * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({ item: wishlistItems, customer: { email: customers.email, firstName: customers.firstName } })
    .from(wishlistItems)
    .innerJoin(customers, eq(customers.id, wishlistItems.customerId))
    .where(and(
      eq(wishlistItems.productId, after.id),
      eq(wishlistItems.storeId, store.id),
      eq(customers.emailNotificationsEnabled, true),
      eq(customers.isBanned, false),
      isNull(customers.deletedAt),
      // Never emailed, emailed about a higher price, or long enough ago.
      or(
        isNull(wishlistItems.saleNotifiedPrice),
        sql`${wishlistItems.saleNotifiedPrice} > ${now + 0.5}`,
        lt(wishlistItems.saleNotifiedAt, remindBefore),
      ),
    ))
    .limit(MAX_PER_DROP);

  const link = `${getStorefrontUrl(store)}/products/${after.slug}`;
  const brand = emailBrand(isPlusStore(store) ? store : { ...store, storefrontAccentColor: null });
  let sent = 0;
  for (const { item, customer } of rows) {
    // Claim first, so two quick saves can't both email the same person.
    const [claimed] = await db
      .update(wishlistItems)
      .set({ saleNotifiedPrice: now, saleNotifiedAt: new Date() })
      .where(and(
        eq(wishlistItems.id, item.id),
        item.saleNotifiedAt ? eq(wishlistItems.saleNotifiedAt, item.saleNotifiedAt) : isNull(wishlistItems.saleNotifiedAt),
      ))
      .returning({ id: wishlistItems.id });
    if (!claimed) continue;
    try {
      await sendMail({
        to: customer.email,
        subject: `Price drop: ${after.name} is now ${formatCurrency(now)}`,
        html: dropEmail({ store, product: after, was, now, link, firstName: customer.firstName }),
        fromName: store.name,
        brand,
        preheader: `Now ${formatCurrency(now)}, was ${formatCurrency(was)}`,
      });
      sent += 1;
    } catch (error) {
      console.error("sendMail failed (wishlist price drop):", error);
    }
  }
  return { sent };
}
