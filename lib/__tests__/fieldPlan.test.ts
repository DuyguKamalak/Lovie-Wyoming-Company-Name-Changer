import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LLC_FIELD_PLAN,
  CORP_FIELD_PLAN,
  nextStep,
  chipsForState,
  renderDirective,
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

test("every plan step has a fallback question, and enumerable steps have chips", () => {
  for (const step of [...LLC_FIELD_PLAN, ...CORP_FIELD_PLAN]) {
    if (step.kind !== "field") continue;
    assert.ok(step.askText.trim().length > 0, `${step.key} has no askText`);
    assert.ok(step.whatItIs.trim().length > 0, `${step.key} has no description`);
    if (step.key === "approval") {
      assert.equal(step.chips?.length, 3);
    }
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

test("renderDirective names exactly one field and lists what's already collected", () => {
  const step = nextStep("llc", { currentName: "Acme Ventures LLC" }, []);
  const directive = renderDirective(step, { currentName: "Acme Ventures LLC" });

  assert.match(directive, /CURRENT STEP/);
  assert.match(directive, /newName/);
  assert.match(directive, /currentName/); // in the already-collected list
  assert.doesNotMatch(directive, /articleNumber/); // not this step, not collected
});

test("renderDirective tells the model chips are already shown, so it skips suggest_replies", () => {
  // Both kinds of chip-carrying step: the entity type, and the Corp approval
  // question the plan supplies three options for.
  assert.match(renderDirective(nextStep(null, {}, []), {}), /suggest_replies/);

  const beforeApproval = {
    currentName: "Acme Ventures, Inc.",
    newName: "Acme Holdings, Inc.",
    articleNumber: "1",
    amendmentText: "Article 1. The name of the corporation is Acme Holdings, Inc.",
    amendmentDate: "07/01/2026",
  };
  const approvalStep = nextStep("corp", beforeApproval, [
    { role: "assistant", text: beforeApproval.amendmentText },
  ]);
  const directive = renderDirective(approvalStep, beforeApproval);
  assert.match(directive, /suggest_replies/);
  assert.match(directive, /shareholder/i);
});

test("renderDirective asks for mark_ready_for_review when nothing is left", () => {
  assert.match(renderDirective(null, {}), /mark_ready_for_review/);
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
test("every directive tells the model not to ask about the system-owned fields", () => {
  const steps = [
    nextStep(null, {}, []),
    nextStep("llc", { currentName: "Acme Ventures LLC" }, []),
    nextStep(
      "corp",
      {
        currentName: "Acme Ventures, Inc.",
        newName: "Acme Holdings, Inc.",
        articleNumber: "1",
        amendmentText: "Article 1. The name of the corporation is Acme Holdings, Inc.",
      },
      []
    ),
  ];
  for (const step of steps) {
    const directive = renderDirective(step, { signatureDate: "08/06/2026" });
    assert.match(directive, /Never ask about signatureDate/);
  }
});

// Found live: asked for the signer's name — an open-ended question — the
// model offered "John Smith" / "Jane Doe" as chips. Tapping an invented
// value turns it into something "the user said", which is the one way
// around rule 16's provenance check.
test("open-ended steps tell the model not to offer chips at all", () => {
  const step = nextStep("llc", { currentName: "Acme Ventures LLC" }, []);
  const directive = renderDirective(step, {});
  assert.match(directive, /don't call suggest_replies/);
  assert.match(directive, /open-ended/);
});

// Requested after live use: several steps ask for something the user has to
// look up or phrase precisely, and a sample answer makes the shape obvious.
test("every asked field carries an example, and the directive marks it as never-record", () => {
  for (const step of [...LLC_FIELD_PLAN, ...CORP_FIELD_PLAN]) {
    if (step.kind !== "field") continue;
    // The approval step offers its three options as chips instead.
    if (step.key === "approval") continue;
    assert.ok(step.example, `${step.key} has no example answer`);
  }

  const directive = renderDirective(nextStep("llc", {}, []), {});
  assert.match(directive, /Acme Ventures LLC/);
  assert.match(directive, /never record it as the value/);
});

// Regression guard for a bug seen in the live app: a question about the
// signer's title shipped with the three Corp approval chips under it. The
// model had recorded `approval` and asked the next question in the same
// round, and the chips came from the step that round opened with.
test("chips follow the state after the turn's records, not before", () => {
  const beforeApproval: Record<string, string> = {
    currentName: "Gamma Manufacturing Inc",
    newName: "Gamma Industries Inc",
    articleNumber: "1",
    amendmentText: "Article 1. The name of the corporation is Gamma Industries Inc.",
    amendmentDate: "07/01/2026",
  };
  const history: ChatTurn[] = [{ role: "assistant", text: beforeApproval.amendmentText }];

  assert.equal(chipsForState("corp", beforeApproval, history)?.length, 3);
  // The same turn records approval and moves to the signer's name: no chips.
  assert.equal(chipsForState("corp", { ...beforeApproval, approval: "shareholders" }, history), null);
});
