// Register/session logic - pure functions over kobo, no db import, so
// the same maths runs on the sell screen (live balance/change) and on
// the server (settle, X report, Z report). See lib/money.js for the
// naira<->kobo boundary and lib/db/schema.js for pos_sessions /
// cash_movements / order_tenders.

// The drawer is the opening float plus every signed cash movement. The
// opening float is ALSO written as a `float` movement row at session open
// (so it shows in the ledger), so it's excluded from the sum here -
// counting both the `openingFloat` arg and the `float` row would inflate
// the expected cash by the float amount and make every Z read "short".
// movements: [{ kind, amount }]  (amount signed kobo)
export function computeDrawer(openingFloat, movements) {
  const by = { cash_sale: 0, cash_refund: 0, paid_in: 0, paid_out: 0, drop: 0, change_out: 0, float: 0 };
  for (const m of movements) by[m.kind] = (by[m.kind] || 0) + m.amount;
  const expectedCash =
    Number(openingFloat || 0) +
    movements.filter((m) => m.kind !== "float").reduce((sum, m) => sum + Number(m.amount || 0), 0);
  return {
    openingFloat: Number(openingFloat || 0),
    cashSales: by.cash_sale,
    cashRefunds: by.cash_refund, // negative
    paidIn: by.paid_in,
    paidOut: by.paid_out, // negative
    drops: by.drop, // negative
    changeOut: by.change_out, // negative - cash change on a POS/transfer overpayment
    expectedCash,
  };
}

// Validates a split-tender payment before settle.
// tenders: [{ method, amount, changeGiven }]  (kobo)
// Returns { ok, error }. The invariant: what the customer actually paid
// (amount minus any change handed back) must exactly cover the order.
export function validateTenders(tenders, totalKobo) {
  if (!Array.isArray(tenders) || tenders.length === 0) {
    return { ok: false, error: "At least one payment is required" };
  }
  let paid = 0;
  for (const t of tenders) {
    if (!t || typeof t.amount !== "number" || t.amount <= 0) {
      return { ok: false, error: "Every payment needs an amount greater than 0" };
    }
    const change = Number(t.changeGiven || 0);
    if (change < 0) return { ok: false, error: "Change can't be negative" };
    // Change on a non-cash tender is fine - a customer who transfers a
    // round number and collects the difference in cash from the drawer
    // (see drawerDeltaFromTenders, which then pays that out of the till).
    if (change > t.amount) return { ok: false, error: "Change can't exceed what was tendered" };
    paid += t.amount - change;
  }
  // 1 kobo of slack absorbs the float->kobo rounding on totalAmount.
  if (Math.abs(paid - totalKobo) > 1) {
    return { ok: false, error: "Payments don't add up to the total" };
  }
  return { ok: true };
}

// The cash that actually moves through the drawer for a set of tenders:
// cash taken in, minus every bit of change handed back - including change
// given on a non-cash tender (a transfer/POS overpayment settled in cash
// from the till). Used to write the cash_sale movement at settle (and,
// negated, the cash_refund on a return).
export function drawerDeltaFromTenders(tenders) {
  return tenders.reduce((sum, t) => {
    const change = Number(t.changeGiven || 0);
    return t.method === "cash" ? sum + (t.amount - change) : sum - change;
  }, 0);
}

// Rolls a session's orders + movements + tenders into the immutable
// snapshot stored on pos_sessions.z_report (and returned live for an X
// report). All figures kobo.
// orders:   [{ totalAmount, discountAmount, channel, createdAt, originalOrderId }]  totalAmount already kobo
// tenders:  [{ method, provider, amount, changeGiven }]
// movements:[{ kind, amount }]
export function buildSessionSummary({ session, orders, tenders, movements }) {
  const sales = orders.filter((o) => !o.originalOrderId);
  const returns = orders.filter((o) => o.originalOrderId);

  // Net taken per method, and per non-cash account (a POS terminal for a
  // card swipe, a provider bank account for a transfer) so every stream
  // reconciles. Change on a non-cash tender is cash out of the drawer -
  // track it so the drawer figure isn't a mystery.
  const byMethod = {};
  const accounts = {}; // "card|Moniepoint" -> { method, provider, amount }
  let nonCashChangeOut = 0;
  for (const t of tenders) {
    const net = t.amount - Number(t.changeGiven || 0);
    byMethod[t.method] = (byMethod[t.method] || 0) + net;
    if (t.method !== "cash") {
      const provider = (t.provider || "").trim() || "Unspecified";
      const key = `${t.method}|${provider}`;
      (accounts[key] = accounts[key] || { method: t.method, provider, amount: 0 }).amount += net;
      nonCashChangeOut += Number(t.changeGiven || 0);
    }
  }
  const byAccount = Object.values(accounts).sort((a, b) => b.amount - a.amount);

  const times = orders.map((o) => new Date(o.createdAt).getTime()).filter(Boolean);

  // The hand-entered drawer moves (paid in / out, drops, cash refunds),
  // itemised, so the Z report can say exactly what each adjustment was -
  // not just a net "Paid out". Kept in the snapshot; the sell-screen and
  // stored-Z renders read this when a live movements list isn't to hand.
  const cashEvents = (movements || [])
    .filter((m) => ["paid_in", "paid_out", "drop", "cash_refund", "change_out"].includes(m.kind))
    .map((m) => ({
      id: m.id,
      kind: m.kind,
      amount: m.amount,
      reason: m.reason || null,
      orderId: m.orderId || null,
      createdBy: m.createdBy || null,
      createdAt: m.createdAt,
    }))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return {
    openedAt: session.openedAt,
    generatedAt: new Date().toISOString(),
    saleCount: sales.length,
    returnCount: returns.length,
    grossSales: sales.reduce((s, o) => s + Number(o.totalAmount || 0), 0),
    returnsTotal: returns.reduce((s, o) => s + Number(o.totalAmount || 0), 0), // negative
    discountsGiven: sales.reduce((s, o) => s + Number(o.discountAmount || 0), 0),
    byTenderMethod: byMethod,
    byAccount,
    nonCashChangeOut,
    cashEvents,
    drawer: computeDrawer(session.openingFloat, movements),
    firstSaleAt: times.length ? new Date(Math.min(...times)).toISOString() : null,
    lastSaleAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
  };
}
