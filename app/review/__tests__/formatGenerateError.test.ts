import { test } from "node:test";
import assert from "node:assert/strict";
import { formatGenerateError } from "../formatGenerateError";
import { LLC_FIELD_CONFIG } from "../fieldConfig";

test("lists missing fields by their review-screen label, not raw key", () => {
  const message = formatGenerateError({ error: "Missing required fields.", missing: ["amendmentText"] }, LLC_FIELD_CONFIG);
  assert.match(message, /Amendment text/);
  assert.doesNotMatch(message, /amendmentText/);
});

test("falls back to the raw error when there's no missing list", () => {
  const message = formatGenerateError({ error: "Something else went wrong." }, LLC_FIELD_CONFIG);
  assert.equal(message, "Something else went wrong.");
});

test("falls back to a generic message when there's nothing usable at all", () => {
  const message = formatGenerateError({}, LLC_FIELD_CONFIG);
  assert.match(message, /Couldn't generate the PDF/);
});
