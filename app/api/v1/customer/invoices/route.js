import { NextResponse } from "next/server";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../../../../../lib/db/index.js";
import { invoiceRequests, invoices } from "../../../../../lib/db/schema.js";
import { getUser } from "../../../../../lib/auth.js";
import { buildPublicAppUrl } from "../../../../../lib/requestUrl.js";
import { parsePagination } from "../../../../../lib/pagination.js";

export async function GET(req) {
  const user = await getUser(req);
  if (!user || user.role !== "customer") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { page, pageSize, limit, offset } = parsePagination(new URL(req.url).searchParams);
  const condition = and(eq(invoiceRequests.customerId, user.id), eq(invoices.storeId, user.storeId));
  const [rows, [{ total }]] = await Promise.all([
    db.select({ invoice: invoices })
      .from(invoices)
      .innerJoin(invoiceRequests, eq(invoiceRequests.id, invoices.requestId))
      .where(condition)
      .orderBy(desc(invoices.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(invoices).innerJoin(invoiceRequests, eq(invoiceRequests.id, invoices.requestId)).where(condition),
  ]);
  const totalNumber = Number(total) || 0;
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
    pagination: { page, pageSize, total: totalNumber, totalPages: Math.max(1, Math.ceil(totalNumber / pageSize)) },
  });
}
