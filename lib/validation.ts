import type { EntityType, LlcFields, CorpFields } from "./types";

export function humanizeFieldKey(key: string): string {
  return key.replace(/([A-Z])/g, " $1").toLowerCase();
}

// spec.md FR-005: warn, don't silently block, if the new name is missing a
// designator. Matching is case-insensitive and anchors to the end of the
// name (designators are suffixes).
const LLC_DESIGNATORS = ["llc", "l.l.c.", "limited liability company"];
const CORP_DESIGNATORS = [
  "inc.",
  "inc",
  "incorporated",
  "corporation",
  "corp.",
  "corp",
  "co.",
  "company",
  "limited",
  "ltd.",
  "ltd",
];

function endsWithAny(name: string, designators: string[]): boolean {
  const normalized = name.trim().toLowerCase();
  return designators.some((d) => normalized.endsWith(d));
}

export function hasValidDesignator(entityType: EntityType, name: string): boolean {
  const designators = entityType === "llc" ? LLC_DESIGNATORS : CORP_DESIGNATORS;
  return endsWithAny(name, designators);
}

export function designatorWarning(entityType: EntityType, name: string): string | null {
  if (hasValidDesignator(entityType, name)) return null;
  return entityType === "llc"
    ? `"${name}" doesn't end in a recognized LLC designator (LLC, L.L.C., or "Limited Liability Company"). Wyoming requires one — double-check before continuing.`
    : `"${name}" doesn't end in a recognized corporate designator (Inc., Incorporated, Corporation, Corp., Co., Company, Limited, or Ltd.). Wyoming requires one — double-check before continuing.`;
}

export const LLC_REQUIRED_KEYS: (keyof LlcFields)[] = [
  "currentName",
  "dateOfOriginalFiling",
  "articleNumber",
  "newName",
  "amendmentText",
  "signatureDate",
  "signerName",
  "signerTitle",
  "contactPerson",
  "phone",
  "email",
];

export const CORP_REQUIRED_KEYS: (keyof CorpFields)[] = [
  "currentName",
  "articleNumber",
  "newName",
  "amendmentText",
  "amendmentDate",
  "approval",
  "signatureDate",
  "signerName",
  "signerTitle",
  "contactPerson",
  "phone",
  "email",
];

// Server-side backstop (the /api/generate-pdf boundary, and lib/gemini.ts's
// own readyForReview check) behind the review screen's own validation —
// never silently treat an incomplete field set as done. Takes a plain
// Record rather than Partial<LlcFields|CorpFields> so it works equally for
// a validated fields object (generate-pdf) and the agent's freeform
// knownFields accumulator (gemini.ts) — both are structurally the same
// shape (string keys -> string values) at the point this runs.
export function missingFields(entityType: EntityType, fields: Record<string, string>): string[] {
  const keys = entityType === "llc" ? LLC_REQUIRED_KEYS : CORP_REQUIRED_KEYS;
  return keys.filter((key) => {
    const value = fields[key];
    return typeof value !== "string" || value.trim() === "";
  });
}
