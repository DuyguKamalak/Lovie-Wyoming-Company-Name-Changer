import { test } from "node:test";
import assert from "node:assert/strict";
import { amendmentTextMismatch } from "../amendmentSync";

// Regression guard for a real hole in the review screen: `amendmentText` is
// the only one of the two name fields that reaches the PDF, so editing
// `newName` here and leaving the amendment text alone mails the old name to
// the Secretary of State — with no warning, and past the API's designator
// check (which validates `newName`, not the text that gets printed).

test("no mismatch when the amendment text matches the new name", () => {
  assert.equal(
    amendmentTextMismatch("llc", {
      articleNumber: "1",
      newName: "Acme Holdings LLC",
      amendmentText: "Article 1. The name of the limited liability company is Acme Holdings LLC.",
    }),
    null
  );
});

test("whitespace differences alone are not a mismatch", () => {
  assert.equal(
    amendmentTextMismatch("corp", {
      articleNumber: "1",
      newName: "Acme Holdings, Inc.",
      amendmentText: "  Article 1.  The name of the corporation is Acme Holdings, Inc.  ",
    }),
    null
  );
});

test("editing newName without updating the text returns the corrected text", () => {
  assert.equal(
    amendmentTextMismatch("llc", {
      articleNumber: "1",
      newName: "Acme Global LLC",
      amendmentText: "Article 1. The name of the limited liability company is Acme Holdings LLC.",
    }),
    "Article 1. The name of the limited liability company is Acme Global LLC."
  );
});

test("editing the article number is caught the same way", () => {
  assert.equal(
    amendmentTextMismatch("corp", {
      articleNumber: "4",
      newName: "Acme Holdings, Inc.",
      amendmentText: "Article 1. The name of the corporation is Acme Holdings, Inc.",
    }),
    "Article 4. The name of the corporation is Acme Holdings, Inc."
  );
});

test("stays quiet while fields are still empty", () => {
  assert.equal(amendmentTextMismatch("llc", {}), null);
  assert.equal(
    amendmentTextMismatch("llc", { articleNumber: "1", newName: "Acme LLC", amendmentText: "" }),
    null
  );
});
