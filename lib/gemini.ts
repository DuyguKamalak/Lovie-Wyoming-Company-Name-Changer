import { GoogleGenAI, type FunctionDeclaration, type Content } from "@google/genai";
import type { EntityType } from "./types";
import { SYSTEM_PROMPT } from "./agentPrompt";
import { DATE_FIELD_KEYS, normalizeDate, getTodayFormatted, isValidDate } from "./dateFormat";
import {
  missingFields,
  humanizeFieldKey,
  isValidEmail,
  isValidPhone,
  looksLikeAName,
  looksLikeArticleNumber,
  looksLikeAmendmentText,
} from "./validation";

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

// Same model, a second free Google AI Studio key as a same-day quota
// fallback — not the multi-provider fallback plan.md section 9 explicitly
// deferred (different LLM providers, a bigger decision). GEMINI_API_KEY_FALLBACK
// is optional; when unset, behavior is unchanged (single key, throws on 429
// same as before).
export function getApiKeys(): string[] {
  const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_FALLBACK].filter(
    (key): key is string => typeof key === "string" && key.trim() !== ""
  );
  if (keys.length === 0) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return keys;
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

const flagInvalidNameDeclaration: FunctionDeclaration = {
  name: "flag_invalid_name",
  description:
    "Flag that the proposed new company name is missing a valid entity designator, instead of silently accepting or auto-correcting it.",
  parametersJsonSchema: {
    type: "object",
    properties: { reason: { type: "string" } },
    required: ["reason"],
  },
};

const suggestRepliesDeclaration: FunctionDeclaration = {
  name: "suggest_replies",
  description:
    "Offer 2-4 short tappable-chip options for the question you just asked, when it has natural discrete answers (e.g. entity type, the Corp approval question). Skip for open-ended questions (names, dates, free text).",
  parametersJsonSchema: {
    type: "object",
    properties: {
      options: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 4,
      },
    },
    required: ["options"],
  },
};

const markReadyDeclaration: FunctionDeclaration = {
  name: "mark_ready_for_review",
  description:
    "Signal that every required field for the selected entity type is present and valid, and the composed amendment text has been confirmed with the user.",
  parametersJsonSchema: { type: "object", properties: {} },
};

const TOOLS = [
  {
    functionDeclarations: [
      setEntityTypeDeclaration,
      recordFieldDeclaration,
      flagInvalidNameDeclaration,
      suggestRepliesDeclaration,
      markReadyDeclaration,
    ],
  },
];

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

function renderStateSummary(entityType: EntityType | null, knownFields: Record<string, string>): string {
  const fieldLines = Object.entries(knownFields);
  const fieldsBlock =
    fieldLines.length > 0
      ? `Known fields:\n${fieldLines.map(([k, v]) => `- ${k}: ${v}`).join("\n")}`
      : "Known fields: none yet.";
  return `entityType: ${entityType ?? "unknown"}\n${fieldsBlock}`;
}

interface ToolContext {
  knownFields: Record<string, string>;
  setEntityType: (entityType: EntityType) => void;
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
        ctx.setEntityType(entityType);
        return { ok: true };
      }
      return { ok: false, error: "entityType must be llc or corp" };
    }
    case "record_field": {
      const field = typeof args.field === "string" ? args.field : "";
      const value = typeof args.value === "string" ? args.value : "";
      if (!RECORD_FIELD_KEYS.includes(field as (typeof RECORD_FIELD_KEYS)[number])) {
        return { ok: false, error: `unknown field: ${field}` };
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
      // Free-text "name-shaped" fields — catches empty/pure-digit/pure-
      // punctuation answers (e.g. an off-topic reply the model mistakenly
      // recorded anyway). Deliberately doesn't judge whether it's a
      // *plausible* name, just that it isn't obviously garbage. newName's
      // designator (LLC/Inc./etc.) is checked separately, later, as a
      // warn-not-block step (FR-005) — this isn't that check.
      if (
        (field === "currentName" ||
          field === "newName" ||
          field === "signerName" ||
          field === "signerTitle" ||
          field === "contactPerson") &&
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

      ctx.knownFields[field] = value;
      return { ok: true };
    }
    case "flag_invalid_name":
      return { ok: true };
    case "suggest_replies":
      return { ok: true };
    case "mark_ready_for_review":
      return { ok: true };
    default:
      return { ok: false, error: `unknown tool: ${name}` };
  }
}

const MAX_TOOL_ITERATIONS = 6;

// Stateless by design (plan.md section 3/6): the caller resends the full
// history + knownFields every request; this function has no memory beyond
// its own arguments and never persists anything server-side.
export async function runIntakeAgent(params: RunIntakeAgentParams): Promise<RunIntakeAgentResult> {
  const apiKeys = getApiKeys();
  // Advances forward-only within a single request: once a key is exhausted
  // (429) this turn, there's no reason to keep re-trying it on every
  // remaining tool-call iteration of the same request — stick with
  // whichever key last worked. A fresh HTTP request (the next chat turn)
  // starts back at index 0 by design; this function is stateless (plan.md
  // section 3/6) and has nowhere to remember "key 0 was dead" between
  // requests, so the cost is at most one extra failed call per turn on a
  // day the primary key is out of quota — acceptable for a free-tier app.
  let keyIndex = 0;
  let ai = new GoogleGenAI({ apiKey: apiKeys[keyIndex] });
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  let entityType = params.entityType;
  const knownFields: Record<string, string> = { ...params.knownFields };
  // Pre-fill signatureDate deterministically instead of leaving it for the
  // model to guess — see getTodayFormatted's comment. Only fills the gap;
  // never overwrites a value the user (or a prior turn) already gave.
  if (!knownFields.signatureDate || knownFields.signatureDate.trim() === "") {
    knownFields.signatureDate = getTodayFormatted();
  }
  let readyForReview = false;
  let suggestedReplies: string[] | null = null;

  const contents: Content[] = params.history.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));

  let reply = "";
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const systemInstruction = `${SYSTEM_PROMPT}\n\nCurrent state (do not re-ask what's already known here):\n${renderStateSummary(entityType, knownFields)}`;

    let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
    for (;;) {
      try {
        response = await ai.models.generateContent({
          model,
          contents,
          config: { systemInstruction, tools: TOOLS },
        });
        break;
      } catch (error) {
        const status = (error as { status?: number })?.status;
        // Only a quota/rate-limit error justifies switching keys — any
        // other failure (bad request, network, etc.) would fail identically
        // on the fallback key too, so surface it immediately instead of
        // masking it behind a pointless retry.
        if (status === 429 && keyIndex < apiKeys.length - 1) {
          keyIndex++;
          ai = new GoogleGenAI({ apiKey: apiKeys[keyIndex] });
          continue;
        }
        throw error;
      }
    }

    const calls = response.functionCalls ?? [];
    const text = response.text ?? "";

    // Found via real user testing: suggest_replies is itself a function
    // call, so a naive "calls.length === 0 means done" loop discards this
    // turn's text (and defers to another round-trip) whenever suggest_replies
    // is called alongside it — e.g. a turn that both calls
    // set_entity_type/suggest_replies AND writes "What is the current
    // legal name...?" As soon as another round-trip runs, that text is
    // gone, but the chip options from THIS round were already captured
    // into `suggestedReplies`, which the loop never reset — so an
    // unrelated later turn's question ("what's the legal name?") shipped
    // to the client paired with stale "Yes"/"No" chips meant for a
    // completely different message. Only ever trust suggest_replies when
    // it arrives in the same response as non-empty reply text.
    let turnSuggestedReplies: string[] | null = null;
    const results = calls.map((call) => {
      const name = call.name ?? "";
      if (name === "mark_ready_for_review") readyForReview = true;
      if (name === "suggest_replies") {
        const options = call.args?.options;
        if (Array.isArray(options)) {
          turnSuggestedReplies = options.filter((o): o is string => typeof o === "string");
        }
      }
      return executeTool(name, call.args ?? {}, {
        knownFields,
        setEntityType: (e) => (entityType = e),
      });
    });

    if (text) {
      reply = text;
      suggestedReplies = turnSuggestedReplies;
      break;
    }

    // No user-facing text yet this turn — a pure tool-calling round that
    // needs its results fed back before the model can compose its actual
    // reply. Push the model's own response content back verbatim (not a
    // hand-built { functionCall: {name, args} } object) — newer models
    // attach a thoughtSignature to each function-call part that must be
    // echoed back unmodified on the next turn, or the API rejects the
    // request with INVALID_ARGUMENT.
    const candidateContent = response.candidates?.[0]?.content;
    if (candidateContent) {
      contents.push(candidateContent);
    } else {
      contents.push({
        role: "model",
        parts: calls.map((call) => ({ functionCall: { name: call.name, args: call.args } })),
      });
    }

    const responseParts = calls.map((call, idx) => ({
      functionResponse: { name: call.name ?? "", response: results[idx] },
    }));
    contents.push({ role: "user", parts: responseParts });
  }

  const reconciled = reconcileReadyForReview(entityType, knownFields, readyForReview, reply);

  return { ...reconciled, entityType, knownFields, suggestedReplies };
}

// Don't trust mark_ready_for_review at face value: found via direct
// testing that the model can call it (and even say the right thing in its
// reply) while having silently skipped record_field for one or more
// mentioned fields in a dense, multi-fact message — signerName,
// contactPerson, phone, and email all went unset in one real run despite
// being spelled out in the user's message. /api/generate-pdf already has
// its own missingFields check, but catching it here means the user finds
// out in the conversation instead of after clicking Download. Extracted
// as a pure function so this reconciliation logic is unit-testable without
// a real API call.
//
// Asks about only the FIRST missing field, not the whole list at once:
// dumping every missing field into one message ("signer name, contact
// person, phone, email...") broke agent.md rule 3 (one question at a time)
// and read as jarringly different from the rest of the conversation, which
// the model had been asking one field per turn. If more than one field is
// still missing, the next turn's reconciliation asks about the next one —
// same as if the model itself had asked them one by one.
//
// Plain "What's the X?" phrasing, no "Almost done" preamble: found via real
// user testing that when several fields are missing in a row, this
// reconciliation fires on every single turn, so "Almost done — one more
// thing..." ends up repeated four times back to back — reads as robotic,
// and it isn't even true the first three times. The rest of the
// conversation just asks its questions plainly; this should match.
export function reconcileReadyForReview(
  entityType: EntityType | null,
  knownFields: Record<string, string>,
  readyForReview: boolean,
  reply: string
): { readyForReview: boolean; reply: string } {
  if (!readyForReview || !entityType) {
    return { readyForReview, reply };
  }
  const missing = missingFields(entityType, knownFields);
  if (missing.length === 0) {
    return { readyForReview, reply };
  }
  const next = humanizeFieldKey(missing[0]);
  return {
    readyForReview: false,
    reply: `What's the ${next}?`,
  };
}
