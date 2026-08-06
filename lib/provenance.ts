import { normalizeDate } from "./dateFormat";

// agent.md rule 16: a recorded value has to trace back to something the user
// actually typed. Every format check in lib/validation.ts asks "is this a
// well-formed X?" — and a fabricated value is perfectly well-formed, which is
// exactly what makes it dangerous on a document the state acts on. Two
// reproduced failures this catches: an email recorded for a question that was
// never asked ("jane.doe@example.com"), and an amendmentDate taken from the
// example the model itself had just written into its own question.
//
// Deliberately limited to the three field kinds where the comparison is
// mechanical and precise. Names and titles keep rule 15's checks instead:
// "I'm Jane" -> "Jane" is a legitimate reading, and a literal-match rule
// there would cost the user a turn for nothing.

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const MONTH_NAME = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

function pad(value: number | string): string {
  return String(value).padStart(2, "0");
}

// Every date the user's own words contain, normalized to mm/dd/yyyy so the
// comparison is about the date, not the spelling: "March 14, 2019",
// "14 March 2019", "2019-03-14" and "3/14/2019" are all the same answer.
export function datesInText(text: string): Set<string> {
  const found = new Set<string>();
  const lower = text.toLowerCase();

  for (const match of lower.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g)) {
    found.add(normalizeDate(`${match[1]}/${match[2]}/${match[3]}`));
  }
  for (const match of lower.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    found.add(`${match[2]}/${match[3]}/${match[1]}`);
  }
  // "March 14, 2019" / "Mar 14 2019"
  for (const match of lower.matchAll(new RegExp(`\\b(${MONTH_NAME})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "g"))) {
    const month = MONTHS[match[1].slice(0, 3)];
    found.add(`${pad(month)}/${pad(match[2])}/${match[3]}`);
  }
  // "14 March 2019"
  for (const match of lower.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAME})\\.?,?\\s+(\\d{4})\\b`, "g"))) {
    const month = MONTHS[match[2].slice(0, 3)];
    found.add(`${pad(month)}/${pad(match[1])}/${match[3]}`);
  }
  return found;
}

function emailsInText(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.toLowerCase().matchAll(/[^\s@,;<>()"']+@[^\s@,;<>()"']+\.[a-z]{2,}/g)) {
    // Trailing punctuation ("...@acme.com.") isn't part of the address.
    found.add(match[0].replace(/[.,;:]+$/, ""));
  }
  return found;
}

function digitsOnly(value: string): string {
  return (value.match(/\d/g) ?? []).join("");
}

// Which fields this applies to. signatureDate is absent on purpose: code
// pre-fills it (rule 13), and a user-supplied override arrives through the
// same path, where the date check below then applies to it anyway.
const PROVENANCE_DATE_FIELDS = new Set(["dateOfOriginalFiling", "amendmentDate"]);

export function valueCameFromUser(field: string, value: string, userText: string): boolean {
  if (PROVENANCE_DATE_FIELDS.has(field)) {
    return datesInText(userText).has(normalizeDate(value));
  }
  if (field === "email") {
    return emailsInText(userText).has(value.trim().toLowerCase());
  }
  if (field === "phone") {
    const digits = digitsOnly(value);
    // Guard against a value so short that it matches by accident; isValidPhone
    // already requires 7, so this only trips on values it would reject anyway.
    if (digits.length < 7) return false;
    return digitsOnly(userText).includes(digits);
  }
  return true;
}

// The examples the CURRENT STEP block asks the model to show ("for example,
// President, Manager, Managing Member") are an illustration, never an
// answer — but found immediately in live use that the model will record one
// as the value when the user's reply doesn't fit the question: asked for a
// title, the user typed a name, and "President" was recorded, a title
// nobody had said. Names and titles are outside valueCameFromUser's three
// mechanical field kinds on purpose, so this is the narrow guard for them:
// reject a value that is one of our own example tokens and appears nowhere
// in what the user typed. A user who genuinely answers "President" is
// unaffected — their own word is right there in userText.
export function isEchoedExample(
  example: string | undefined,
  value: string,
  userText: string
): boolean {
  if (!example) return false;
  const candidate = value.trim().toLowerCase();
  if (!candidate) return false;
  if (userText.toLowerCase().includes(candidate)) return false;

  return example
    .split(/,| — | - |\/|\bor\b/)
    .map((token) => token.trim().toLowerCase().replace(/^["']|["'.]+$/g, ""))
    .filter((token) => token.length > 1)
    .includes(candidate);
}
