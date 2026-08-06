"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useIntakeDispatch, useIntakeState, startOver } from "../state/IntakeContext";
import { Disclaimer } from "../components/Disclaimer";
import { designatorWarning } from "@/lib/validation";
import { CORP_APPROVAL_OPTIONS, fieldConfigFor } from "./fieldConfig";
import { formatGenerateError } from "./formatGenerateError";
import styles from "./review.module.css";

export default function ReviewPage() {
  const state = useIntakeState();
  const dispatch = useIntakeDispatch();
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard: only reachable after the chat agent has actually said
  // readyForReview (spec.md section 4) — don't let a direct /review visit
  // through with nothing to show.
  useEffect(() => {
    if (!state.entityType || !state.readyForReview) {
      router.replace("/chat");
    }
  }, [state.entityType, state.readyForReview, router]);

  if (!state.entityType || !state.readyForReview) {
    return null;
  }

  const entityType = state.entityType;
  const fields = fieldConfigFor(entityType);
  const warning = designatorWarning(entityType, state.knownFields.newName ?? "");

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
    <div className={styles.page}>
      <h1 className={styles.title}>Review before you download</h1>
      <p className={styles.subtitle}>
        Every field below is exactly what will be printed on the official{" "}
        {entityType === "llc" ? "LLC amendment" : "corporation amendment"} form.
        Edit anything that isn&apos;t right.
      </p>

      <div className={styles.fields}>
        {fields.map((field) => (
          <label key={field.key} className={styles.field}>
            <span className={styles.label}>{field.label}</span>
            {field.multiline ? (
              <textarea
                className={styles.textarea}
                rows={3}
                value={state.knownFields[field.key] ?? ""}
                onChange={(e) => setField(field.key, e.target.value)}
              />
            ) : (
              <input
                className={styles.input}
                type="text"
                value={state.knownFields[field.key] ?? ""}
                onChange={(e) => setField(field.key, e.target.value)}
              />
            )}
            {field.help && <span className={styles.help}>{field.help}</span>}
          </label>
        ))}

        {entityType === "corp" && (
          <fieldset className={styles.field}>
            <legend className={styles.label}>How was this amendment approved?</legend>
            {CORP_APPROVAL_OPTIONS.map((option) => (
              <label key={option.value} className={styles.radioOption}>
                <input
                  type="radio"
                  name="approval"
                  value={option.value}
                  checked={state.knownFields.approval === option.value}
                  onChange={() => setField("approval", option.value)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
        )}
      </div>

      {warning && <p className={styles.warning}>{warning}</p>}

      <Disclaimer />

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => {
            startOver(dispatch);
            router.push("/");
          }}
        >
          Start over
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? "Generating…" : "Download PDF"}
        </button>
      </div>
    </div>
  );
}
