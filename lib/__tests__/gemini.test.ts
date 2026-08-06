import { test } from "node:test";
import assert from "node:assert/strict";
import { RECORD_FIELD_KEYS, reconcileReadyForReview } from "../gemini";
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
  assert.match(result.reply, /contact person/);
  assert.match(result.reply, /phone/);
  assert.match(result.reply, /email/);
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
