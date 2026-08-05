import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../route";

// Only the request-validation branches are covered here — they return
// before calling the real Gemini API, so these run offline/deterministically
// without GEMINI_API_KEY. The happy path was verified manually against the
// live API during T008/T009 (see agent.md and the T008 commit message);
// it's not part of the automated suite since it costs a real API call.

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("rejects invalid JSON", async () => {
  const res = await POST(
    new Request("http://localhost/api/chat", { method: "POST", body: "not json" })
  );
  assert.equal(res.status, 400);
});

test("rejects a malformed history array", async () => {
  const res = await POST(jsonRequest({ history: [{ role: "user" }], entityType: null }));
  assert.equal(res.status, 400);
});

test("rejects a non-array history", async () => {
  const res = await POST(jsonRequest({ history: "hi", entityType: null }));
  assert.equal(res.status, 400);
});

test("rejects an invalid entityType", async () => {
  const res = await POST(jsonRequest({ history: [], entityType: "nonprofit" }));
  assert.equal(res.status, 400);
});

test("rejects a non-object knownFields", async () => {
  const res = await POST(jsonRequest({ history: [], entityType: null, knownFields: "nope" }));
  assert.equal(res.status, 400);
});
