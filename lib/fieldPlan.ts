import type { EntityType } from "./types";

// Who asks what, and in which order — see agent.md's "Flow control" section
// for why this moved out of the system prompt. The short version: the order
// of questions is a deterministic function of the entity type and what's
// already collected, and the model scheduling it from prose produced
// off-form questions (a Corp user asked for dateOfOriginalFiling), repeated
// questions (the same one three turns running), and invented answers to
// questions it never asked. The model still phrases every question; it just
// doesn't choose which one.

// A structural match for lib/gemini.ts's ChatMessage. Declared here rather
// than imported so the plan has no dependency on the agent runtime — gemini
// imports this module, not the other way around.
export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface FieldStep {
  kind: "field";
  /** record_field key this step collects. */
  key: string;
  /** One line telling the model what the field actually means. */
  whatItIs: string;
  /** Required shape, when there is one (dates). */
  format?: string;
  /** Quick replies the server ships directly — see agent.md rule 11. */
  chips?: string[];
  /**
   * A concrete sample answer to show in the question ("for example,
   * 03/14/2019"). Requested after live use: several steps ask for something
   * the user has to look up or phrase precisely, and a shape to copy makes
   * that obvious. Never a value to record — the directive says so, and
   * provenance (agent.md rule 16) enforces it for dates, email and phone.
   */
  example?: string;
  /**
   * Deterministic phrasing, used only when code has to ask without a model
   * turn (reconcileReadyForReview's last-resort veto). The normal path lets
   * the model phrase the question itself.
   */
  askText: string;
}

export interface EntityTypeStep {
  kind: "entityType";
  chips: string[];
  askText: string;
}

export interface ReadBackStep {
  kind: "readBack";
  chips: string[];
}

export type Step = FieldStep | EntityTypeStep | ReadBackStep;

export const ENTITY_TYPE_STEP: EntityTypeStep = {
  kind: "entityType",
  chips: ["Wyoming LLC", "Wyoming Corporation"],
  askText:
    "First — is your company a Wyoming LLC or a Wyoming Corporation? The two have different official amendment forms.",
};

export const READ_BACK_STEP: ReadBackStep = {
  kind: "readBack",
  chips: ["Yes, that's the text", "No, let me change it"],
};

const SIGNER_STEPS: FieldStep[] = [
  {
    kind: "field",
    key: "signerName",
    whatItIs: "the full name of the person who will sign the amendment, as it should be printed",
    example: "Jane Doe",
    askText: "Who's signing the amendment? I need their full name as it should be printed on the form.",
  },
  {
    kind: "field",
    key: "signerTitle",
    whatItIs: "the signer's title in the company",
    example: "President, Manager, Managing Member",
    askText: "What's that person's title in the company?",
  },
  {
    kind: "field",
    key: "contactPerson",
    whatItIs: "who the Secretary of State should contact about this filing (often the same person)",
    example: "Jane Doe — or just say \"same\" if it's the signer",
    askText: "Who should the Secretary of State contact about this filing?",
  },
  {
    kind: "field",
    key: "phone",
    whatItIs: "a daytime phone number for the contact person",
    example: "307-555-0142",
    askText: "What's the daytime phone number for that contact?",
  },
  {
    kind: "field",
    key: "email",
    whatItIs:
      "the contact person's email address — the state sends reminders, notices and filing evidence here",
    example: "jane@acmeventures.com",
    askText: "And the contact's email address? The state sends filing evidence and notices there.",
  },
];

// Name fields first (that's what the user came to do), then the read-back of
// the exact text being filed, then the paperwork details. spec.md §5.1/§5.2
// define the field sets; this is the order they're asked in, not the order
// they're printed.
const NAME_STEPS = (label: "LLC" | "corporation"): FieldStep[] => [
  {
    kind: "field",
    key: "currentName",
    whatItIs: `the ${label}'s current legal name, exactly as it appears on file with the Wyoming Secretary of State`,
    example: label === "LLC" ? "Acme Ventures LLC" : "Acme Ventures, Inc.",
    askText: `What's the ${label}'s current legal name, exactly as it's on file with the Wyoming Secretary of State?`,
  },
  {
    kind: "field",
    key: "newName",
    whatItIs: `the new legal name, which must end in a valid ${label === "LLC" ? "LLC" : "corporate"} designator`,
    example: label === "LLC" ? "Acme Holdings LLC" : "Acme Holdings, Inc.",
    askText: `What would you like the new name to be?`,
  },
  {
    kind: "field",
    key: "articleNumber",
    whatItIs: `the number of the article being amended — the one that states the company name in the original articles of ${label === "LLC" ? "organization" : "incorporation"}, usually 1`,
    example: "1",
    askText: `Which article number states the company name in your original articles of ${label === "LLC" ? "organization" : "incorporation"}? It's usually Article 1.`,
  },
];

export const LLC_FIELD_PLAN: Step[] = [
  ...NAME_STEPS("LLC"),
  READ_BACK_STEP,
  {
    kind: "field",
    key: "dateOfOriginalFiling",
    whatItIs: "the date the LLC's original Articles of Organization were filed with the Wyoming Secretary of State",
    format: "mm/dd/yyyy",
    example: "03/14/2019",
    askText:
      "What date were your original Articles of Organization filed with the Wyoming Secretary of State? (mm/dd/yyyy)",
  },
  ...SIGNER_STEPS,
];

export const CORP_FIELD_PLAN: Step[] = [
  ...NAME_STEPS("corporation"),
  READ_BACK_STEP,
  {
    kind: "field",
    key: "amendmentDate",
    whatItIs: "the date the amendment was adopted by the corporation",
    format: "mm/dd/yyyy",
    example: "06/15/2026",
    askText: "What date was this amendment adopted? (mm/dd/yyyy)",
  },
  {
    kind: "field",
    key: "approval",
    whatItIs:
      'how the amendment was approved — record exactly one of "incorporators" (no shares issued yet), "board" (shares issued, board adopted it without a shareholder vote) or "shareholders" (shares issued, adopted with shareholder approval)',
    // agent.md rule 8: plain language, never statute citations, and never
    // bundled with another question.
    chips: ["No shares issued yet", "Board, no shareholder vote", "Board with shareholder approval"],
    askText: `One legal detail decides which box gets checked on the form — which of these describes how the amendment was approved?

1. Shares haven't been issued yet, and the incorporators or board adopted it.
2. Shares were issued, and the board adopted it without a shareholder vote.
3. Shares were issued, and the board adopted it with shareholder approval.`,
  },
  ...SIGNER_STEPS,
];

export function planFor(entityType: EntityType): Step[] {
  return entityType === "llc" ? LLC_FIELD_PLAN : CORP_FIELD_PLAN;
}

function normalizeForCompare(value: string): string {
  // Markdown decoration only — the model reads the text back as
  // "> **Article 1.** The name of..." and that is still a faithful
  // read-back. Wording differences are NOT normalized away.
  return value
    .replace(/[*_>`#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Did the assistant actually show the user this exact amendment text at some
// point? Only assistant turns count — the same string appearing in a user
// message is the user typing it, not us reading it back for confirmation.
export function wasReadBackToUser(amendmentText: string, history: ChatTurn[]): boolean {
  const needle = normalizeForCompare(amendmentText);
  if (!needle) return false;
  return history.some(
    (message) => message.role === "assistant" && normalizeForCompare(message.text).includes(needle)
  );
}

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim() === "";
}

/**
 * The one thing to ask about right now, or null when everything is collected
 * and the amendment text has been confirmed.
 *
 * `history` is optional: omit it (as the pure-veto path does) to treat the
 * read-back step as already satisfied rather than assert it from nothing.
 */
export function nextStep(
  entityType: EntityType | null,
  knownFields: Record<string, string>,
  history?: ChatTurn[]
): Step | null {
  if (!entityType) return ENTITY_TYPE_STEP;

  for (const step of planFor(entityType)) {
    if (step.kind === "field") {
      if (isBlank(knownFields[step.key])) return step;
      continue;
    }
    if (step.kind === "readBack") {
      // Nothing to read back yet — the text is composed from newName +
      // articleNumber, so this only happens if one of them is still missing,
      // and the loop is about to return that field anyway.
      if (isBlank(knownFields.amendmentText)) continue;
      if (history && !wasReadBackToUser(knownFields.amendmentText, history)) return step;
    }
  }
  return null;
}

function collectedList(knownFields: Record<string, string>): string {
  const keys = Object.keys(knownFields).filter((key) => !isBlank(knownFields[key]));
  return keys.length > 0 ? keys.join(", ") : "nothing yet";
}

/** The per-turn CURRENT STEP block injected into the system instruction. */
export function renderDirective(step: Step | null, knownFields: Record<string, string>): string {
  if (!step) {
    return `CURRENT STEP — every field is collected and the amendment text is confirmed. Call mark_ready_for_review, and tell the user they're heading to the review screen.`;
  }

  // The two fields the system owns. Slimming the prompt dropped its
  // "signatureDate is pre-filled, don't ask about it" paragraph (rule 13),
  // and the model immediately started asking "what date are you signing
  // this?" mid-flow — a question with no step, about a field already set.
  // The instruction belongs here, next to the step, not back in the prompt.
  const NEVER_ASK =
    "Never ask about signatureDate (already set to today's date for you — only record it if the user volunteers a different one) or amendmentText (composed for you).";

  const chipsLine = (chips: string[]) =>
    `Quick-reply chips are already shown to the user (${chips
      .map((c) => `"${c}"`)
      .join(", ")}) — don't call suggest_replies for this question.`;

  if (step.kind === "entityType") {
    return [
      "CURRENT STEP — ask whether this is a Wyoming LLC or a Wyoming Corporation, and nothing else.",
      "Call set_entity_type as soon as they answer; every other field depends on it.",
      chipsLine(step.chips),
      NEVER_ASK,
    ].join("\n");
  }

  if (step.kind === "readBack") {
    return [
      "CURRENT STEP — read the amendment text back to the user, word for word, and ask whether that's exactly what they want to file. Ask nothing else in this message.",
      `The text, already recorded for you: "${knownFields.amendmentText ?? ""}"`,
      "Don't rewrite it. If they want it different, the fix is to correct the new name or article number, not the sentence.",
      chipsLine(step.chips),
      NEVER_ASK,
    ].join("\n");
  }

  return [
    "CURRENT STEP — ask about this field and nothing else:",
    `  field: ${step.key}`,
    `  what it is: ${step.whatItIs}`,
    ...(step.format ? [`  required format: ${step.format}`] : []),
    ...(step.example
      ? [
          `  show this example in your question so they can see the shape expected: ${step.example}`,
          "  the example is an illustration, never their answer — never record it as the value",
        ]
      : []),
    // A step without chips is open-ended by construction. Found live: asked
    // for the signer's name, the model offered "John Smith" / "Jane Doe" as
    // chips — names nobody had mentioned. Tapping one would launder an
    // invented value into "the user said it", which is the one path around
    // rule 16's provenance check.
    ...(step.chips
      ? [chipsLine(step.chips)]
      : [
          "This answer is open-ended (a name, date or free text) — don't call suggest_replies, and never offer an example value as if it were the user's answer.",
        ]),
    `Already collected — don't re-ask and don't re-record: ${collectedList(knownFields)}.`,
    NEVER_ASK,
    "If the user's message also states other fields, record every one of them too; the next step skips ahead accordingly.",
  ].join("\n");
}

// The chips that belong with a reply, given the state *after* that turn's
// record_field calls. Reported from the live app: the model recorded
// `approval` and asked the next question ("what's your title?") in the same
// round, and chips taken from the round's opening step put the three
// approval options under a title question. Deriving them from the final
// state instead means the chips always match the step the model was asked
// to be on.
export function chipsForState(
  entityType: EntityType | null,
  knownFields: Record<string, string>,
  history?: ChatTurn[]
): string[] | null {
  return nextStep(entityType, knownFields, history)?.chips ?? null;
}

// The example shown for a field, so record_field can tell a real answer from
// the model echoing our own illustration back — see isEchoedExample.
export function exampleFor(entityType: EntityType | null, field: string): string | undefined {
  if (!entityType) return undefined;
  for (const step of planFor(entityType)) {
    if (step.kind === "field" && step.key === field) return step.example;
  }
  return undefined;
}
