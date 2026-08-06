import type { EntityType } from "./types";

// Every question the user sees, in the order they see them — see agent.md's
// "Flow control" section. Both the order and the exact wording live here
// because each earlier version left the model one more thing to decide, and
// it eventually decided each of them wrong: an LLC-only field asked of a
// Corp user, the same question three turns running, an email recorded for a
// question never asked, a title question shipped under the approval chips,
// and the example from our own prompt recorded as someone's title.
//
// The model reads answers. It does not write questions.

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
  /** Shown to the user verbatim. Examples live in this text, so no example can be invented. */
  question: string;
  /** Quick replies, shipped with the question they belong to. */
  chips?: string[];
  /** Prepended when the previous answer was rejected, ahead of the same question. */
  retryNote: string;
}

export interface EntityTypeStep {
  kind: "entityType";
  question: string;
  chips: string[];
  retryNote: string;
}

export interface ReadBackStep {
  kind: "readBack";
  chips: string[];
  retryNote: string;
}

export type Step = FieldStep | EntityTypeStep | ReadBackStep;

export const ENTITY_TYPE_STEP: EntityTypeStep = {
  kind: "entityType",
  question:
    "First — is your company a Wyoming LLC or a Wyoming Corporation? The two file different amendment forms.",
  chips: ["Wyoming LLC", "Wyoming Corporation"],
  retryNote: "I need to know which one it is before anything else.",
};

export const READ_BACK_STEP: ReadBackStep = {
  kind: "readBack",
  chips: ["Yes, that's the text", "No, let me change it"],
  retryNote: "Let's confirm the wording first.",
};

// The read-back is the one question with a value in it, so it's a template
// rather than a constant. agent.md rule 6: verbatim, and confirmed before
// anything else happens with it.
export function readBackQuestion(amendmentText: string): string {
  return `Here's the exact text that will be printed on the form:\n\n"${amendmentText}"\n\nIs that word-for-word what you want to file?`;
}

function signerSteps(entityLabel: "LLC" | "corporation"): FieldStep[] {
  const titleExamples =
    entityLabel === "LLC" ? "Manager, Managing Member, Member" : "President, Vice President, Secretary";
  return [
    {
      kind: "field",
      key: "signerName",
      question:
        "Who's signing the amendment? I need their full name as it should be printed on the form. (for example, Jane Doe)",
      retryNote: "That doesn't look like a person's full name.",
    },
    {
      kind: "field",
      key: "signerTitle",
      question: `What's that person's title in the company? (for example, ${titleExamples})`,
      retryNote: "That doesn't look like a title.",
    },
    {
      kind: "field",
      key: "contactPerson",
      question:
        'Who should the Secretary of State contact about this filing? Say "same" if it\'s the person signing. (for example, Jane Doe)',
      retryNote: "That doesn't look like a person's name.",
    },
    {
      kind: "field",
      key: "phone",
      question: "What's a daytime phone number for that contact? (for example, 307-555-0142)",
      retryNote: "That doesn't look like a phone number.",
    },
    {
      kind: "field",
      key: "email",
      question:
        "And their email address? The state sends reminders, notices and filing evidence there. (for example, jane@acmeventures.com)",
      retryNote: "That doesn't look like an email address.",
    },
  ];
}

// Name fields first (that's what the user came to do), then the read-back of
// the exact text being filed, then the paperwork details.
function nameSteps(entityLabel: "LLC" | "corporation"): FieldStep[] {
  const isLlc = entityLabel === "LLC";
  return [
    {
      kind: "field",
      key: "currentName",
      question: `What's the ${entityLabel}'s current legal name, exactly as it appears on file with the Wyoming Secretary of State? (for example, ${
        isLlc ? "Acme Ventures LLC" : "Acme Ventures, Inc."
      })`,
      retryNote: `That doesn't look like a full legal ${entityLabel} name.`,
    },
    {
      kind: "field",
      key: "newName",
      question: isLlc
        ? 'What would you like the new name to be? Wyoming requires it to end in "LLC", "L.L.C." or "Limited Liability Company". (for example, Acme Holdings LLC)'
        : 'What would you like the new name to be? Wyoming requires it to end in a corporate designator — "Inc.", "Corporation", "Corp.", "Company", "Limited" or "Ltd.". (for example, Acme Holdings, Inc.)',
      retryNote: "That name is missing a valid designator, or it matches the current name.",
    },
    {
      kind: "field",
      key: "articleNumber",
      question: `Which article of your original articles of ${
        isLlc ? "organization" : "incorporation"
      } states the company name? It's usually Article 1. (for example, 1)`,
      retryNote: "That doesn't look like an article number.",
    },
  ];
}

export const LLC_FIELD_PLAN: Step[] = [
  ...nameSteps("LLC"),
  READ_BACK_STEP,
  {
    kind: "field",
    key: "dateOfOriginalFiling",
    question:
      "What date were your original Articles of Organization filed with the Wyoming Secretary of State? Use mm/dd/yyyy. (for example, 03/14/2019)",
    retryNote: "That doesn't look like a real date in mm/dd/yyyy form.",
  },
  ...signerSteps("LLC"),
];

export const CORP_FIELD_PLAN: Step[] = [
  ...nameSteps("corporation"),
  READ_BACK_STEP,
  {
    kind: "field",
    key: "amendmentDate",
    question: "What date was this amendment adopted? Use mm/dd/yyyy. (for example, 06/15/2026)",
    retryNote: "That doesn't look like a real date in mm/dd/yyyy form.",
  },
  {
    // agent.md rule 8: plain language, never statute citations, never bundled
    // with another question, and always with its three options attached.
    kind: "field",
    key: "approval",
    question: `One legal detail decides which box gets checked on the form — which of these describes how the amendment was approved?

1. Shares haven't been issued yet, and the incorporators or board adopted it.
2. Shares were issued, and the board adopted it without a shareholder vote.
3. Shares were issued, and the board adopted it with shareholder approval.`,
    chips: ["No shares issued yet", "Board, no shareholder vote", "Board with shareholder approval"],
    retryNote: "I need to know which of the three situations applies — it decides a checkbox on the form.",
  },
  ...signerSteps("corporation"),
];

export const DONE_REPLY =
  "That's everything. Taking you to the review screen, where you can check and edit every field before downloading the form.";

export function planFor(entityType: EntityType): Step[] {
  return entityType === "llc" ? LLC_FIELD_PLAN : CORP_FIELD_PLAN;
}

function normalizeForCompare(value: string): string {
  // Markdown decoration only — a read-back quoted as "> **Article 1.** ..."
  // is still a faithful read-back. Wording differences are NOT normalized.
  return value
    .replace(/[*_>`#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Did the user actually see this amendment text? Only assistant turns count —
// the same string in a user message is the user typing it, not us showing it.
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
 * The one thing to ask right now, or null when everything is collected and
 * the amendment text has been confirmed. `history` may be omitted to treat
 * the read-back as already satisfied.
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
      // Nothing to read back yet — the text is derived from newName +
      // articleNumber, and the loop is about to return whichever is missing.
      if (isBlank(knownFields.amendmentText)) continue;
      if (history && !wasReadBackToUser(knownFields.amendmentText, history)) return step;
    }
  }
  return null;
}

export function questionFor(step: Step, knownFields: Record<string, string>): string {
  return step.kind === "readBack" ? readBackQuestion(knownFields.amendmentText ?? "") : step.question;
}

export interface TurnOutcome {
  /** A record_field for this step's field was refused (bad value, or not something the user said). */
  rejected: boolean;
  /** Nothing at all was extracted from the user's message. */
  recordedNothing: boolean;
  /** The step didn't move — so the user is being asked the same thing again. */
  sameStep: boolean;
}

/**
 * The whole assistant reply, assembled in code: an optional one-line note
 * about the previous answer, then this step's question. Text and chips come
 * from the same step object, so they cannot disagree — which is exactly how
 * a title question ended up under the three approval chips before.
 */
export function composeReply(
  step: Step,
  knownFields: Record<string, string>,
  outcome: TurnOutcome
): { reply: string; suggestedReplies: string[] | null } {
  const question = questionFor(step, knownFields);
  const note = outcome.rejected
    ? step.retryNote
    : outcome.recordedNothing && outcome.sameStep
      ? "I didn't catch that."
      : null;

  return {
    reply: note ? `${note}\n\n${question}` : question,
    suggestedReplies: step.chips ?? null,
  };
}

/**
 * What the model is told, so it can resolve what the user's answer refers to
 * ("same", "yes", a bare "1"). It is never asked to produce a question.
 */
export function renderExtractionContext(
  step: Step | null,
  entityType: EntityType | null,
  knownFields: Record<string, string>
): string {
  const collected = Object.entries(knownFields)
    .filter(([, value]) => !isBlank(value))
    .map(([key, value]) => `- ${key}: ${value}`);

  return [
    `entityType: ${entityType ?? "unknown"}`,
    collected.length > 0 ? `Already recorded:\n${collected.join("\n")}` : "Already recorded: nothing yet.",
    step
      ? `CURRENT QUESTION (what the user's message is answering):\n${questionFor(step, knownFields)}`
      : "CURRENT QUESTION: none — everything is collected.",
    step?.kind === "field"
      ? `That question collects the field: ${step.key}`
      : step?.kind === "entityType"
        ? "That question is answered with set_entity_type, not record_field."
        : "That question only asks for confirmation — record nothing unless the user changes a value.",
  ].join("\n\n");
}

/**
 * Which step the user's message is answering, found by matching the last
 * thing the assistant said against the plan. Every question is a fixed
 * string, so this is exact rather than inferred.
 *
 * Inferring it from knownFields instead had the read-back confirmation land
 * as an answer to the *next* question: by the time the user taps "Yes,
 * that's the text", the history already contains the read-back, so the
 * derived step had moved on — and their "yes" was offered to the model as
 * an adoption date, refused, and answered with "that doesn't look like a
 * date" above a question they hadn't been asked yet.
 */
export function stepForQuestion(
  assistantText: string,
  entityType: EntityType | null,
  knownFields: Record<string, string>
): Step | null {
  // A reply may carry a retry note ahead of the question; the question is
  // always the last paragraph.
  const paragraphs = assistantText.trim().split("\n\n");
  const question = paragraphs[paragraphs.length - 1].trim();

  if (knownFields.amendmentText) {
    const readBackTail = readBackQuestion(knownFields.amendmentText).split("\n\n").slice(-1)[0].trim();
    if (question === readBackTail) return READ_BACK_STEP;
  }
  if (question === ENTITY_TYPE_STEP.question) return ENTITY_TYPE_STEP;

  for (const step of [...LLC_FIELD_PLAN, ...CORP_FIELD_PLAN]) {
    if (step.kind !== "field" || step.question !== question) continue;
    // Both plans share the signer/contact questions; prefer the active
    // entity's copy so the key lookup is unambiguous either way.
    if (!entityType) return step;
    return planFor(entityType).find((s) => s.kind === "field" && s.key === step.key) ?? step;
  }
  return null;
}
