"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useIntakeDispatch, useIntakeHydrated, useIntakeState } from "../state/IntakeContext";
import { IntroModal } from "../components/IntroModal";
import { LovieLogo } from "../components/LovieLogo";
import type { ChatMessage } from "@/lib/gemini";
import styles from "./chat.module.css";

// The first-question hint chips shown in the hero state, before any
// message has been sent — there's no agent turn yet to call
// suggest_replies, so these two are hardcoded (agent.md rule 1: entity
// type is always the first thing asked).
const STARTER_SUGGESTIONS = ["I have a Wyoming LLC", "I have a Wyoming Corporation"];

export default function ChatPage() {
  const state = useIntakeState();
  const dispatch = useIntakeDispatch();
  const hydrated = useIntakeHydrated();
  const router = useRouter();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedReplies, setSuggestedReplies] = useState<string[] | null>(null);
  const [introOpen, setIntroOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.readyForReview) {
      router.push("/review");
    }
  }, [state.readyForReview, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.history]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMessage: ChatMessage = { role: "user", text: trimmed };
    const nextHistory = [...state.history, userMessage];
    dispatch({ type: "ADD_MESSAGE", message: userMessage });
    setInput("");
    setSuggestedReplies(null);
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
      setSuggestedReplies(data.suggestedReplies ?? null);
    } catch {
      setError("Couldn't reach the assistant. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const started = hydrated && state.history.length > 0;

  return (
    <div className={styles.page}>
      <IntroModal open={introOpen} onClose={() => setIntroOpen(false)} />

      {!started ? (
        <HeroEmptyState
          input={input}
          setInput={setInput}
          loading={loading}
          onSend={() => sendMessage(input)}
          onSuggestion={(s) => sendMessage(s)}
        />
      ) : (
        <div className={styles.thread}>
          {state.history.map((message, i) => (
            <ChatBubble key={i} message={message} />
          ))}
          {loading && <ThinkingBubble />}
          {!loading && suggestedReplies && suggestedReplies.length > 0 && (
            <div className={styles.chipRow}>
              {suggestedReplies.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={styles.chip}
                  onClick={() => sendMessage(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {started && (
        <form
          className={styles.composer}
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
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
      )}
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <motion.div
        className={styles.userBubble}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {message.text}
      </motion.div>
    );
  }
  return (
    <motion.div
      className={styles.assistantRow}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className={styles.avatar}>
        <LovieLogo size={28} />
      </div>
      <div className={styles.assistantBubble}>{message.text}</div>
    </motion.div>
  );
}

function ThinkingBubble() {
  return (
    <div className={styles.assistantRow}>
      <div className={styles.avatar}>
        <LovieLogo size={28} />
      </div>
      <div className={styles.assistantBubble}>
        <span className={styles.thinkingLabel}>Thinking</span>
        <span className={styles.thinkingDots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>
  );
}

function HeroEmptyState({
  input,
  setInput,
  loading,
  onSend,
  onSuggestion,
}: {
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  onSend: () => void;
  onSuggestion: (s: string) => void;
}) {
  return (
    <motion.div
      className={styles.hero}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <LovieLogo size={56} />
      <h1 className={styles.heroTitle}>Let&apos;s change your company&apos;s name</h1>
      <p className={styles.heroSubtitle}>
        Tell me about your Wyoming company and the new name you want.
      </p>

      <form
        className={styles.heroComposer}
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
      >
        <input
          className={styles.heroInput}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tell Lovie about your company…"
          disabled={loading}
          autoFocus
        />
        <button className={styles.heroSend} type="submit" disabled={loading || !input.trim()} aria-label="Send">
          ➤
        </button>
      </form>

      <div className={styles.chipRow}>
        {STARTER_SUGGESTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={styles.chip}
            onClick={() => onSuggestion(option)}
            disabled={loading}
          >
            {option}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
