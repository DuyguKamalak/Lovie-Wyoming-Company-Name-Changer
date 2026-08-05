# Feature Spec 001: Wyoming Company Name Change Assistant

Status: APPROVED
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

## 5. Data fields — verified against the real official PDFs

The actual official forms are vendored in the repo (source: sos.wyo.gov,
provided directly by the user) and their AcroForm fields have been
extracted and confirmed field-by-field, including visual top-to-bottom
verification of checkbox ordering against the printed option text:

- `assets/forms/llc-amendment.pdf` — "LLC-Amendment", Rev. June 2021, 1 page
- `assets/forms/corp-amendment-form-p.pdf` — "P-Amendment", Rev. June 2021, 2 pages

### 5.1 LLC — `assets/forms/llc-amendment.pdf`

| PDF field name | Meaning |
|---|---|
| `name of llc` | Current LLC legal name — must match SOS records exactly |
| `date of filing` | Date the original Articles of Organization were filed |
| `amended article #` | Article number being amended (not the filing ID — use the existing article number for the name clause, or the next sequential number if adding a new article) |
| `amendment` | **Full text of the amended article** (assistant-composed, e.g. "Article 1. The name of the limited liability company is Acme Holdings LLC.") — see §5.3 |
| `date` | Signature date |
| `print name` | Name of the person signing (must be authorized by the company) |
| `title` | Signer's title |
| `contact` | Contact person (may equal signer) |
| `phone` | Daytime phone number |
| `email` | **Required** — SOS sends filing evidence/notices here |
| `Check Box7.0`–`.3` | Four self-check boxes mirroring the printed checklist (filing fee, processing time, mail-don't-email, review-before-submitting). Not legal data — optional, default unchecked. |

**There is no SOS filing/registration ID field anywhere on this form.** It is
not part of the data model (this resolves former Open Question 2).

### 5.2 Corporation — `assets/forms/corp-amendment-form-p.pdf`

| PDF field name | Meaning |
|---|---|
| `Corporation name` | Current legal name — must match SOS records exactly |
| `Article number being amended` | Article number being amended |
| `Amendment` | **Full text of the amended article** (assistant-composed) — see §5.3 |
| `exchange, reclassification, cancellation` | Only relevant if the amendment also changes share structure. Irrelevant to a pure name change — leave blank, don't ask. |
| `amendment date` | Date the amendment was adopted |
| `date` | Signature date |
| `printed name` | Signer's name (Chairman, President, or another officer) |
| `title` | Signer's title |
| `contact person`, `daytime phone number`, `email` | Contact info; email required |
| `Filing fee`, `Processing`, `Refer`, `review before submitting`, `Mail` | Five self-check boxes mirroring the printed checklist. Not legal data — optional, default unchecked. |

**Approval — exactly one of three checkboxes** (order verified against the
printed form, top to bottom):
- `Incorporators approved` = "Shares were not issued and the board of
  directors or incorporators have adopted the amendment."
- `Board of directors approved` = "Shares were issued and the board of
  directors have adopted the amendment without shareholder approval
  (W.S. 17-16-1005)."
- `Shareholders approved` = "Shares were issued and the board of directors
  have adopted the amendment with shareholder approval (W.S. 17-16-1003)."

The assistant must ask which situation applies (most name-change-only
amendments without a share event will be the first option) and check
exactly one box. This resolves former Open Question 3.

**There is no SOS filing/registration ID field on this form either.**

### 5.3 Composing the amendment text (both forms)

Neither form has a bare "new name" box — the `amendment`/`Amendment` field
expects the **full text of the amended article** as it will legally read,
e.g. `Article 1. The name of the limited liability company is Acme Holdings
LLC.` The assistant composes this from (entity type, article number, new
legal name incl. designator) and always shows it verbatim on the review
screen for the user to edit before download — this exact wording is what
gets filed with the state.

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

1. ~~Exact PDF field names~~ — **RESOLVED**: official PDFs vendored at
   `assets/forms/llc-amendment.pdf` and `assets/forms/corp-amendment-form-p.pdf`;
   fields extracted and documented in §5.
2. ~~Filing ID optional?~~ — **RESOLVED**: neither form has a filing/
   registration ID field at all; it's not part of the data model.
3. ~~Form P certification branching~~ — **RESOLVED**: three-way checkbox
   mapping confirmed against the printed form in §5.2.
4. **Gemini free-tier rate limits in production**: confirm current
   requests-per-day/minute limits at implementation time (they change) and
   design a graceful "please try again in a moment" fallback.
5. **pdf-lib compatibility smoke test**: both forms use standard `/Tx` text
   fields and `/Btn` checkboxes with `/Off`+`/Yes` states, which `pdf-lib`
   handles natively — but confirm with a real fill-and-save round trip as
   the first implementation task, before building the rest of the flow on
   top of it.

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
