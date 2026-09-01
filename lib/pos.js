// Register/session logic - pure functions over kobo, no db import, so
// the same maths runs on the sell screen (live balance/change) and on
// the server (settle, X report, Z report). See lib/money.js for the
// naira<->kobo boundary and lib/db/schema.js for pos_sessions /
// cash_movements / order_tenders.

// The drawer is opening float plus every signed cash movement. Also
// breaks the movements out by kind so an X/Z report can show the working.
// movements: [{ kind, amount }]  (amount signed kobo)
export function computeDrawer(openingFloat, movements) {
  const by = { cash_sale: 0, cash_refund: 0, paid_in: 0, paid_out: 0, drop: 0, float: 0 };
  for (const m of movements) by[m.kind] = (by[m.kind] || 0) + m.amount;
  const expectedCash =
    Number(openingFloat || 0) + movements.reduce((sum, m) => sum + Number(m.amount || 0), 0);
  return {
    openingFloat: Number(openingFloat || 0),
    cashSales: by.cash_sale,
    cashRefunds: by.cash_refund, // negative
    paidIn: by.paid_in,
    paidOut: by.paid_out, // negative
    drops: by.drop, // negative
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
    if (change > 0 && t.method !== "cash") {
      return { ok: false, error: "Only a cash payment can have change" };
    }
    if (change > t.amount) return { ok: false, error: "Change can't exceed what was tendered" };
    paid += t.amount - change;
  }
  // 1 kobo of slack absorbs the float->kobo rounding on totalAmount.
  if (Math.abs(paid - totalKobo) > 1) {
    return { ok: false, error: "Payments don't add up to the total" };
  }
  return { ok: true };
}

// The cash that actually goes into the drawer from a set of tenders:
// cash amounts minus the change handed back out. Used to write the
// cash_sale movement at settle (and, negated, the cash_refund on a
// return).
export function drawerDeltaFromTenders(tenders) {
  return tenders
    .filter((t) => t.method === "cash")
    .reduce((sum, t) => sum + (t.amount - Number(t.changeGiven || 0)), 0);
}

// Rolls a session's orders + movements + tenders into the immutable
// snapshot stored on pos_sessions.z_report (and returned live for an X
// report). All figures kobo.
// orders:   [{ totalAmount, discountAmount, channel, createdAt, originalOrderId }]  totalAmount already kobo
// tenders:  [{ method, amount, changeGiven }]
// movements:[{ kind, amount }]
export function buildSessionSummary({ session, orders, tenders, movements }) {
  const sales = orders.filter((o) => !o.originalOrderId);
  const returns = orders.filter((o) => o.originalOrderId);

  const byMethod = {};
  for (const t of tenders) {
    byMethod[t.method] = (byMethod[t.method] || 0) + (t.amount - Number(t.changeGiven || 0));
  }

  const times = orders.map((o) => new Date(o.createdAt).getTime()).filter(Boolean);

  return {
    openedAt: session.openedAt,
    generatedAt: new Date().toISOString(),
    saleCount: sales.length,
    returnCount: returns.length,
    grossSales: sales.reduce((s, o) => s + Number(o.totalAmount || 0), 0),
    returnsTotal: returns.reduce((s, o) => s + Number(o.totalAmount || 0), 0), // negative
    discountsGiven: sales.reduce((s, o) => s + Number(o.discountAmount || 0), 0),
    byTenderMethod: byMethod,
    drawer: computeDrawer(session.openingFloat, movements),
    firstSaleAt: times.length ? new Date(Math.min(...times)).toISOString() : null,
    lastSaleAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
  };
}
