# Plan 001: Wyoming Company Name Change Assistant

Status: APPROVED
Depends on: `spec.md` (approved)

## 1. Architecture overview

```
Browser (React, client-side state only)
   │
   │  POST /api/chat            { history, entityType, knownFields }
   │  →  { reply, knownFields, readyForReview }
   │
   │  POST /api/generate-pdf    { entityType, fields }
   │  →  application/pdf (streamed download)
   ▼
Next.js App Router, deployed on Vercel (serverless functions)
   │
   ├─ /api/chat        → calls Google Gemini (structured output)
   └─ /api/generate-pdf → pdf-lib fills assets/forms/*.pdf, returns bytes
```

- **No database, no session store.** Every request is self-contained: the
  browser holds the conversation + extracted fields in React state and
  resends what's needed. This is what makes constitution §III (privacy by
  default) trivial to satisfy — the server has nothing to leak because it
  never stores anything past the response.
- **Two API routes only.** Chat/extraction and PDF generation are cleanly
  separated: the chat route never touches a PDF, the PDF route never talks
  to Gemini. Keeps each route's failure modes independent (e.g., Gemini
  free-tier rate limit shouldn't affect the PDF step, since by that point
  extraction is already done and reviewed).

## 2. Data model

```ts
// lib/types.ts
type EntityType = "llc" | "corp";

interface LlcFields {
  currentName: string;
  dateOfOriginalFiling: string;      // mm/dd/yyyy
  articleNumber: string;             // e.g. "1"
  newName: string;                   // used to compose `amendmentText`
  amendmentText: string;             // full article text, user-editable
  signatureDate: string;
  signerName: string;
  signerTitle: string;
  contactPerson: string;
  phone: string;
  email: string;
}

interface CorpFields {
  currentName: string;
  articleNumber: string;
  newName: string;
  amendmentText: string;             // full article text, user-editable
  amendmentDate: string;
  approval: "incorporators" | "board" | "shareholders";
  signatureDate: string;
  signerName: string;
  signerTitle: string;
  contactPerson: string;
  phone: string;
  email: string;
}
```

`amendmentText` is always derived by a template function first
(`composeAmendmentText(entityType, articleNumber, newName)` →
`"Article {n}. The name of the {limited liability company|corporation} is
{newName}."`) and then shown as an editable field on the review screen —
per spec §5.3, the user must be able to see/adjust the exact wording that
gets filed.

`exchange, reclassification, cancellation` (corp form) and the checklist
self-check boxes (§5.1/§5.2 of spec.md) are **not** part of the typed data
model — they're either left blank (irrelevant to a name change) or handled
as a fixed default at fill time, never asked about in chat.

## 3. The intake agent (`/api/chat`)

This is the agentic core of the product — Google Gemini (`gemini-2.0-flash`,
model name in an env var `GEMINI_MODEL` so it can be bumped without a code
change) doesn't just answer questions, it *decides* what to do next each
turn via explicit **function calling / tool use** (not raw JSON-mode
parsing — real tools the model chooses to invoke).

**The agent's full system prompt, its rules, and its three tool schemas
(`record_field`, `flag_invalid_name`, `mark_ready_for_review`) are defined
in [`agent.md`](./agent.md) — that file is the source of truth `lib/gemini.ts`
loads/embeds, not something restated here.** Changing agent behavior means
editing `agent.md` first (constitution VI), then the code.

Each turn: client sends `{ history, entityType, knownFields }` → the agent
runs (possibly calling several tools in sequence before replying, e.g.
`record_field` three times then a follow-up question) → response is
`{ reply, knownFields, readyForReview }`. So each turn either:
  1. returns updated known fields + a follow-up question (fields still
     missing/ambiguous), or
  2. returns updated known fields + `readyForReview: true` (all required
     fields present and valid, `mark_ready_for_review` was called).
- System prompt encodes: ask entity type first (FR-001), never give legal
  advice, ask one clear question at a time, validate the new name ends in
  an appropriate designator, and — importantly — once it has current name +
  new name + article number, compose a draft `amendmentText` and show it to
  the user in the chat for a sanity check before marking ready-for-review.
- The route is stateless: the client sends the full running `knownFields`
  object plus the latest user message each call; Gemini's job is only to
  fill gaps and ask the next question, not to remember previous turns
  itself beyond what's in the request.
- Gemini free-tier errors (429/rate limit) surface as a typed error the
  client renders as "please try again in a moment" (NFR-001/spec Open
  Question 4) — never silently retried against a paid fallback (constitution §I).

## 4. Review screen

Plain React form (not chat) rendering every field from §2's model with
labels matching the PDF's own field meanings (spec.md §5 tables) — one
input per field, `amendmentText` as a multi-line textarea. The disclaimer
(FR-007) renders directly above the download button, not just once at the
top of the page. Client-side validation mirrors FR-005 (designator check)
before enabling download.

## 5. PDF generation (`/api/generate-pdf`)

```
lib/pdf/fillLlc.ts
lib/pdf/fillCorp.ts
```

- Load the vendored PDF bytes from `assets/forms/llc-amendment.pdf` or
  `assets/forms/corp-amendment-form-p.pdf` (bundled at build time, read
  once, cached in module scope — no network fetch at request time, so this
  never depends on `sos.wyo.gov` being reachable in production).
- `pdf-lib`: `PDFDocument.load(bytes)` → `form.getTextField(name).setText(value)`
  for every `/Tx` field named in spec.md §5.1/§5.2; `form.getCheckBox(name).check()`
  for the one approval box on the corp form (leave the other two — and all
  checklist self-check boxes — at their default `/Off`).
- Call `form.updateFieldAppearances()` before flattening so text renders
  correctly across PDF viewers (some viewers respect `/NeedAppearances`
  inconsistently — don't rely on it).
- `form.flatten()` before returning bytes: this is a final document meant
  for printing/signing/mailing, not further digital editing, and flattening
  avoids any viewer-specific rendering quirks with un-flattened form
  fields. (Tradeoff noted for sign-off: flattening means the user can't
  tweak the PDF further themselves in Acrobat after download — acceptable
  since the review screen is the edit point, and they can always regenerate.)
- Response: `Content-Type: application/pdf`, `Content-Disposition: attachment;
  filename="wyoming-{entityType}-amendment.pdf"`. No temp file written to
  disk — bytes go straight from `pdf-lib` into the response body (keeps
  constitution §III trivially true here too).

## 6. Project structure

```
app/
  page.tsx                  # landing page + disclaimer + CTA
  chat/page.tsx              # chat UI (client component)
  review/page.tsx            # review screen (client component)
  api/chat/route.ts
  api/generate-pdf/route.ts
lib/
  types.ts
  gemini.ts                  # thin client wrapper + system prompt
  composeAmendment.ts         # amendment-text template function
  pdf/fillLlc.ts
  pdf/fillCorp.ts
  validation.ts               # designator checks etc.
assets/forms/
  llc-amendment.pdf
  corp-amendment-form-p.pdf
```

State (conversation history, knownFields, entityType) is held in a small
client-side context (`useReducer`) and **mirrored to `sessionStorage`** on
every change, restored on mount — so a refresh mid-chat/mid-review does not
lose progress. `sessionStorage` (not `localStorage`) is a deliberate choice:
it survives a refresh but clears automatically when the tab/browser closes,
which keeps constitution §III's spirit (nothing lingers indefinitely) while
fixing the "don't lose my answers on refresh" requirement. This is still
100% client-only — the server never sees or stores this state; it's just
the browser's own storage, same privacy posture as before. Add an explicit
"Start over" action that clears it, for users who want to discard mid-flow.

## 7. Environment & deployment

- `.env.local` (dev) / Vercel project env vars (prod): `GEMINI_API_KEY`,
  `GEMINI_MODEL` (default `gemini-2.0-flash`). Never sent to the client —
  only read inside `app/api/*/route.ts` server code.
- Vercel free tier, no custom infra. `npm run build` must pass before any
  push (per CLAUDE.md).

## 8. Testing strategy

- **Smoke test (do this first, task 1)**: script that loads both vendored
  PDFs with `pdf-lib`, fills every field with dummy data, saves to a temp
  file, and confirms the field values round-trip — catches any field-name
  typo or library-compatibility surprise before the rest of the flow is
  built on top of it (spec Open Question 5).
- Unit tests for `composeAmendmentText` (both entity types) and
  `validation.ts` (designator checks — accepts "LLC", "L.L.C.", "Limited
  Liability Company"; rejects/warns on missing designator; corp equivalents).
- Manual QA against spec.md §9 acceptance criteria: full flow for both
  entity types, opened output PDF compared against a blank official form.

## 9. Free-tier daily quota — investigated, decided

Confirmed during T014 manual QA against the real API: `gemini-flash-latest`
(resolving to `gemini-3.6-flash`) is capped at 20 `generateContent`
requests/project/day. Rather than guess at a fix, we pulled the project's
actual Google AI Studio rate-limits dashboard, which shows quota is
tracked **per model**, and varies sharply on this project:

| Model | RPD |
|---|---|
| Gemini 3.6 Flash (`flash-latest`) | 20 |
| Gemini 2.5 Flash / Flash Lite | 20 |
| **Gemini 3.1 Flash Lite** | **500** |
| **Gemini 3.5 Flash Lite** | **500** |
| Gemma 4 31B | 14,400 |

**Decision**: switched the default model to `gemini-flash-lite-latest`
(§3), which resolves to one of the 500-RPD Lite models and was verified
working through the full tool-calling loop in testing. At ~2-4 calls/turn,
that's roughly 150+ conversations/day across all visitors — comfortable
for an MVP. **No multi-provider fallback for now** (constitution IV — no
speculative complexity ahead of a demonstrated need); revisit only if real
usage shows 500/day is actually insufficient. If it ever is, the cheapest
next step is GitHub Models (OpenAI-compatible, free via the repo owner's
existing GitHub account, no new signup) as a 429-triggered fallback —
NVIDIA NIM was also considered but requires a separate signup and doesn't
publish a clear daily cap, so it's a worse first choice.

## 10. Pre-launch risk: form staleness

This sandbox cannot reach `sos.wyo.gov` (network policy), so the vendored
PDFs were verified by field-structure extraction + the form's own embedded
"Revised June 2021" metadata, not a live fetch. **Before shipping**, do one
manual check: open the live URLs
(sos.wyo.gov/forms/business/llc/llc-amendment.pdf,
sos.wyo.gov/Forms/Business/PROF/P-Amendment.pdf) in a normal browser and
diff against the vendored copies. Tracked as a task in `tasks.md`.

## 11. Decisions (signed off)

1. Generated PDF is flattened before download (§5).
2. Conversation/review state survives a page refresh via `sessionStorage`,
   client-only, cleared on tab close or explicit "Start over" (§6).
3. Gemini SDK: whichever is current/stable at implementation time — no
   pinned preference.
