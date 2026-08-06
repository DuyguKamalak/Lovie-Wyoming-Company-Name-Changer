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
