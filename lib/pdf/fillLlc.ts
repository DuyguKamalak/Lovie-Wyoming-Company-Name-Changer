import { PDFDocument } from "pdf-lib";
import type { LlcFields } from "../types";
import { loadFormTemplate } from "./loadTemplate";

const TEMPLATE_PATH = "assets/forms/llc-amendment.pdf";

// Field names verified against the live PDF and documented in
// spec.md section 5.1 — do not rename without updating both (constitution
// VI) and re-running the verify-pdf-fields skill.
export async function fillLlcAmendment(fields: LlcFields): Promise<Uint8Array> {
  const templateBytes = await loadFormTemplate(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  form.getTextField("name of llc").setText(fields.currentName);
  form.getTextField("date of filing").setText(fields.dateOfOriginalFiling);
  form.getTextField("amended article #").setText(fields.articleNumber);
  form.getTextField("amendment").setText(fields.amendmentText);
  form.getTextField("date").setText(fields.signatureDate);
  form.getTextField("print name").setText(fields.signerName);
  form.getTextField("title").setText(fields.signerTitle);
  form.getTextField("contact").setText(fields.contactPerson);
  form.getTextField("phone").setText(fields.phone);
  form.getTextField("email").setText(fields.email);
  // Check Box7.0-.3 (the printed checklist self-check boxes) are left at
  // their default /Off — not legal data, not part of the data model
  // (spec.md section 5.1).

  form.updateFieldAppearances();
  form.flatten();
  return pdfDoc.save();
}
