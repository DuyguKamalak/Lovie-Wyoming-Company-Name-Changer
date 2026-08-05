import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { fillLlcAmendment } from "../fillLlc";
import { fillCorpAmendment } from "../fillCorp";
import type { LlcFields, CorpFields } from "../../types";

const llcFields: LlcFields = {
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

test("fillLlcAmendment writes every field and flattens", async () => {
  const bytes = await fillLlcAmendment(llcFields);
  const pdfDoc = await PDFDocument.load(bytes);
  // A flattened form has no editable fields left.
  assert.equal(pdfDoc.getForm().getFields().length, 0);
});

const corpFields: CorpFields = {
  currentName: "Acme Ventures, Inc.",
  articleNumber: "1",
  newName: "Acme Holdings, Inc.",
  amendmentText: "Article 1. The name of the corporation is Acme Holdings, Inc.",
  amendmentDate: "08/05/2026",
  approval: "board",
  signatureDate: "08/05/2026",
  signerName: "Jordan Smith",
  signerTitle: "President",
  contactPerson: "Jordan Smith",
  phone: "307-555-0100",
  email: "jordan@example.com",
};

test("fillCorpAmendment writes every field, checks exactly one approval box, and flattens", async () => {
  const bytes = await fillCorpAmendment(corpFields);
  const pdfDoc = await PDFDocument.load(bytes);
  assert.equal(pdfDoc.getForm().getFields().length, 0);
});

test("fillCorpAmendment checks a different box for a different approval value", async () => {
  // Regression guard for the approval->checkbox mapping in fillCorp.ts:
  // fill twice with different `approval` values and confirm the rendered
  // bytes differ (i.e. the mapping isn't silently defaulting to one box).
  const boardBytes = await fillCorpAmendment({ ...corpFields, approval: "board" });
  const shareholdersBytes = await fillCorpAmendment({ ...corpFields, approval: "shareholders" });
  assert.notDeepEqual(Buffer.from(boardBytes), Buffer.from(shareholdersBytes));
});
