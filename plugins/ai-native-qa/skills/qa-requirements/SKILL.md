---
name: qa-requirements
description: How to turn a requirements document (FSD, BRD, SRS), designs, or only a running app into requirement cards (REQ-####.md) with verbatim source quotes, questions for the BA (Q-####.md), and an FSD when one is missing. Covers the card format, what counts as one testable rule, the ambiguity checklist, vague words, and the app-only case. Use during /qa-ingest and /qa-analyze, and whenever cards or questions are written or reviewed.
---

# Requirement cards and questions

A card is one testable rule with its source. Later stages read cards, never the document, so a
card must carry everything a tester needs: the rule, the quote, where it came from, and hints.

## Card format (`cards/REQ-0142.md`)

```markdown
---
id: "REQ-0142"
title: "Transfer daily limit"
section: "S014"            # section id from fsd/<v>/index.md
ref: "4.3.2"               # the document's own numbering, when it has one
page: 31                   # page hint from the index (approximate)
slice: "transfers"         # feature slice = unit of work for one session
risk: "high"               # high | medium | low (see Risk below)
quote: "The system shall reject a transfer above the user's daily limit and show message E-104."
origin: "fsd"              # fsd | brd | design | observed
---
Expected: transfer blocked; message E-104 shown; balance unchanged.
Actor: retail customer. Rule data: Tier 1 limit 5,000; Tier 2 limit 20,000 (table in S014).
Test hints: boundaries limit-1, limit, limit+1; per tier; limit reached by two transfers.
Open: Q-0017.
```

Get the id with `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-rtm.cjs" next-id req`. File name = id.

## Rules

1. **Quote verbatim.** Copy the sentence(s) from the section file. Do not fix grammar, translate,
   or merge sentences from different places. `sync` rejects a quote that is not in the section.
2. **One rule per card.** "shall X and Y" with independent outcomes is two cards. A table of
   values for one rule stays one card (put the values in the body).
3. **Testable or a question.** If you cannot state an observable expected result, write a
   question, not a card.
4. **Keep the document's words** for screens, fields, buttons and messages. A manual and a bug
   report reuse them.
5. **Read one section per call.** Read `fsd/<v>/index.md` once, then each section file. Write that
   section's cards and questions, then move on. Do not reread earlier sections.
6. **Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-rtm.cjs" sync`** after each batch; fix every reported problem.

## Questions (`questions/Q-0017.md`)

```markdown
---
id: "Q-0017"
status: "open"             # open | answered | withdrawn
section: "S014"
req: "REQ-0142"            # optional
asked_to: "BA"
answer: ""                 # filled when answered; then status: answered
---
Does the daily limit reset at 00:00 local time or UTC? S014 says "per day" only.
```

Ask a question when the text is:

| Problem | Example |
|---------|---------|
| Ambiguous | "per day" without a time zone; "recent transactions" without a count |
| Missing | an error case with no message; a field with no length or format |
| Conflicting | S014 says 5,000; the table in S020 says 3,000 |
| Untestable | "fast", "user-friendly", "secure", "as appropriate", "etc." |
| Undefined term | a role, status or code that the document never defines |

Vague words to flag: fast, quick, easy, user-friendly, intuitive, appropriate, adequate,
flexible, robust, secure, efficient, normally, usually, some, several, etc., and/or, TBD.

## Risk

high = money, personal data, security, legal, or a main flow most users take.
medium = a main flow with a workaround, or a secondary flow many users take.
low = cosmetic or rarely used. Risk drives test depth (`/qa-plan`) and run order.

## Writing an FSD (only a BRD, designs or the app exist)

1. Ingest what exists; cards get `origin: brd`, `design` or `observed`.
2. Write `deliverables/FSD.md` from the cards with the outline in
   `${CLAUDE_PLUGIN_ROOT}/skills/qa-documents/templates/fsd.md`; every functional statement cites its REQ id.
3. The tester reviews it. Render it with `qa-docx.cjs` into the FSD template.
4. Ingest the reviewed FSD as the next version, so the quotes come from the reviewed text.

## App only, no documents

Explore first (`/qa-explore`). Cards get `origin: observed` and the quote is the observed
behaviour in the form "Observed: ...". An observed card is NOT an oracle for a bug: only a named
standard (crash, HTTP 5xx, data loss, WCAG, security, an inconsistency between two screens of
the same app) can make a finding a bug. Everything else becomes a question.
