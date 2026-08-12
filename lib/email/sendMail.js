import { sendViaSendPulse, getMailerConfig } from "./mailer.js";

export async function sendMail({ to, subject, html, from, fromName, replyTo, attachments }) {
  if (!to || !subject || !html) throw new Error("Missing email params");

  const { from: defaultFrom, fromName: defaultFromName } = getMailerConfig();
  if (!process.env.SENDPULSE_API_ID || !process.env.SENDPULSE_API_SECRET) {
    throw new Error("SENDPULSE_API_ID/SENDPULSE_API_SECRET are not configured");
  }

  // The address is always the shared support@ mailbox (that's the only
  // one actually authenticated with SendPulse), but the display name a
  // recipient sees should reflect who the email is actually from - the
  // vendor's store for an order confirmation, not a generic platform
  // name that has nothing to do with what they just bought.
  await sendViaSendPulse({
    html: Buffer.from(html, "utf-8").toString("base64"),
    subject,
    from: { name: fromName || defaultFromName, email: from || defaultFrom },
    to: [{ email: to }],
    ...(replyTo ? { headers: { "Reply-To": replyTo } } : {}),
    // Callers pass { content: <base64>, filename, id: <cid> } - id/cid
    // (inline image references) isn't used by any current caller, so it's
    // dropped here rather than guessing at SendPulse's inline-attachment
    // shape for a code path nothing exercises yet.
    ...(attachments?.length
      ? { attachments: Object.fromEntries(attachments.map(({ filename, content }) => [filename, content])) }
      : {}),
  });

  return { success: true };
}
