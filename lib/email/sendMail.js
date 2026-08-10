import { getTransporter, getMailerConfig } from "./mailer.js";

export async function sendMail({ to, subject, html, from, fromName, replyTo, attachments }) {
  if (!to || !subject || !html) throw new Error("Missing email params");

  const { from: defaultFrom, fromName: defaultFromName } = getMailerConfig();
  if (!process.env.SENDPULSE_SMTP_USER || !process.env.SENDPULSE_SMTP_PASS) {
    throw new Error("SENDPULSE_SMTP_USER/SENDPULSE_SMTP_PASS are not configured");
  }

  // The address is always the shared support@ mailbox (that's the only
  // one actually authenticated with SendPulse), but the display name a
  // recipient sees should reflect who the email is actually from - the
  // vendor's store for an order confirmation, not a generic platform
  // name that has nothing to do with what they just bought.
  await getTransporter().sendMail({
    from: `"${fromName || defaultFromName}" <${from || defaultFrom}>`,
    to,
    subject,
    html,
    ...(replyTo ? { replyTo } : {}),
    // Callers pass the inline-attachment shape { content: <base64>,
    // filename, id: <cid> }, translate it here to nodemailer's
    // { filename, content, encoding, cid } so callers don't need to know
    // which mail provider is behind sendMail().
    ...(attachments?.length
      ? {
          attachments: attachments.map(({ content, filename, id }) => ({
            filename,
            content,
            encoding: "base64",
            cid: id,
          })),
        }
      : {}),
  });

  return { success: true };
}
