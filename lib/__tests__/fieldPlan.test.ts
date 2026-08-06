import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LLC_FIELD_PLAN,
  CORP_FIELD_PLAN,
  nextStep,
  composeReply,
  stepForQuestion,
  ENTITY_TYPE_STEP,
  questionFor,
  renderExtractionContext,
  wasReadBackToUser,
  type ChatTurn,
  type Step,
} from "../fieldPlan";
import { LLC_REQUIRED_KEYS, CORP_REQUIRED_KEYS } from "../validation";

// The plans are the deterministic replacement for the model scheduling its
// own questions (agent.md "Flow control"). These guards are what keep them
// honest: every required field has to be reachable, and no plan may contain
// a field that isn't on its own form.

const READ_BACK_CONFIRMED: ChatTurn[] = [
  {
    role: "assistant",
    text: "Article 1. The name of the limited liability company is Acme Holdings LLC.",
  },
];

function fieldKeys(plan: typeof LLC_FIELD_PLAN): string[] {
  return plan.flatMap((step) => (step.kind === "field" ? [step.key] : []));
}

// nextStep returns a union; every assertion about "which field" wants the
// field step's key, and undefined for the entity-type/read-back steps.
function keyOf(step: Step | null): string | undefined {
  return step?.kind === "field" ? step.key : undefined;
}

test("each plan asks for every required field of its own form", () => {
  // amendmentText is composed in code and confirmed via the read-back step,
  // and signatureDate is pre-filled (agent.md rules 6/13) — neither is asked.
  const derived = new Set(["amendmentText", "signatureDate"]);

  for (const [entity, plan, required] of [
    ["llc", LLC_FIELD_PLAN, LLC_REQUIRED_KEYS],
    ["corp", CORP_FIELD_PLAN, CORP_REQUIRED_KEYS],
  ] as const) {
    const asked = new Set(fieldKeys(plan));
    for (const key of required) {
      if (derived.has(key)) continue;
      assert.ok(asked.has(key), `${entity} plan never asks for "${key}"`);
    }
  }
});

test("neither plan contains a field from the other entity's form", () => {
  assert.ok(!fieldKeys(LLC_FIELD_PLAN).some((k) => k === "approval" || k === "amendmentDate"));
  assert.ok(!fieldKeys(CORP_FIELD_PLAN).includes("dateOfOriginalFiling"));
});

test("every plan step carries its own verbatim question and retry note", () => {
  for (const step of [...LLC_FIELD_PLAN, ...CORP_FIELD_PLAN]) {
    if (step.kind !== "field") continue;
    assert.ok(step.question.trim().length > 0, `${step.key} has no question text`);
    assert.ok(step.retryNote.trim().length > 0, `${step.key} has no retry note`);
    if (step.key === "approval") {
      assert.equal(step.chips?.length, 3);
    }
  }
});

// The examples live inside the fixed question text, so there is no example
// for the model to invent — and no question whose wording can drift.
test("every asked field shows an example inside its own question text", () => {
  for (const step of [...LLC_FIELD_PLAN, ...CORP_FIELD_PLAN]) {
    if (step.kind !== "field" || step.key === "approval") continue;
    assert.match(step.question, /for example/i, `${step.key} shows no example`);
  }
});

test("the entity type comes before anything else", () => {
  const step = nextStep(null, {}, []);
  assert.equal(step?.kind, "entityType");
  assert.equal(step?.chips?.length, 2);
});

test("nextStep returns the first missing field, skipping what's collected", () => {
  assert.equal(keyOf(nextStep("llc", {}, [])), "currentName");
  assert.equal(keyOf(nextStep("llc", { currentName: "Acme Ventures LLC" }, [])), "newName");
  // Blank counts as missing, same as absent.
  assert.equal(keyOf(nextStep("llc", { currentName: "   " }, [])), "currentName");
});

// The point of the redesign: a user who volunteers several fields at once
// doesn't get asked about them again — the step is computed from the fields,
// not from what the model remembers asking.
test("nextStep skips ahead when the user volunteered several fields at once", () => {
  const step = nextStep(
    "corp",
    {
      currentName: "Acme Ventures, Inc.",
      newName: "Acme Holdings, Inc.",
      articleNumber: "1",
      amendmentText: "Article 1. The name of the corporation is Acme Holdings, Inc.",
      amendmentDate: "07/01/2026",
    },
    [{ role: "assistant", text: "Article 1. The name of the corporation is Acme Holdings, Inc." }]
  );
  assert.equal(keyOf(step), "approval");
});

// Reproduced bug: a Corp run was asked for dateOfOriginalFiling, an LLC-only
// field. Recording it was already refused; now it can't even be asked.
test("nextStep never asks a Corp user for an LLC-only field", () => {
  const fields: Record<string, string> = {
    currentName: "Acme Ventures, Inc.",
    newName: "Acme Holdings, Inc.",
    articleNumber: "1",
    amendmentText: "Article 1. The name of the corporation is Acme Holdings, Inc.",
  };
  const seen: string[] = [];
  // Walk the whole plan, filling each step as it's asked.
  for (let i = 0; i < 20; i++) {
    const step = nextStep("corp", fields, [
      { role: "assistant", text: fields.amendmentText },
    ]);
    if (!step) break;
    if (step.kind !== "field") break;
    seen.push(step.key);
    fields[step.key] = step.key === "approval" ? "board" : "filled";
  }
  assert.ok(!seen.includes("dateOfOriginalFiling"));
  assert.deepEqual(seen, ["amendmentDate", "approval", "signerName", "signerTitle", "contactPerson", "phone", "email"]);
});

test("the read-back step comes after the name fields and before the rest", () => {
  const fields = {
    currentName: "Acme Ventures LLC",
    newName: "Acme Holdings LLC",
    articleNumber: "1",
    amendmentText: "Article 1. The name of the limited liability company is Acme Holdings LLC.",
  };
  const step = nextStep("llc", fields, []);
  assert.equal(step?.kind, "readBack");
  assert.equal(step?.chips?.length, 2);

  // Once it's been shown, the plan moves on.
  assert.equal(keyOf(nextStep("llc", fields, READ_BACK_CONFIRMED)), "dateOfOriginalFiling");
});

test("nextStep returns null only when everything is collected and confirmed", () => {
  const complete: Record<string, string> = {
    currentName: "Acme Ventures LLC",
    newName: "Acme Holdings LLC",
    articleNumber: "1",
    amendmentText: "Article 1. The name of the limited liability company is Acme Holdings LLC.",
    dateOfOriginalFiling: "01/15/2020",
    signatureDate: "08/06/2026",
    signerName: "Jordan Smith",
    signerTitle: "Manager",
    contactPerson: "Jordan Smith",
    phone: "307-555-0100",
    email: "jordan@example.com",
  };
  assert.equal(nextStep("llc", complete, READ_BACK_CONFIRMED), null);
  // Same fields, but the text was never shown to the user.
  assert.equal(nextStep("llc", complete, [])?.kind, "readBack");
});




test("wasReadBackToUser ignores markdown decoration and whitespace, not wording", () => {
  const text = "Article 1. The name of the corporation is Acme Holdings, Inc.";
  assert.equal(
    wasReadBackToUser(text, [
      { role: "assistant", text: "> **Article 1.**  The name of the\ncorporation is Acme Holdings, Inc." },
    ]),
    true
  );
  // Said by the user, not read back by the assistant — doesn't count.
  assert.equal(wasReadBackToUser(text, [{ role: "user", text }]), false);
  assert.equal(
    wasReadBackToUser(text, [
      { role: "assistant", text: "Article 1. The name of the corporation is Acme Ventures, Inc." },
    ]),
    false
  );
});

// Reproduced live after the prompt was slimmed: with rule 13's paragraph
// gone from the system prompt, the model started asking "what date are you
// signing this?" — a question with no step, about a field code already set.
// The instruction now travels with the step instead.

// Found live: asked for the signer's name — an open-ended question — the
// model offered "John Smith" / "Jane Doe" as chips. Tapping an invented
// value turns it into something "the user said", which is the one way
// around rule 16's provenance check.

// The reply is assembled in code, so text and chips come from the same step
// object. Reported from the live app before this change: a question about
// the signer's title shipped under the three Corp approval chips.
test("composeReply pairs each question with its own chips, and nothing else", () => {
  const beforeApproval: Record<string, string> = {
    currentName: "Gamma Manufacturing Inc",
    newName: "Gamma Industries Inc",
    articleNumber: "1",
    amendmentText: "Article 1. The name of the corporation is Gamma Industries Inc.",
    amendmentDate: "07/01/2026",
  };
  const history: ChatTurn[] = [{ role: "assistant", text: beforeApproval.amendmentText }];
  const clean = { rejected: false, recordedNothing: false, sameStep: false, askedForAdvice: false, askedAQuestion: false };

  const approval = composeReply(nextStep("corp", beforeApproval, history)!, beforeApproval, clean);
  assert.match(approval.reply, /how the amendment was approved/i);
  assert.equal(approval.suggestedReplies?.length, 3);

  const afterApproval = { ...beforeApproval, approval: "shareholders" };
  const signer = composeReply(nextStep("corp", afterApproval, history)!, afterApproval, clean);
  assert.match(signer.reply, /signing the amendment/i);
  assert.equal(signer.suggestedReplies, null);
});

test("composeReply explains a rejected answer, then repeats the same question", () => {
  const step = nextStep("llc", { currentName: "Acme Ventures LLC" }, [])!;
  const { reply } = composeReply(step, {}, { rejected: true, recordedNothing: true, sameStep: true, askedForAdvice: false, askedAQuestion: false });

  assert.match(reply, /missing a valid designator/i);   // the step's retry note
  assert.match(reply, /What would you like the new name to be\?/); // verbatim question
});

test("composeReply says so when nothing was understood, but not when the flow moved on", () => {
  const step = nextStep("llc", {}, [])!;
  const stuck = composeReply(step, {}, { rejected: false, recordedNothing: true, sameStep: true, askedForAdvice: false, askedAQuestion: false });
  assert.match(stuck.reply, /didn't catch that/i);

  const moved = composeReply(step, {}, { rejected: false, recordedNothing: true, sameStep: false, askedForAdvice: false, askedAQuestion: false });
  assert.doesNotMatch(moved.reply, /didn't catch that/i);
});

// Same state, same words — every time. This is the whole point of the
// redesign: the question text is data, not a generated sentence.
test("the same step always produces byte-identical text", () => {
  const fields = { currentName: "Acme Ventures LLC" };
  const step = nextStep("llc", fields, [])!;
  const clean = { rejected: false, recordedNothing: false, sameStep: false, askedForAdvice: false, askedAQuestion: false };
  assert.equal(composeReply(step, fields, clean).reply, composeReply(step, fields, clean).reply);
  assert.equal(questionFor(step, fields), (step as { question: string }).question);
});

test("the extraction context names the current question and the field it fills", () => {
  const fields = { currentName: "Acme Ventures LLC" };
  const context = renderExtractionContext(nextStep("llc", fields, []), "llc", fields);
  assert.match(context, /CURRENT QUESTION/);
  assert.match(context, /newName/);
  assert.match(context, /Already recorded/);
});

// Reported live: tapping "Yes, that's the text" on the read-back produced
// "That doesn't look like a real date" above the adoption-date question —
// the confirmation had been treated as an answer to the next question,
// because the step was inferred from the fields instead of from what was
// actually asked.
test("stepForQuestion identifies the question the user is answering", () => {
  const fields = {
    currentName: "Acme Ventures, Inc.",
    newName: "Acme Holdings, Inc.",
    articleNumber: "1",
    amendmentText: "Article 1. The name of the corporation is Acme Holdings, Inc.",
  };

  const readBack = questionFor(nextStep("corp", fields, [])!, fields);
  assert.equal(stepForQuestion(readBack, "corp", fields)?.kind, "readBack");

  const dateStep = CORP_FIELD_PLAN.find((s) => s.kind === "field" && s.key === "amendmentDate")!;
  const asked = questionFor(dateStep, fields);
  const found = stepForQuestion(asked, "corp", fields);
  assert.equal(found?.kind, "field");
  assert.equal((found as { key: string }).key, "amendmentDate");

  // A retry note ahead of the question doesn't change which question it is.
  const afterNote = stepForQuestion(`That doesn't look like a real date.\n\n${asked}`, "corp", fields);
  assert.equal((afterNote as { key: string }).key, "amendmentDate");

  assert.equal(stepForQuestion(ENTITY_TYPE_STEP.question, null, {}), ENTITY_TYPE_STEP);
  assert.equal(stepForQuestion("something we never said", "corp", fields), null);
});

// (c) from the design discussion: the agent still writes nothing, so "why do
// you even need this?" is answered by one fixed sentence per step rather
// than by a model turn. Same words every time, then the same question again.
test("an unanswered question comes back with a fixed reason, not a bare repeat", () => {
  const step = nextStep("llc", { currentName: "Acme Ventures LLC" }, [])!;
  const { reply } = composeReply(step, {}, {
    rejected: false,
    recordedNothing: true,
    sameStep: true,
    askedForAdvice: false,
    askedAQuestion: false,
  });

  assert.match(reply, /I didn't catch that\./);
  assert.match(reply, /the whole point of the filing/); // the step's fixed `why`
  assert.match(reply, /What would you like the new name to be\?/);
});

test("every step has a reason it can give for asking", () => {
  for (const step of [...LLC_FIELD_PLAN, ...CORP_FIELD_PLAN, ENTITY_TYPE_STEP]) {
    assert.ok(step.why.trim().length > 0, `${step.kind === "field" ? step.key : step.kind} has no why`);
  }
});

// agent.md rule 2 used to live in the system prompt. The model no longer
// writes anything the user reads, so the rule is enforced here instead.
test("a request for legal or tax advice gets the disclaimer, then the question again", () => {
  const step = nextStep("llc", { currentName: "Acme Ventures LLC" }, [])!;
  const { reply } = composeReply(step, {}, {
    rejected: false,
    recordedNothing: true,
    sameStep: true,
    askedForAdvice: true,
    askedAQuestion: true,
  });

  assert.match(reply, /can't advise/i);
  assert.match(reply, /lawyer or accountant/i);
  assert.match(reply, /What would you like the new name to be\?/);
});

test("a user who asks why gets the reason, without being told they weren't understood", () => {
  const step = nextStep("llc", { currentName: "Acme Ventures LLC" }, [])!;
  const { reply } = composeReply(step, {}, {
    rejected: false,
    recordedNothing: true,
    sameStep: true,
    askedForAdvice: false,
    askedAQuestion: true,
  });

  assert.doesNotMatch(reply, /didn't catch that/i);
  assert.match(reply, /the whole point of the filing/);
  assert.match(reply, /What would you like the new name to be\?/);
});
