// Data model per plan.md section 2. Field names/meanings are verified
// against the real PDFs in assets/forms/ — see spec.md sections 5.1/5.2.
// Do not add fields here without first updating spec.md (constitution VI).

export type EntityType = "llc" | "corp";

export interface LlcFields {
  currentName: string;
  dateOfOriginalFiling: string; // mm/dd/yyyy
  articleNumber: string; // e.g. "1"
  newName: string; // used to compose amendmentText, not written to the PDF directly
  amendmentText: string; // full article text, user-editable — written to the PDF
  signatureDate: string;
  signerName: string;
  signerTitle: string;
  contactPerson: string;
  phone: string;
  email: string;
}

export type CorpApproval = "incorporators" | "board" | "shareholders";

export interface CorpFields {
  currentName: string;
  articleNumber: string;
  newName: string; // used to compose amendmentText, not written to the PDF directly
  amendmentText: string; // full article text, user-editable — written to the PDF
  amendmentDate: string;
  approval: CorpApproval;
  signatureDate: string;
  signerName: string;
  signerTitle: string;
  contactPerson: string;
  phone: string;
  email: string;
}

export type EntityFields<E extends EntityType> = E extends "llc" ? LlcFields : CorpFields;
