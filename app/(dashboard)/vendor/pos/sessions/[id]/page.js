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
import { formatCurrency, formatDateTime } from "@/lib/format.js";

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
  change_out: "Change given (POS / transfer)",
};

// A plain-language note under each movement kind so the owner can read
// the ledger without knowing the jargon.
const MOVE_HINT = {
  float: "Cash the drawer was started with",
  cash_sale: "Cash taken in for a sale",
  cash_refund: "Cash paid back to a customer for a return",
  paid_in: "Cash added to the drawer during the shift",
  paid_out: "Cash taken out of the drawer during the shift",
  drop: "Cash moved from the drawer to the safe / bank",
  change_out: "Cash change handed back because the customer overpaid on POS / transfer",
};

export default function SessionDetailPage({ params }) {
  const { id } = use(params);
  const storeId = useSearchParams().get("storeId");
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const [data, setData] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewing, setReviewing] = useState(false);

  // The Cash movements + Sales lists load 20 at a time.
  const [moves, setMoves] = useState([]);
  const [movesPage, setMovesPage] = useState(1);
  const [movesTotal, setMovesTotal] = useState(0);
  const [movesLoading, setMovesLoading] = useState(false);
  const [ords, setOrds] = useState([]);
  const [ordsPage, setOrdsPage] = useState(1);
  const [ordsTotal, setOrdsTotal] = useState(0);
  const [ordsLoading, setOrdsLoading] = useState(false);

  useEffect(() => {
    if (!token || !storeId) return;
    apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sessions/${id}`)
      .then((d) => {
        setData(d);
        setMoves(d.movements || []);
        setMovesTotal(d.movementsTotal ?? (d.movements || []).length);
        setMovesPage(1);
        setOrds(d.orders || []);
        setOrdsTotal(d.ordersTotal ?? (d.orders || []).length);
        setOrdsPage(1);
      })
      .catch((err) => toast.error(err.message || "Couldn't load the session"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId, id]);

  const loadMoreMoves = async () => {
    setMovesLoading(true);
    try {
      const res = await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sessions/${id}?movementsPage=${movesPage + 1}`);
      setMoves((m) => [...m, ...(res.movements || [])]);
      setMovesPage((p) => p + 1);
    } catch (err) {
      toast.error(err.message || "Couldn't load more");
    } finally {
      setMovesLoading(false);
    }
  };
  const loadMoreOrds = async () => {
    setOrdsLoading(true);
    try {
      const res = await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sessions/${id}?ordersPage=${ordsPage + 1}`);
      setOrds((o) => [...o, ...(res.orders || [])]);
      setOrdsPage((p) => p + 1);
    } catch (err) {
      toast.error(err.message || "Couldn't load more");
    } finally {
      setOrdsLoading(false);
    }
  };

  const approveClose = async () => {
    setReviewing(true);
    try {
      const res = await apiFetch(`/api/v1/vendor/stores/${storeId}/pos/sessions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ note: reviewNote.trim() || undefined }),
      });
      setData((d) => ({ ...d, session: { ...d.session, ...res.session } }));
      toast.success("Close approved");
    } catch (err) {
      toast.error(err.message || "Couldn't approve");
    } finally {
      setReviewing(false);
    }
  };

  if (!data) return <div className="max-w-2xl mx-auto h-64 bg-slate-100 rounded-sm animate-pulse" />;

  const { session, register, summary } = data;
  // Frozen Z for a closed shift, but always with the freshly-computed
  // itemised cash events (the frozen ones can be stale/absent).
  const report = { ...(session.zReport || summary), cashEvents: summary.cashEvents };
  const isOwner = user?.role === "vendor" || user?.role === "super_admin";
  const forced = session.closeMethod === "forced_uncounted";

  return (
    <div className="max-w-2xl mx-auto space-y-6 print:max-w-none">
      <div className="print:hidden">
        <BackLink href="/vendor/pos/sessions" label="Back" />
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{register.name}</h1>
          <p className="text-sm text-slate-500">
            {session.status === "open" ? "Open" : "Closed"} · opened {formatDateTime(session.openedAt)}
            {session.closedAt && ` · closed ${formatDateTime(session.closedAt)}`}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
          Print
        </Button>
      </div>

      {session.status === "closed" && (session.provisional || forced || session.reviewStatus !== "ok") && (
        <div
          className={`rounded-sm border p-4 space-y-2 text-sm ${
            session.reviewStatus === "approved" ? "border-slate-200 bg-slate-50" : "border-amber-300 bg-amber-50"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            {forced && <span className="inline-flex rounded-sm bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5">Not counted</span>}
            {session.provisional && (
              <span className="inline-flex rounded-sm bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5">
                Provisional{session.pendingSyncCount ? ` · ${session.pendingSyncCount} unsynced` : ""}
              </span>
            )}
            {session.reviewStatus === "pending" && (
              <span className="inline-flex rounded-sm bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5">Needs owner review</span>
            )}
            {session.reviewStatus === "approved" && (
              <span className="inline-flex rounded-sm bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5">Reviewed</span>
            )}
          </div>

          {forced && (
            <p className="text-amber-900">
              The drawer wasn&apos;t counted &mdash; the system&apos;s expected figure ({formatKobo(report.expectedCash)}) was recorded.
              {session.forcedReason ? ` Reason: “${session.forcedReason}”.` : ""}
            </p>
          )}
          {session.provisional && (
            <p className="text-amber-900">
              {session.pendingSyncCount} sale{session.pendingSyncCount === 1 ? "" : "s"} hadn&apos;t synced at close, so the totals may still move.
            </p>
          )}

          {session.reviewStatus === "approved" && (
            <p className="text-slate-500 text-xs">
              Approved{session.reviewedAt ? ` ${formatDateTime(session.reviewedAt)}` : ""}
              {session.reviewNote ? ` · “${session.reviewNote}”` : ""}
            </p>
          )}

          {session.reviewStatus === "pending" && isOwner && (
            <div className="pt-1 space-y-2 print:hidden">
              <input
                type="text"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Note (optional) — what you found / did"
                className="w-full px-3 py-2 border border-slate-300 rounded-sm text-sm outline-none focus:border-brand-500 bg-surface"
              />
              <Button type="button" size="sm" loading={reviewing} onClick={approveClose}>
                Approve this close
              </Button>
            </div>
          )}
          {session.reviewStatus === "pending" && !isOwner && (
            <p className="text-amber-900 text-xs">The store owner needs to review and sign off on this shift.</p>
          )}
        </div>
      )}

      <div className="bg-surface border border-slate-200 rounded-sm p-4">
        <ZReport summary={report} title={session.status === "open" ? "X report" : "Z report"} />
        {session.countBreakdown && Object.keys(session.countBreakdown).length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Counted by notes</p>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-600">
              {Object.entries(session.countBreakdown)
                .sort((a, b) => Number(b[0]) - Number(a[0]))
                .map(([denom, qty]) => (
                  <span key={denom} className="tabular-nums">
                    ₦{Number(denom).toLocaleString()} × {qty}
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-surface border border-slate-200 rounded-sm overflow-hidden print:break-inside-avoid">
        <div className="px-4 py-2.5 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-700">Cash movements ({movesTotal})</p>
          <p className="text-xs text-slate-400">Every entry in and out of this drawer, newest first &mdash; who did it, when, and why.</p>
        </div>
        {moves.length === 0 ? (
          <p className="text-sm text-slate-500 px-4 py-4">None</p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 text-sm">
              {moves.map((m) => (
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
                    {m.by || "—"} · {formatDateTime(m.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
            {moves.length < movesTotal && (
              <div className="border-t border-slate-100 p-2 print:hidden">
                <Button type="button" variant="outline" size="sm" fullWidth loading={movesLoading} onClick={loadMoreMoves}>
                  Load 20 more ({movesTotal - moves.length} left)
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="bg-surface border border-slate-200 rounded-sm overflow-hidden print:break-inside-avoid">
        <p className="text-sm font-semibold text-slate-700 px-4 py-2.5 border-b border-slate-100">
          Sales ({ordsTotal})
        </p>
        {ords.length === 0 ? (
          <p className="text-sm text-slate-500 px-4 py-4">None</p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 text-sm">
              {ords.map((o) => (
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
            {ords.length < ordsTotal && (
              <div className="border-t border-slate-100 p-2 print:hidden">
                <Button type="button" variant="outline" size="sm" fullWidth loading={ordsLoading} onClick={loadMoreOrds}>
                  Load 20 more ({ordsTotal - ords.length} left)
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
