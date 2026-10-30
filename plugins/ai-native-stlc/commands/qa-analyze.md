---
description: Stage 2 - analyze the requirement cards for gaps, conflicts and untestable text, update the BA question list, and write the FSD when only a BRD, designs or the running app exist.
---

# /qa-analyze — gaps, questions, FSD

**Preflight:** these steps run Node scripts on the tester's computer. If `node --version` fails, or you cannot run shell commands here (claude.ai chat), stop and tell the tester this command needs Node.js and Cowork or Claude Code. Never do a script's work by hand.

Load the `qa-requirements` skill.

1. Work from cards and questions only (`qa-rtm.cjs summary`, then read cards slice by slice).
   Do not reread the source document.
2. Look across cards for: conflicting values, missing error cases, undefined roles or statuses,
   flows with no end state, messages without text, vague words. Each finding becomes a question
   (`questions/Q-####.md`) that names the cards involved.
3. Answered questions: when the tester gives an answer, set `status: answered` and `answer:`;
   update the affected cards' body (the quote stays the document's text) and run `sync`.
4. FSD wanted (only BRD/designs/app, or the client asks for one): write `deliverables/FSD.md`
   from the outline in `${CLAUDE_PLUGIN_ROOT}/skills/qa-documents/templates/fsd.md`, every requirement
   citing its REQ id; render with `qa-docx.cjs render ... --template <fsd template>`.
5. Export the questions for the BA: `qa-rtm.cjs export` (sheet Questions).

**Gate:** the tester reviews the questions (and the FSD) before they go to the BA: review the open
questions as `qa-requirements` "Question review with the tester" says, before the export in step 5.
After the BA
answers and an FSD is reviewed, ingest the reviewed FSD as the next version (`/qa-ingest`, `/qa-delta`).
