import type { EntityType, LlcFields, CorpFields } from "./types";

export function humanizeFieldKey(key: string): string {
  return key.replace(/([A-Z])/g, " $1").toLowerCase();
}

// spec.md FR-005: warn, don't silently block, if the new name is missing a
// designator. Matching is case-insensitive and anchors to the end of the
// name (designators are suffixes). Listed without a trailing period —
// endsWithAny strips trailing punctuation before comparing, so "Inc",
// "Inc.", and even a stray "Inc," all match "inc" uniformly, instead of
// needing every punctuation variant spelled out per designator.
const LLC_DESIGNATORS = ["llc", "l.l.c", "limited liability company"];
const CORP_DESIGNATORS = [
  "inc",
  "incorporated",
  "corporation",
  "corp",
  "co",
  "company",
  "limited",
  "ltd",
];

// Word-boundary aware, not a raw string suffix check — a plain .endsWith
// would count "Acme Franco" as having a valid "Co" designator, since
// "Franco" itself ends in "co". Comparing whole trailing words instead
// fixes that false positive.
function endsWithDesignator(name: string, designator: string): boolean {
  // Trailing punctuation only — "L.L.C" keeps its internal periods,
  // "Acme Holdings Inc." loses just the final period, "Acme Holdings Inc,"
  // loses the trailing comma. Found via real testing that a trailing comma
  // (a plausible typo) fell through the old exact-suffix check entirely.
  const normalizedName = name.trim().toLowerCase().replace(/[.,;:!?]+$/, "");
  const nameWords = normalizedName.split(/\s+/).filter(Boolean);
  const designatorWords = designator.split(/\s+/);
  if (nameWords.length < designatorWords.length) return false;
  const tail = nameWords.slice(nameWords.length - designatorWords.length).join(" ");
  return tail === designator;
}

function endsWithAny(name: string, designators: string[]): boolean {
  return designators.some((d) => endsWithDesignator(name, d));
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

// Deliberately simple — a shape check ("something@something.something"),
// not full RFC 5322 validation (constitution IV: no premature complexity
// for a problem this narrow). Found via real testing that the model isn't
// reliable here on its own: it accepted "asdfghjkl" and "jordan@" (no
// domain) as valid emails in separate live runs. The SOS form requires a
// real email ("will receive important reminders, notices and filing
// evidence"), so this is the same record_field-time backstop pattern as
// the approval-value check, not a UX nicety.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_SHAPE.test(value.trim());
}

// Also found inconsistent live: "banana" was caught and re-asked, but
// "asdfghjkl" — same kind of letters-only garbage — was accepted as a
// phone number in a separate run. Rather than trust that judgment call
// every time, require a minimum count of digit characters. 7 is the
// shortest a real phone number gets before an area code (matches the US
// convention this form's own "Daytime Phone Number" field assumes), and
// counting digits rather than matching a strict pattern tolerates any
// reasonable formatting: "307-555-0100", "(307) 555-0100", "3075550100",
// or a number with a leading country code.
export function isValidPhone(value: string): boolean {
  const digitCount = (value.match(/\d/g) ?? []).length;
  return digitCount >= 7;
}

// Applies to every free-text "name-shaped" field: currentName, newName,
// signerName, signerTitle, contactPerson. Deliberately loose — this isn't
// trying to judge whether something is a *plausible* name (that's not a
// call this app should make), only to catch the class of clearly-wrong
// input a fat-fingered or off-topic answer produces: empty, pure digits,
// pure punctuation, or a wall of text someone pasted into the wrong box.
export function looksLikeAName(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return false;
  if (!/[a-zA-Z]/.test(trimmed)) return false; // must contain at least one letter
  return true;
}

// articleNumber is always short on the real forms — "1", "Article 1",
// "First", "3(b)", "III" — never a sentence. Word-count/length caps catch
// an off-topic or rambling answer without trying to enumerate every
// legitimate numbering style Wyoming articles might use.
export function looksLikeArticleNumber(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 40) return false;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  return wordCount <= 6;
}

// amendmentText is composed by the agent itself from the fixed template in
// spec.md section 5.3 (see composeAmendmentText) — it should never be
// free-form. A light structural check (not a full template regex, which
// would be brittle against harmless whitespace variation) catches the
// agent recording something that clearly isn't that sentence: forgetting
// to mention the new name, or not composing a real sentence at all.
export function looksLikeAmendmentText(value: string, newName?: string): boolean {
  const trimmed = value.trim();
  if (!/^Article\s/i.test(trimmed)) return false;
  if (!trimmed.endsWith(".")) return false;
  if (newName && !trimmed.includes(newName)) return false;
  return true;
}

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
