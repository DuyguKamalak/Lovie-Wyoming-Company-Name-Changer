# Project Constitution

These principles override convenience, cleverness, and speed. When a decision
conflicts with one of these, the principle wins.

## I. Free-tier only
Every service this product depends on (LLM API, hosting, PDF tooling) must be
usable indefinitely on a no-credit-card free tier. Never introduce a
dependency that requires payment to keep the product running. If a free tier
has a hard quota, degrade gracefully (clear error message) rather than fail
silently or fall back to a paid path.

## II. Official-form fidelity
The generated PDF is a legal filing document. It must be the real, unmodified
Wyoming Secretary of State form (LLC "Amendment to Articles of Organization"
or Corporation "Articles of Amendment / Form P") with our data written into
its actual fields — never a lookalike we drew ourselves. If the official form
changes, our output must change with it. A mismatch between our output and
the current official form is a bug, full stop.

## III. Privacy by default
We collect legal/business information, some of it sensitive. Nothing the user
types is persisted server-side beyond the request that generates their PDF —
no database, no logs containing form content, no analytics on message
content. The PDF is generated and streamed straight to the user's browser.

## IV. Simplicity
No user accounts, no auth, no database, no premature abstraction, no feature
flags. Build only what the current spec requires. Three similar lines beat a
speculative helper.

## V. Legal-safety
This tool prepares paperwork; it does not give legal advice and does not
file anything with the state. That distinction must be visible on the
landing page and on the review screen before download, in plain language.

## VI. Spec before code
No feature lands without a spec.md written and approved first, per the
workflow in CLAUDE.md. Plans and tasks follow the spec, never the reverse.
