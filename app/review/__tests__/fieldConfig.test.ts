import { test } from "node:test";
import assert from "node:assert/strict";
import { LLC_FIELD_CONFIG, CORP_FIELD_CONFIG, fieldConfigFor } from "../fieldConfig";
import { LLC_REQUIRED_KEYS, CORP_REQUIRED_KEYS } from "@/lib/validation";
import { RECORD_FIELD_KEYS } from "@/lib/gemini";

// Regression guard: the review screen's field list must show every
// required field (spec.md FR-003 — nothing gets silently left off the
// review screen) and every key it renders must be one the agent actually
// knows how to fill in (RECORD_FIELD_KEYS).

test("LLC field config covers every LLC_REQUIRED_KEYS entry", () => {
  const configKeys = new Set(LLC_FIELD_CONFIG.map((f) => f.key));
  for (const key of LLC_REQUIRED_KEYS) {
    assert.ok(configKeys.has(key), `LLC review form is missing "${key}"`);
  }
});

test("Corp field config covers every CORP_REQUIRED_KEYS entry except approval", () => {
  const configKeys = new Set(CORP_FIELD_CONFIG.map((f) => f.key));
  for (const key of CORP_REQUIRED_KEYS) {
    if (key === "approval") continue; // rendered separately as a 3-way choice
    assert.ok(configKeys.has(key), `Corp review form is missing "${key}"`);
  }
});

test("every configured field key is one the agent can actually record", () => {
  const declared = new Set<string>(RECORD_FIELD_KEYS);
  for (const field of [...LLC_FIELD_CONFIG, ...CORP_FIELD_CONFIG]) {
    assert.ok(declared.has(field.key), `"${field.key}" is not in RECORD_FIELD_KEYS`);
  }
});

test("fieldConfigFor routes to the right list per entity type", () => {
  assert.equal(fieldConfigFor("llc"), LLC_FIELD_CONFIG);
  assert.equal(fieldConfigFor("corp"), CORP_FIELD_CONFIG);
});
