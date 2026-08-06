import type { FieldConfig } from "./fieldConfig";

// The agent doesn't always get every field recorded before saying
// readyForReview (found in T014 testing — e.g. composing amendmentText in
// a chat reply without also calling record_field for it) — /api/generate-pdf
// is the last line of defense and returns which fields it's missing.
// Surface those by their review-screen label, not their raw key name, so
// the user knows exactly which box on this page to fill in.
export function formatGenerateError(
  data: { error?: string; missing?: string[] },
  fields: FieldConfig[]
): string {
  if (!data.missing?.length) {
    return data.error ?? "Couldn't generate the PDF. Please check the fields above and try again.";
  }
  const labels = data.missing.map((key) => fields.find((f) => f.key === key)?.label ?? key);
  return `Missing or empty: ${labels.join(", ")}. Fill those in above and try again.`;
}
