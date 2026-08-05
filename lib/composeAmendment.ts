import type { EntityType } from "./types";

// spec.md section 5.3: neither PDF has a bare "new name" field — the
// amendment/Amendment field expects the full text of the amended article.
// The agent (agent.md rule 6) composes this, reads it back to the user for
// confirmation, and the review screen (spec.md section 4) keeps it editable.
export function composeAmendmentText(
  entityType: EntityType,
  articleNumber: string,
  newName: string
): string {
  const entityLabel = entityType === "llc" ? "limited liability company" : "corporation";
  const sentence = `Article ${articleNumber}. The name of the ${entityLabel} is ${newName}`;
  // Avoid a double period when newName's own designator already ends in one
  // (e.g. "Inc.", "Corp.", "L.L.C.") — see lib/__tests__/composeAmendment.test.ts.
  return sentence.endsWith(".") ? sentence : `${sentence}.`;
}
