import type { EntityType } from "@/lib/types";
import { composeAmendmentText } from "@/lib/composeAmendment";

// The review screen keeps both `newName` and `amendmentText` editable, and
// only `amendmentText` is printed on the form — so editing the new name
// alone silently mails the OLD name to the state. The field's help text
// asked the user to keep the two in sync by hand, which is exactly the kind
// of thing nobody does. `amendmentText` is fully determined by entity type +
// article number + new name, so the mismatch is detectable: return what the
// text should say (for a one-tap fix), or null when it already matches.
//
// Whitespace-insensitive on purpose; wording differences are the whole point
// of the check and are never normalized away.
export function amendmentTextMismatch(
  entityType: EntityType,
  fields: Record<string, string>
): string | null {
  const articleNumber = fields.articleNumber?.trim() ?? "";
  const newName = fields.newName?.trim() ?? "";
  const current = fields.amendmentText ?? "";
  // Nothing to compare against yet — the review screen's own empty-field
  // handling (and /api/generate-pdf's missingFields check) covers this.
  if (!articleNumber || !newName || current.trim() === "") return null;

  const expected = composeAmendmentText(entityType, articleNumber, newName);
  const collapse = (value: string) => value.replace(/\s+/g, " ").trim();
  return collapse(current) === collapse(expected) ? null : expected;
}
