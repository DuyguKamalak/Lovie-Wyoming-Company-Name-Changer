import type { EntityType } from "@/lib/types";
import { runIntakeAgent, type ChatMessage } from "@/lib/gemini";

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
    // surface it plainly and let the user retry.
    const status = (error as { status?: number })?.status;
    if (status === 429) {
      return Response.json(
        { error: "The assistant is temporarily busy (rate limit). Please try again in a moment." },
        { status: 429 }
      );
    }
    console.error("Chat agent failed:", error);
    return Response.json({ error: "The assistant failed to respond. Please try again." }, { status: 500 });
  }
}
