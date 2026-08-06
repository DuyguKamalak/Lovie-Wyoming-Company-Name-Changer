// agent.md rule 2 is non-negotiable — asked whether to do a DBA instead, or
// what this does to their taxes, the tool has to say plainly that it can't
// advise and point at a lawyer or accountant. That rule used to live in the
// system prompt, but the model no longer writes anything the user reads
// ("Flow control"), so the prompt can't enforce it any more. Detecting the
// question here keeps the rule working with the same fixed-text guarantee as
// every other reply: one sentence, identical every time, then the current
// question again.

export const ADVICE_DISCLAIMER =
  "I can't advise on that — I only prepare the paperwork, and a lawyer or accountant is the right person to ask.";

// Deliberately narrow. A false positive costs a user one accurate but
// unhelpful sentence above a question they were going to be asked anyway; a
// false negative just falls through to the ordinary "I didn't catch that"
// path. Neither is worth a cleverer classifier — and a classifier is a model
// call, which is the thing this design is trying not to depend on.
const ADVICE_PATTERNS: RegExp[] = [
  /\bshould i\b/i,
  /\bdo i (need|have) to\b/i,
  /\bis it (legal|better|worth|smart|safe|a good idea)\b/i,
  /\bwhat (do|would) you (recommend|suggest|advise)\b/i,
  /\badvice\b/i,
  /\btax(es|able)?\b/i,
  /\bdba\b/i,
  /\btrademark/i,
  /\bliab(le|ility)\b/i,
  /\bsue|lawsuit|attorney|lawyer\b/i,
];

export function looksLikeAdviceRequest(text: string): boolean {
  return ADVICE_PATTERNS.some((pattern) => pattern.test(text));
}
