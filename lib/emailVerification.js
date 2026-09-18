import { db } from "./db/index.js";
import { tokens } from "./db/schema.js";
import { sendMail } from "./email/sendMail.js";
import { escapeHtml } from "./email/escapeHtml.js";
import { emailBrand, emailButton } from "./email/templates.js";
import { resolveStoreByHost } from "./resolveStore.js";

// Shared by both signup routes (and the resend endpoint) so the
// token/URL/email shape stays identical no matter who's verifying -
// built from the request's own host, same reasoning as forgot-password's
// resetUrl: a customer verifying from their store's subdomain must land
// back on that store's own /verify-email (rewritten by proxy.js), not
// the vendor/admin one at the platform root, and vice versa.
//
// `kind` says which of users/staff/customers `user.id` lives in (see
// tokens.userId/staffId/customerId in lib/db/schema.js) - defaults to
// "user" since vendor signup is the only caller that doesn't pass it.
export async function sendVerificationEmail({ user, req, kind = "user" }) {
  const token = crypto.randomUUID();
  await db.insert(tokens).values({
    userId: kind === "user" ? user.id : null,
    staffId: kind === "staff" ? user.id : null,
    customerId: kind === "customer" ? user.id : null,
    type: "verify",
    token,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  const protocol = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("host") || "";
  const verifyUrl = `${protocol}://${host}/verify-email?token=${token}`;
  const brand = kind === "customer" ? await resolveStoreByHost(host) : null;
  const identity = emailBrand(brand);

  return sendMail({
    to: user.email,
    subject: "Verify your email",
    html: `<h2>Verify your email</h2><p>Welcome${user.firstName ? `, ${escapeHtml(user.firstName)}` : ""}.</p><p>Confirm this email address to activate your account. This secure link expires in 24 hours.</p>${emailButton(verifyUrl, "Verify email", identity.accentColor)}`,
    brand,
    fromName: brand?.name,
    preheader: "Verify your email to activate your account",
  });
}
