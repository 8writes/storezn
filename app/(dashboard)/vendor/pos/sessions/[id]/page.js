"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { Button } from "@/components/ui/Button.js";
import { ZReport } from "@/components/pos/ZReport.js";
import { formatKobo } from "@/lib/money.js";
import { formatCurrency } from "@/lib/format.js";

const PAY_NAME = { cash: "Cash", card: "POS", transfer: "Transfer", wallet: "Wallet", store_credit: "Store credit" };
const paidBy = (methods) =>
  !methods?.length
    ? null
    : methods
        .map((m) => {
          const [method, provider] = m.split(":");
          const n = PAY_NAME[method] || method;
          return provider ? `${n} (${provider})` : n;
        })
        .join(" + ");

const MOVE_LABEL = {
  float: "Opening float",
  cash_sale: "Cash sale",
  cash_refund: "Cash refund",
  paid_in: "Paid in",
  paid_out: "Paid out",
  drop: "Cash drop",
};

// A plain-language note under each movement kind so the owner can read
// the ledger without knowing the jargon.
const MOVE_HINT = {
  float: "Cash the drawer was started with",
  cash_sale: "Cash taken in for a sale (net of any change given)",
  cash_refund: "Cash paid back to a customer for a return",
  paid_in: "Cash added to the drawer during the shift",
  paid_out: "Cash taken out of the drawer during the shift",
  drop: "Cash moved from the drawer to the safe / bank",
};

export default function SessionDetailPage({ params }) {
  const { id } = use(params);
  const storeId = useSearchParams().get("storeId");
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!token || !storeId) return;
    apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sessions/${id}`)
      .then(setData)
      .catch((err) => toast.error(err.message || "Couldn't load the session"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId, id]);

  if (!data) return <div className="max-w-2xl mx-auto h-64 bg-slate-100 rounded-sm animate-pulse" />;

  const { session, register, summary, movements, orders } = data;
  const report = session.zReport || summary;

  return (
    <div className="max-w-2xl mx-auto space-y-6 print:max-w-none">
      <div className="print:hidden">
        <BackLink href="/vendor/pos/sessions" label="Back to sessions" />
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{register.name}</h1>
          <p className="text-sm text-slate-500">
            {session.status === "open" ? "Open" : "Closed"} · opened {new Date(session.openedAt).toLocaleString()}
            {session.closedAt && ` · closed ${new Date(session.closedAt).toLocaleString()}`}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
          Print
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm p-4">
        <ZReport summary={report} title={session.status === "open" ? "X report" : "Z report"} movements={movements} />
      </div>

      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden print:break-inside-avoid">
        <div className="px-4 py-2.5 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-700">Cash movements</p>
          <p className="text-xs text-slate-400">Every entry in and out of this drawer, in order &mdash; who did it, when, and why.</p>
        </div>
        {movements.length === 0 ? (
          <p className="text-sm text-slate-500 px-4 py-4">None</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {movements.map((m) => (
              <li key={m.id} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium text-slate-800">{MOVE_LABEL[m.kind] || m.kind}</span>
                  <span className={`tabular-nums font-medium ${m.amount < 0 ? "text-red-600" : "text-slate-900"}`}>
                    {m.amount > 0 ? "+" : ""}{formatKobo(m.amount)}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{MOVE_HINT[m.kind] || ""}</p>
                {(m.reason || m.orderNumber) && (
                  <p className="text-xs text-slate-600 mt-0.5">
                    {m.orderNumber ? (
                      <Link
                        href={`/vendor/orders/${m.orderId}?storeId=${storeId}`}
                        className="text-brand-700 hover:text-brand-800 print:text-slate-700"
                      >
                        {m.orderNumber}
                      </Link>
                    ) : null}
                    {m.orderNumber && m.reason ? " · " : ""}
                    {m.reason || ""}
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-0.5">
                  {m.by || "—"} · {new Date(m.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden print:break-inside-avoid">
        <p className="text-sm font-semibold text-slate-700 px-4 py-2.5 border-b border-slate-100">
          Sales ({orders.length})
        </p>
        {orders.length === 0 ? (
          <p className="text-sm text-slate-500 px-4 py-4">None</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {orders.map((o) => (
              <li key={o.id} className="flex justify-between gap-4 px-4 py-2">
                <Link href={`/vendor/orders/${o.id}?storeId=${storeId}`} className="text-brand-700 hover:text-brand-800 print:text-slate-700">
                  {o.orderNumber}
                  {o.originalOrderId ? <span className="text-slate-400"> · return</span> : null}
                  {paidBy(o.paymentMethods) && <span className="text-slate-400"> · {paidBy(o.paymentMethods)}</span>}
                </Link>
                <span className={`tabular-nums ${Number(o.totalAmount) < 0 ? "text-red-600" : "text-slate-900"}`}>
                  {formatCurrency(o.totalAmount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
