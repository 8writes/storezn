import test from "node:test";
import assert from "node:assert/strict";
import { parsePagination } from "../lib/pagination.js";

test("pagination defaults to and caps at 20 rows", () => {
  assert.deepEqual(parsePagination(new URLSearchParams()), { page: 1, pageSize: 20, limit: 20, offset: 0 });
  assert.equal(parsePagination(new URLSearchParams("page=3&pageSize=100")).pageSize, 20);
  assert.equal(parsePagination(new URLSearchParams("page=2&pageSize=7")).offset, 7);
});
