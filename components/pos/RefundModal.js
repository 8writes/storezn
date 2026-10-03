"use client";
import { useState } from "react";
import { Minus, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { formatKobo, toKobo } from "@/lib/money.js";
import { formatDateTime } from "@/lib/format.js";

// One id per mount (the modal unmounts on close), reused for every retry
// of THIS refund so a flaky-network double-submit is deduped by the
// server rather than refunding twice - same reasoning as CashDrawerModal.
function newKey() {
  try {
    return crypto.randomUUID();
  } catch {
    return `ret_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

const METHODS = [
  { value: "cash", label: "Cash", hint: "Paid back out of this drawer - the expected-cash figure drops by the refund." },
  { value: "transfer", label: "Transfer", hint: "Sent back to the customer's account. Record the transfer reference below." },
  { value: "card", label: "Card", hint: "Reversed on the card terminal. Record the terminal reference below." },
];

// Mirrors the refund math in POST /pos/returns so the cashier sees the
// figure the server will actually record: each line refunds its own
// snapshot amount, then an order-level discount is spread across the
// returned lines (POS `totalAmount` is net of that discount while the
// item snapshots are not). The server stays authoritative - it also
// subtracts anything returned on an earlier visit, which this screen
// cannot see.
function estimateRefundKobo(order, items, quantities) {
  const linesKobo = items.reduce((sum, item) => sum + toKobo(item.lineTotal), 0);
  const scale = linesKobo > 0 ? toKobo(order.totalAmount) / linesKobo : 1;
  const raw = items.reduce((sum, item) => {
    const quantity = quantities[item.id] || 0;
    if (!quantity) return sum;
    const perUnit = Math.round(toKobo(item.lineTotal) / item.quantity);
    return sum + perUnit * quantity;
  }, 0);
  return Math.max(0, Math.round(raw * scale));
}

// Refund against an earlier POS sale: find it by receipt number, pick the
// lines and quantities coming back, and pay the customer out. The returned
// stock goes back to this register's branch and the sale is recorded as a
// negative order - see POST /pos/returns.
export function RefundModal({ open, onClose, onFindSale, onSubmit, submitting }) {
  const [query, setQuery] = useState("");
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState("");
  const [sale, setSale] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [idempotencyKey] = useState(newKey);
  const { confirm, confirmDialog } = useConfirm();

  if (!open) return null;

  const activeMethod = METHODS.find((entry) => entry.value === method);
  const refundKobo = sale ? estimateRefundKobo(sale.order, sale.items, quantities) : 0;
  const pickedLines = sale
    ? sale.items
      .map((item) => ({ orderItemId: item.id, quantity: quantities[item.id] || 0 }))
      .filter((line) => line.quantity > 0)
    : [];

  const findSale = async () => {
    const orderNumber = query.trim();
    if (!orderNumber || finding) return;
    setFinding(true);
    setFindError("");
    try {
      const found = await onFindSale(orderNumber);
      setSale(found);
      // Nothing pre-selected: a refund is destructive, so every line
      // coming back is an explicit tap rather than a default to undo.
      setQuantities({});
    } catch (error) {
      setSale(null);
      setFindError(error?.message || "Couldn't find that sale");
    } finally {
      setFinding(false);
    }
  };

  const setQuantity = (item, next) => {
    setQuantities((current) => ({ ...current, [item.id]: Math.max(0, Math.min(item.quantity, next)) }));
  };

  const startOver = () => {
    setSale(null);
    setQuantities({});
    setFindError("");
    setQuery("");
  };

  // A refund moves real money and cannot be undone from the till (the
  // return posts as its own order), so it gets the same confirm step as a
  // cash-drawer movement.
  const handleSubmit = async () => {
    const ok = await confirm({
      title: `Refund ${formatKobo(refundKobo)} by ${activeMethod.label.toLowerCase()}?`,
      description: `${pickedLines.length} line${pickedLines.length === 1 ? "" : "s"} from ${sale.order.orderNumber} goes back into stock. This can't be undone.`,
      confirmLabel: "Refund",
      variant: "danger",
    });
    if (!ok) return;
    onSubmit({
      idempotencyKey,
      originalOrderId: sale.order.id,
      items: pickedLines,
      refundMethod: method,
      ...(reference.trim() ? { reference: reference.trim() } : {}),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={submitting ? undefined : onClose} />
      <div className="relative bg-surface rounded-t-sm sm:rounded-sm shadow-xl w-full sm:max-w-md max-h-[92dvh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
          <div>
            <p className="text-sm font-bold text-slate-900">Refund a sale</p>
            <p className="text-xs text-slate-600 mt-0.5">
              {sale ? `Receipt ${sale.order.orderNumber}` : "Find the receipt this refund is against"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={submitting}
            className="text-slate-400 hover:text-slate-700 cursor-pointer disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto overscroll-contain space-y-4">
          {!sale ? (
            <>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  autoFocus
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && findSale()}
                  placeholder="Receipt number (e.g. ORD-ABC123)"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-sm text-base sm:text-sm outline-none focus:border-brand-500"
                />
                <Button type="button" loading={finding} disabled={!query.trim() || finding} onClick={findSale}>
                  <Search size={15} /> Find
                </Button>
              </div>
              {findError && <p className="text-sm text-red-600">{findError}</p>}
              <p className="text-xs text-slate-600">
                Only register sales can be refunded here. An online order is refunded from its order page instead.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 rounded-sm bg-slate-50 border border-slate-200 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{formatKobo(toKobo(sale.order.totalAmount))}</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Sold {formatDateTime(sale.order.paidAt || sale.order.createdAt)}
                    {sale.order.soldByName ? ` by ${sale.order.soldByName}` : ""}
                  </p>
                </div>
                <button type="button" onClick={startOver} disabled={submitting} className="text-xs font-medium text-brand-700 hover:text-brand-800 cursor-pointer disabled:opacity-50 shrink-0">
                  Change
                </button>
              </div>

              <div className="space-y-2">
                {sale.items.map((item) => {
                  const picked = quantities[item.id] || 0;
                  return (
                    <div key={item.id} className="flex items-center gap-3 border border-slate-200 rounded-sm px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">{item.productName}</p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {item.variantLabel ? `${item.variantLabel} · ` : ""}
                          {item.quantity} sold · {formatKobo(toKobo(item.lineTotal))}
                        </p>
                      </div>
                      <div className="inline-grid grid-cols-[2.25rem_2.5rem_2.25rem] h-9 border border-slate-300 rounded-sm overflow-hidden shrink-0">
                        <button
                          type="button"
                          aria-label={`Return one less ${item.productName}`}
                          disabled={submitting || picked === 0}
                          onClick={() => setQuantity(item, picked - 1)}
                          className="grid place-items-center hover:bg-brand-50 text-brand-700 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Minus size={15} />
                        </button>
                        <output className="grid place-items-center border-x border-slate-300 text-sm font-semibold tabular-nums">{picked}</output>
                        <button
                          type="button"
                          aria-label={`Return one more ${item.productName}`}
                          disabled={submitting || picked >= item.quantity}
                          onClick={() => setQuantity(item, picked + 1)}
                          className="grid place-items-center hover:bg-brand-50 text-brand-700 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Refund by</p>
                <div className="grid grid-cols-3 gap-2">
                  {METHODS.map((entry) => (
                    <button
                      key={entry.value}
                      type="button"
                      onClick={() => setMethod(entry.value)}
                      className={`py-2 rounded-sm border text-xs font-medium cursor-pointer transition-colors ${
                        method === entry.value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-800">{activeMethod.hint}</p>
                {method !== "cash" && (
                  <input
                    type="text"
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder="Reference (optional)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-sm text-base sm:text-sm outline-none focus:border-brand-500"
                  />
                )}
              </div>
            </>
          )}
        </div>

        {sale && (
          <div className="p-4 border-t border-slate-100 shrink-0 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-700">Refund total</span>
              <span className="text-base font-bold text-slate-900 tabular-nums">{formatKobo(refundKobo)}</span>
            </div>
            <Button
              type="button"
              fullWidth
              variant="danger"
              loading={submitting}
              disabled={submitting || pickedLines.length === 0 || refundKobo <= 0}
              onClick={handleSubmit}
            >
              {pickedLines.length === 0 ? "Pick what's coming back" : `Refund ${formatKobo(refundKobo)}`}
            </Button>
          </div>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
