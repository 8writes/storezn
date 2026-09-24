import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../../../../lib/db/index.js";
import { invoices } from "../../../../../../lib/db/schema.js";
import { resolveStoreByHost } from "../../../../../../lib/resolveStore.js";
import { checkRateLimit } from "../../../../../../lib/rateLimit.js";
import { buildPublicAppUrl } from "../../../../../../lib/requestUrl.js";
import { withApiMonitoring } from "../../../../../../lib/apiMonitoring.js";

const lookupSchema = z.object({
  invoiceNumber: z.string().trim().toUpperCase().regex(/^INV-[A-Z0-9-]{6,40}$/, "Enter a valid invoice number"),
  email: z.string().trim().toLowerCase().email("Enter the email used for the invoice"),
});

async function handlePost(req) {
  const store = await resolveStoreByHost(req.headers.get("host") || "");
  if (!store) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const parsed = lookupSchema.safeParse(body || {});
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid lookup details" }, { status: 400 });
  const limit = await checkRateLimit(req, `invoice-lookup:${store.id}`, { max: 10, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many lookup attempts. Try again shortly." }, { status: 429 });

  const [invoice] = await db.select({ shareToken: invoices.shareToken })
    .from(invoices)
    .where(and(eq(invoices.storeId, store.id), eq(invoices.invoiceNumber, parsed.data.invoiceNumber), eq(invoices.guestEmail, parsed.data.email)))
    .limit(1);
  if (!invoice) return NextResponse.json({ error: "Invoice not found. Check the number and email." }, { status: 404 });
  return NextResponse.json({ paymentUrl: buildPublicAppUrl(req, `/invoice/${invoice.shareToken}`) });
}

export const POST = withApiMonitoring(handlePost, { source: "storefront.invoice.lookup" });
