import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasValidDesignator,
  designatorWarning,
  isValidEmail,
  isValidPhone,
  looksLikeAName,
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

test("looksLikeAName", () => {
  assert.equal(looksLikeAName("Jordan Smith"), true);
  assert.equal(looksLikeAName("Acme Ventures LLC"), true);
  assert.equal(looksLikeAName(""), false);
  assert.equal(looksLikeAName("123456"), false);
  assert.equal(looksLikeAName("!!!"), false);
  assert.equal(looksLikeAName("a".repeat(201)), false);
});

test("looksLikeArticleNumber", () => {
  assert.equal(looksLikeArticleNumber("1"), true);
  assert.equal(looksLikeArticleNumber("Article 1"), true);
  assert.equal(looksLikeArticleNumber("First"), true);
  assert.equal(looksLikeArticleNumber("3(b)"), true);
  assert.equal(looksLikeArticleNumber(""), false);
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
