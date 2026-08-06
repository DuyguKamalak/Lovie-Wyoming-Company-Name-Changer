# Lovie — Wyoming Company Name Changer

**Live:** [lovie-wyoming-company-name-changer.vercel.app](https://lovie-wyoming-company-name-changer.vercel.app)

An AI-assisted landing page that chats with a Wyoming LLC/Corporation owner,
collects the information required to change their entity's legal name, and
produces a download-ready, pre-filled copy of the **official Wyoming
Secretary of State** amendment form.

The Secretary of State only accepts this filing by mail or in person — this
tool prepares the paperwork, it does not file anything on your behalf, and
it is not legal advice.

## How it works

1. Chat with Lovie about your Wyoming LLC or Corporation and the new name
   you want.
2. Review every extracted field before anything is generated.
3. Download a pre-filled copy of the real SOS amendment form, ready to
   print, sign, and mail (with the $60 filing fee).

Nothing is stored server-side: each request is self-contained, the browser
holds the conversation state, and the server never persists PII beyond the
lifetime of a single request.

## Tech stack

- **Next.js** (App Router, TypeScript) — API routes run server-side so
  secrets never reach the browser.
- **Tailwind CSS v4** + `framer-motion` for styling/animation.
- **Google Gemini** (`gemini-flash-lite-latest`) for the conversational
  intake agent, via function calling / structured extraction.
- **pdf-lib** to fill the real AcroForm fields of the vendored official
  Wyoming SOS forms (`assets/forms/`).
- No database, no user accounts — all free-tier.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in GEMINI_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

See `.env.example`. `GEMINI_API_KEY` is required — get a free key from
[Google AI Studio](https://aistudio.google.com/apikey).

`GEMINI_API_KEYS` (comma-separated) and `GEMINI_API_KEY_FALLBACK` are
optional extra keys. The app automatically tries the next key when one is
rate-limited, restricted, or rejected. Free-tier capacity is **per key and
capped per minute** (15 RPM), so extra keys — from different Google
accounts — are the only real way to raise the ceiling; see
`.specify/specs/001-wyoming-name-change/plan.md` §9.1 for the measurements
behind that.

`GEMINI_MODEL` is optional and defaults to `gemini-flash-lite-latest`.

### Commands

- `npm run dev` — local dev server
- `npm run build` — production build (must pass before any push)
- `npm run lint` — lint
- `npm test` — unit tests (`node --test`, colocated in `__tests__/` next to
  the code they cover)
- `npm run smoke:pdf` — quick manual check that the vendored PDFs still
  fill correctly

## Deployment

Deployed on [Vercel](https://vercel.com) (free tier, serverless functions),
tracking the `main` branch — every push to `main` auto-deploys to
production. Environment variables (`GEMINI_API_KEY`, optionally
`GEMINI_API_KEY_FALLBACK` and `GEMINI_MODEL`) are set in the Vercel
project settings, not committed anywhere.

To deploy your own copy: import this repository in the Vercel dashboard
and set those same environment variables — no other configuration is
needed.

## Project structure & development process

This repo follows a spec-driven workflow — see `CLAUDE.md` for the full
methodology and `.specify/specs/001-wyoming-name-change/` for the actual
spec, technical plan, task breakdown, and the intake agent's system prompt
(the source of truth for `lib/gemini.ts`'s behavior). Changes to the
agent's behavior or the form fields it collects should update those docs
first.

```
app/            Routes (App Router), each with colocated __tests__/
lib/            Business logic: Gemini agent, PDF filling, validation
assets/forms/   Vendored official Wyoming SOS PDF forms
.specify/       spec.md / plan.md / tasks.md / agent.md
```
