import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECORD_FIELD_KEYS,
  reconcileReadyForReview,
  isValidApprovalValue,
  getApiKeys,
  isTransientError,
  isKeyLevelFailure,
  entityScopeError,
  type ChatMessage,
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
  // Phrasing comes from the field plan now, not from humanizing the key.
  assert.match(result.reply, /signing the amendment/i);
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
  assert.match(first.reply, /signing the amendment/i);
  assert.doesNotMatch(first.reply, /contact/i);
  assert.doesNotMatch(first.reply, /phone/i);
  assert.doesNotMatch(first.reply, /email/i);

  // signerTitle comes next in the plan, then the contact fields — still one
  // question per call, never a combined list.
  const afterSigner = { ...incomplete, signerName: "Jordan Smith", signerTitle: "Manager" };
  const second = reconcileReadyForReview("llc", afterSigner, true, "All set!");
  assert.match(second.reply, /contact/i);
  assert.doesNotMatch(second.reply, /phone/i);
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
const COMPLETE_CORP_FIELDS: Record<string, string> = {
  currentName: "Acme Ventures, Inc.",
  articleNumber: "1",
  newName: "Acme Holdings, Inc.",
  amendmentText: "Article 1. The name of the corporation is Acme Holdings, Inc.",
  amendmentDate: "07/01/2026",
  approval: "shareholders",
  signatureDate: "08/06/2026",
  signerName: "Jordan Smith",
  signerTitle: "President",
  contactPerson: "Jordan Smith",
  phone: "307-555-0100",
  email: "jordan@example.com",
};

// Regression guard for a reproduced bug: humanizeFieldKey turned a missing
// `approval` into the question "What's the approval?" — a bare key name
// standing in for a three-way legal choice, with none of the three options
// offered. Which checkbox gets checked is a real legal fact (agent.md rule
// 8), so this one field needs its own phrasing and its own chips.
test("reconcileReadyForReview asks the approval question in plain language, with chips", () => {
  const incomplete = { ...COMPLETE_CORP_FIELDS };
  delete (incomplete as Record<string, string | undefined>).approval;

  const result = reconcileReadyForReview("corp", incomplete, true, "All set!");

  assert.equal(result.readyForReview, false);
  assert.doesNotMatch(result.reply, /What's the approval\?/);
  assert.match(result.reply, /shares/i);
  assert.equal(result.suggestedReplies?.length, 3);
});

// Regression guard for the stale-chip bug class documented in
// runIntakeAgent's tool loop: when reconciliation throws away the model's
// reply and asks its own question instead, the chips the model offered
// belonged to the *discarded* text and must not ship with the new question.
test("reconcileReadyForReview drops the model's chips when it overrides the reply", () => {
  const incomplete = { ...COMPLETE_LLC_FIELDS };
  delete (incomplete as Record<string, string | undefined>).signerName;

  const result = reconcileReadyForReview("llc", incomplete, true, "All set!", {
    suggestedReplies: ["Yes", "No"],
  });

  assert.match(result.reply, /signing the amendment/i);
  assert.equal(result.suggestedReplies, null);
});

test("reconcileReadyForReview passes the model's chips through when it doesn't intervene", () => {
  const result = reconcileReadyForReview("llc", COMPLETE_LLC_FIELDS, true, "All set!", {
    suggestedReplies: ["Yes", "No"],
  });

  assert.equal(result.readyForReview, true);
  assert.deepEqual(result.suggestedReplies, ["Yes", "No"]);
});

// Regression guard for a reproduced bug in the Corp flow: given one dense
// opening message, the model composed and record_field'd amendmentText,
// asked the approval question, and later called mark_ready_for_review —
// without ever showing the user the exact text that gets mailed to the
// state. agent.md rule 6 requires reading it back and getting confirmation;
// looksLikeAmendmentText checks the *wording* at record time, but nothing
// checked that the user ever saw it.
test("reconcileReadyForReview withholds ready until the amendment text was read back", () => {
  const history: ChatMessage[] = [
    { role: "user", text: "I have a Wyoming Corporation, Acme Ventures, Inc." },
    { role: "assistant", text: "How was this amendment approved?" },
    { role: "user", text: "Shares were issued and the shareholders approved it" },
  ];

  const result = reconcileReadyForReview("corp", COMPLETE_CORP_FIELDS, true, "All set!", { history });

  assert.equal(result.readyForReview, false);
  assert.match(result.reply, /Article 1\. The name of the corporation is Acme Holdings, Inc\./);
  assert.equal(result.suggestedReplies?.length, 2);
});

test("reconcileReadyForReview honors ready once the text has been read back", () => {
  const history: ChatMessage[] = [
    {
      role: "assistant",
      text: "Here it is:\n\n> **Article 1.** The name of the corporation is Acme Holdings, Inc.\n\nLook right?",
    },
    { role: "user", text: "yes" },
  ];

  const result = reconcileReadyForReview("corp", COMPLETE_CORP_FIELDS, true, "All set!", { history });

  assert.equal(result.readyForReview, true);
  assert.equal(result.reply, "All set!");
});


// Regression guard: record_field's enum is a flat list of every key across
// both entity types, so nothing stopped the model from recording `approval`
// or `amendmentDate` in an LLC conversation (or `dateOfOriginalFiling` in a
// Corp one) — values that then sit in knownFields unused, or get asked about
// in a flow where they aren't part of the form (agent.md rule 4). Also
// guards set_entity_type's documented precondition: record_field must not be
// accepted before the entity type is known, since every other validation
// (company-name designators especially) depends on it.
test("entityScopeError rejects fields that don't belong to the active entity type", () => {
  assert.equal(entityScopeError("llc", "currentName"), null);
  assert.equal(entityScopeError("llc", "dateOfOriginalFiling"), null);
  assert.equal(entityScopeError("corp", "amendmentDate"), null);
  assert.equal(entityScopeError("corp", "approval"), null);

  assert.match(String(entityScopeError("llc", "approval")), /llc/i);
  assert.match(String(entityScopeError("llc", "amendmentDate")), /llc/i);
  assert.match(String(entityScopeError("corp", "dateOfOriginalFiling")), /corp/i);
});

test("entityScopeError rejects any record_field before set_entity_type", () => {
  assert.match(String(entityScopeError(null, "currentName")), /set_entity_type/);
});

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
  const ORIGINAL = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_API_KEY_FALLBACK: process.env.GEMINI_API_KEY_FALLBACK,
    GEMINI_API_KEYS: process.env.GEMINI_API_KEYS,
  };
  const reset = () => {
    for (const name of Object.keys(ORIGINAL)) delete process.env[name];
  };
  t.after(() => {
    for (const [name, value] of Object.entries(ORIGINAL)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  await t.test("returns just the primary key when nothing else is set", () => {
    reset();
    process.env.GEMINI_API_KEY = "primary-key";
    assert.deepEqual(getApiKeys(), ["primary-key"]);
  });

  await t.test("returns both keys in order when a fallback is set", () => {
    reset();
    process.env.GEMINI_API_KEY = "primary-key";
    process.env.GEMINI_API_KEY_FALLBACK = "fallback-key";
    assert.deepEqual(getApiKeys(), ["primary-key", "fallback-key"]);
  });

  await t.test("ignores a blank fallback instead of returning an empty-string key", () => {
    reset();
    process.env.GEMINI_API_KEY = "primary-key";
    process.env.GEMINI_API_KEY_FALLBACK = "   ";
    assert.deepEqual(getApiKeys(), ["primary-key"]);
  });

  // Free-tier capacity is per key and capped per *minute*, so the only
  // real lever for more headroom is more keys — hence an open-ended list
  // rather than a fixed primary/fallback pair.
  await t.test("accepts an arbitrary number of keys via GEMINI_API_KEYS", () => {
    reset();
    process.env.GEMINI_API_KEYS = "key-a,key-b,key-c";
    assert.deepEqual(getApiKeys(), ["key-a", "key-b", "key-c"]);
  });

  await t.test("merges all sources and trims surrounding whitespace", () => {
    reset();
    process.env.GEMINI_API_KEY = "primary-key";
    process.env.GEMINI_API_KEY_FALLBACK = "fallback-key";
    process.env.GEMINI_API_KEYS = " extra-1 , extra-2 ,, ";
    assert.deepEqual(getApiKeys(), ["primary-key", "fallback-key", "extra-1", "extra-2"]);
  });

  // A duplicate would otherwise burn a failover attempt on a key already
  // known to be failing this request.
  await t.test("de-duplicates a key listed in more than one source", () => {
    reset();
    process.env.GEMINI_API_KEY = "same-key";
    process.env.GEMINI_API_KEYS = "same-key,other-key";
    assert.deepEqual(getApiKeys(), ["same-key", "other-key"]);
  });

  await t.test("throws when no key is configured at all", () => {
    reset();
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

// Regression guard for the actual root cause of a real production 500,
// diagnosed from the project's Gemini dashboard: the primary key hit its
// per-minute rate limit (429 — the dashboard showed 17/15 RPM peak against
// only 115/500 RPD, so the *minute* window was the binding constraint, not
// the day), the code failed over to the configured spare key, and that
// key's Google project turned out to be restricted ("set up billing to
// continue") — returning 403 on every single call, verified 8/8. 403
// wasn't treated as a key-level failure, so it was thrown straight through
// as "The assistant failed to respond" instead of falling back to the key
// that would have recovered moments later.
test("isKeyLevelFailure covers every status that means 'this key can't serve the request'", () => {
  assert.equal(isKeyLevelFailure(429), true); // rate limited / out of quota
  assert.equal(isKeyLevelFailure(403), true); // project restricted or denied
  assert.equal(isKeyLevelFailure(401), true); // key rejected
  // Not key-level: another key would fail these identically.
  assert.equal(isKeyLevelFailure(400), false); // malformed request
  assert.equal(isKeyLevelFailure(404), false); // unknown model
  assert.equal(isKeyLevelFailure(500), false); // Gemini server error (transient instead)
  assert.equal(isKeyLevelFailure(undefined), false); // network blip (transient instead)
});

// The two classifiers must stay mutually exclusive: a status handled as
// both would either double-retry or short-circuit the failover walk.
test("transient and key-level failure classes never overlap", () => {
  for (const status of [undefined, 400, 401, 403, 404, 429, 500, 502, 503]) {
    assert.equal(
      isTransientError(status) && isKeyLevelFailure(status),
      false,
      `status ${status} is classified as both transient and key-level`
    );
  }
});
