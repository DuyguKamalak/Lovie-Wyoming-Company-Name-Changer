// What the user types goes onto a state filing, and people type the way
// people type: "president", "acme ventures inc", "JANE DOE", "3075550142".
// Presenting those properly on the form is the tool's job — the user's job is
// to tell us the facts. Applied at record time (not at PDF time) so the chat,
// the composed amendment text, the review screen and the PDF all show the
// same string; the review screen's own edits are the user's explicit choice
// and are never re-formatted.
//
// The line this draws: **casing is presentation, punctuation is identity.**
// "Inc" and "Inc." are two different registered names, so a missing period is
// never added and an existing one never removed (agent.md rule 7 forbids
// changing a designator the user gave). Capitalising the same letters is not
// a change to the name.

// Designators, mapped to their conventional casing. The trailing period is
// handled separately — these keys are matched against the word with any
// trailing period stripped.
const DESIGNATOR_CASING: Record<string, string> = {
  llc: "LLC",
  "l.l.c": "L.L.C",
  inc: "Inc",
  incorporated: "Incorporated",
  corp: "Corp",
  corporation: "Corporation",
  co: "Co",
  company: "Company",
  ltd: "Ltd",
  limited: "Limited",
};

// Kept lowercase inside a name, never as its first word.
const MINOR_WORDS = new Set(["of", "and", "the", "for", "in", "on", "at", "to", "a", "an", "de", "du"]);

// Name particles — "Ludwig van Beethoven", not "Van".
const NAME_PARTICLES = new Set(["van", "von", "de", "del", "della", "di", "da", "la", "le", "den", "der", "du"]);

// Titles that are acronyms rather than words.
const TITLE_ACRONYMS = new Set(["ceo", "cfo", "coo", "cto", "cio", "vp", "evp", "svp", "md", "gm", "hr"]);

function splitTrailingPunctuation(word: string): [string, string] {
  const match = word.match(/^([\s\S]*?)([.,;:)\]]*)$/);
  return match ? [match[1], match[2]] : [word, ""];
}

// Capitalise a word only when the user gave no capitals of their own —
// "eBay", "iRobot" and "McDonald" are spellings, not typos. An all-caps word
// is lowercased first, so "JANE" becomes "Jane" rather than staying shouted.
function capitalizeWord(word: string): string {
  if (word.length === 0) return word;
  const isAllCaps = word === word.toUpperCase() && /[A-Z]/.test(word);
  const hasOwnCapitals = /[A-Z]/.test(word) && !isAllCaps;
  if (hasOwnCapitals) return word;

  const base = isAllCaps ? word.toLowerCase() : word;
  // Capitalise after hyphens, and after an apostrophe when a real syllable
  // follows it ("o'brien" -> "O'Brien", but "jane's" stays "Jane's").
  return base
    .split("-")
    .map((part) =>
      part
        .split("'")
        .map((piece, index) =>
          index === 0 || piece.length >= 2
            ? piece.charAt(0).toUpperCase() + piece.slice(1)
            : piece
        )
        .join("'")
    )
    .join("-");
}

function formatCompanyName(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words
    .map((word, index) => {
      const [core, punctuation] = splitTrailingPunctuation(word);
      const designator = DESIGNATOR_CASING[core.toLowerCase()];
      if (designator) return `${designator}${punctuation}`;
      if (index > 0 && MINOR_WORDS.has(core.toLowerCase()) && !/[A-Z]/.test(core)) {
        return `${core.toLowerCase()}${punctuation}`;
      }
      return `${capitalizeWord(core)}${punctuation}`;
    })
    .join(" ");
}

function formatPersonName(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words
    .map((word, index) => {
      const [core, punctuation] = splitTrailingPunctuation(word);
      if (index > 0 && NAME_PARTICLES.has(core.toLowerCase()) && !/[A-Z]/.test(core)) {
        return `${core.toLowerCase()}${punctuation}`;
      }
      return `${capitalizeWord(core)}${punctuation}`;
    })
    .join(" ");
}

function formatTitle(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words
    .map((word) => {
      const [core, punctuation] = splitTrailingPunctuation(word);
      if (TITLE_ACRONYMS.has(core.toLowerCase())) return `${core.toUpperCase()}${punctuation}`;
      return `${capitalizeWord(core)}${punctuation}`;
    })
    .join(" ");
}

function formatEmail(value: string): string {
  const trimmed = value.trim();
  const at = trimmed.lastIndexOf("@");
  if (at === -1) return trimmed;
  // Only the domain is case-insensitive by spec; leave the local part exactly
  // as the user gave it rather than gamble on a case-sensitive mailbox.
  return `${trimmed.slice(0, at)}@${trimmed.slice(at + 1).toLowerCase()}`;
}

function formatPhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  // Only reshape a plain 10-digit US number. Anything else — country code,
  // extension, non-US formatting — is left as given rather than mangled.
  if (digits.length === 10 && /^[\d\s().+-]+$/.test(trimmed)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return trimmed;
}

const ARTICLE_FILLER = /^(article|articles|no\.?|number|#|the)$/i;

// "Article 1" passes validation as an article number, and composeAmendmentText
// then prints "Article Article 1. The name of the corporation is ..." on the
// filing — found while adding the rest of this module.
function formatArticleNumber(value: string): string {
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !ARTICLE_FILLER.test(word.replace(/[.,;:]+$/, "")));
  if (words.length === 0) return value.trim();
  return words.map((word) => (/\d/.test(word) ? word : capitalizeWord(word))).join(" ");
}

const FORMATTERS: Record<string, (value: string) => string> = {
  currentName: formatCompanyName,
  newName: formatCompanyName,
  signerName: formatPersonName,
  contactPerson: formatPersonName,
  signerTitle: formatTitle,
  email: formatEmail,
  phone: formatPhone,
  articleNumber: formatArticleNumber,
  // Deliberately absent: dates (already normalized to mm/dd/yyyy), approval
  // (a canonical enum value fillCorp.ts maps to a checkbox), and
  // amendmentText (composed by us from already-formatted parts).
};

export function formatFieldValue(field: string, value: string): string {
  const formatter = FORMATTERS[field];
  return formatter ? formatter(value) : value;
}
