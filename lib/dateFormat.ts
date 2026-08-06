// Safety net behind agent.md rule 10: the official forms print
// "(mm/dd/yyyy)" next to every date field, so that's the only acceptable
// output format. Found during T014 testing that the model sometimes
// records ISO dates (2026-08-01) instead — this normalizes known date
// fields server-side rather than trusting prompt instructions alone for
// formatting that ends up on a legal document.
export const DATE_FIELD_KEYS = new Set(["dateOfOriginalFiling", "signatureDate", "amendmentDate"]);

export function normalizeDate(value: string): string {
  const trimmed = value.trim();

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    return trimmed; // already mm/dd/yyyy
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${m}/${d}/${y}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    const dd = String(parsed.getDate()).padStart(2, "0");
    return `${mm}/${dd}/${parsed.getFullYear()}`;
  }

  // Couldn't confidently parse it — leave as-is rather than guess wrong;
  // it'll be visibly editable on the review screen either way.
  return trimmed;
}

// normalizeDate's "already mm/dd/yyyy" fast path only checks digit shape,
// not calendar validity — "13/45/2020" matches the regex and would pass
// through unchanged onto a legal document. Reconstructing a Date from the
// parsed parts and checking it round-trips back to the same
// month/day/year catches impossible dates (month 13, Feb 30, etc.),
// including invalid leap days, since JS Date silently rolls those over
// into a different real date instead of throwing.
export function isValidDate(value: string): boolean {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return false;
  const [, mm, dd, yyyy] = match.map(Number);
  const date = new Date(yyyy, mm - 1, dd);
  return date.getFullYear() === yyyy && date.getMonth() === mm - 1 && date.getDate() === dd;
}

// Deterministic mm/dd/yyyy for "today", in the server's local time. Used to
// pre-fill signatureDate in code rather than letting the model guess it —
// found via real user testing that the model will otherwise invent a
// plausible-looking date (e.g. "01/15/2023") that nobody ever said, which is
// exactly the kind of hallucination that shouldn't land on a legal document.
// The review screen still lets the user override it (e.g. signing later).
export function getTodayFormatted(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${now.getFullYear()}`;
}
