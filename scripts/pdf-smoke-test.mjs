#!/usr/bin/env node
// T002 (tasks.md): confirm pdf-lib can load, fill, save, and re-read every
// AcroForm field we depend on in both vendored forms — a library/field-name
// compatibility gate, run once before building lib/pdf/fill*.ts on top of it.
// Field names here must match spec.md sections 5.1/5.2 exactly; if this
// script fails after a form update, run the verify-pdf-fields skill first.

import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

const LLC_TEXT_FIELDS = {
  "name of llc": "Acme Ventures LLC",
  "date of filing": "01/15/2020",
  "amended article #": "1",
  amendment: "Article 1. The name of the limited liability company is Acme Holdings LLC.",
  date: "08/05/2026",
  "print name": "Jordan Smith",
  title: "Manager",
  contact: "Jordan Smith",
  phone: "307-555-0100",
  email: "jordan@example.com",
};

const CORP_TEXT_FIELDS = {
  "Corporation name": "Acme Ventures, Inc.",
  "Article number being amended": "1",
  Amendment: "Article 1. The name of the corporation is Acme Holdings, Inc.",
  "amendment date": "08/05/2026",
  date: "08/05/2026",
  "printed name": "Jordan Smith",
  title: "President",
  "contact person": "Jordan Smith",
  "daytime phone number": "307-555-0100",
  email: "jordan@example.com",
};
const CORP_CHECKED_BOX = "Incorporators approved";
const CORP_UNCHECKED_BOXES = ["Board of directors approved", "Shareholders approved"];

async function smokeTest(label, path, textFields, { checkedBox, uncheckedBoxes } = {}) {
  console.log(`\n=== ${label} (${path}) ===`);
  const bytes = await readFile(path);
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();

  for (const [name, value] of Object.entries(textFields)) {
    form.getTextField(name).setText(value);
  }
  if (checkedBox) form.getCheckBox(checkedBox).check();
  for (const name of uncheckedBoxes ?? []) {
    form.getCheckBox(name); // just confirm it resolves without throwing
  }

  form.updateFieldAppearances();
  const filledBytes = await pdfDoc.save();

  // Round-trip: reload the saved bytes and confirm every value stuck.
  const reloaded = await PDFDocument.load(filledBytes);
  const reloadedForm = reloaded.getForm();
  let ok = true;
  for (const [name, expected] of Object.entries(textFields)) {
    const actual = reloadedForm.getTextField(name).getText();
    if (actual !== expected) {
      ok = false;
      console.error(`  MISMATCH field=${name} expected=${expected} actual=${actual}`);
    }
  }
  if (checkedBox) {
    const isChecked = reloadedForm.getCheckBox(checkedBox).isChecked();
    if (!isChecked) {
      ok = false;
      console.error(`  MISMATCH checkbox=${checkedBox} expected=checked actual=unchecked`);
    }
  }

  const outPath = path.replace(/\.pdf$/, ".smoketest.pdf");
  await writeFile(outPath, filledBytes);
  console.log(`  ${ok ? "OK" : "FAILED"} — wrote ${outPath} for manual inspection`);
  return ok;
}

const llcOk = await smokeTest(
  "LLC",
  "assets/forms/llc-amendment.pdf",
  LLC_TEXT_FIELDS
);

const corpOk = await smokeTest(
  "CORP",
  "assets/forms/corp-amendment-form-p.pdf",
  CORP_TEXT_FIELDS,
  { checkedBox: CORP_CHECKED_BOX, uncheckedBoxes: CORP_UNCHECKED_BOXES }
);

if (!llcOk || !corpOk) {
  console.error("\nSmoke test FAILED.");
  process.exit(1);
}
console.log("\nSmoke test passed: pdf-lib round-trips every field cleanly on both forms.");
