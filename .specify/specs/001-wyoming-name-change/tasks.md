# Tasks 001: Wyoming Company Name Change Assistant

Status: READY
Depends on: `spec.md` (approved), `plan.md` (approved)

Each task is small and independently verifiable. Check items off as they
land; don't start a task whose dependencies aren't checked yet.

- [ ] **T001 — Scaffold Next.js app**
  Initialize Next.js (App Router, TypeScript) at repo root. Add
  `npm run dev/build/lint/test` per CLAUDE.md. Commit a baseline that
  builds clean with no other logic yet.

- [ ] **T002 — pdf-lib smoke test**
  Script that loads both `assets/forms/*.pdf`, fills every field named in
  spec.md §5.1/§5.2 with dummy data via `pdf-lib`, saves to a scratch file,
  reloads it, and asserts every value round-trips. This is the "does the
  library actually work with these specific PDFs" gate (plan §8, resolves
  spec Open Question 5) — do this before anything else depends on it.

- [ ] **T003 — Data model**
  `lib/types.ts`: `EntityType`, `LlcFields`, `CorpFields` exactly per
  plan.md §2.

- [ ] **T004 — Validation**
  `lib/validation.ts`: designator checks (LLC: "LLC"/"L.L.C."/"Limited
  Liability Company"; Corp: "Inc."/"Incorporated"/"Corporation"/"Corp."/
  "Co."/"Company"/"Limited"/"Ltd."), warns-not-blocks per FR-005. Unit
  tests for both entity types, including a missing-designator case.

- [ ] **T005 — Amendment text composer**
  `lib/composeAmendment.ts`: `composeAmendmentText(entityType,
  articleNumber, newName)` per plan.md §2/§5.3. Unit tests for both entity
  types.

- [ ] **T006 — PDF fill functions**
  `lib/pdf/fillLlc.ts`, `lib/pdf/fillCorp.ts`: load vendored bytes (module
  scope, no per-request disk/network read), set every `/Tx` field from
  spec.md §5.1/§5.2, check the correct single approval box on the corp
  form, `updateFieldAppearances()`, `flatten()` per plan.md §5 decision 1.
  Depends on T002 (smoke test proves the approach), T003.

- [ ] **T007 — `/api/generate-pdf` route**
  Wires T006's fill functions to an API route: request body → filled PDF
  bytes → `Content-Type: application/pdf` + correct
  `Content-Disposition: attachment; filename=...` response, no temp files
  written to disk (plan §5). Depends on T006.

- [ ] **T008 — Gemini intake agent**
  `lib/gemini.ts`: implement exactly what `agent.md` specifies — the
  system prompt verbatim, the four tool schemas (`set_entity_type`,
  `record_field`, `flag_invalid_name`, `mark_ready_for_review`) wired to
  real function-calling (not JSON-mode parsing). `GEMINI_API_KEY`/
  `GEMINI_MODEL` read server-side only. Depends on T003.

- [ ] **T009 — `/api/chat` route**
  Stateless route: request = `{ history, entityType, knownFields }` → runs
  T008's agent loop (may invoke several tools before replying) →
  `{ reply, knownFields, readyForReview }`. Surfaces Gemini rate-limit
  errors as a typed "try again in a moment" error, no silent paid fallback
  (constitution §I). Depends on T008.

- [ ] **T010 — Client state layer**
  `useReducer` context for `{ entityType, history, knownFields,
  readyForReview }`, mirrored to `sessionStorage` on every change and
  restored on mount, plus an explicit "Start over" action that clears it
  (plan §6, decision 2). Depends on T003.

- [ ] **T011 — Landing page**
  `app/page.tsx`: explainer + disclaimer (FR-007/US-4) + "Start" CTA into
  the chat flow.

- [ ] **T012 — Chat page**
  `app/chat/page.tsx`: chat UI wired to `/api/chat` (T009) and the state
  layer (T010); asks entity type before anything else (FR-001); on
  `readyForReview`, routes to `/review`.

- [ ] **T013 — Review page**
  `app/review/page.tsx`: structured, editable summary of every field per
  spec.md §5 tables (FR-003/FR-004), `amendmentText` as an editable
  textarea, disclaimer shown again directly above the download button
  (FR-007), designator validation (T004) blocking-with-warning before
  enabling download (FR-005), calls `/api/generate-pdf` (T007) on confirm.

- [ ] **T014 — End-to-end manual QA**
  Run the full flow for both an LLC and a Corp scenario per spec.md §9
  acceptance criteria; open each downloaded PDF and visually compare
  against a blank official form for correct field placement. Use the `run`
  skill to drive this in a real browser, not just unit tests.

- [ ] **T015 — Pre-launch form-currency check**
  Manually open the live URLs
  (`sos.wyo.gov/forms/business/llc/llc-amendment.pdf`,
  `sos.wyo.gov/Forms/Business/PROF/P-Amendment.pdf`) in a normal browser
  and diff against `assets/forms/*.pdf`; re-vendor if the state has
  published a newer revision (plan §9).

- [ ] **T016 — Security review**
  Run the `security-review` skill over the full diff before calling this
  feature done, per CLAUDE.md — this handles user-submitted legal/business
  PII, so this isn't optional.
