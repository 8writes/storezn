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

// A queued offline sale belongs to the shift during which it was rung up,
// even if another device closed that shift before this device reconnected.
// Keep the acceptance window strict so an arbitrary backdated sale cannot
// be attached to an unrelated historical Z report.
export function canReplayOfflineSale(session, soldAtMs, nowMs = Date.now()) {
  if (!session || session.status !== "closed" || !Number.isFinite(soldAtMs)) return false;
  const openedAtMs = new Date(session.openedAt).getTime();
  const closedAtMs = new Date(session.closedAt).getTime();
  if (!Number.isFinite(openedAtMs) || !Number.isFinite(closedAtMs)) return false;
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return soldAtMs >= openedAtMs && soldAtMs <= closedAtMs && soldAtMs <= nowMs + 60_000 && soldAtMs >= nowMs - sevenDays;
}

// Price policy for POS settlement. A staff member cannot deliberately
// alter a price or discount, but a completed offline sale whose cached
// catalogue price has drifted must sync and enter the owner's review queue.
export function posPriceAdjustmentPolicy({ isOwner, wantsPriceChange, isOfflineReplay, hasPriceDifference = false }) {
  return {
    blocked: !isOwner && wantsPriceChange,
    reviewRequired: !isOwner && !wantsPriceChange && isOfflineReplay && hasPriceDifference,
  };
}

// How far a queued offline sale's cached line price may sit from the
// current catalogue price and still be settled by a non-owner.
//
// A captured line price is a price the SERVER did not compute, so it has
// to be treated as an adjustment, not as fact - without a bound, a
// cashier could settle any item at any price simply by presenting it as
// offline catalogue drift (the captured value is not covered by the
// explicit unitPrice/lineDiscount owner gate). Genuine drift is a
// catalogue edit between the ring-up and the sync, which is normally
// small; anything past this has to be settled by the owner, who can
// override prices outright anyway.
//
// Both bounds must hold: the percentage keeps small-ticket items honest,
// the absolute cap keeps a percentage of a large-ticket item from being
// a big number on its own.
export const OFFLINE_DRIFT_MAX_PERCENT = 20;
export const OFFLINE_DRIFT_MAX_KOBO = 500_000; // ₦5,000

// capturedKobo/catalogueKobo are LINE totals (see the POS sale route -
// bundle pricing makes the line, not the unit, authoritative).
export function offlineDriftWithinStaffAllowance(capturedKobo, catalogueKobo) {
  const captured = Number(capturedKobo || 0);
  const catalogue = Number(catalogueKobo || 0);
  const variance = Math.abs(captured - catalogue);
  if (variance === 0) return true;
  if (variance > OFFLINE_DRIFT_MAX_KOBO) return false;
  // No catalogue price to measure against (a free/zero-priced line) -
  // any non-zero captured price is an unverifiable adjustment.
  if (catalogue <= 0) return false;
  return (variance / catalogue) * 100 <= OFFLINE_DRIFT_MAX_PERCENT;
}

// Validates a split-tender payment before settle.
// tenders: [{ method, amount, changeGiven }]  (kobo)
// Returns { ok, error }. The invariant: what the customer actually paid
// (amount minus any change handed back) must exactly cover the order.
export function validateTenders(tenders, totalKobo) {
  if (!Number.isSafeInteger(totalKobo) || totalKobo < 0 || totalKobo > 2_000_000_000) {
    return { ok: false, error: "Sale total is outside the supported POS range" };
  }
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
  // byMethod mixes bases - cash is net of change, non-cash is gross of it
  // - because each answers a different question (what the drawer holds vs
  // what the account received). That is kept as-is for the stored
  // snapshots and tests that encode it, with a same-basis sibling added
  // alongside so "taken by method" can actually be made to tie out.
  const byMethodApplied = {};
  const accounts = {}; // "card|Moniepoint" -> { method, provider, amount }
  let nonCashChangeOut = 0;
  // Gross cash over the counter and the change handed back out of it.
  // Both are netted into a single cash_sale movement when a sale settles,
  // so without deriving them here the Z can show the drawer total but
  // cannot say how much cash actually came in or went back out.
  let cashTenderedGross = 0;
  let cashChangeGiven = 0;
  for (const t of tenders) {
    const change = Number(t.changeGiven || 0);
    const received = t.method === "cash" ? t.amount - change : t.amount;
    byMethod[t.method] = (byMethod[t.method] || 0) + received;
    byMethodApplied[t.method] = (byMethodApplied[t.method] || 0) + (t.amount - change);
    if (t.method === "cash") {
      // Refund tenders carry a negative amount (see the returns route) and
      // never carry change; they belong on the existing refunds line, not
      // in gross takings.
      if (t.amount > 0) cashTenderedGross += t.amount;
      cashChangeGiven += change;
    }
    if (t.method !== "cash") {
      const provider = (t.provider || "").trim() || "Unspecified";
      const key = `${t.method}|${provider}`;
      const account = (accounts[key] = accounts[key] || {
        method: t.method,
        provider,
        amount: 0,
        grossReceived: 0,
        refunds: 0,
        changeGiven: 0,
        netApplied: 0,
      });
      // The provider account receives the full tender. Any change is
      // physically paid from the cash drawer, not removed from that
      // account, so keep gross and net figures separate and explicit.
      account.amount += t.amount;
      if (t.amount >= 0) account.grossReceived += t.amount;
      else account.refunds += Math.abs(t.amount);
      account.changeGiven += change;
      account.netApplied += t.amount - change;
      nonCashChangeOut += change;
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

  const drawer = computeDrawer(session.openingFloat, movements);
  const changeGivenTotal = cashChangeGiven + nonCashChangeOut;
  // Whether the derived gross/change pair actually reconciles to the
  // drawer. It must, because the ledger total is basis-invariant: a net
  // writer stores cash_sale = gross - cashChange and change_out =
  // -nonCashChange, which sums to exactly gross - allChange either way.
  // So this is false only when something is genuinely wrong - a movement
  // hand-patched in SQL, or a sale whose tender rows went missing - and
  // in that case the Z falls back to the old single net line rather than
  // printing a confident breakdown that doesn't add up.
  const cashSplitTies = (cashTenderedGross - changeGivenTotal) === (drawer.cashSales + drawer.changeOut);

  return {
    openedAt: session.openedAt,
    generatedAt: new Date().toISOString(),
    saleCount: sales.length,
    returnCount: returns.length,
    grossSales: sales.reduce((s, o) => s + Number(o.totalAmount || 0), 0),
    returnsTotal: returns.reduce((s, o) => s + Number(o.totalAmount || 0), 0), // negative
    discountsGiven: sales.reduce((s, o) => s + Number(o.discountAmount || 0), 0),
    byTenderMethod: byMethod,
    byTenderMethodApplied: byMethodApplied,
    byAccount,
    nonCashChangeOut,
    cashTenderedGross,
    cashChangeGiven,
    changeGivenTotal,
    cashSplitTies,
    cashEvents,
    drawer,
    firstSaleAt: times.length ? new Date(Math.min(...times)).toISOString() : null,
    lastSaleAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
  };
}

// ---------------------------- change float -----------------------------

// Notes BELOW this are the shop's change float, not takings.
//
// The float is the small notes kept in the drawer purely to give change.
// The shop never counts them - "if it's not up to 500 or 1000 we don't
// count it, it's for change" - so ₦500 is their own rule, and the
// note-by-note count entered at close already separates the two piles
// with no second count and no extra typing.
//
// THE RULE THAT MATTERS: the pot is excluded from the opening figure and
// from the closing count, both. It used to be excluded only at close
// while `openingFloat` was "all the cash in the drawer", and over/short
// was therefore minus the whole pot on every single shift - see
// drizzle/migrations/REGISTER-CASH-BASIS-MIGRATION.sql. Whatever changes
// here, the two sides must keep measuring the same notes.
//
// What is left over is the shift's net small-note churn: a cashier who
// breaks a ₦1,000 note into ₦100s moves ₦1,000 from the counted pile into
// the pot and the close reads ₦1,000 short, having lost nothing. That is
// irreducible without counting the pot, so it is absorbed by a tolerance
// (posOverShortReview) rather than pretended away.
export const CHANGE_FLOAT_BELOW = 500;

// Which pile a shift's openingFloat measured. Stored on the session so a
// Z report can describe itself years later, and so the pre-fix shifts
// (all of which read short by about the pot) can be labelled as such
// instead of looking like a cashier's variance.
export const OPENING_BASIS = { ALL_CASH: "all_cash", COUNTED_NOTES: "counted_notes" };

// Every row written before openingBasis existed was on the old all-cash
// basis. One place for that default, so no caller has to remember it.
export function openingBasisOf(session) {
  return session?.openingBasis || OPENING_BASIS.ALL_CASH;
}

// ₦5,000. See stores.posOverShortTolerance for why it is not tighter.
export const DEFAULT_OVER_SHORT_TOLERANCE_KOBO = 500_000;

// countBreakdown is { "1000": 2, "500": 3, "200": 4, ... } - denomination
// in naira -> how many notes. Returns both subtotals in kobo.
//
// Shared by the close screen (to show the two running subtotals as the
// cashier counts) and the close route (which is the one that decides what
// gets stored), so the two can never disagree about which notes are
// takings and which are the float.
export function splitCountBreakdown(countBreakdown) {
  let countedKobo = 0;
  let changeFloatKobo = 0;
  for (const [denom, quantity] of Object.entries(countBreakdown || {})) {
    const faceValue = Number(denom);
    const count = Number(quantity || 0);
    if (!Number.isFinite(faceValue) || !Number.isFinite(count) || count <= 0) continue;
    const kobo = Math.round(faceValue * 100) * count;
    if (faceValue >= CHANGE_FLOAT_BELOW) countedKobo += kobo;
    else changeFloatKobo += kobo;
  }
  return { countedKobo, changeFloatKobo };
}

// What a close actually counted, decided in one place.
//
// Lifted out of the close route so it can be tested without a database -
// over/short is the number staff are judged on and it had no test at all.
// A note-by-note count always wins over a client-sent total: the split is
// derived here, never trusted from the device.
export function resolveCloseCount({
  forced,
  countBreakdown,
  countedCashKobo,
  closingChangeCashKobo,
  expectedCash,
}) {
  // Couldn't count (till rush, cashier gone) - the system's own figure is
  // used, so the shift is square by construction and goes to review on
  // closeMethod alone, never on its (zero) variance.
  if (forced) {
    return { countedCash: expectedCash, closingChangeCash: null, closeMethod: "forced_uncounted" };
  }
  if (countBreakdown) {
    const split = splitCountBreakdown(countBreakdown);
    return {
      countedCash: split.countedKobo,
      closingChangeCash: split.changeFloatKobo,
      closeMethod: "blind_count",
    };
  }
  return {
    countedCash: Math.round(Number(countedCashKobo) || 0),
    // NULL, not 0: "nobody counted the pot" has to render differently from
    // "the pot was empty", and a fabricated zero would print on the Z as
    // though it were a fact.
    closingChangeCash: closingChangeCashKobo == null ? null : Math.round(Number(closingChangeCashKobo) || 0),
    closeMethod: "blind_count",
  };
}

// Does this close need the owner to look at it?
//
// Three independent reasons, and the variance is only one of them: a
// forced (uncounted) close and a provisional one (sales still unsynced)
// are flagged however well the cash adds up.
export function posOverShortReview({ overShort, forced, provisional, toleranceKobo }) {
  // A 0 / null / NaN column must not mean "flag everything" - that is the
  // behaviour this whole change exists to remove.
  const resolved = Number(toleranceKobo);
  const tolerance = Number.isFinite(resolved) && resolved > 0 ? resolved : DEFAULT_OVER_SHORT_TOLERANCE_KOBO;
  const overTolerance = Math.abs(Number(overShort) || 0) >= tolerance;
  return {
    reviewStatus: forced || provisional || overTolerance ? "pending" : "ok",
    overTolerance,
    toleranceKobo: tolerance,
  };
}
