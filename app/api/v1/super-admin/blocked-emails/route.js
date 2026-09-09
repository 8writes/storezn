import { NextResponse } from "next/server";
import { db } from "../../../../../lib/db/index.js";
import { blockedEmails } from "../../../../../lib/db/schema.js";
import { desc } from "drizzle-orm";
import { getUser, requireRole } from "../../../../../lib/auth.js";
import { validate, blockedEmailSchema } from "../../../../../lib/validate.js";
import { normalizeEmail } from "../../../../../lib/emailNormalize.js";

// The signup block-list. super_admin + admin (spam-account management is
// day-to-day moderation, not a privileged platform change).
export async function GET(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.select().from(blockedEmails).orderBy(desc(blockedEmails.createdAt));
  return NextResponse.json({ blocked: rows });
}

export async function POST(req) {
  const user = await getUser(req);
  if (!requireRole(user, ["super_admin", "admin"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const result = validate(blockedEmailSchema, body || {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const raw = result.data.value.trim().toLowerCase();
  // An "@" means a specific address (canonicalised); otherwise a whole
  // domain. A bare "gmail.com" blocks every gmail signup - the UI warns.
  const isEmail = raw.includes("@");
  const value = isEmail ? normalizeEmail(raw) : raw.replace(/^@/, "");
  const kind = isEmail ? "email" : "domain";

  if (kind === "domain" && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(value)) {
    return NextResponse.json({ error: "That doesn't look like an email or a domain" }, { status: 400 });
  }

  try {
    const [row] = await db
      .insert(blockedEmails)
      .values({ value, kind, reason: result.data.reason?.trim() || null, createdBy: user.id })
      .returning();
    return NextResponse.json({ blocked: row }, { status: 201 });
  } catch (err) {
    if (/unique|duplicate key/i.test(err.message || "")) {
      return NextResponse.json({ error: "That's already on the list" }, { status: 409 });
    }
    throw err;
  }
}
