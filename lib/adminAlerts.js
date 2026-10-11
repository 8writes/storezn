import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { users } from "./db/schema.js";
import { sendMail } from "./email/sendMail.js";
import { renderEmail, emailButton, emailText } from "./email/templates.js";
import { sendPushToRole } from "./push.js";
import { buildPublicAppUrl } from "./requestUrl.js";

// Operational alerts to the Storezn team: a vendor submitted a NIN, a
// vendor attached a bank account. Both are moments where someone needs to
// look at something, and a push alone is easy to miss on a phone that was
// locked at the time - so these go out as push AND email together.
//
// Addressed to whoever currently holds the super_admin role rather than a
// hard-coded inbox, the same source sendPushToRole already uses, so the
// list maintains itself when the team changes.
//
// Fire-and-forget by design: a vendor's submission must never fail
// because an email provider was slow. Callers hand this to after().
export async function alertAdmins({ req, title, body, url, lines = [] }) {
  const link = url ? buildPublicAppUrl(req, url) : null;

  const push = sendPushToRole("super_admin", { title, body, url: url || "/super-admin" }).catch((err) =>
    console.error("alertAdmins: push failed", { title, error: err?.message }),
  );

  const email = (async () => {
    const admins = await db
      .select({ email: users.email, firstName: users.firstName })
      .from(users)
      .where(eq(users.role, "super_admin"));
    if (admins.length === 0) return;

    const detail = lines
      .filter(Boolean)
      .map((line) => `<p style="margin:0 0 6px;font-size:14px;line-height:22px;color:#334155">${emailText(line)}</p>`)
      .join("");

    const content =
      `<h1 style="margin:0 0 12px;font-size:20px;line-height:28px;color:#0f172a">${emailText(title)}</h1>` +
      `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#334155">${emailText(body)}</p>` +
      detail +
      (link ? emailButton(link, "Open in Storezn") : "");

    await Promise.all(
      admins.map((admin) =>
        sendMail({
          to: admin.email,
          subject: title,
          html: renderEmail({ content, preheader: body }),
        }).catch((err) => console.error("alertAdmins: email failed", { to: admin.email, error: err?.message })),
      ),
    );
  })().catch((err) => console.error("alertAdmins: could not load admins", err?.message));

  await Promise.allSettled([push, email]);
}
