import { sendMail } from "./email/sendMail.js";
import { renderEmail, emailButton, emailText } from "./email/templates.js";

// Told to the vendor the moment their identity clears - whether that was
// the automatic NIN check or a person on the team approving them. Until
// this point their store is unlisted and cannot take orders (see
// isStoreLive in lib/resolveStore.js), so this is the message that says
// the business can actually start trading.
export async function sendVendorVerifiedEmail(vendor, { reviewedByTeam = false } = {}) {
  if (!vendor?.email) return;

  const firstName = (vendor.firstName || "").trim();
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";

  const content =
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:30px;color:#0f172a">You're verified</h1>` +
    `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#334155">${emailText(greeting)}</p>` +
    `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#334155">` +
    emailText(
      reviewedByTeam
        ? "Our team has checked your details and your identity is now verified."
        : "Your identity has been verified against your NIN.",
    ) +
    `</p>` +
    `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#334155">` +
    emailText(
      "Your store is live and every feature on your plan is now open to you - you can take orders, receive payments, and get paid out to your bank account.",
    ) +
    `</p>` +
    emailButton("https://storezn.com/vendor/dashboard", "Go to your dashboard") +
    `<p style="margin:16px 0 0;font-size:13px;line-height:20px;color:#64748b">` +
    emailText("If you didn't submit this, reply to this email and we'll look into it straight away.") +
    `</p>`;

  await sendMail({
    to: vendor.email,
    subject: "You're verified - your store is live",
    html: renderEmail({ content, preheader: "Your identity is verified and your store can now take orders." }),
  });
}
