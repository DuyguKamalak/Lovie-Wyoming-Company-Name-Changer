import { test } from "node:test";
import assert from "node:assert/strict";
import { formatFieldValue } from "../textFormat";

// People type the way people type — "president", "acme ventures inc",
// "JANE DOE" — and what they typed used to go onto a state filing verbatim.
// Presenting it properly on the form is the tool's job, not theirs.

test("titles are capitalised, and known acronyms stay uppercase", () => {
  assert.equal(formatFieldValue("signerTitle", "president"), "President");
  assert.equal(formatFieldValue("signerTitle", "vice president"), "Vice President");
  assert.equal(formatFieldValue("signerTitle", "managing member"), "Managing Member");
  assert.equal(formatFieldValue("signerTitle", "ceo"), "CEO");
  assert.equal(formatFieldValue("signerTitle", "cfo "), "CFO");
  // Already-formatted input is left alone.
  assert.equal(formatFieldValue("signerTitle", "President"), "President");
});

test("person names are capitalised, including hyphens and apostrophes", () => {
  assert.equal(formatFieldValue("signerName", "jane doe"), "Jane Doe");
  assert.equal(formatFieldValue("contactPerson", "mary-jane o'brien"), "Mary-Jane O'Brien");
  assert.equal(formatFieldValue("signerName", "JANE DOE"), "Jane Doe");
  // Deliberate internal capitals are a real spelling, not a typo.
  assert.equal(formatFieldValue("signerName", "Jane McDonald"), "Jane McDonald");
  // Name particles stay lowercase unless they lead.
  assert.equal(formatFieldValue("signerName", "ludwig van beethoven"), "Ludwig van Beethoven");
});

test("company names are capitalised and designators get their conventional case", () => {
  assert.equal(formatFieldValue("currentName", "acme ventures llc"), "Acme Ventures LLC");
  assert.equal(formatFieldValue("newName", "acme holdings l.l.c."), "Acme Holdings L.L.C.");
  assert.equal(formatFieldValue("currentName", "acme ventures inc"), "Acme Ventures Inc");
  assert.equal(formatFieldValue("currentName", "gamma manufacturing corp."), "Gamma Manufacturing Corp.");
  assert.equal(formatFieldValue("newName", "bank of the west corporation"), "Bank of the West Corporation");
  assert.equal(formatFieldValue("currentName", "ACME VENTURES LLC"), "Acme Ventures LLC");
});

// The designator is part of the legal name (agent.md rule 7): its casing is
// presentation, but its punctuation is identity. "Inc" and "Inc." are two
// different registered strings and the tool must not pick for the user.
test("punctuation in a company name is never added or removed", () => {
  assert.equal(formatFieldValue("newName", "acme holdings inc"), "Acme Holdings Inc");
  assert.equal(formatFieldValue("newName", "acme holdings inc."), "Acme Holdings Inc.");
  assert.equal(formatFieldValue("newName", "acme holdings, inc."), "Acme Holdings, Inc.");
  assert.equal(formatFieldValue("newName", "acme holdings ltd"), "Acme Holdings Ltd");
});

// A name whose own spelling carries capitals mid-word is left exactly as
// typed — "eBay", "iRobot", "3M" are not typos to be corrected.
test("a word the user capitalised themselves is left alone", () => {
  assert.equal(formatFieldValue("currentName", "eBay Ventures LLC"), "eBay Ventures LLC");
  assert.equal(formatFieldValue("currentName", "iRobot Holdings Inc."), "iRobot Holdings Inc.");
});

// An email is the user's own identifier, and the state writes to it — take it
// exactly as given. Lowercasing the domain would be safe by spec, but it left
// a half-changed address on the form, which is worse than either extreme.
test("an email is taken exactly as typed, apart from surrounding whitespace", () => {
  assert.equal(formatFieldValue("email", " Jane.Doe@ACME.COM "), "Jane.Doe@ACME.COM");
  assert.equal(formatFieldValue("email", "JANE@ACME.COM"), "JANE@ACME.COM");
  assert.equal(formatFieldValue("email", "jane@acme.com"), "jane@acme.com");
});

test("US phone numbers are printed in one consistent shape", () => {
  assert.equal(formatFieldValue("phone", "3075550142"), "307-555-0142");
  assert.equal(formatFieldValue("phone", "(307) 555 0142"), "307-555-0142");
  assert.equal(formatFieldValue("phone", "307.555.0142"), "307-555-0142");
  // Anything that isn't a plain 10-digit number is left as the user gave it.
  assert.equal(formatFieldValue("phone", "+44 20 7946 0958"), "+44 20 7946 0958");
  assert.equal(formatFieldValue("phone", "307-555-0142 ext. 12"), "307-555-0142 ext. 12");
});

// Found while adding the rest: "Article 1" passes validation as an article
// number, and composeAmendmentText then prints "Article Article 1. The name
// of the corporation is ..." on the filing.
test("an article number sheds the word 'article' and keeps only the number", () => {
  assert.equal(formatFieldValue("articleNumber", "Article 1"), "1");
  assert.equal(formatFieldValue("articleNumber", "article no. 4"), "4");
  assert.equal(formatFieldValue("articleNumber", "1"), "1");
  assert.equal(formatFieldValue("articleNumber", "first"), "First");
  assert.equal(formatFieldValue("articleNumber", "Article First"), "First");
});

test("fields whose value is not free text are never reformatted", () => {
  // approval is a canonical enum value fillCorp.ts maps to a checkbox.
  assert.equal(formatFieldValue("approval", "board"), "board");
  // dates already went through normalizeDate.
  assert.equal(formatFieldValue("amendmentDate", "07/01/2026"), "07/01/2026");
  // the amendment text is composed by us from already-formatted parts.
  assert.equal(
    formatFieldValue("amendmentText", "Article 1. The name of the corporation is Acme Holdings, Inc."),
    "Article 1. The name of the corporation is Acme Holdings, Inc."
  );
});
