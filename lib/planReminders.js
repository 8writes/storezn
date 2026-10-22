import { and, desc, eq, gt, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "./db/index.js";
import { stores, storeSubscriptionTransactions, users } from "./db/schema.js";
import { getEffectivePlan } from "./storePlan.js";
import { sendMail } from "./email/sendMail.js";
import { escapeHtml } from "./email/escapeHtml.js";
import { sendPushToRole, sendPushToUser } from "./push.js";
import { getPlatformUrl } from "./storeUrl.js";

// Daily (see /api/cron/plan-reminders): tells store owners before and when
// their Storezn+ / Enterprise plan ends, and the Storezn team about plans
// it granted by hand. Plan access itself never waits on this job - every
// gate reads getEffectivePlan, which lapses on the date by itself.
//
//   1. Ending soon - renewal / end date within REMIND_DAYS: one email +
//      push per term (stores.planReminderSentFor holds the date reminded).
//      A live subscription is told it will renew (check your card); a
//      cancelled or hand-granted one that it will end.
//   2. Ended - the plan has lapsed (after the renewal grace, for a live
//      subscription): stores.plan is set to "free" so the record matches
//      what the store actually gets, and the owner is told once (that
//      flip is what makes it once). A later payment sets it back.

export const REMIND_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const PAID = ["plus", "enterprise"];

const planName = (plan) => (plan === "enterprise" ? "Enterprise" : "Storezn+");
const longDate = (value) =>
  new Date(value).toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });

// A term the Storezn team granted (super-admin manual plan) rather than a
// Paystack subscription: its latest payment row is a MANUAL- reference.
async function isManualTerm(storeId) {
  const [latest] = await db
    .select({ reference: storeSubscriptionTransactions.paystackReference })
    .from(storeSubscriptionTransactions)
    .where(eq(storeSubscriptionTransactions.storeId, storeId))
    .orderBy(desc(storeSubscriptionTransactions.paidAt))
    .limit(1);
  return !!latest?.reference?.startsWith("MANUAL-");
}

// Pure: what to say for a store whose term ends soon. Exported for tests.
export function endingSoonMessage(store, { manual }) {
  const name = planName(store.plan);
  const when = longDate(store.planRenewsAt);
  const renewing = !!store.paystackSubscriptionCode && !store.planCancelled && !manual;
  if (renewing) {
    return {
      subject: `Your ${name} renews on ${when}`,
      title: `${name} renews soon`,
      body: `Your ${name} plan renews on ${when}. Make sure the card on your subscription can be charged so nothing switches off.`,
    };
  }
  return {
    subject: `Your ${name} ends on ${when}`,
    title: `${name} ends soon`,
    body: manual
      ? `Your ${name} plan ends on ${when}. Contact Storezn to extend it and keep your paid features.`
      : `Your ${name} plan ends on ${when}. Subscribe again to keep your paid features.`,
  };
}

export function endedMessage(store, { manual }) {
  const name = planName(store.plan);
  return {
    subject: `Your ${name} plan has ended`,
    title: `${name} has ended`,
    body: `Your store is now on the free plan. Your products, orders and settings are all still there, but paid features (like your own domain, theme colour${store.plan === "enterprise" ? ", the shop till" : ""} and higher limits) are off. ${manual ? "Contact Storezn to restart it." : "Subscribe again to switch them back on."}`,
  };
}

async function notifyOwner(store, owner, message) {
  const link = getPlatformUrl("/vendor/plus");
  const tasks = [
    sendPushToUser(store.ownerId, { title: message.title, body: message.body, url: "/vendor/plus" }),
  ];
  if (owner?.email) {
    tasks.push(sendMail({
      to: owner.email,
      subject: message.subject,
      html: `<p>Hello${owner.firstName ? ` ${escapeHtml(owner.firstName)}` : ""},</p><p>${escapeHtml(message.body)}</p><p><a href="${escapeHtml(link)}">Open your plan</a></p>`,
      preheader: message.title,
    }));
  }
  await Promise.allSettled(tasks);
}

function notifyTeam(store, title, body) {
  const notice = { title, body: `${store.name}: ${body}`, url: `/super-admin/stores/${store.id}` };
  return Promise.allSettled([sendPushToRole("super_admin", notice), sendPushToRole("admin", notice)]);
}

export async function runPlanReminders(now = new Date()) {
  const soon = new Date(now.getTime() + REMIND_DAYS * DAY_MS);
  const result = { reminded: 0, ended: 0 };

  const rows = await db
    .select({ store: stores, owner: { email: users.email, firstName: users.firstName } })
    .from(stores)
    .innerJoin(users, eq(users.id, stores.ownerId))
    .where(and(inArray(stores.plan, PAID), isNotNull(stores.planRenewsAt), lte(stores.planRenewsAt, soon)));

  for (const { store, owner } of rows) {
    const manual = await isManualTerm(store.id);

    // 2. Ended (grace included - getEffectivePlan decides, same as access).
    if (getEffectivePlan(store, now) === "free") {
      const [flipped] = await db
        .update(stores)
        .set({ plan: "free", planCancelled: true })
        .where(and(eq(stores.id, store.id), eq(stores.plan, store.plan)))
        .returning({ id: stores.id });
      if (!flipped) continue;
      result.ended += 1;
      await notifyOwner(store, owner, endedMessage(store, { manual }));
      if (manual) await notifyTeam(store, `${planName(store.plan)} ended`, "the plan you granted has ended - the store is on free now.");
      continue;
    }

    // 1. Ending soon - once per term.
    const renewsAt = new Date(store.planRenewsAt);
    if (renewsAt <= now) continue; // inside the renewal grace: wait for the charge or the lapse
    if (store.planReminderSentFor && new Date(store.planReminderSentFor).getTime() === renewsAt.getTime()) continue;
    const [claimed] = await db
      .update(stores)
      .set({ planReminderSentFor: renewsAt })
      .where(and(eq(stores.id, store.id), eq(stores.planRenewsAt, renewsAt), gt(stores.planRenewsAt, now)))
      .returning({ id: stores.id });
    if (!claimed) continue;
    result.reminded += 1;
    await notifyOwner(store, owner, endingSoonMessage(store, { manual }));
    if (manual) await notifyTeam(store, `${planName(store.plan)} ending`, `the plan you granted ends on ${longDate(renewsAt)}.`);
  }
  return result;
}
