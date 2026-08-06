import type { EntityType } from "@/lib/types";
import { runIntakeAgent, type ChatMessage } from "@/lib/gemini";

// One user message fans out into several sequential Gemini calls (the
// tool loop in runIntakeAgent), and a rate-limited turn now waits out the
// rolling RPM window before retrying — so the default serverless timeout
// is too tight. Vercel caps this at 60s on the free tier, which is well
// clear of a realistic worst case.
export const maxDuration = 60;

interface RequestBody {
  history: ChatMessage[];
  entityType: EntityType | null;
  knownFields: Record<string, string>;
}

function isChatMessage(value: unknown): value is ChatMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    ((value as ChatMessage).role === "user" || (value as ChatMessage).role === "assistant") &&
    typeof (value as ChatMessage).text === "string"
  );
}

export async function POST(request: Request): Promise<Response> {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { history, entityType, knownFields } = body ?? {};
  if (!Array.isArray(history) || !history.every(isChatMessage)) {
    return Response.json({ error: "history must be an array of {role, text}." }, { status: 400 });
  }
  if (entityType !== null && entityType !== "llc" && entityType !== "corp") {
    return Response.json({ error: 'entityType must be "llc", "corp", or null.' }, { status: 400 });
  }
  if (knownFields !== undefined && (typeof knownFields !== "object" || knownFields === null)) {
    return Response.json({ error: "knownFields must be an object." }, { status: 400 });
  }

  try {
    const result = await runIntakeAgent({
      history,
      entityType,
      knownFields: knownFields ?? {},
    });
    return Response.json(result);
  } catch (error) {
    // constitution I: no silent paid fallback on a free-tier rate limit —
    // surface it plainly and let the user retry. runIntakeAgent has already
    // tried every configured key and waited out the rolling rate-limit
    // window by this point, so reaching here means it genuinely couldn't
    // get through.
    const status = (error as { status?: number })?.status;
    if (status === 429) {
      return Response.json(
        { error: "The assistant is temporarily busy (rate limit). Please try again in a moment." },
        { status: 429 }
      );
    }
    // 403/401 is a misconfigured or restricted API key — an operator
    // problem, not something the visitor can fix by retrying. Say so
    // plainly instead of the generic "try again" that sent a real user
    // in circles, and log loudly so it's obvious in the deployment logs.
    if (status === 403 || status === 401) {
      console.error(
        `Chat agent auth failure (${status}) — check GEMINI_API_KEY / GEMINI_API_KEY_FALLBACK: is the key valid and its Google project unrestricted?`,
        error
      );
      return Response.json(
        { error: "The assistant is misconfigured on our side. Please try again later." },
        { status: 503 }
      );
    }
    console.error("Chat agent failed:", error);
    return Response.json({ error: "The assistant failed to respond. Please try again." }, { status: 500 });
  }
}
