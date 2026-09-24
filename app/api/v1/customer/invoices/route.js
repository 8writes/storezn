import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../../../../lib/db/index.js";
import { invoiceRequests, invoices } from "../../../../../lib/db/schema.js";
import { getUser } from "../../../../../lib/auth.js";
import { buildPublicAppUrl } from "../../../../../lib/requestUrl.js";

export async function GET(req) {
  const user = await getUser(req);
  if (!user || user.role !== "customer") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select({ invoice: invoices })
    .from(invoices)
    .innerJoin(invoiceRequests, eq(invoiceRequests.id, invoices.requestId))
    .where(and(eq(invoiceRequests.customerId, user.id), eq(invoices.storeId, user.storeId)))
    .orderBy(desc(invoices.createdAt))
    .limit(50);
  return NextResponse.json({
    invoices: rows.map(({ invoice }) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      totalAmount: invoice.totalAmount,
      amountPaid: invoice.amountPaid,
      amountDue: invoice.amountDue,
      createdAt: invoice.createdAt,
      paymentUrl: buildPublicAppUrl(req, `/invoice/${invoice.shareToken}`),
    })),
  });
}
