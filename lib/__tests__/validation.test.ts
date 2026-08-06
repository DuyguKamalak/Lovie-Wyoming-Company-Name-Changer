import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasValidDesignator,
  designatorWarning,
  isValidEmail,
  isValidPhone,
  looksLikeAName,
  looksLikeCompanyName,
  designatorAppearsInUserText,
  looksLikeArticleNumber,
  looksLikeAmendmentText,
} from "../validation";

test("LLC: accepts valid designators", () => {
  assert.equal(hasValidDesignator("llc", "Acme Holdings LLC"), true);
  assert.equal(hasValidDesignator("llc", "Acme Holdings L.L.C."), true);
  assert.equal(hasValidDesignator("llc", "Acme Holdings Limited Liability Company"), true);
});

test("LLC: rejects missing designator", () => {
  assert.equal(hasValidDesignator("llc", "Acme Holdings"), false);
  assert.notEqual(designatorWarning("llc", "Acme Holdings"), null);
});

test("Corp: accepts valid designators", () => {
  assert.equal(hasValidDesignator("corp", "Acme Holdings Inc."), true);
  assert.equal(hasValidDesignator("corp", "Acme Holdings Corporation"), true);
  assert.equal(hasValidDesignator("corp", "Acme Holdings Ltd"), true);
});

test("Corp: rejects missing designator", () => {
  assert.equal(hasValidDesignator("corp", "Acme Holdings"), false);
  assert.notEqual(designatorWarning("corp", "Acme Holdings"), null);
});

// Regression guard for the exact user question that prompted this: does a
// trailing period matter? A trailing comma (a plausible typo) used to slip
// through the old exact-suffix check entirely.
test("designator matching ignores trailing punctuation variance", () => {
  assert.equal(hasValidDesignator("corp", "Acme Holdings Inc"), true);
  assert.equal(hasValidDesignator("corp", "Acme Holdings Inc."), true);
  assert.equal(hasValidDesignator("corp", "Acme Holdings Inc,"), true);
  assert.equal(hasValidDesignator("corp", "Acme Holdings INC."), true);
  assert.equal(hasValidDesignator("llc", "Acme Holdings LLC"), true);
  assert.equal(hasValidDesignator("llc", "Acme Holdings LLC."), true);
  assert.equal(hasValidDesignator("llc", "Acme Holdings L.L.C."), true);
  assert.equal(hasValidDesignator("llc", "Acme Holdings L.L.C"), true);
});

// Word-boundary regression: a raw string .endsWith("co") would wrongly
// treat "Acme Franco" as ending in the "Co." designator, since "Franco"
// itself ends in "co". Comparing whole trailing words instead of raw
// suffixes fixes that false positive.
test("designator matching doesn't false-positive on a name that merely ends in the same letters", () => {
  assert.equal(hasValidDesignator("corp", "Acme Franco"), false);
  assert.equal(hasValidDesignator("corp", "Acme Repair Co"), true);
});

test("isValidEmail", () => {
  assert.equal(isValidEmail("jordan@example.com"), true);
  assert.equal(isValidEmail("asdfghjkl"), false);
  assert.equal(isValidEmail("jordan@"), false);
  assert.equal(isValidEmail("@example.com"), false);
  assert.equal(isValidEmail(""), false);
});

test("isValidPhone", () => {
  assert.equal(isValidPhone("307-555-0100"), true);
  assert.equal(isValidPhone("(307) 555-0100"), true);
  assert.equal(isValidPhone("3075550100"), true);
  assert.equal(isValidPhone("asdfghjkl"), false);
  assert.equal(isValidPhone("banana"), false);
  assert.equal(isValidPhone("12345"), false); // only 5 digits
});

// Regression guard for a real user report: they answered a bare "s" to
// every question and it sailed through, because the original check only
// required "contains at least one letter". These values get printed on a
// state filing, so junk has to be rejected — while still accepting
// genuinely short real answers.
test("looksLikeAName", () => {
  assert.equal(looksLikeAName("Jordan Smith"), true);
  assert.equal(looksLikeAName("Acme Ventures LLC"), true);
  assert.equal(looksLikeAName("Al"), true); // short but real
  assert.equal(looksLikeAName("CEO"), true);
  assert.equal(looksLikeAName("s"), false); // the reported bug
  assert.equal(looksLikeAName("a"), false);
  assert.equal(looksLikeAName("aaaa"), false); // one char repeated
  assert.equal(looksLikeAName("SSS"), false);
  assert.equal(looksLikeAName("...."), false);
  assert.equal(looksLikeAName(""), false);
  assert.equal(looksLikeAName("123456"), false);
  assert.equal(looksLikeAName("!!!"), false);
  assert.equal(looksLikeAName("a".repeat(201)), false);
});

// A registered Wyoming entity's legal name must carry a designator, and
// the form says it "must match exactly to the Secretary of State's
// records" — so a company name without one is wrong by definition. This
// is what stops a bare "s" being recorded as a legal entity name.
test("looksLikeCompanyName requires a designator, not just non-garbage", () => {
  assert.equal(looksLikeCompanyName("llc", "Acme Ventures LLC"), true);
  assert.equal(looksLikeCompanyName("llc", "Acme Ventures L.L.C."), true);
  assert.equal(looksLikeCompanyName("corp", "Beta Manufacturing Inc"), true);
  assert.equal(looksLikeCompanyName("corp", "Beta Manufacturing Inc."), true);

  assert.equal(looksLikeCompanyName("llc", "s"), false); // the reported bug
  assert.equal(looksLikeCompanyName("llc", "Acme Ventures"), false); // no designator
  assert.equal(looksLikeCompanyName("llc", "12345"), false);
  assert.equal(looksLikeCompanyName("corp", "Acme Holdings LLC"), false); // wrong entity's designator
});

// "s" and "purple" used to pass because the check only capped length and
// word count. An article number has to actually designate something.
test("looksLikeArticleNumber", () => {
  assert.equal(looksLikeArticleNumber("1"), true);
  assert.equal(looksLikeArticleNumber("Article 1"), true);
  assert.equal(looksLikeArticleNumber("First"), true);
  assert.equal(looksLikeArticleNumber("Article First"), true);
  assert.equal(looksLikeArticleNumber("3(b)"), true);
  assert.equal(looksLikeArticleNumber("III"), true);

  assert.equal(looksLikeArticleNumber("s"), false); // the reported bug
  assert.equal(looksLikeArticleNumber("purple"), false);
  assert.equal(looksLikeArticleNumber(""), false);
  assert.equal(looksLikeArticleNumber("Article"), false); // filler only, no numeral
  assert.equal(
    looksLikeArticleNumber("I really don't know what article number this is, sorry"),
    false
  );
});

test("looksLikeAmendmentText", () => {
  const valid = "Article 1. The name of the limited liability company is Acme Holdings LLC.";
  assert.equal(looksLikeAmendmentText(valid), true);
  assert.equal(looksLikeAmendmentText(valid, "Acme Holdings LLC"), true);
  assert.equal(looksLikeAmendmentText(valid, "Some Other Name LLC"), false);
  assert.equal(looksLikeAmendmentText("Acme Holdings LLC is a great company"), false);
  assert.equal(looksLikeAmendmentText("Article 1. No trailing period"), false);
});

// agent.md rule 7 forbids the agent appending a designator the user never
// gave. Found live: asked for the company name, a user typed a bare
// "purple" and the model recorded "Purple Corp" — inventing the
// designator, and thereby passing looksLikeCompanyName. The checkable
// form of the rule is that the designator must appear in the user's own
// words.
test("designatorAppearsInUserText blocks a designator the user never said", () => {
  // The reported bug: user typed only "purple".
  assert.equal(designatorAppearsInUserText("corp", "Purple Corp", "purple"), false);
  assert.equal(designatorAppearsInUserText("llc", "Purple LLC", "purple"), false);

  // Legitimate: the user actually said it, in whatever casing/punctuation.
  assert.equal(
    designatorAppearsInUserText("corp", "Purple Corp", "my company is purple corp"),
    true
  );
  assert.equal(
    designatorAppearsInUserText("llc", "Acme Ventures LLC", "Acme Ventures LLC"),
    true
  );
  assert.equal(
    designatorAppearsInUserText("llc", "Acme Ventures L.L.C.", "acme ventures llc"),
    true
  );
  assert.equal(
    designatorAppearsInUserText("corp", "Beta Manufacturing Inc.", "Beta Manufacturing Inc"),
    true
  );

  // No designator at all — reported by the separate designator check.
  assert.equal(designatorAppearsInUserText("llc", "Acme Ventures", "Acme Ventures"), false);
});

// Regression guard: "s LLC" passed every earlier check because the junk
// was in the *name* while the designator was real — and the opening
// "I have a Wyoming LLC" even made the designator look user-supplied.
// The distinctive part of the name has to stand on its own.
test("looksLikeCompanyName rejects a junk name carrying a real designator", () => {
  assert.equal(looksLikeCompanyName("llc", "s LLC"), false);
  assert.equal(looksLikeCompanyName("llc", "a LLC"), false);
  assert.equal(looksLikeCompanyName("corp", "s Inc."), false);
  assert.equal(looksLikeCompanyName("corp", "1 Corp"), false);

  // Real names, including short and multi-word designators, still pass.
  assert.equal(looksLikeCompanyName("llc", "Acme LLC"), true);
  assert.equal(looksLikeCompanyName("llc", "Acme Ventures Limited Liability Company"), true);
  assert.equal(looksLikeCompanyName("corp", "Beta Manufacturing Inc."), true);
});
