import { NextResponse, after } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../../../../../../../lib/db/index.js";
import { invoiceRequests, stores } from "../../../../../../../../lib/db/schema.js";
import { getUser, canManageStore } from "../../../../../../../../lib/auth.js";
import { sendMail } from "../../../../../../../../lib/email/sendMail.js";
import { escapeHtml } from "../../../../../../../../lib/email/escapeHtml.js";
import { logStoreActivity } from "../../../../../../../../lib/storeActivity.js";
import { withApiMonitoring } from "../../../../../../../../lib/apiMonitoring.js";

async function handlePatch(req, { params }) {
  const user = await getUser(req);
  const { storeId, requestId } = await params;
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!user || !store || !canManageStore(user, store)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (body?.action !== "cancel") return NextResponse.json({ error: "Only quote cancellation is supported" }, { status: 400 });

  const [cancelled] = await db.update(invoiceRequests)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(invoiceRequests.id, requestId), eq(invoiceRequests.storeId, storeId), inArray(invoiceRequests.status, ["new", "reviewing", "quoted"])))
    .returning();
  if (!cancelled) return NextResponse.json({ error: "This quote request is no longer open" }, { status: 409 });

  if (cancelled.guestEmail) {
    after(() => sendMail({
      to: cancelled.guestEmail,
      subject: `Quote request ${cancelled.requestNumber} was cancelled`,
      html: `<p>Hello${cancelled.buyerName ? ` ${escapeHtml(cancelled.buyerName)}` : ""},</p><p><strong>${escapeHtml(store.name)}</strong> cancelled quote request <strong>${escapeHtml(cancelled.requestNumber)}</strong>.</p><p>You can contact the store if you still need help with this request.</p>`,
      fromName: store.name,
      brand: store,
      preheader: `Quote request ${cancelled.requestNumber} was cancelled`,
    }).catch((error) => console.error("sendMail failed (quote cancellation):", error)));
  }
  after(() => logStoreActivity({
    storeId,
    actor: user,
    action: "invoice.request.cancel",
    summary: `Cancelled quote request ${cancelled.requestNumber}`,
    targetType: "invoice_request",
    targetId: cancelled.id,
  }));
  return NextResponse.json({ request: cancelled });
}

export const PATCH = withApiMonitoring(handlePatch, { source: "vendor.invoice_request.cancel" });
