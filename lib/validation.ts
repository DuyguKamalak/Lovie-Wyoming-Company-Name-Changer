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

// Free-text "person-shaped" fields: signerName, signerTitle,
// contactPerson. The first version only required "contains a letter",
// which a real user immediately walked straight through by answering a
// bare "s" to every question — it passed, and the junk reached the review
// screen. These values get printed on a state filing, so require at least
// two letters and reject a single character repeated ("aa", "..."), while
// still accepting genuinely short real answers like "Al" or "CEO".
export function looksLikeAName(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 200) return false;
  const letters = trimmed.match(/[a-zA-Z]/g) ?? [];
  if (letters.length < 2) return false;
  // "aaaa", "----", "SSS" — one character repeated is never a real answer.
  if (new Set(trimmed.replace(/\s/g, "").toLowerCase()).size < 2) return false;
  return true;
}

// Company names (currentName, newName) get a stricter rule than person
// names: Wyoming requires a registered entity's legal name to carry a
// designator, and the form itself says the name "must match exactly to the
// Secretary of State's records" — so a company name without one is wrong
// by definition, not merely suspicious. This is what stops a bare "s" (or
// "Acme" with the designator forgotten) being recorded as a legal entity
// name. hasValidDesignator subsumes the junk checks: no garbage string
// carries a valid designator.
export function looksLikeCompanyName(entityType: EntityType, value: string): boolean {
  if (!looksLikeAName(value) || !hasValidDesignator(entityType, value)) return false;
  // The designator alone isn't enough: found live that "s LLC" passed
  // every check, because the junk was in the *name* and the designator was
  // real (the opening "I have a Wyoming LLC" even made it look
  // user-supplied). Strip the designator and require what's left — the
  // actual company name — to stand on its own.
  return looksLikeAName(stripDesignator(entityType, value));
}

// Removes the trailing designator words so the distinctive part of the
// name can be validated separately. "Acme Ventures LLC" -> "Acme Ventures".
function stripDesignator(entityType: EntityType, name: string): string {
  const designators = entityType === "llc" ? LLC_DESIGNATORS : CORP_DESIGNATORS;
  const normalized = name.trim().replace(/[.,;:!?]+$/, "");
  const words = normalized.split(/\s+/).filter(Boolean);
  const matched = designators.find((d) => endsWithDesignator(name, d));
  if (!matched) return normalized;
  return words.slice(0, words.length - matched.split(/\s+/).length).join(" ");
}

// agent.md rule 7: the agent must never append an entity designator the
// user didn't actually give. Found in live testing that it does exactly
// that under pressure — asked for the company name, a user typed a bare
// "purple" and the model recorded "Purple Corp", fabricating the
// designator and thereby passing looksLikeCompanyName.
//
// The checkable version of that rule: whichever designator the recorded
// name ends in must also appear somewhere in the user's own words.
// Case-insensitive and punctuation-tolerant, so any way the user actually
// wrote it ("llc", "L.L.C.", "Inc.") still counts.
export function designatorAppearsInUserText(
  entityType: EntityType,
  name: string,
  userText: string
): boolean {
  const designators = entityType === "llc" ? LLC_DESIGNATORS : CORP_DESIGNATORS;
  const matched = designators.find((d) => endsWithDesignator(name, d));
  if (!matched) return false; // no designator at all — the other check reports this
  // Compare on letters only, so "L.L.C." in the name matches "llc" typed
  // by the user and vice versa.
  const lettersOnly = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const haystack = lettersOnly(userText);
  return haystack.includes(lettersOnly(matched));
}

// Recognized ways a Wyoming article gets numbered, so "purple" and "s" are
// rejected while every legitimate style still passes.
const ORDINAL_WORDS =
  /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|one|two|three|four|five|six|seven|eight|nine|ten)$/i;
const ROMAN_NUMERAL = /^[ivxlcdm]+$/i;

// articleNumber is always short on the real forms — "1", "Article 1",
// "First", "3(b)", "III" — never a sentence and never a random word. The
// original check only capped length and word count, so a bare "s" sailed
// through. Now the value has to actually *designate* something: contain a
// digit, or be a recognized ordinal word or roman numeral.
export function looksLikeArticleNumber(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 40) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 6) return false;
  if (/\d/.test(trimmed)) return true;
  // No digits — every remaining word must be filler ("article", "the") or
  // an ordinal/roman numeral, and at least one must be the numeral itself.
  const meaningful = words.filter((w) => !/^(article|articles|the|no\.?|number|#)$/i.test(w));
  if (meaningful.length === 0) return false;
  return meaningful.every((w) => {
    const bare = w.replace(/[.,;:()]/g, "");
    return ORDINAL_WORDS.test(bare) || ROMAN_NUMERAL.test(bare);
  });
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
