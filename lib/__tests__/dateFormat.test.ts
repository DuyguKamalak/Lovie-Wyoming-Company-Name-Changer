import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDate, getTodayFormatted, isValidDate, isNotFutureDate } from "../dateFormat";

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

// Regression guard: normalizeDate's "already mm/dd/yyyy" fast path only
// checks digit shape, so an impossible date like "13/45/2020" would pass
// through unchanged and land on the legal document. isValidDate is the
// calendar-validity backstop record_field runs after normalizing.
test("isValidDate", () => {
  assert.equal(isValidDate("08/01/2026"), true);
  assert.equal(isValidDate("8/1/2026"), true);
  assert.equal(isValidDate("02/29/2024"), true); // real leap day
  assert.equal(isValidDate("13/45/2020"), false); // month 13, day 45
  assert.equal(isValidDate("02/30/2026"), false); // no Feb 30
  assert.equal(isValidDate("02/29/2026"), false); // 2026 isn't a leap year
  assert.equal(isValidDate("not a date"), false);
  assert.equal(isValidDate(""), false);
});

// dateOfOriginalFiling and amendmentDate both describe something that
// already happened, so a future date is always a mistake — typically a
// mistyped year, which isValidDate alone would happily pass through onto a
// state filing. signatureDate is exempt (a user may post-date a signature).
test("isNotFutureDate", () => {
  assert.equal(isNotFutureDate("01/15/2020"), true);
  assert.equal(isNotFutureDate(getTodayFormatted()), true); // today counts as not-future
  const nextYear = new Date().getFullYear() + 1;
  assert.equal(isNotFutureDate(`01/15/${nextYear}`), false);
  assert.equal(isNotFutureDate("not a date"), false);
});
