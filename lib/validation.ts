import type { EntityType } from "./types";

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
