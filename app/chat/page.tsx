"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useIntakeDispatch, useIntakeHydrated, useIntakeState } from "../state/IntakeContext";
import type { ChatMessage } from "@/lib/gemini";
import styles from "./chat.module.css";

// Hardcoded rather than fetched from the API on first load: it's always
// the same opening question (agent.md rule 1), and seeding it locally
// saves a round trip before the user has said anything.
const OPENING_MESSAGE: ChatMessage = {
  role: "assistant",
  text: "Hi! I'll help you prepare a Wyoming name-change amendment. First — is your company a Wyoming LLC or a Wyoming Corporation?",
};

export default function ChatPage() {
  const state = useIntakeState();
  const dispatch = useIntakeDispatch();
  const hydrated = useIntakeHydrated();
  const router = useRouter();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Wait for the sessionStorage hydration attempt to finish before seeding
  // the opening message — otherwise this can race with IntakeProvider's own
  // hydration effect and the opening message silently never appears (see
  // T012 commit message).
  useEffect(() => {
    if (hydrated && state.history.length === 0) {
      dispatch({ type: "ADD_MESSAGE", message: OPENING_MESSAGE });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    if (state.readyForReview) {
      router.push("/review");
    }
  }, [state.readyForReview, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.history]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = { role: "user", text };
    const nextHistory = [...state.history, userMessage];
    dispatch({ type: "ADD_MESSAGE", message: userMessage });
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: nextHistory,
          entityType: state.entityType,
          knownFields: state.knownFields,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      dispatch({ type: "ADD_MESSAGE", message: { role: "assistant", text: data.reply } });
      if (data.entityType) dispatch({ type: "SET_ENTITY_TYPE", entityType: data.entityType });
      dispatch({ type: "MERGE_KNOWN_FIELDS", fields: data.knownFields ?? {} });
      if (data.readyForReview) dispatch({ type: "SET_READY_FOR_REVIEW", ready: true });
    } catch {
      setError("Couldn't reach the assistant. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.thread}>
        {state.history.map((message, i) => (
          <div
            key={i}
            className={message.role === "user" ? styles.userBubble : styles.assistantBubble}
          >
            {message.text}
          </div>
        ))}
        {loading && <div className={styles.assistantBubble}>Thinking…</div>}
        <div ref={bottomRef} />
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
      >
        <input
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your answer…"
          disabled={loading}
          autoFocus
        />
        <button className={styles.send} type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
