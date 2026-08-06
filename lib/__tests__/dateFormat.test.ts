import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDate } from "../dateFormat";

// Regression test for the exact bug found in T014 manual QA: the agent
// recorded "2026-08-01" instead of "08/01/2026" for a Corp amendment
// date, and it made it all the way into the downloaded PDF before being
// caught by manually reading the output.

test("already mm/dd/yyyy passes through unchanged", () => {
  assert.equal(normalizeDate("08/01/2026"), "08/01/2026");
  assert.equal(normalizeDate("8/1/2026"), "8/1/2026");
});

test("ISO yyyy-mm-dd is converted to mm/dd/yyyy", () => {
  assert.equal(normalizeDate("2026-08-01"), "08/01/2026");
});

test("natural-language dates are converted to mm/dd/yyyy", () => {
  assert.equal(normalizeDate("August 1, 2026"), "08/01/2026");
});

test("unparseable input is left as-is rather than guessed", () => {
  assert.equal(normalizeDate("sometime next week"), "sometime next week");
});
