import { eq } from "drizzle-orm";
import { db } from "@/lib/db/index.js";
import { invoices, stores } from "@/lib/db/schema.js";
import { formatCurrency } from "@/lib/format.js";
import { getPlatformUrl } from "@/lib/storeUrl.js";

// The invoice page itself is a client component, so its link preview
// (WhatsApp, iMessage, email) is set here instead - otherwise it shows the
// generic Storezn preview. The preview names the store and what's due,
// with the store's own logo; nothing about the customer or the items.
// noindex: these are private payment links.
export async function generateMetadata({ params }) {
  const { shareToken } = await params;
  const [row] = await db
    .select({
      storeName: stores.name,
      logoUrl: stores.logoUrl,
      faviconUrl: stores.faviconUrl,
      status: invoices.status,
      amountDue: invoices.amountDue,
      totalAmount: invoices.totalAmount,
    })
    .from(invoices)
    .innerJoin(stores, eq(stores.id, invoices.storeId))
    .where(eq(invoices.shareToken, String(shareToken)))
    .limit(1)
    .catch(() => []);

  const robots = { index: false, follow: false };
  if (!row) return { title: { absolute: "Invoice" }, robots };

  const title = `Invoice from ${row.storeName}`;
  const description =
    row.status === "paid"
      ? `Paid in full - ${formatCurrency(row.totalAmount)}.`
      : ["sent", "partially_paid"].includes(row.status)
        ? `${formatCurrency(row.amountDue)} to pay. Tap to view and pay securely.`
        : `View your invoice from ${row.storeName}.`;
  const image = row.logoUrl || getPlatformUrl("/storezn-logo.png");

  return {
    title: { absolute: title },
    description,
    robots,
    icons: row.faviconUrl ? { icon: row.faviconUrl } : undefined,
    openGraph: {
      title,
      description,
      siteName: row.storeName,
      images: [{ url: image }],
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [image],
    },
  };
}

export default function InvoiceLayout({ children }) {
  return children;
}
