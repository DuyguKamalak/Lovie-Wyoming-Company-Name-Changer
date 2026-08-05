import { test } from "node:test";
import assert from "node:assert/strict";
import { hasValidDesignator, designatorWarning } from "../validation";

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
