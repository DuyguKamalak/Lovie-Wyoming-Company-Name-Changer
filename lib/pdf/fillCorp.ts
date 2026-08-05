import { PDFDocument } from "pdf-lib";
import type { CorpFields, CorpApproval } from "../types";
import { loadFormTemplate } from "./loadTemplate";

const TEMPLATE_PATH = "assets/forms/corp-amendment-form-p.pdf";

// Field names verified against the live PDF and documented in
// spec.md section 5.2 — do not rename without updating both (constitution
// VI) and re-running the verify-pdf-fields skill.
const APPROVAL_CHECKBOX: Record<CorpApproval, string> = {
  incorporators: "Incorporators approved",
  board: "Board of directors approved",
  shareholders: "Shareholders approved",
};

export async function fillCorpAmendment(fields: CorpFields): Promise<Uint8Array> {
  const templateBytes = await loadFormTemplate(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  form.getTextField("Corporation name").setText(fields.currentName);
  form.getTextField("Article number being amended").setText(fields.articleNumber);
  form.getTextField("Amendment").setText(fields.amendmentText);
  // "exchange, reclassification, cancellation" intentionally left blank —
  // only relevant to a share-structure change, out of scope for a pure
  // name change (spec.md section 5.2).
  form.getTextField("amendment date").setText(fields.amendmentDate);

  const checkboxName = APPROVAL_CHECKBOX[fields.approval];
  form.getCheckBox(checkboxName).check();
  // The other two approval checkboxes, and the five printed checklist
  // self-check boxes, are left at their default /Off.

  form.getTextField("date").setText(fields.signatureDate);
  form.getTextField("printed name").setText(fields.signerName);
  form.getTextField("title").setText(fields.signerTitle);
  form.getTextField("contact person").setText(fields.contactPerson);
  form.getTextField("daytime phone number").setText(fields.phone);
  form.getTextField("email").setText(fields.email);

  form.updateFieldAppearances();
  form.flatten();
  return pdfDoc.save();
}
