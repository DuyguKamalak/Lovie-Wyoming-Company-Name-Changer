import { test } from "node:test";
import assert from "node:assert/strict";
import { RECORD_FIELD_KEYS } from "../gemini";
import { LLC_REQUIRED_KEYS, CORP_REQUIRED_KEYS } from "../validation";

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
