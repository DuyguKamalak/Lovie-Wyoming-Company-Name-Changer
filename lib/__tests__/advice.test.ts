import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeAdviceRequest } from "../advice";

// agent.md rule 2: the tool must say plainly that it can't advise, and point
// at a lawyer or accountant. The rule used to live in the system prompt;
// since the model no longer writes anything the user reads, the detection
// has to be deterministic.
test("recognises the questions rule 2 is about", () => {
  assert.equal(looksLikeAdviceRequest("should I do a DBA instead?"), true);
  assert.equal(looksLikeAdviceRequest("will this affect my taxes?"), true);
  assert.equal(looksLikeAdviceRequest("do I need a lawyer for this?"), true);
  assert.equal(looksLikeAdviceRequest("is it better to just start a new company?"), true);
  assert.equal(looksLikeAdviceRequest("what would you recommend?"), true);
});

// A false positive costs one accurate but unhelpful sentence; a false
// negative falls through to the ordinary "I didn't catch that" path. Real
// answers must not trip it.
test("ordinary answers are not mistaken for advice requests", () => {
  assert.equal(looksLikeAdviceRequest("Acme Holdings LLC"), false);
  assert.equal(looksLikeAdviceRequest("307-555-0142"), false);
  assert.equal(looksLikeAdviceRequest("same"), false);
  assert.equal(looksLikeAdviceRequest("Jane Doe, Managing Member"), false);
  assert.equal(looksLikeAdviceRequest("03/14/2019"), false);
});
