import { test } from "node:test";
import assert from "node:assert/strict";
import { composeAmendmentText } from "../composeAmendment";

test("LLC amendment text", () => {
  assert.equal(
    composeAmendmentText("llc", "1", "Acme Holdings LLC"),
    "Article 1. The name of the limited liability company is Acme Holdings LLC."
  );
});

test("Corp amendment text", () => {
  assert.equal(
    composeAmendmentText("corp", "1", "Acme Holdings, Inc."),
    "Article 1. The name of the corporation is Acme Holdings, Inc."
  );
});

test("does not double the period when the designator already ends in one", () => {
  assert.equal(
    composeAmendmentText("llc", "1", "Acme Holdings L.L.C."),
    "Article 1. The name of the limited liability company is Acme Holdings L.L.C."
  );
});
