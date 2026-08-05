# Wyoming Company Name Changer

AI-assisted landing page that chats with a Wyoming LLC/Corporation owner, collects
the information required to change their entity's legal name, and produces a
download-ready, pre-filled copy of the **official Wyoming Secretary of State**
amendment form (the SOS only accepts these by mail/in-person — we don't file
anything on the user's behalf, we just prepare the paperwork).

## Development methodology: spec → plan → tasks → build

This repo follows a lightweight spec-driven workflow (spec-kit style), kept
dependency-free and hand-rolled for this project:

```
.specify/
  memory/constitution.md   # non-negotiable project principles
  specs/<NNN-slug>/
    spec.md                # WHAT & WHY — user stories, requirements, scope
    plan.md                # HOW — architecture, data model, API design
    tasks.md                # ordered, checkable implementation tasks
    agent.md                # if the feature drives an LLM agent: its system
                             # prompt, rules, and tool schemas — the source of
                             # truth the code loads, not a code-only detail
```

Rules for any new feature or significant change:
1. Write/update `spec.md` first. No code. Get explicit user sign-off.
2. Only then write `plan.md` (technical approach) — get sign-off if the
   approach is non-obvious or has tradeoffs.
3. Break the plan into `tasks.md` (small, independently verifiable steps).
4. Implement task-by-task, checking tasks off as they land.

Never skip straight to code for a new feature. Bug fixes / small tweaks to
already-specced behavior don't need this ceremony.

## Tech stack (all free-tier, no credit card required)

- **Framework**: Next.js (App Router, TypeScript). API routes run server-side
  so secrets never reach the browser.
- **Hosting**: Vercel free tier.
- **LLM**: Google Gemini (`gemini-2.0-flash` or newer flash tier) via the free
  Google AI Studio API key. Used for the conversational intake + structured
  data extraction (function calling / JSON mode) — never for legal advice.
- **PDF**: `pdf-lib` to fill the real AcroForm fields of the official Wyoming
  SOS forms, vendored into `assets/forms/`. See the `pdf` skill for form-field
  inspection/filling helpers.
- **No database.** No user accounts. Nothing persists server-side beyond the
  lifetime of a single request.

## Non-negotiable principles

See `.specify/memory/constitution.md` for the full list. The short version:
free-tier only, the generated PDF must match the real official form exactly,
no PII persistence, no premature abstraction, always disclaim "not legal
advice."

## Commands

Populated once the Next.js app is scaffolded (see `plan.md`):
- `npm run dev` — local dev server
- `npm run build` — production build (must pass before any push)
- `npm run lint` — lint
- `npm test` — unit tests

## Next.js version notes

See @AGENTS.md — auto-generated/maintained by the Next.js tooling itself
(regenerated on `next dev`/`next build`), documenting breaking changes for
whichever Next.js major version this repo is pinned to. Read it before
writing framework-level code; don't hand-edit it, it gets overwritten.

## Useful skills for this project

- `pdf` — filling/inspecting AcroForm fields on the official SOS PDFs.
- `security-review` — run before shipping anything that touches user PII.
- `run` — launch the app locally and click through the real flow before
  claiming a UI change works.
