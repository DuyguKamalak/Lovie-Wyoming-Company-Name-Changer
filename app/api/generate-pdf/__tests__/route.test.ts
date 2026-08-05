import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../route";
import type { LlcFields } from "@/lib/types";

const validLlcFields: LlcFields = {
  currentName: "Acme Ventures LLC",
  dateOfOriginalFiling: "01/15/2020",
  articleNumber: "1",
  newName: "Acme Holdings LLC",
  amendmentText: "Article 1. The name of the limited liability company is Acme Holdings LLC.",
  signatureDate: "08/05/2026",
  signerName: "Jordan Smith",
  signerTitle: "Manager",
  contactPerson: "Jordan Smith",
  phone: "307-555-0100",
  email: "jordan@example.com",
};

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/generate-pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("returns a PDF for a valid LLC request", async () => {
  const res = await POST(jsonRequest({ entityType: "llc", fields: validLlcFields }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  const buf = new Uint8Array(await res.arrayBuffer());
  assert.equal(String.fromCharCode(...buf.slice(0, 5)), "%PDF-");
});

test("rejects an invalid entityType", async () => {
  const res = await POST(jsonRequest({ entityType: "nonprofit", fields: validLlcFields }));
  assert.equal(res.status, 400);
});

test("rejects missing required fields", async () => {
  const incomplete: Partial<LlcFields> = { ...validLlcFields };
  delete incomplete.email;
  const res = await POST(jsonRequest({ entityType: "llc", fields: incomplete }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.deepEqual(body.missing, ["email"]);
});

test("rejects a new name with no valid designator", async () => {
  const res = await POST(
    jsonRequest({ entityType: "llc", fields: { ...validLlcFields, newName: "Acme Holdings" } })
  );
  assert.equal(res.status, 400);
});
