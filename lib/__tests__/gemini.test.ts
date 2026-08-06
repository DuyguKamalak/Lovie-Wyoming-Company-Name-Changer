import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECORD_FIELD_KEYS,
  reconcileReadyForReview,
  isValidApprovalValue,
  getApiKeys,
  isTransientError,
} from "../gemini";
import { LLC_REQUIRED_KEYS, CORP_REQUIRED_KEYS } from "../validation";

const COMPLETE_LLC_FIELDS: Record<string, string> = {
  currentName: "Acme Ventures LLC",
  dateOfOriginalFiling: "01/15/2020",
  articleNumber: "1",
  newName: "Acme Holdings LLC",
  amendmentText: "Article 1. The name of the limited liability company is Acme Holdings LLC.",
  signatureDate: "08/06/2026",
  signerName: "Jordan Smith",
  signerTitle: "Manager",
  contactPerson: "Jordan Smith",
  phone: "307-555-0100",
  email: "jordan@example.com",
};

// Regression guard for the exact bug hit during T008 manual testing: the
// agent invented a plausible-but-wrong field key ("currentLegalName"
// instead of "currentName") when record_field's schema didn't constrain
// it. RECORD_FIELD_KEYS is that constraint — this test fails loudly if it
// ever drifts out of sync with the real LlcFields/CorpFields keys that
// lib/pdf/fill*.ts and the review screen actually read.
test("record_field's enum covers every LlcFields and CorpFields key", () => {
  const required = new Set<string>([...LLC_REQUIRED_KEYS, ...CORP_REQUIRED_KEYS]);
  const declared = new Set<string>(RECORD_FIELD_KEYS);
  for (const key of required) {
    assert.ok(declared.has(key), `record_field enum is missing "${key}"`);
  }
});

// Regression test for a real user-reported bug: given one dense message
// stating several fields at once, the model recorded some (signerTitle)
// but silently skipped others (signerName, contactPerson, phone, email),
// then called mark_ready_for_review anyway. reconcileReadyForReview is the
// safety net that catches this regardless of prompt compliance.
test("reconcileReadyForReview overrides readyForReview when fields are actually missing", () => {
  const incomplete = { ...COMPLETE_LLC_FIELDS };
  delete (incomplete as Record<string, string | undefined>).signerName;
  delete (incomplete as Record<string, string | undefined>).contactPerson;
  delete (incomplete as Record<string, string | undefined>).phone;
  delete (incomplete as Record<string, string | undefined>).email;

  const result = reconcileReadyForReview("llc", incomplete, true, "All set, taking you to review!");

  assert.equal(result.readyForReview, false);
  assert.match(result.reply, /signer name/);
});

// Regression guard for a second real bug found alongside the one above:
// once the model was caught skipping fields, the fallback asked about every
// missing one in a single combined message ("signer name, contact person,
// phone, email"), which broke the one-question-at-a-time pattern used
// everywhere else in the conversation. Each call should surface only the
// next missing field; later calls (once earlier ones are filled in) move on
// to the next.
test("reconcileReadyForReview asks about only the first missing field, one at a time", () => {
  const incomplete = { ...COMPLETE_LLC_FIELDS };
  delete (incomplete as Record<string, string | undefined>).signerName;
  delete (incomplete as Record<string, string | undefined>).contactPerson;
  delete (incomplete as Record<string, string | undefined>).phone;
  delete (incomplete as Record<string, string | undefined>).email;

  const first = reconcileReadyForReview("llc", incomplete, true, "All set!");
  assert.match(first.reply, /signer name/);
  assert.doesNotMatch(first.reply, /contact person/);
  assert.doesNotMatch(first.reply, /phone/);
  assert.doesNotMatch(first.reply, /email/);

  const afterSignerName = { ...incomplete, signerName: "Jordan Smith" };
  const second = reconcileReadyForReview("llc", afterSignerName, true, "All set!");
  assert.match(second.reply, /contact person/);
});

test("reconcileReadyForReview leaves readyForReview true when everything is actually present", () => {
  const result = reconcileReadyForReview("llc", COMPLETE_LLC_FIELDS, true, "All set!");
  assert.equal(result.readyForReview, true);
  assert.equal(result.reply, "All set!");
});

test("reconcileReadyForReview is a no-op when the model didn't claim ready anyway", () => {
  const result = reconcileReadyForReview("llc", {}, false, "What's the current name?");
  assert.equal(result.readyForReview, false);
  assert.equal(result.reply, "What's the current name?");
});

// Regression guard for a real user-reported bug: the model asked the
// amendment-text confirmation and the Corp approval question in one
// combined message, the user replied with a bare "yes" (which only
// answers the text confirmation), and the model recorded an approval
// value anyway — risking the wrong checkbox on the actual mailed form.
// isValidApprovalValue is the server-side backstop: record_field rejects
// anything that isn't one of the three canonical values fillCorp.ts's
// APPROVAL_CHECKBOX actually knows how to map to a checkbox.
test("isValidApprovalValue accepts only the three canonical values", () => {
  assert.equal(isValidApprovalValue("incorporators"), true);
  assert.equal(isValidApprovalValue("board"), true);
  assert.equal(isValidApprovalValue("shareholders"), true);
  assert.equal(isValidApprovalValue("yes"), false);
  assert.equal(isValidApprovalValue(""), false);
  assert.equal(isValidApprovalValue("Incorporators"), false);
});

// getApiKeys backs runIntakeAgent's same-day quota fallback: a second free
// Google AI Studio key (GEMINI_API_KEY_FALLBACK) the app switches to on a
// 429 from the primary. These tests guard the env-parsing edge cases —
// unset/blank fallback shouldn't produce a bogus second entry, and a
// missing primary key should still throw the same clear error as before
// this feature existed.
test("getApiKeys", async (t) => {
  const ORIGINAL_KEY = process.env.GEMINI_API_KEY;
  const ORIGINAL_FALLBACK = process.env.GEMINI_API_KEY_FALLBACK;
  t.after(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = ORIGINAL_KEY;
    if (ORIGINAL_FALLBACK === undefined) delete process.env.GEMINI_API_KEY_FALLBACK;
    else process.env.GEMINI_API_KEY_FALLBACK = ORIGINAL_FALLBACK;
  });

  await t.test("returns just the primary key when no fallback is set", () => {
    process.env.GEMINI_API_KEY = "primary-key";
    delete process.env.GEMINI_API_KEY_FALLBACK;
    assert.deepEqual(getApiKeys(), ["primary-key"]);
  });

  await t.test("returns both keys in order when a fallback is set", () => {
    process.env.GEMINI_API_KEY = "primary-key";
    process.env.GEMINI_API_KEY_FALLBACK = "fallback-key";
    assert.deepEqual(getApiKeys(), ["primary-key", "fallback-key"]);
  });

  await t.test("ignores a blank fallback instead of returning an empty-string key", () => {
    process.env.GEMINI_API_KEY = "primary-key";
    process.env.GEMINI_API_KEY_FALLBACK = "   ";
    assert.deepEqual(getApiKeys(), ["primary-key"]);
  });

  await t.test("throws when no key is configured at all", () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY_FALLBACK;
    assert.throws(() => getApiKeys(), /GEMINI_API_KEY is not set/);
  });
});

// Regression guard for a real user report: a live chat request failed with
// a 500 that didn't reproduce locally replaying the identical
// conversation — consistent with a one-off network blip or a transient
// error from Gemini's own servers, not an actual bug in the request.
// isTransientError decides which failures runIntakeAgent retries once
// (same key) before giving up.
test("isTransientError", () => {
  assert.equal(isTransientError(undefined), true); // network-level failure, no HTTP response at all
  assert.equal(isTransientError(500), true);
  assert.equal(isTransientError(503), true);
  assert.equal(isTransientError(599), true);
  assert.equal(isTransientError(429), false); // handled separately by the key-fallback path
  assert.equal(isTransientError(400), false); // bad request — retrying won't help
  assert.equal(isTransientError(401), false); // invalid key — retrying won't help
  assert.equal(isTransientError(404), false);
});
