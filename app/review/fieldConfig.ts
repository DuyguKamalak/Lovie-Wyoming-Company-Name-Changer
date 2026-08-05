import type { EntityType } from "@/lib/types";

export interface FieldConfig {
  key: string;
  label: string;
  multiline?: boolean;
  help?: string;
}

// Order and labels here are the human-facing counterparts of the PDF field
// tables in spec.md sections 5.1/5.2 — every key must be one of
// lib/gemini.ts's RECORD_FIELD_KEYS (validated by
// lib/__tests__/gemini.test.ts) and every non-"newName" key must be one of
// lib/validation.ts's LLC_REQUIRED_KEYS/CORP_REQUIRED_KEYS.
export const LLC_FIELD_CONFIG: FieldConfig[] = [
  { key: "currentName", label: "Current LLC name" },
  { key: "dateOfOriginalFiling", label: "Original filing date (mm/dd/yyyy)" },
  { key: "articleNumber", label: "Article number being amended" },
  { key: "newName", label: "New LLC name" },
  {
    key: "amendmentText",
    label: "Amendment text",
    multiline: true,
    help: "This exact text is printed on the form. If you edit the new name above, update this to match.",
  },
  { key: "signatureDate", label: "Signature date (mm/dd/yyyy)" },
  { key: "signerName", label: "Signer's name" },
  { key: "signerTitle", label: "Signer's title" },
  { key: "contactPerson", label: "Contact person" },
  { key: "phone", label: "Daytime phone" },
  { key: "email", label: "Email" },
];

export const CORP_FIELD_CONFIG: FieldConfig[] = [
  { key: "currentName", label: "Current corporation name" },
  { key: "articleNumber", label: "Article number being amended" },
  { key: "newName", label: "New corporation name" },
  {
    key: "amendmentText",
    label: "Amendment text",
    multiline: true,
    help: "This exact text is printed on the form. If you edit the new name above, update this to match.",
  },
  { key: "amendmentDate", label: "Date the amendment was adopted (mm/dd/yyyy)" },
  // "approval" is rendered separately as a 3-way choice, not a plain input.
  { key: "signatureDate", label: "Signature date (mm/dd/yyyy)" },
  { key: "signerName", label: "Signer's name" },
  { key: "signerTitle", label: "Signer's title" },
  { key: "contactPerson", label: "Contact person" },
  { key: "phone", label: "Daytime phone" },
  { key: "email", label: "Email" },
];

export const CORP_APPROVAL_OPTIONS: { value: string; label: string }[] = [
  {
    value: "incorporators",
    label: "Shares haven't been issued yet — the board/incorporators adopted this amendment.",
  },
  {
    value: "board",
    label: "Shares were issued — the board adopted this without a shareholder vote.",
  },
  {
    value: "shareholders",
    label: "Shares were issued — the board adopted this with shareholder approval.",
  },
];

export function fieldConfigFor(entityType: EntityType): FieldConfig[] {
  return entityType === "llc" ? LLC_FIELD_CONFIG : CORP_FIELD_CONFIG;
}
