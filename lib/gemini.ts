import { GoogleGenAI, type FunctionDeclaration, type Content } from "@google/genai";
import type { EntityType } from "./types";
import { SYSTEM_PROMPT } from "./agentPrompt";

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

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return new GoogleGenAI({ apiKey });
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
      ctx.knownFields[field] = value;
      return { ok: true };
    }
    case "flag_invalid_name":
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
  const ai = getClient();
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  let entityType = params.entityType;
  const knownFields: Record<string, string> = { ...params.knownFields };
  let readyForReview = false;

  const contents: Content[] = params.history.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));

  let reply = "";
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const systemInstruction = `${SYSTEM_PROMPT}\n\nCurrent state (do not re-ask what's already known here):\n${renderStateSummary(entityType, knownFields)}`;

    const response = await ai.models.generateContent({
      model,
      contents,
      config: { systemInstruction, tools: TOOLS },
    });

    const calls = response.functionCalls ?? [];
    if (calls.length === 0) {
      reply = response.text ?? "";
      break;
    }

    // Push the model's own response content back verbatim (not a
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

    const responseParts = calls.map((call) => {
      const name = call.name ?? "";
      if (name === "mark_ready_for_review") readyForReview = true;
      const result = executeTool(name, call.args ?? {}, {
        knownFields,
        setEntityType: (e) => (entityType = e),
      });
      return { functionResponse: { name, response: result } };
    });
    contents.push({ role: "user", parts: responseParts });
  }

  return { reply, entityType, knownFields, readyForReview };
}
