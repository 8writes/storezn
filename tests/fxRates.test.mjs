import test from "node:test";
import assert from "node:assert/strict";
import { STALE_AFTER_MS, chooseRate, extractRate, isPlausibleRate } from "../lib/fxRates.js";
import { formatUsd, formatUsdFromNgn, isFxProvider, ngnToUsd, rateAge } from "../lib/fxDisplay.js";

// ---------------------------------------------------------------------
// Display-only USD prices. Nothing here decides what a customer pays -
// Paystack always charges the naira the vendor set.
// ---------------------------------------------------------------------

test("Wise's response yields naira per dollar", () => {
  assert.equal(extractRate("wise", [{ rate: 1550.25, source: "USD", target: "NGN", time: "2026-10-19T10:00:00+0000" }]), 1550.25);
});

test("a Wise response for the wrong pair is rejected, not misread", () => {
  // e.g. NGN->USD would give 0.000645 - the direction matters.
  assert.ok(Number.isNaN(extractRate("wise", [{ rate: 0.000645, source: "NGN", target: "USD" }])));
  assert.ok(Number.isNaN(extractRate("wise", [])));
  assert.ok(Number.isNaN(extractRate("wise", { error: "unauthorised" })));
});

test("the market-rate response yields naira per dollar", () => {
  assert.equal(extractRate("market", { result: "success", base_code: "USD", rates: { NGN: 1548.9, EUR: 0.92 } }), 1548.9);
  assert.ok(Number.isNaN(extractRate("market", { result: "error", "error-type": "quota-reached" })));
  assert.ok(Number.isNaN(extractRate("market", { result: "success", base_code: "EUR", rates: { NGN: 1700 } })));
});

test("an unknown provider never produces a rate", () => {
  assert.ok(Number.isNaN(extractRate("nope", { rate: 1500 })));
});

test("implausible rates are refused before they reach a storefront", () => {
  assert.equal(isPlausibleRate(1550), true);
  assert.equal(isPlausibleRate(0), false);
  assert.equal(isPlausibleRate(-1550), false);
  assert.equal(isPlausibleRate(1), false); // a sandbox / wrong-direction figure
  assert.equal(isPlausibleRate(NaN), false);
  assert.equal(isPlausibleRate(5_000_000), false);
});

test("a huge jump between fetches is treated as a bad response", () => {
  assert.equal(isPlausibleRate(1600, 1550), true);
  assert.equal(isPlausibleRate(3200, 1550), false); // +106% in an hour
  assert.equal(isPlausibleRate(700, 1550), false);  // -55%
  assert.equal(isPlausibleRate(1600, null), true);  // first ever fetch
});

const NOW = new Date("2026-10-19T12:00:00Z").getTime();
const hoursAgo = (h) => new Date(NOW - h * 3_600_000);

test("the store's chosen provider is used while its rate is fresh", () => {
  const rows = [
    { provider: "wise", ngnPerUnit: 1550, fetchedAt: hoursAgo(1) },
    { provider: "market", ngnPerUnit: 1540, fetchedAt: hoursAgo(1) },
  ];
  const chosen = chooseRate(rows, "market", NOW);
  assert.equal(chosen.provider, "market");
  assert.equal(chosen.rate, 1540);
  assert.equal(chosen.isFallback, false);
});

test("a stale or missing chosen rate falls back to the other provider", () => {
  const rows = [
    { provider: "wise", ngnPerUnit: 1550, fetchedAt: new Date(NOW - STALE_AFTER_MS - 1) },
    { provider: "market", ngnPerUnit: 1540, fetchedAt: hoursAgo(2) },
  ];
  const chosen = chooseRate(rows, "wise", NOW);
  assert.equal(chosen.provider, "market");
  assert.equal(chosen.isFallback, true);
  assert.equal(chooseRate([{ provider: "market", ngnPerUnit: 1540, fetchedAt: hoursAgo(2) }], "wise", NOW).provider, "market");
});

test("with no fresh rate anywhere there is nothing to show", () => {
  assert.equal(chooseRate([], "wise", NOW), null);
  assert.equal(chooseRate([{ provider: "wise", ngnPerUnit: 1550, fetchedAt: hoursAgo(72) }], "wise", NOW), null);
});

test("naira converts to dollars and formats to the cent", () => {
  assert.equal(ngnToUsd(15_000, 1550).toFixed(4), "9.6774");
  assert.equal(formatUsdFromNgn(15_000, 1550), "$9.68");
  assert.equal(formatUsdFromNgn(1_550_000, 1550), "$1,000.00");
  assert.equal(formatUsd(0), "$0.00");
});

test("an unusable rate shows nothing rather than $NaN or $Infinity", () => {
  assert.equal(ngnToUsd(15_000, 0), null);
  assert.equal(ngnToUsd(15_000, null), null);
  assert.equal(formatUsdFromNgn(15_000, undefined), "");
  assert.equal(formatUsdFromNgn("abc", 1550), "");
});

test("only registered providers are accepted", () => {
  assert.equal(isFxProvider("wise"), true);
  assert.equal(isFxProvider("market"), true);
  assert.equal(isFxProvider("aboki"), false);
  assert.equal(isFxProvider("__proto__"), false);
});

test("rate age reads naturally", () => {
  assert.equal(rateAge(hoursAgo(0), NOW), "just now");
  assert.equal(rateAge(new Date(NOW - 25 * 60_000), NOW), "25m ago");
  assert.equal(rateAge(hoursAgo(3), NOW), "3h ago");
  assert.equal(rateAge(hoursAgo(72), NOW), "3d ago");
});

// ---------------------------------------------------------------------
// The old manual "Storezn rate" is retired - a store still pointing at it,
// or a leftover row, must never be served.
// ---------------------------------------------------------------------

test("a store still set to the retired manual rate gets the market rate", () => {
  const rows = [
    { provider: "manual", ngnPerUnit: 1550, fetchedAt: hoursAgo(1) },
    { provider: "market", ngnPerUnit: 1330, fetchedAt: hoursAgo(1) },
  ];
  const chosen = chooseRate(rows, "manual", NOW);
  assert.equal(chosen.provider, "market");
  assert.equal(chosen.rate, 1330);
  assert.equal(chosen.isFallback, false);
});

test("a store set to Wise with no Wise rate falls back to the market rate", () => {
  const rows = [
    { provider: "manual", ngnPerUnit: 1550, fetchedAt: hoursAgo(1) },
    { provider: "market", ngnPerUnit: 1330, fetchedAt: hoursAgo(1) },
  ];
  const chosen = chooseRate(rows, "wise", NOW);
  assert.equal(chosen.provider, "market");
  assert.equal(chosen.isFallback, true);
});

test("a store that picked the market rate still gets the market rate", () => {
  const rows = [
    { provider: "manual", ngnPerUnit: 1550, fetchedAt: hoursAgo(5) },
    { provider: "market", ngnPerUnit: 1330, fetchedAt: hoursAgo(1) },
  ];
  assert.equal(chooseRate(rows, "market", NOW).provider, "market");
});

test("the manual rate is no longer a selectable source", () => {
  assert.equal(isFxProvider("manual"), false);
});
