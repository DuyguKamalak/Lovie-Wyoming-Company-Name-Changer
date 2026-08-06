"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useIntakeDispatch, useIntakeHydrated, useIntakeState } from "../state/IntakeContext";
import { IntroModal } from "../components/IntroModal";
import { LovieLogo } from "../components/LovieLogo";
import { BrandButton } from "../components/BrandButton";
import type { ChatMessage } from "@/lib/gemini";

// The first-question hint chips shown in the hero state, before any
// message has been sent — there's no agent turn yet to call
// suggest_replies, so these two are hardcoded (agent.md rule 1: entity
// type is always the first thing asked).
const STARTER_SUGGESTIONS = ["I have a Wyoming LLC", "I have a Wyoming Corporation"];

// Brand-green on hover, not the purple this accidentally shipped with —
// every colored/interactive surface in the app uses the one brand green.
const chipClass =
  "rounded-full border border-[#d6d3d1] bg-[#fafaf9] px-4 py-2 text-sm text-[#292524] transition-colors hover:border-brand-green hover:bg-brand-green/15 active:scale-95 disabled:opacity-50 disabled:active:scale-100";

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
    <div className="flex min-h-screen w-full flex-col bg-white text-brand-black">
      <IntroModal open={introOpen} onClose={() => setIntroOpen(false)} />

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-6">
        {!started ? (
          <HeroEmptyState
            input={input}
            setInput={setInput}
            loading={loading}
            onSend={() => sendMessage(input)}
            onSuggestion={(s) => sendMessage(s)}
          />
        ) : (
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto py-2">
            {state.history.map((message, i) => (
              <ChatBubble key={i} message={message} />
            ))}
            {loading && <ThinkingBubble />}
            {!loading && suggestedReplies && suggestedReplies.length > 0 && (
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                {suggestedReplies.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={chipClass}
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

        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

        {started && (
          <form
            className="flex gap-2 border-t border-[#e7e5e4] pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
          >
            <input
              className="flex-1 rounded-lg border border-[#e7e5e4] bg-white px-3 py-2 text-base text-brand-black outline-none focus:border-brand-green"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your answer…"
              disabled={loading}
              autoFocus
            />
            <BrandButton type="submit" className="h-auto px-5 py-2" disabled={loading || !input.trim()}>
              Send
            </BrandButton>
          </form>
        )}
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <motion.div
        className="max-w-[80%] self-end whitespace-pre-wrap rounded-2xl bg-brand-black px-4 py-2.5 leading-relaxed text-white"
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
      className="flex max-w-[85%] items-start gap-2 self-start"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-green/15">
        <LovieLogo size={28} />
      </div>
      <div className="whitespace-pre-wrap rounded-2xl bg-[#f5f5f4] px-4 py-2.5 leading-relaxed text-brand-black">
        {message.text}
      </div>
    </motion.div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex items-start gap-2 self-start">
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-green/15">
        <LovieLogo size={28} />
      </div>
      <div className="flex items-center gap-1 rounded-2xl bg-[#f5f5f4] px-4 py-2.5">
        <span className="mr-1 text-[#78716c]">Thinking</span>
        <span className="inline-flex gap-[3px]" aria-hidden="true">
          <span className="h-[5px] w-[5px] animate-[thinking-bounce_1.1s_ease-in-out_infinite] rounded-full bg-[#a8a29e]" />
          <span className="h-[5px] w-[5px] animate-[thinking-bounce_1.1s_ease-in-out_infinite] rounded-full bg-[#a8a29e] [animation-delay:0.15s]" />
          <span className="h-[5px] w-[5px] animate-[thinking-bounce_1.1s_ease-in-out_infinite] rounded-full bg-[#a8a29e] [animation-delay:0.3s]" />
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
      className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <LovieLogo size={56} />
      <h1 className="font-serif text-3xl font-normal">Let&apos;s change your company&apos;s name</h1>
      <p className="mb-1 text-[#57534e]">Tell me about your Wyoming company and the new name you want.</p>

      <form
        className="flex w-full max-w-xl items-center gap-2 rounded-full border border-[#e7e5e4] bg-white py-1.5 pl-5 pr-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.06)]"
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
      >
        <input
          className="flex-1 border-none bg-transparent py-2 text-base text-brand-black outline-none"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tell Lovie about your company…"
          disabled={loading}
          autoFocus
        />
        <BrandButton
          type="submit"
          className="h-10 w-10 flex-shrink-0 rounded-full px-0"
          disabled={loading || !input.trim()}
          aria-label="Send"
        >
          ➤
        </BrandButton>
      </form>

      <div className="mt-1 flex flex-wrap justify-center gap-2">
        {STARTER_SUGGESTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={chipClass}
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
