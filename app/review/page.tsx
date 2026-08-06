"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useIntakeDispatch, useIntakeHydrated, useIntakeState, startOver } from "../state/IntakeContext";
import { Disclaimer } from "../components/Disclaimer";
import { BrandButton } from "../components/BrandButton";
import { designatorWarning } from "@/lib/validation";
import { CORP_APPROVAL_OPTIONS, fieldConfigFor } from "./fieldConfig";
import { formatGenerateError } from "./formatGenerateError";
import { amendmentTextMismatch } from "./amendmentSync";

export default function ReviewPage() {
  const state = useIntakeState();
  const dispatch = useIntakeDispatch();
  const hydrated = useIntakeHydrated();
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard: only reachable after the chat agent has actually said
  // readyForReview (spec.md section 4) — don't let a direct /review visit
  // through with nothing to show. Must wait for hydration first: a hard
  // navigation/refresh straight to /review remounts IntakeProvider, and
  // checking state before its async sessionStorage read finishes would
  // see the not-yet-hydrated default state and bounce to /chat even when
  // the real (persisted) state says readyForReview — a visible round
  // trip, even though no data is actually lost (found via direct
  // testing, not user-reported).
  useEffect(() => {
    if (hydrated && (!state.entityType || !state.readyForReview)) {
      router.replace("/chat");
    }
  }, [hydrated, state.entityType, state.readyForReview, router]);

  if (!hydrated || !state.entityType || !state.readyForReview) {
    return null;
  }

  const entityType = state.entityType;
  const fields = fieldConfigFor(entityType);
  const warning = designatorWarning(entityType, state.knownFields.newName ?? "");
  // Only amendmentText is printed on the form, so a newName edit that isn't
  // mirrored there mails the old name — see amendmentSync.ts.
  const correctedAmendmentText = amendmentTextMismatch(entityType, state.knownFields);

  function setField(key: string, value: string) {
    dispatch({ type: "SET_FIELD", field: key, value });
  }

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, fields: state.knownFields }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(formatGenerateError(data, fields));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = entityType === "llc" ? "wyoming-llc-amendment.pdf" : "wyoming-corp-amendment.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-white text-brand-black">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-10">
        <h1 className="font-serif text-3xl font-normal">Review before you download</h1>
        <p className="leading-relaxed text-stone-600">
          Every field below is exactly what will be printed on the official{" "}
          {entityType === "llc" ? "LLC amendment" : "corporation amendment"} form. Edit anything
          that isn&apos;t right.
        </p>

        <div className="flex flex-col gap-4">
          {fields.map((field) => (
            <label key={field.key} className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">{field.label}</span>
              {field.multiline ? (
                <textarea
                  className="resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 font-sans text-base text-brand-black outline-none focus:border-brand-green"
                  rows={3}
                  value={state.knownFields[field.key] ?? ""}
                  onChange={(e) => setField(field.key, e.target.value)}
                />
              ) : (
                <input
                  className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-base text-brand-black outline-none focus:border-brand-green"
                  type="text"
                  value={state.knownFields[field.key] ?? ""}
                  onChange={(e) => setField(field.key, e.target.value)}
                />
              )}
              {field.help && <span className="text-sm text-stone-500">{field.help}</span>}
            </label>
          ))}

          {entityType === "corp" && (
            <fieldset className="flex flex-col gap-1.5 border-none p-0">
              <legend className="text-sm font-semibold">How was this amendment approved?</legend>
              {CORP_APPROVAL_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-start gap-2 py-1 text-[0.95rem] leading-snug">
                  <input
                    type="radio"
                    name="approval"
                    value={option.value}
                    checked={state.knownFields.approval === option.value}
                    onChange={() => setField("approval", option.value)}
                    className="mt-1"
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
          )}
        </div>

        {correctedAmendmentText && (
          <div className="flex flex-col items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p>
              The amendment text below doesn&apos;t match the new name and article number above —
              and the amendment text is what actually gets printed on the form. It should read:
            </p>
            <p className="font-semibold">{correctedAmendmentText}</p>
            <button
              type="button"
              className="rounded-full border border-amber-300 bg-white px-3 py-1.5 font-semibold transition-colors hover:bg-amber-100 active:scale-95"
              onClick={() => setField("amendmentText", correctedAmendmentText)}
            >
              Use this text
            </button>
          </div>
        )}

        {warning && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {warning}
          </p>
        )}

        <Disclaimer />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3">
          <BrandButton
            type="button"
            onClick={() => {
              startOver(dispatch);
              router.push("/");
            }}
          >
            Start over
          </BrandButton>
          <BrandButton type="button" onClick={handleDownload} disabled={downloading}>
            {downloading ? "Generating…" : "Download PDF"}
          </BrandButton>
        </div>
      </div>
    </div>
  );
}
