import { test } from "node:test";
import assert from "node:assert/strict";
import { reducer, initialState } from "../IntakeContext";

test("SET_ENTITY_TYPE sets entityType only", () => {
  const next = reducer(initialState, { type: "SET_ENTITY_TYPE", entityType: "llc" });
  assert.equal(next.entityType, "llc");
  assert.deepEqual(next.knownFields, {});
});

test("ADD_MESSAGE appends without mutating the original array", () => {
  const first = reducer(initialState, { type: "ADD_MESSAGE", message: { role: "user", text: "hi" } });
  const second = reducer(first, { type: "ADD_MESSAGE", message: { role: "assistant", text: "hello" } });
  assert.equal(initialState.history.length, 0);
  assert.deepEqual(second.history, [
    { role: "user", text: "hi" },
    { role: "assistant", text: "hello" },
  ]);
});

test("MERGE_KNOWN_FIELDS merges without dropping existing keys", () => {
  const first = reducer(initialState, {
    type: "MERGE_KNOWN_FIELDS",
    fields: { currentName: "Acme LLC" },
  });
  const second = reducer(first, {
    type: "MERGE_KNOWN_FIELDS",
    fields: { articleNumber: "1" },
  });
  assert.deepEqual(second.knownFields, { currentName: "Acme LLC", articleNumber: "1" });
});

test("SET_FIELD overwrites a single field (review-screen edits)", () => {
  const withField = reducer(initialState, { type: "SET_FIELD", field: "newName", value: "Acme Holdings LLC" });
  const edited = reducer(withField, { type: "SET_FIELD", field: "newName", value: "Acme Corp LLC" });
  assert.equal(edited.knownFields.newName, "Acme Corp LLC");
});

test("START_OVER resets to initialState regardless of prior state", () => {
  const messy = reducer(initialState, { type: "SET_READY_FOR_REVIEW", ready: true });
  const reset = reducer(messy, { type: "START_OVER" });
  assert.deepEqual(reset, initialState);
});
