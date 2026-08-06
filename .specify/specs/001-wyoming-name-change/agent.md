# Agent: Wyoming Name-Change Intake Agent

This is the one piece of the product that talks to an LLM (Google Gemini,
`/api/chat`, see plan.md §3). Everything here is the source of truth for
`lib/gemini.ts` — the code should load/embed this prompt and these tool
schemas rather than restating them ad hoc. If the agent's behavior needs to
change, edit this file first, then the code, same as any other spec change
(constitution VI).

## Role

A conversational intake assistant that collects exactly the information
needed to fill one of two Wyoming Secretary of State amendment forms (LLC
or Corporation — see spec.md §5), and nothing else. It does not give legal
advice, does not file anything, and does not remember anything beyond the
current request (constitution §III/§V).

## Flow control: the code asks, the model only listens

The agent used to schedule its own questions from prose, and then — after
that moved into code — still phrased them itself. Each step of that
retreat removed a class of bug and left a smaller one behind, always of the
same shape: whatever the model was still free to decide, it eventually
decided wrong. A Corp user asked for an LLC-only field. The same question
three turns running. An email recorded for a question never asked. A title
question shipped under the three approval chips, because the model recorded
a field and moved on mid-round. A user typing a name into the title
question, and "President" — the example from our own prompt — recorded as
their title.

So the model no longer writes anything the user reads. **Both the order and
the exact wording of every question live in `lib/fieldPlan.ts`**, and the
model's only job is to read the user's answer and call `record_field`.
There is no turn in which it can invent a question, skip one, reorder them,
attach the wrong chips, or answer for the user.

- **`LLC_FIELD_PLAN` / `CORP_FIELD_PLAN`** — the ordered steps for each form.
  Each carries its `record_field` key, the **verbatim question text** shown
  to the user (examples included in that text, so an example can never be
  invented), the required format, and any chips.
- **`nextStep(entityType, knownFields, history)`** — the entity type step,
  then the first step whose field is still missing, then the amendment-text
  read-back once there is a text that was never shown, then `null`.
- **`composeReply(step, outcome)`** — the reply, assembled in code: an
  optional one-line note about the previous answer (rejected value, or
  nothing recognised), followed by the current step's question, with that
  step's chips. Text and chips come from the same object, so they cannot
  disagree.
- **`lib/gemini.ts`** runs the model once per turn with an extraction-only
  instruction and a single tool pair (`set_entity_type`, `record_field`).
  Any user-facing text it produces is discarded.
- `suggest_replies` and `mark_ready_for_review` are gone. Chips come from the
  step; readiness is `nextStep(...) === null`. Neither was ever a judgment
  the model was better placed to make than the code.

What this costs, deliberately: the assistant no longer rephrases, and it
can't improvise an answer to an off-topic aside. The intake reads as a
chat-shaped wizard rather than a conversation. Given a document the state
acts on, stable wording is worth more than fluency.

It does not read as a wall, though. Every step also carries a fixed **`why`**
sentence — the reason that field is on the form — and a message that isn't an
answer gets it: "why do you even need my phone number?" is answered with
"The form asks for a daytime number so the Secretary of State can reach you
about this filing.", then the same question again. A message that is a
question gets that reason alone; anything else gets "I didn't catch that."
ahead of it. The reason is the same every time, which is exactly why it
doesn't need a model to write it.

## Rules (non-negotiable)

1. **Entity type first.** Before any other question, determine LLC or
   C-Corp (FR-001). Everything downstream depends on which field set/tools
   apply. This is `nextStep`'s first step, so it can't be skipped.
2. **No legal advice.** If asked something like "should I do a DBA
   instead?" or "will this affect my taxes?", answer only: this tool
   prepares the amendment paperwork, it can't give legal/tax advice, and
   point them to a lawyer/accountant for that — then return to intake.
   This rule used to live in the system prompt, which stopped enforcing
   anything the moment the model stopped writing to the user. It is now
   `lib/advice.ts`: a narrow keyword check on the user's message, one fixed
   disclaimer sentence, then the current question again. A false positive
   costs one accurate but unhelpful sentence; a false negative falls
   through to the ordinary not-understood path. Neither is worth a
   classifier, and a classifier would be a model call — the dependency this
   design is built to avoid.
3. **One question at a time.** Don't dump a checklist on the user; ask
   naturally, follow up on what's actually missing. The `CURRENT STEP`
   block carries exactly one field, which is what makes this structural
   rather than aspirational.
4. **Only the fields in spec.md §5.1 (LLC) / §5.2 (Corp).** Never ask
   about the share-reclassification field or the printed self-check
   boxes — those are out of scope for a name change (spec.md §5.3).
   `record_field`'s enum is necessarily the union of both entity types'
   keys (one tool, two forms), so **found in testing**: nothing stopped an
   LLC conversation from recording `approval`/`amendmentDate`, or a Corp
   one from recording `dateOfOriginalFiling` — fields that don't exist on
   the form being prepared. `lib/gemini.ts`'s `entityScopeError` now
   rejects cross-entity keys, and any `record_field` at all before
   `set_entity_type` (that tool's own description already required this,
   and every other validation — the company-name designator rules
   especially — depends on knowing which form is being filled).
5. **No filing/registration ID.** Neither form has that field — don't ask
   for it (spec.md, resolved Open Question 2).
6. **Compose, record, then confirm, the amendment text.** Once entity
   type, current name, new name, and article number are known, build
   `amendmentText` using the template in spec.md §5.3
   (`"Article {n}. The name of the {limited liability company|corporation}
   is {newName}."`), **call `record_field(amendmentText, ...)` with it —
   don't just say it in your reply**, then read it back to the user
   verbatim and only proceed once they've confirmed it. **Found during
   T014 testing**: the model composed and displayed the text in chat but
   sometimes skipped the `record_field` call for it, then called
   `mark_ready_for_review` anyway — the review screen showed an empty
   amendment-text box and download failed with a 400. Saying the text in
   the reply is not the same as recording it. **Both halves of this rule
   now have code-side safety nets** (the prompt rule is still the first
   line of defense): the text is fully determined by entity type + article
   number + new name, so `lib/gemini.ts` composes it via
   `composeAmendmentText` once those three are known rather than hoping for
   the `record_field` call (`looksLikeAmendmentText` already rejects a
   *wrong* text at record time — this covers the one never recorded at
   all); and `reconcileReadyForReview` refuses `mark_ready_for_review`
   until the recorded text has actually appeared in something the
   assistant said (markdown decoration ignored, wording not), reading it
   back itself with confirmation chips if it never did. **Reproduced in
   testing**: given one dense opening message, a Corp run recorded
   `amendmentText`, went straight to the approval question, and reached the
   review screen without the user ever seeing the wording that gets mailed
   to the state.
7. **Validate the designator, don't silently fix it.** If the new name
   doesn't end in a valid entity designator (LLC: "LLC" / "L.L.C." /
   "Limited Liability Company"; Corp: "Inc." / "Incorporated" /
   "Corporation" / "Corp." / "Co." / "Company" / "Limited" / "Ltd."), call
   `flag_invalid_name` and ask the user to confirm or correct it — never
   append a designator yourself without asking (FR-005).
8. **Corp approval question, in plain language — and never bundled with
   the amendment-text confirmation.** Ask which situation applies without
   requiring the user to know statute numbers — offer the three options
   from spec.md §5.2 in everyday terms, then map the answer to the correct
   one of the three checkbox tools/fields yourself. **Found from a real
   user report**: the model asked "Does this look correct? ... Also,
   regarding the approval of this amendment: (1)/(2)/(3)..." as a single
   combined message. The user replied with a bare "yes" — which answers
   the text confirmation, but is not a valid answer to a three-way legal
   choice — and the model recorded an `approval` value anyway. Which
   checkbox gets checked on the actual mailed form is a real legal fact,
   not a UX nicety; never infer it from an answer that could just as
   easily have meant something else. This is exactly what rule 3 (one
   question at a time) already forbids — confirm the amendment text as
   its own turn, wait for an unambiguous reply, then ask the approval
   question as a separate turn with its own `suggest_replies` chips.
9. **Stateless.** Only use what's in the current request's `history` +
   `knownFields`. No memory across requests, no external lookups beyond
   the tools below.
10. **Dates are always `mm/dd/yyyy`, exactly as printed on the form.**
    Applies to `dateOfOriginalFiling`, `signatureDate`, `amendmentDate`.
    **Found during T014 testing**: without this rule, the model recorded
    dates as `2026-08-01` instead of `08/01/2026` — the official forms
    print `(mm/dd/yyyy)` next to every date field, so ISO-formatted dates
    are wrong output, not just a style mismatch. `lib/gemini.ts` also
    normalizes these three fields server-side as a safety net (never
    trust the model alone on formatting that ends up on a legal
    document) — but the prompt rule is the first line of defense.
11. **Suggest quick replies when the question has discrete answers.**
    Whenever your question has a small set of natural answers (entity
    type; the Corp approval question; anything else with obviously
    enumerable options), call `suggest_replies` with 2-4 short option
    strings alongside your reply so the UI can offer them as tappable
    chips. Don't call it for open-ended questions (names, dates, dollar
    amounts, free text) — chips there would be noise, not help.
    **Reproduced in testing**: chips never reached the UI at all, on any
    turn. `suggest_replies` is itself a function call, and the model
    usually calls it in a tool-only round and writes the question in the
    *next* round (the Corp approval question does exactly this) — while
    `lib/gemini.ts` only kept options that arrived in the same round as the
    reply text, to avoid pairing a question with an earlier question's
    chips. Options are now collected across all rounds of a single turn
    (they all belong to that turn's one reply) but never survive it, and
    any code path that discards the model's reply — see rule 12 — must
    discard its chips with it. **The steps whose chips actually matter no
    longer depend on this at all**: entity type, the Corp approval question
    and the read-back confirmation carry their chips in the field plan, and
    the server ships those directly. `suggest_replies` remains for the
    ad-hoc enumerable question the plan doesn't know about (e.g. confirming
    a corrected designator), and plan chips win when both exist.
12. **When a single message states several fields at once, call
    `record_field` for every one of them — not just some.** Found from a
    real user report: given one dense message stating signer name, title,
    "also the contact person," phone, and email all together, the model
    recorded `signerTitle` but silently dropped `signerName`,
    `contactPerson`, `phone`, and `email` — then called
    `mark_ready_for_review` anyway, reaching the review screen with those
    boxes blank. Go through the message point by point before deciding
    you're done with it; a phrase like "also the contact person" refers
    back to a name already given in the same message and still needs its
    own `record_field(contactPerson, ...)` call, not just a mental note.
    **This is not solely a prompting problem** — `lib/gemini.ts` now
    double-checks every required field is actually present in
    `knownFields` before honoring `mark_ready_for_review`, and turns it
    back into a follow-up question if anything was skipped. **Ask about
    only the single next missing field**, not a combined list of
    everything still missing — the first version of this safety net named
    every missing field in one message ("signer name, contact person,
    phone, email"), which contradicted rule 3 (one question at a time)
    and read as jarringly different from the rest of the conversation.
    Treat this as a safety net, not a reason to be less careful in the
    first place. One field can't be asked for this way: **reproduced in
    testing**, a missing `approval` came out as "What's the approval?" — a
    humanized key name standing in for the three-way legal choice of rule
    8, with none of the three options offered. That path now asks the same
    plain-language question the review screen uses, with its own chips.
13. **`signatureDate` is pre-filled with today's actual date in code —
    never guess it yourself.** `lib/gemini.ts` sets `knownFields.signatureDate`
    to the real current date before your very first turn runs, specifically
    so you never have to invent one. **Found from a real user report**: given
    a message with signer name/title/contact/phone/email but no date at
    all, the model still called `record_field(signatureDate, "01/15/2023")`
    — a date nobody ever said, on a legal document. If `signatureDate`
    already appears in "Known fields," treat it as settled and don't ask
    about it or re-record it unless the user explicitly gives a different
    date (e.g. because they'll sign it later) — then `record_field` the
    date they actually gave, same as any other field.
14. **Verify email and phone actually look like an email and a phone
    before recording them.** **Found from real testing**: in separate
    live runs, the model accepted `"asdfghjkl"` and `"jordan@"` (no
    domain) as valid emails, and accepted letters-only garbage as a phone
    number after correctly rejecting a different piece of letters-only
    garbage (`"banana"`) moments earlier — this judgment call isn't
    reliable enough on its own for information the SOS form actually
    depends on for filing notices. **This is not solely a prompting
    problem** — `record_field` now rejects an `email` value that isn't
    shaped like `name@domain.tld`, and a `phone` value with fewer than 7
    digit characters, returning an error instead of recording it. If you
    get that error back, tell the user their answer didn't look right and
    ask again — don't just retry `record_field` with the same value.
15. **Never let a junk answer become a field value, and never invent the
    missing part of one.** **Found from real testing**: a user answered a
    bare `"s"` to every question and it was recorded as their company's
    legal name, their article number, and their signer name. Worse, asked
    for the company name after typing `"purple"`, the model recorded
    `"Purple Corp"` — fabricating the designator it had just been told
    (rule 7) never to add. `record_field` now enforces all of this in code
    and returns an error instead of recording:
    - **Company names** (`currentName`, `newName`) must carry a valid
      designator *and* have a real name in front of it — `"s LLC"` is
      rejected as firmly as `"s"` — *and* the designator must appear in
      what the user themselves actually typed, so you cannot supply it for
      them.
    - **`articleNumber`** must contain a digit, an ordinal word
      (`First`, `Second`, …) or a roman numeral. `"purple"` and `"s"` are
      rejected.
    - **Person fields** (`signerName`, `signerTitle`, `contactPerson`)
      need at least two distinct letters, so `"s"` and `"aaaa"` fail while
      genuinely short answers like `"Al"` and `"CEO"` pass.
    - **`dateOfOriginalFiling` and `amendmentDate`** cannot be in the
      future — both describe something that already happened, so a future
      date is a mistyped year.
    - **`newName` cannot equal `currentName`** — this filing exists to
      *change* the name; identical values mean something was misheard.
    When you get one of these errors, tell the user plainly what was wrong
    with their answer and ask again. Never work around it by rephrasing
    the same junk, and never fill in a part they didn't give you.
16. **A recorded value must come from the user, not from you.** Rule 15's
    designator check is one instance of a general rule, and the gap showed
    up as soon as both flows were replayed end to end: in an LLC run the
    email was **never asked about at all** and `jane.doe@example.com` was
    recorded anyway; in a Corp run the model wrote "for example,
    08/06/2026" in its own question and then recorded that example as
    `amendmentDate`. Both passed every format check, because a fabricated
    value is perfectly well-formed — which is exactly what makes it
    dangerous on a document the state acts on and mails to. `record_field`
    now verifies, for the three field kinds where the check is precise and
    mechanical, that the value traces back to something the user actually
    typed:
    - **Dates** (`dateOfOriginalFiling`, `amendmentDate`): every date
      appearing in the user's own messages is parsed and normalized, and
      the recorded date must be one of them. `"March 14, 2019"` therefore
      satisfies `03/14/2019` — the check is on the date, not the spelling.
    - **`email`**: an address the user typed, compared case-insensitively.
    - **`phone`**: the recorded digits must appear in the digits the user
      typed, so formatting differences (`307-555-0142` vs `(307) 555 0142`)
      don't matter.
    `signatureDate` is exempt — code pre-fills it (rule 13), and it is not
    recorded through this path unless the user gives their own date, in
    which case the same check applies. Person and company names keep rule
    15's checks rather than a literal-match rule: `"I'm Jane"` → `"Jane"`
    is a legitimate reading, and rejecting it would cost the user a turn
    for nothing.

## Tools

### `set_entity_type`
```json
{ "name": "set_entity_type",
  "description": "Record which of the two supported entity types the user has, as soon as it's determined. Must be called before any record_field call.",
  "parameters": {
    "type": "object",
    "properties": { "entityType": { "type": "string", "enum": ["llc", "corp"] } },
    "required": ["entityType"]
  }
}
```
Discovered missing during implementation (T008) — `record_field` only covers
`LlcFields`/`CorpFields` keys, which don't exist until the entity type
itself is known, so a dedicated tool is needed for that first step.

### `record_field`
```json
{ "name": "record_field",
  "description": "Record a single confirmed field value extracted from the conversation. `field` must be exactly one of the listed enum values that applies to the active entity type — never invent a different key name.",
  "parameters": {
    "type": "object",
    "properties": {
      "field": {
        "type": "string",
        "enum": [
          "currentName", "articleNumber", "newName", "amendmentText",
          "signatureDate", "signerName", "signerTitle", "contactPerson",
          "phone", "email",
          "dateOfOriginalFiling",
          "amendmentDate", "approval"
        ],
        "description": "LLC uses: currentName, dateOfOriginalFiling, articleNumber, newName, amendmentText, signatureDate, signerName, signerTitle, contactPerson, phone, email. Corp uses: currentName, articleNumber, newName, amendmentText, amendmentDate, approval, signatureDate, signerName, signerTitle, contactPerson, phone, email (approval is one of \"incorporators\"/\"board\"/\"shareholders\"). Exact match to lib/types.ts LlcFields/CorpFields keys required."
      },
      "value": { "type": "string" }
    },
    "required": ["field", "value"]
  }
}
```
Called once per field as it's confirmed — never batch-guessed from a single
ambiguous message without asking. **Found during T008 testing**: without an
explicit enum, the model invented plausible-looking but wrong key names
(e.g. `currentLegalName` instead of `currentName`), silently breaking the
review screen and PDF fill. The enum above is authoritative — it must stay
in sync with `lib/types.ts`.

### Removed: `flag_invalid_name`, `suggest_replies`, `mark_ready_for_review`

All three asked the model for a judgment the code was already in a position
to make, and each one eventually got it wrong in production:

- **`flag_invalid_name`** — `record_field` refuses a name without a valid
  designator, and a name whose designator the user never said (rule 15). The
  refusal produces the step's own retry note, so a flag adds nothing.
- **`suggest_replies`** — chips ship with the question they belong to. This
  tool produced chips for open-ended questions (two invented names under
  "who's signing?"), and, when the model recorded a field and moved on
  mid-round, chips for a question the user had already answered.
- **`mark_ready_for_review`** — readiness is `nextStep(...) === null`. The
  model called it with fields still missing and with the amendment text
  never shown, which is why it needed a veto in the first place.

## System prompt (used verbatim in `lib/gemini.ts`)

```
You extract structured data from one message in an intake conversation for
a Wyoming Secretary of State company name-change amendment. You never write
anything the user reads — the application composes every question and every
reply itself, and any text you produce is discarded.

Your only job each turn: read the user's latest message and call the tools.

Call set_entity_type as soon as the user makes clear whether the company is
an LLC or a Corporation. Call record_field once for every field value their
message actually states — including fields the current question didn't ask
about, when they volunteer them. A phrase like "also the contact person"
refers back to a name given earlier in that same message and still needs its
own record_field call. "Same" or "same as above" means the value already
recorded for the field it refers to; record that value, not the word.

Never record a value the user didn't give you. If their message doesn't
answer the current question, record nothing — the application will ask
again. Never fill a gap with an example, a placeholder, today's date, or a
value from the question text. record_field rejects what it can't verify and
tells you why; don't resubmit the same value, and never supply the part the
user left out.

The question the user is answering is shown to you as CURRENT QUESTION. Use
it to resolve what their answer refers to — nothing more.
```

## Example exchange (illustrative, not exhaustive)

```
Agent: Hi! I'll help you prepare a Wyoming name-change amendment. First —
       is your company a Wyoming LLC or a Wyoming Corporation?
User:  LLC
Agent: [set_entity_type entityType=llc] Got it. What's the LLC's current
       legal name, exactly as it's on file with the Secretary of State?
User:  Acme Ventures LLC
Agent: [record_field currentName="Acme Ventures LLC"] Thanks. And what
       would you like the new name to be?
User:  Acme Holdings
Agent: [flag_invalid_name reason="missing LLC designator"] "Acme Holdings"
       is missing a designator — Wyoming requires the name to end in LLC,
       L.L.C., or "Limited Liability Company". Did you mean "Acme
       Holdings LLC"?
User:  yes
Agent: [record_field newName="Acme Holdings LLC"] ...
```
