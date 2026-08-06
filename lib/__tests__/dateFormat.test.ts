import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDate, getTodayFormatted } from "../dateFormat";

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

// Regression test for a real user-reported hallucination: the model
// invented "01/15/2023" as a signatureDate the user never gave it.
// getTodayFormatted() is the deterministic replacement — the caller
// pre-fills the field in code so the model never has to guess it at all.
test("getTodayFormatted returns mm/dd/yyyy matching the real current date", () => {
  const now = new Date();
  const expected = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;
  assert.equal(getTodayFormatted(), expected);
  assert.match(getTodayFormatted(), /^\d{2}\/\d{2}\/\d{4}$/);
});
