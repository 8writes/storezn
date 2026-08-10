import { db } from "./db/index.js";
import { tokens } from "./db/schema.js";
import { sendMail } from "./email/sendMail.js";

// Shared by both signup routes (and the resend endpoint) so the
// token/URL/email shape stays identical no matter who's verifying -
// built from the request's own host, same reasoning as forgot-password's
// resetUrl: a customer verifying from their store's subdomain must land
// back on that store's own /verify-email (rewritten by proxy.js), not
// the vendor/admin one at the platform root, and vice versa.
export async function sendVerificationEmail({ user, req }) {
  const token = crypto.randomUUID();
  await db.insert(tokens).values({
    userId: user.id,
    type: "verify",
    token,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  const protocol = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("host") || "";
  const verifyUrl = `${protocol}://${host}/verify-email?token=${token}`;

  return sendMail({
    to: user.email,
    subject: "Verify your email",
    html: `<p>Welcome${user.firstName ? `, ${user.firstName}` : ""}!</p><p>Confirm this is your email address to activate your account. This link expires in 24 hours.</p><p><a href="${verifyUrl}">Verify email</a></p>`,
  });
}
