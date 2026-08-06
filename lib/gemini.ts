import { GoogleGenAI, type FunctionDeclaration, type Content } from "@google/genai";
import type { EntityType } from "./types";
import { SYSTEM_PROMPT } from "./agentPrompt";
import {
  DATE_FIELD_KEYS,
  normalizeDate,
  getTodayFormatted,
  isValidDate,
  isNotFutureDate,
} from "./dateFormat";
import {
  humanizeFieldKey,
  isValidEmail,
  isValidPhone,
  looksLikeAName,
  looksLikeCompanyName,
  designatorAppearsInUserText,
  looksLikeArticleNumber,
  looksLikeAmendmentText,
} from "./validation";
import { composeAmendmentText } from "./composeAmendment";
import { valueCameFromUser } from "./provenance";
import { looksLikeAdviceRequest } from "./advice";
import { formatFieldValue } from "./textFormat";
import {
  DONE_REPLY,
  composeReply,
  nextStep,
  renderExtractionContext,
  stepForQuestion,
  type Step,
} from "./fieldPlan";

// Everything here implements .specify/specs/001-wyoming-name-change/agent.md
// exactly — that file is the source of truth for the four tools and the
// system prompt (constitution VI). Don't change behavior here without
// updating agent.md first.

// Verified against the live API, not assumed: gemini-2.0-flash and
// gemini-2.5-flash are both "no longer available to new users" on this
// project's key, and gemini-flash-latest (resolving today to
// gemini-3.6-flash) is capped at a mere 20 free requests/day — see
// spec.md Open Question 4 / plan.md section 9. gemini-flash-lite-latest
// worked cleanly through the full tool-calling loop in testing and isn't
// hitting that same wall, so it's the default until T017's fallback-chain
// work (agent.md) lands.
const DEFAULT_MODEL = "gemini-flash-lite-latest";

// Capacity on the free tier is per-key and the binding limit is
// requests-per-minute, so the only real lever is more keys — measured, not
// assumed: swapping to a model with a higher headline RPM (Gemma 4 31B,
// 30 RPM vs Flash Lite's 15) is actually *worse*, because its 16K
// token-per-minute cap divided by this app's ~2K-token requests works out
// to ~8 effective calls/min against Flash Lite's 15. See plan.md §9.1.
//
// So: accept any number of keys. GEMINI_API_KEYS takes a comma-separated
// list; GEMINI_API_KEY and GEMINI_API_KEY_FALLBACK remain supported (and
// are what the deployment currently sets). All sources are merged in
// order, blanks dropped, duplicates removed — a key listed twice would
// otherwise waste a failover attempt on a key already known to be failing.
export function getApiKeys(): string[] {
  const raw = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_FALLBACK,
    ...(process.env.GEMINI_API_KEYS ?? "").split(","),
  ];
  const keys = [
    ...new Set(
      raw
        .filter((key): key is string => typeof key === "string")
        .map((key) => key.trim())
        .filter((key) => key !== "")
    ),
  ];
  if (keys.length === 0) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return keys;
}

// A 4xx (bad request, content-policy rejection) will fail identically on
// retry — no point looping on those. No status at all (thrown before an
// HTTP response ever came back, e.g. a network-level failure) or a 5xx
// (Gemini's own server error) are the two shapes worth one retry.
export function isTransientError(status: number | undefined): boolean {
  return status === undefined || (status >= 500 && status < 600);
}

// Failures that are about *this key* rather than about the request, so a
// different key stands a real chance of succeeding:
//   429 — quota/rate limit exhausted on this key's project
//   403 — project denied/restricted (e.g. AI Studio wants billing enabled)
//   401 — key rejected outright
// Found the hard way from a real production 500: the primary key hit its
// per-minute rate limit (429), the code switched to the configured
// fallback key, and that key's Google project turned out to be restricted
// — returning 403 on every single call. 403 wasn't in the failover set, so
// it was thrown immediately and surfaced as "The assistant failed to
// respond", even though the *first* key would have recovered seconds
// later. Treating all three the same way means one broken key can no
// longer take the whole chat down.
export function isKeyLevelFailure(status: number | undefined): boolean {
  return status === 429 || status === 403 || status === 401;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const setEntityTypeDeclaration: FunctionDeclaration = {
  name: "set_entity_type",
  description:
    "Record which of the two supported entity types the user has, as soon as it's determined. Must be called before any record_field call.",
  parametersJsonSchema: {
    type: "object",
    properties: { entityType: { type: "string", enum: ["llc", "corp"] } },
    required: ["entityType"],
  },
};

// Keep this enum in sync with lib/types.ts (LlcFields/CorpFields) and
// agent.md's record_field schema — all three must match exactly.
export const RECORD_FIELD_KEYS = [
  "currentName",
  "articleNumber",
  "newName",
  "amendmentText",
  "signatureDate",
  "signerName",
  "signerTitle",
  "contactPerson",
  "phone",
  "email",
  "dateOfOriginalFiling",
  "amendmentDate",
  "approval",
] as const;

// Must match lib/types.ts's CorpApproval union and fillCorp.ts's
// APPROVAL_CHECKBOX keys exactly. Exported (rather than kept private next
// to executeTool) so the validation below is unit-testable without a real
// API call.
export const APPROVAL_VALUES = ["incorporators", "board", "shareholders"] as const;

export function isValidApprovalValue(value: string): value is (typeof APPROVAL_VALUES)[number] {
  return (APPROVAL_VALUES as readonly string[]).includes(value);
}

// record_field's enum is necessarily the union of both entity types' keys
// (one tool, two forms), so the schema alone can't stop the model from
// recording a Corp-only field in an LLC conversation or vice versa — found
// in testing that it does exactly that, leaving values in knownFields that
// aren't on the form being prepared (agent.md rule 4) and, for `approval`,
// a legal fact recorded in a flow that has no approval checkbox at all.
// These two sets are the difference between LLC_REQUIRED_KEYS and
// CORP_REQUIRED_KEYS; keep them in sync with lib/types.ts.
const LLC_ONLY_KEYS = new Set<string>(["dateOfOriginalFiling"]);
const CORP_ONLY_KEYS = new Set<string>(["amendmentDate", "approval"]);

// Pure so the rules are unit-testable without a real API call. Returns null
// when the field belongs to the active entity type, or the error string
// handed back to the model as the tool result (it re-reads these and
// corrects itself).
export function entityScopeError(entityType: EntityType | null, field: string): string | null {
  // set_entity_type's own description says it must come first; enforce it
  // rather than recording fields we can't yet validate against a form —
  // every other check below (and the company-name designator rules) needs
  // to know which of the two forms is being filled.
  if (!entityType) {
    return "call set_entity_type first — which fields exist, and how they're validated, depends on the entity type";
  }
  if (entityType === "llc" && CORP_ONLY_KEYS.has(field)) {
    return `${field} is not a field on the llc amendment form — don't ask about it or record it`;
  }
  if (entityType === "corp" && LLC_ONLY_KEYS.has(field)) {
    return `${field} is not a field on the corp amendment form — don't ask about it or record it`;
  }
  return null;
}

const recordFieldDeclaration: FunctionDeclaration = {
  name: "record_field",
  description:
    "Record a single confirmed field value extracted from the conversation. `field` must be exactly one of the enum values that applies to the active entity type — never invent a different key name.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      field: {
        type: "string",
        enum: [...RECORD_FIELD_KEYS],
        description:
          "LLC uses: currentName, dateOfOriginalFiling, articleNumber, newName, amendmentText, signatureDate, signerName, signerTitle, contactPerson, phone, email. Corp uses: currentName, articleNumber, newName, amendmentText, amendmentDate, approval, signatureDate, signerName, signerTitle, contactPerson, phone, email (approval is one of \"incorporators\"/\"board\"/\"shareholders\").",
      },
      value: { type: "string" },
    },
    required: ["field", "value"],
  },
};

// Two tools, both write-only into knownFields. suggest_replies and
// mark_ready_for_review are gone: chips ship with the question they belong
// to, and readiness is nextStep(...) === null — neither was ever a judgment
// the model was better placed to make than the code. flag_invalid_name went
// with them; record_field already refuses a name without a valid designator.
const TOOLS = [{ functionDeclarations: [setEntityTypeDeclaration, recordFieldDeclaration] }];

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface RunIntakeAgentParams {
  history: ChatMessage[];
  entityType: EntityType | null;
  knownFields: Record<string, string>;
}

export interface RunIntakeAgentResult {
  reply: string;
  entityType: EntityType | null;
  knownFields: Record<string, string>;
  readyForReview: boolean;
  suggestedReplies: string[] | null;
}


interface ToolContext {
  knownFields: Record<string, string>;
  setEntityType: (entityType: EntityType) => void;
  // Company-name validation needs to know which designator set applies
  // (LLC vs corporate), and entityType is established before any field is
  // recorded (agent.md rule 1).
  getEntityType: () => EntityType | null;
  // Everything the user actually typed this conversation, lowercased —
  // used to verify the model isn't inventing a designator the user never
  // said (agent.md rule 7). See the currentName/newName check.
  userText: string;
}

function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Record<string, unknown> {
  switch (name) {
    case "set_entity_type": {
      const entityType = args.entityType;
      if (entityType === "llc" || entityType === "corp") {
        const changed = ctx.getEntityType() !== entityType;
        ctx.setEntityType(entityType);
        return { ok: true, changed };
      }
      return { ok: false, error: "entityType must be llc or corp" };
    }
    case "record_field": {
      const field = typeof args.field === "string" ? args.field : "";
      const value = typeof args.value === "string" ? args.value : "";
      if (!RECORD_FIELD_KEYS.includes(field as (typeof RECORD_FIELD_KEYS)[number])) {
        return { ok: false, error: `unknown field: ${field}` };
      }
      const scopeError = entityScopeError(ctx.getEntityType(), field);
      if (scopeError) {
        return { ok: false, error: scopeError };
      }
      // agent.md rule 16: the value has to trace back to something the user
      // typed. Every check below asks "is this well-formed?" — and an
      // invented value is perfectly well-formed, which is what let an
      // unasked-for email and a self-quoted example date reach the form.
      if (!valueCameFromUser(field, value, ctx.userText)) {
        return {
          ok: false,
          error: `the user never gave "${value}" as the ${humanizeFieldKey(
            field
          )} — ask them for it instead of filling it in yourself`,
        };
      }

      // Dates first: normalize before validating, since the raw input
      // ("August 1, 2026") isn't in the mm/dd/yyyy shape isValidDate
      // checks — agent.md rule 10 covers the format, this covers whether
      // the result is even a real calendar date (normalizeDate's shape
      // regex alone would let "13/45/2020" through unchanged).
      if (DATE_FIELD_KEYS.has(field)) {
        const normalized = normalizeDate(value);
        if (!isValidDate(normalized)) {
          return {
            ok: false,
            error: `"${value}" isn't a valid calendar date — ask the user for the real date in mm/dd/yyyy format.`,
          };
        }
        // dateOfOriginalFiling and amendmentDate both describe something
        // that already happened, so a future date is always a mistake —
        // typically a mistyped year. signatureDate is exempt: the user may
        // legitimately post-date the signature.
        if (field !== "signatureDate" && !isNotFutureDate(normalized)) {
          return {
            ok: false,
            error: `"${normalized}" is in the future, but ${humanizeFieldKey(field)} describes something that already happened — check the year with the user and ask again.`,
          };
        }
        ctx.knownFields[field] = normalized;
        return { ok: true };
      }

      // Which checkbox gets checked on the actual mailed form is a real
      // legal fact, not free text — found via a real user report that the
      // model recorded an approval value from a bare "yes" that had
      // actually answered a different (amendment-text confirmation)
      // question. Reject anything but the three canonical values instead
      // of writing something fillCorpAmendment can't even map to a
      // checkbox (APPROVAL_CHECKBOX[value] would be undefined).
      if (field === "approval" && !isValidApprovalValue(value)) {
        return {
          ok: false,
          error: `approval must be exactly one of: ${APPROVAL_VALUES.join(", ")} — ask the user which of the three situations applies, don't guess from a "yes"`,
        };
      }
      // Found via real testing that the model isn't reliable catching
      // obviously-invalid contact info on its own — "asdfghjkl" and
      // "jordan@" (no domain) were both accepted as emails, and
      // letters-only garbage was accepted as a phone number in one run
      // despite being correctly rejected in another. The SOS form requires
      // a real email ("will receive important reminders, notices and
      // filing evidence") and a real daytime phone, so reject obviously
      // malformed values here instead of trusting that judgment call.
      if (field === "email" && !isValidEmail(value)) {
        return {
          ok: false,
          error: `"${value}" doesn't look like a valid email address — ask the user for a real one (e.g. name@example.com).`,
        };
      }
      if (field === "phone" && !isValidPhone(value)) {
        return {
          ok: false,
          error: `"${value}" doesn't look like a valid phone number — ask the user for a real daytime phone number.`,
        };
      }
      // Company names get the strictest rule, because Wyoming requires a
      // registered entity's legal name to carry a designator and the form
      // says it "must match exactly to the Secretary of State's records".
      // Found from real testing: a user answered a bare "s" to every
      // question and it was recorded as the company's legal name, because
      // the old check only asked for "contains a letter".
      if (field === "currentName" || field === "newName") {
        // entityType is known by the time any field is recorded (agent.md
        // rule 1), but fall back to the looser check rather than crash if
        // the model somehow records a name first.
        const entityType = ctx.getEntityType();
        const valid = entityType
          ? looksLikeCompanyName(entityType, value)
          : looksLikeAName(value);
        if (!valid) {
          return {
            ok: false,
            error: `"${value}" isn't a usable ${humanizeFieldKey(field)} — it must be the full legal name including the entity designator (${
              entityType === "corp"
                ? 'e.g. "Acme Holdings Inc."'
                : 'e.g. "Acme Holdings LLC"'
            }). Ask the user again.`,
          };
        }
        // agent.md rule 7 forbids appending a designator the user didn't
        // give — enforce it here rather than trusting the prompt. Found in
        // live testing: asked for the company name the user typed a bare
        // "purple", and the model recorded "Purple Corp", inventing the
        // designator (and so sailing past the designator check above).
        // Requiring the designator to appear in the user's own words is
        // what catches that, while still accepting any casing or phrasing
        // they actually used.
        if (entityType && !designatorAppearsInUserText(entityType, value, ctx.userText)) {
          return {
            ok: false,
            error: `The user never said an entity designator, so "${value}" would be inventing one. Ask them to confirm the full legal name including the designator instead of assuming it.`,
          };
        }
        // The entire point of this filing is a *change* of name. If the new
        // name matches the current one, something was misheard — filing it
        // would cost the user $60 for a form that changes nothing.
        const other = field === "newName" ? ctx.knownFields.currentName : ctx.knownFields.newName;
        if (other && other.trim().toLowerCase() === value.trim().toLowerCase()) {
          return {
            ok: false,
            error: `The new name and the current name are both "${value}" — this form only makes sense for an actual name change. Confirm with the user which one is wrong.`,
          };
        }
      }
      // Person-shaped fields — rejects the same bare-"s" class of answer
      // while still accepting genuinely short real values ("Al", "CEO").
      if (
        (field === "signerName" || field === "signerTitle" || field === "contactPerson") &&
        !looksLikeAName(value)
      ) {
        return {
          ok: false,
          error: `"${value}" doesn't look like a valid answer for ${humanizeFieldKey(field)} — ask the user again.`,
        };
      }
      if (field === "articleNumber" && !looksLikeArticleNumber(value)) {
        return {
          ok: false,
          error: `"${value}" doesn't look like an article number — ask the user again (e.g. "1", "Article 1", "First").`,
        };
      }
      if (field === "amendmentText" && !looksLikeAmendmentText(value, ctx.knownFields.newName)) {
        return {
          ok: false,
          error: `That doesn't match the required "Article {n}. The name of the {limited liability company|corporation} is {newName}." template — recompose it correctly before recording it.`,
        };
      }

      // The user types the way people type ("president", "acme ventures
      // inc", "3075550142") and it used to reach the state's form verbatim.
      // Formatting happens here, after validation, so the chat, the composed
      // amendment text, the review screen and the PDF all carry the same
      // string — see lib/textFormat.ts for where the line is drawn between
      // presentation and identity.
      const formatted = formatFieldValue(field, value);
      // "changed", not just "ok": re-recording a value we already had means
      // the user's message taught us nothing, and the reply should say so
      // rather than silently repeating the question.
      const changed = ctx.knownFields[field] !== formatted;
      ctx.knownFields[field] = formatted;
      return { ok: true, changed };
    }
    default:
      return { ok: false, error: `unknown tool: ${name}` };
  }
}

const MAX_TOOL_ITERATIONS = 6;

// The free tier's binding constraint is requests-per-*minute*, not
// requests-per-day: the project's dashboard showed 17/15 RPM peak against
// only 115/500 RPD. Because one user message can fan out into several
// generateContent calls (the tool loop below), a normal-paced conversation
// can brush that per-minute ceiling. RPM is a rolling window, so a short
// wait genuinely clears it — unlike a daily quota, where waiting is
// pointless. One brief pause is worth it before failing the whole turn.
const RATE_LIMIT_BACKOFF_MS = 2500;

// Stateless by design (plan.md section 3/6): the caller resends the full
// history + knownFields every request; this function has no memory beyond
// its own arguments and never persists anything server-side.
export async function runIntakeAgent(params: RunIntakeAgentParams): Promise<RunIntakeAgentResult> {
  const apiKeys = getApiKeys();
  // Which key the *next* call starts from. Sticky within one request: once
  // a key works, keep using it for the remaining tool-loop iterations
  // rather than starting the failover dance from scratch each time. A
  // fresh HTTP request starts back at index 0 by design — this function is
  // stateless (plan.md section 3/6) and has nowhere to remember a dead key
  // between requests.
  let keyIndex = 0;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  // Tries every configured key before giving up, then — if every key was
  // merely rate-limited rather than broken — waits out the rolling RPM
  // window once and tries the whole set again.
  async function generateWithFailover(
    request: Parameters<GoogleGenAI["models"]["generateContent"]>[0]
  ) {
    let firstKeyLevelError: unknown = null;
    let sawRateLimit = false;

    for (let attempt = 0; attempt < 2; attempt++) {
      // Start from the key that last worked, then walk the rest.
      for (let offset = 0; offset < apiKeys.length; offset++) {
        const idx = (keyIndex + offset) % apiKeys.length;
        const ai = new GoogleGenAI({ apiKey: apiKeys[idx] });
        let transientRetried = false;

        for (;;) {
          try {
            const response = await ai.models.generateContent(request);
            keyIndex = idx; // this key works — prefer it for the next call
            return response;
          } catch (error) {
            const status = (error as { status?: number })?.status;

            // A network blip or a 5xx from Gemini itself: same key, one
            // immediate retry, since nothing about the key or the request
            // is actually wrong.
            if (isTransientError(status) && !transientRetried) {
              transientRetried = true;
              continue;
            }
            // This key can't serve the request (rate limited, restricted,
            // or rejected) — remember it and let the loop try the next key.
            if (isKeyLevelFailure(status)) {
              if (status === 429) sawRateLimit = true;
              // Prefer reporting a 429 over a 403: "we're rate limited,
              // try again in a moment" is actionable for the user, whereas
              // a misconfigured spare key's 403 is not their problem.
              if (
                firstKeyLevelError === null ||
                (status === 429 &&
                  (firstKeyLevelError as { status?: number })?.status !== 429)
              ) {
                firstKeyLevelError = error;
              }
              break;
            }
            // Anything else (400 bad request, content policy, …) is about
            // the request itself — another key would fail identically.
            throw error;
          }
        }
      }

      // Every key failed. Only a rate limit is worth waiting out; if the
      // keys are restricted/invalid, a pause changes nothing.
      if (!sawRateLimit || attempt === 1) break;
      await sleep(RATE_LIMIT_BACKOFF_MS);
    }

    throw firstKeyLevelError;
  }

  let entityType = params.entityType;
  const knownFields: Record<string, string> = { ...params.knownFields };
  // Pre-fill signatureDate deterministically instead of leaving it for the
  // model to guess — see getTodayFormatted's comment. Only fills the gap;
  // never overwrites a value the user (or a prior turn) already gave.
  if (!knownFields.signatureDate || knownFields.signatureDate.trim() === "") {
    knownFields.signatureDate = getTodayFormatted();
  }
  const contents: Content[] = params.history.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));

  // Only what the user themselves typed — used to verify the agent isn't
  // recording a company designator the user never actually said (agent.md
  // rule 7). Deliberately excludes assistant turns, or the agent's own
  // suggested wording would count as the user having said it.
  const userText = params.history
    .filter((m) => m.role === "user")
    .map((m) => m.text)
    .join("\n");

  // The step the user's message is answering — read off the last question we
  // actually asked, not inferred from the fields, so the read-back
  // confirmation isn't mistaken for an answer to whatever comes next.
  composeAmendmentTextIfReady(entityType, knownFields);
  const lastAssistantText = [...params.history].reverse().find((m) => m.role === "assistant")?.text;
  // Falling back to the pending step matters: when the match failed, the
  // model was told "CURRENT QUESTION: none — everything is collected" while a
  // question was on screen, so a tapped chip answered nothing. Whatever the
  // last message was, the step we are waiting on is never a worse guess than
  // nothing.
  const stepBefore =
    (lastAssistantText ? stepForQuestion(lastAssistantText, entityType, knownFields) : null) ??
    nextStep(entityType, knownFields, params.history);

  let recordedAny = false;
  let rejectedCurrentField = false;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const systemInstruction = `${SYSTEM_PROMPT}\n\n${renderExtractionContext(
      stepBefore,
      entityType,
      knownFields
    )}`;

    const response = await generateWithFailover({
      model,
      contents,
      config: { systemInstruction, tools: TOOLS },
    });

    const calls = response.functionCalls ?? [];
    // Any user-facing text is discarded by design (agent.md "Flow control"):
    // the reply is composed below, from the plan.
    if (calls.length === 0) break;

    const results = calls.map((call) => {
      const name = call.name ?? "";
      const result = executeTool(name, call.args ?? {}, {
        knownFields,
        setEntityType: (e) => (entityType = e),
        getEntityType: () => entityType,
        userText,
      });
      if (result.ok) {
        if (result.changed !== false) recordedAny = true;
      } else if (
        name === "record_field" &&
        stepBefore?.kind === "field" &&
        call.args?.field === stepBefore.key
      ) {
        // Only a refusal on the field we actually asked about should change
        // what the user is told — a stray record_field for something else
        // failing isn't their problem.
        rejectedCurrentField = true;
      }
      return result;
    });

    // Feed the results back so a refused value can be corrected in the same
    // turn. Push the model's own content verbatim — newer models attach a
    // thoughtSignature to each function-call part that must be echoed back
    // unmodified, or the API rejects the next request with INVALID_ARGUMENT.
    const candidateContent = response.candidates?.[0]?.content;
    contents.push(
      candidateContent ?? {
        role: "model",
        parts: calls.map((call) => ({ functionCall: { name: call.name, args: call.args } })),
      }
    );
    contents.push({
      role: "user",
      parts: calls.map((call, idx) => ({
        functionResponse: { name: call.name ?? "", response: results[idx] },
      })),
    });
  }

  // A record_field this turn can complete the newName/articleNumber pair the
  // amendment text is derived from.
  composeAmendmentTextIfReady(entityType, knownFields);
  const step = nextStep(entityType, knownFields, params.history);

  if (!step) {
    return {
      reply: DONE_REPLY,
      entityType,
      knownFields,
      readyForReview: true,
      suggestedReplies: null,
    };
  }

  const sameStep = stepKey(stepBefore) === stepKey(step);
  const lastUserText = [...params.history].reverse().find((m) => m.role === "user")?.text ?? "";
  const { reply, suggestedReplies } = composeReply(step, knownFields, {
    rejected: rejectedCurrentField && sameStep,
    recordedNothing: !recordedAny,
    sameStep,
    askedForAdvice: looksLikeAdviceRequest(lastUserText),
    askedAQuestion: lastUserText.includes("?"),
  });

  return { reply, entityType, knownFields, readyForReview: false, suggestedReplies };
}

function stepKey(step: Step | null): string {
  if (!step) return "done";
  return step.kind === "field" ? `field:${step.key}` : step.kind;
}

// agent.md rule 6: amendmentText is fully determined by entity type +
// article number + new name, and "compose it, then record_field it" was the
// single most-skipped instruction in the prompt — the model showed the text
// in chat and never recorded it, repeatedly. Composing it in code removes
// the failure mode entirely; the read-back step is what still puts it in
// front of the user. Only fills a gap, never overwrites.
function composeAmendmentTextIfReady(
  entityType: EntityType | null,
  knownFields: Record<string, string>
): void {
  if (!entityType) return;
  if (knownFields.amendmentText && knownFields.amendmentText.trim() !== "") return;
  if (!knownFields.articleNumber?.trim() || !knownFields.newName?.trim()) return;
  knownFields.amendmentText = composeAmendmentText(
    entityType,
    knownFields.articleNumber.trim(),
    knownFields.newName.trim()
  );
}

