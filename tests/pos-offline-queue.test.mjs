import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";

import {
  claimSale,
  enqueueSale,
  flushQueue,
  listQueuedSales,
  releaseSale,
} from "../lib/posOffline.js";

// The offline sale queue is the only copy of money that has already
// changed hands at the counter, so the rules below are about never
// stranding one and never sending it twice. See lib/posOffline.js.

const STORE_ID = "queue-test-store";
const CASHIER = "cashier-1";

function deleteTestDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("storezn-pos");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Test database deletion was blocked"));
  });
}

const sale = (key) => ({ idempotencyKey: key, sessionId: "sess-1", items: [], tenders: [] });

// apiFetch stand-in. `fail` returns the error to throw for each call.
function fakeApi(fail) {
  const calls = [];
  return {
    calls,
    apiFetch: async (url, options) => {
      calls.push({ url, options });
      const err = fail(calls.length);
      if (err) throw err;
      return { ok: true };
    },
  };
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function networkError() {
  // What useApi throws when fetch() never reached the server.
  return new Error("Couldn't reach the server. Check your internet connection and try again.");
}

test("a connectivity failure does not count as an attempt", async () => {
  await deleteTestDatabase();
  await enqueueSale(STORE_ID, sale("net-1"), CASHIER);

  const { apiFetch } = fakeApi(() => networkError());
  const result = await flushQueue(STORE_ID, apiFetch, { actorId: CASHIER });

  assert.equal(result.synced, 0);
  const [queued] = await listQueuedSales(STORE_ID);
  // attempts drives the retry backoff (up to 30 minutes) and the "stuck"
  // warning. A dead uplink is neither the sale's fault nor something a
  // longer wait fixes - counting it is what left good sales sitting for
  // half an hour after the network came back.
  assert.equal(queued.attempts, 0, "a network failure must not grow the backoff");
  assert.equal(queued.status, undefined, "a network failure is not a rejection");
});

test("a 4xx is terminal: marked rejected and skipped on the next run", async () => {
  await deleteTestDatabase();
  await enqueueSale(STORE_ID, sale("bad-1"), CASHIER);

  const first = fakeApi(() => httpError(409, "Offline sale timestamp is outside this register shift"));
  const rejectedRun = await flushQueue(STORE_ID, first.apiFetch, { actorId: CASHIER });
  assert.equal(rejectedRun.rejected, 1);

  const [queued] = await listQueuedSales(STORE_ID);
  assert.equal(queued.status, "rejected");
  assert.match(queued.rejectedReason, /outside this register shift/);

  // Retrying on a timer can never change the server's answer, so it must
  // stop being retried - otherwise it keeps every close provisional.
  const second = fakeApi(() => null);
  await flushQueue(STORE_ID, second.apiFetch, { actorId: CASHIER });
  assert.equal(second.calls.length, 0, "a rejected sale must not be retried automatically");

  // ...but an explicit retry still reaches the server.
  const third = fakeApi(() => null);
  const retried = await flushQueue(STORE_ID, third.apiFetch, { actorId: CASHIER, force: true, includeRejected: true });
  assert.equal(third.calls.length, 1);
  assert.equal(retried.synced, 1);
});

test("a 5xx keeps retrying and does count as an attempt", async () => {
  await deleteTestDatabase();
  await enqueueSale(STORE_ID, sale("srv-1"), CASHIER);

  const { apiFetch } = fakeApi(() => httpError(502, "The server had a problem. Please try again in a moment."));
  await flushQueue(STORE_ID, apiFetch, { actorId: CASHIER });

  const [queued] = await listQueuedSales(STORE_ID);
  assert.equal(queued.attempts, 1, "a server fault should back off");
  assert.notEqual(queued.status, "rejected", "a 5xx is not the sale's fault - it must stay retryable");
});

test("a forced flush is not swallowed by an unforced one already running", async () => {
  await deleteTestDatabase();
  await enqueueSale(STORE_ID, sale("force-1"), CASHIER);

  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const calls = [];
  const slowApi = async (url) => { calls.push(url); await gate; return { ok: true }; };

  // Unforced tick starts and is still in flight...
  const unforced = flushQueue(STORE_ID, slowApi, { actorId: CASHIER });
  // ...the cashier presses Sync. It must actually run, not be handed the
  // in-flight promise: that made the one lever they have a no-op exactly
  // when the queue was backed off.
  const forced = flushQueue(STORE_ID, slowApi, { actorId: CASHIER, force: true });
  assert.notEqual(unforced, forced, "forced and unforced must be distinct runs");

  release();
  await unforced;
  await forced;
});

test("a sale claimed by a live POST is skipped by the background flush", async () => {
  await deleteTestDatabase();
  await enqueueSale(STORE_ID, sale("claim-1"), CASHIER);
  await claimSale("claim-1");

  // Both copies share an idempotency key, but the queued payload carries
  // capturedLineTotal while the live one is server-priced - so whichever
  // committed first would silently decide the receipt total.
  const skipped = fakeApi(() => null);
  await flushQueue(STORE_ID, skipped.apiFetch, { actorId: CASHIER, force: true });
  assert.equal(skipped.calls.length, 0, "a sale being POSTed live must not be sent twice");

  await releaseSale("claim-1");
  const after = fakeApi(() => null);
  const result = await flushQueue(STORE_ID, after.apiFetch, { actorId: CASHIER, force: true });
  assert.equal(after.calls.length, 1, "releasing hands it straight back to the flush");
  assert.equal(result.synced, 1);
});

test("another cashier's sale is reported, never silently sent as you", async () => {
  await deleteTestDatabase();
  await enqueueSale(STORE_ID, sale("theirs-1"), "cashier-2");

  const { apiFetch, calls } = fakeApi(() => null);
  const result = await flushQueue(STORE_ID, apiFetch, { actorId: CASHIER, force: true });

  // The server stamps soldBy from the bearer token, so pushing it here
  // would book another cashier's takings against this one.
  assert.equal(calls.length, 0);
  assert.equal(result.blocked, 1);
  assert.equal(result.remaining, 1);
});
