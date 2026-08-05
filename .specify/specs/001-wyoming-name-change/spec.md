# Feature Spec 001: Wyoming Company Name Change Assistant

Status: DRAFT — pending user sign-off
Owner: (repo owner)

## 1. Overview

A single landing page where the owner of a Wyoming LLC or Wyoming
C-Corporation chats with an AI assistant to provide the information needed to
change their company's legal name, reviews a structured summary, and
downloads a pre-filled copy of the correct official Wyoming Secretary of
State amendment form as a PDF.

We do not submit anything to the state. Wyoming SOS only accepts these
amendment filings by mail or in person (no e-file, per current SOS
guidance) — the deliverable is the paperwork, ready to print, sign, and mail.

## 2. User stories

- **US-1**: As a Wyoming LLC owner renaming my company, I want to describe my
  situation in plain English and have the assistant figure out which fields
  go where, so I don't have to decode a government PDF myself.
- **US-2**: As a Wyoming C-Corporation owner, I want the same experience but
  routed to the correct corporate amendment form (different from the LLC
  form), so I don't accidentally file the wrong paperwork.
- **US-3**: As any user, I want to see a clear, structured review of exactly
  what will be printed on the form before I download it, so I can catch
  mistakes (typos in the new name, wrong filing date, etc.) before mailing
  something to the state.
- **US-4**: As any user, I want to be told clearly this isn't legal advice
  and that I'm responsible for mailing/paying the state, so I'm not misled
  about what the tool does.

## 3. Scope

### In scope
- Landing page (marketing/explainer + "start" CTA).
- Chat-based intake flow, English only.
- Entity type detection/selection: Wyoming **LLC** or **C-Corporation**
  (these are the only two entity types supported).
- AI (Google Gemini free tier) conducts the conversation and extracts
  structured data from it (function calling / JSON schema output).
- A structured **review screen** (not pure chat) shown before download,
  listing every field that will be printed on the form, editable inline.
- Server-side PDF generation: fill the real official SOS PDF's form fields
  with the reviewed data using `pdf-lib`, return it for download.
- Explicit "not legal advice / we don't file this for you" disclaimer shown
  on the landing page and again on the review screen.

### Out of scope (for this spec)
- Actually submitting/e-filing the amendment to Wyoming SOS.
- Payment processing (the $60 SOS filing fee is paid by the user via their
  own check/money order when they mail the form).
- Entity types other than LLC and C-Corp (e.g., LP, nonprofit, S-Corp
  election nuances).
- States other than Wyoming.
- User accounts, saved drafts across sessions, or history.
- Non-English UI.

## 4. Conversation & UX flow

1. **Landing page**: short explainer, disclaimer, "Start" CTA.
2. **Chat**: assistant asks for entity type first (LLC vs C-Corp), then
   gathers the fields listed in §5 for that entity type, asking follow-up
   questions for anything missing or ambiguous. User can type freely; no
   rigid script.
3. **Review screen**: once the assistant believes it has everything, it
   transitions out of chat into a structured, labeled summary of every field
   that will be written onto the government form. User can edit any field
   directly here (plain form inputs, not chat) before proceeding.
4. **Download**: on confirmation, the server fills the correct official PDF
   and returns it as a file download. No account, no email required.

## 5. Data fields required per entity type

Based on the current official Wyoming SOS forms:

### 5.1 LLC — "Amendment to Articles of Organization"
- Current legal LLC name (exactly as on file with Wyoming SOS)
- Wyoming SOS filing ID / registration number (if known — optional but
  recommended, speeds up state processing)
- Date of original Articles of Organization filing
- Article number being amended (default: the article containing the entity
  name, typically Article 1 — assistant should explain this)
- Full text of the new article (i.e., the new company name), which must end
  in an approved LLC designator (LLC, L.L.C., Limited Liability Company)
- Name and title of the person signing (authorized person/manager/member)
- Date of signing

### 5.2 C-Corporation — "Articles of Amendment" (Form P)
- Current legal corporate name (exactly as on file)
- Wyoming SOS filing ID / registration number (if known)
- Date of original Articles of Incorporation filing
- New corporate name, ending in an approved corporate designator
  (Inc., Incorporated, Corporation, Corp., Co., Company, or Limited/Ltd.)
- Article being amended
- Whether the amendment was adopted by directors only, or by
  directors + shareholder vote (affects which certification statement/
  checkbox is used on Form P) — assistant must ask this
- Name and title of the signing officer
- Date of signing

*(Exact official AcroForm field names for both PDFs still need to be
confirmed against the live files — see Open Questions §8. The field list
above is the human-meaning data; §8's task is mapping it 1:1 to the PDF's
actual form fields during `plan.md`.)*

## 6. Functional requirements

- **FR-001**: The assistant MUST ask which entity type (LLC or C-Corp)
  before asking any other question.
- **FR-002**: The assistant MUST use structured extraction (not free-text
  parsing on the client) to turn the conversation into a typed data object
  matching §5's schema for the selected entity type.
- **FR-003**: The system MUST show a review screen listing every field that
  will be printed on the PDF, with the exact text as it will appear, before
  any PDF is generated.
- **FR-004**: The user MUST be able to edit any field on the review screen
  without restarting the conversation.
- **FR-005**: The system MUST validate the new company name ends in a legal
  designator appropriate to the entity type before allowing download, and
  warn (not silently block) if it doesn't.
- **FR-006**: The generated PDF MUST be the actual official Wyoming SOS form
  for the selected entity type, with user data written into its real form
  fields.
- **FR-007**: The disclaimer (§3, US-4) MUST be visible on the landing page
  and MUST be shown again, unmissable, on the review screen before the
  download button.
- **FR-008**: No submitted conversation or form data may be written to a
  database or persistent log. It may only live in server memory / the
  client for the duration of the session.

## 7. Non-functional requirements

- **NFR-001 (cost)**: Must run entirely on free tiers — Gemini free API
  quota, Vercel free hosting. No paid add-ons.
- **NFR-002 (latency)**: Chat responses should feel conversational
  (target: first token/response within a few seconds under normal free-tier
  rate limits).
- **NFR-003 (accuracy)**: Because this produces a legal filing document,
  correctness of the official-form mapping is a higher priority than chat
  cleverness. When in doubt, the assistant should ask rather than guess.
- **NFR-004 (privacy)**: See constitution §III — no PII persistence.

## 8. Open questions / risks (to resolve in plan.md)

1. **Exact PDF field names**: `sos.wyo.gov` is unreachable from this
   sandbox's network policy (fetch attempts returned 403). Need to vendor
   the actual current PDFs (LLC amendment + Form P) into `assets/forms/`
   — either fetched from a normal (non-sandboxed) environment/Vercel build,
   or provided directly by the user — before `plan.md` can nail down the
   pdf-lib field mapping.
2. **Filing ID optional?**: Confirm with the real form whether the SOS
   filing/registration number field is required or optional — affects
   whether the assistant should insist on it.
3. **Form P certification branching**: Confirm the exact wording/checkbox
   structure Form P uses for "directors only" vs "directors + shareholders"
   adoption, since the assistant needs to ask the right disambiguating
   question.
4. **Gemini free-tier rate limits in production**: confirm current
   requests-per-day/minute limits at implementation time (they change) and
   design a graceful "please try again in a moment" fallback.

## 9. Acceptance criteria (definition of done for this feature)

- A user can complete the full flow (landing → chat → review → download) for
  both an LLC and a C-Corp scenario end-to-end.
- The downloaded PDF, opened in a standard PDF viewer, shows the correct
  official Wyoming form with the user's data correctly placed in the
  correct fields — verified by manually comparing against a blank official
  form.
- No network request in the flow sends collected data anywhere other than
  the Gemini API (for extraction) and back to the user's own browser (as the
  PDF).
- Disclaimer text is present and visible at both required touchpoints.
