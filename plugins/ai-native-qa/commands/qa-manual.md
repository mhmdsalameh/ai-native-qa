---
description: Write the user manual from the requirement cards and the real screens - task outline per role, one task per call, screens captured once at a fixed size with personal data masked, English and/or Arabic with a glossary - and render it into the template.
argument-hint: "[role or area] [--lang en|ar|en+ar]"
---

# /qa-manual — user manual

**Preflight:** these steps run Node scripts on the tester's computer. If `node --version` fails, or you cannot run shell commands here (claude.ai chat), stop and tell the tester this command needs Node.js and Cowork or Claude Code. Never do a script's work by hand.

Load the `qa-documents` and `qa-execution` skills (and `qa-data-handling` above D0).

1. Outline: list tasks per role from the cards (Grep titles and slices). One topic per task,
   named with a verb. Confirm the outline with the tester.
2. For each task, one at a time:
   - Read only that task's cards.
   - No app yet: write the steps from the cards and mark screens "Screen pending".
   - App available: walk the task once with text snapshots; take one screenshot per screen at
     1366x768 (mask personal data first) into `evidence/manual/<task>-<n>.png`.
   - Write the topic into `deliverables/User manual.md` (outline:
     `${CLAUDE_PLUGIN_ROOT}/skills/qa-documents/templates/user-manual.md`), with the screen's own labels.
   - When the app differs from the card: do not document either version silently. Record it:
     a fail through `/qa-gate`, or a question.
3. Arabic: keep `notes/glossary.md`; write `deliverables/User manual - AR.md` with
   `language: "ar"` from the English edition and the glossary; use the Arabic screen labels.
4. Render each edition with `qa-docx.cjs render` into the manual template (`.ar.docx` if present).

**Gate:** the tester reviews the manual. Report tasks written, screens pending, and differences found.
