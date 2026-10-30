---
description: Stage 3 - write the test plan from the cards - scope per feature slice, risk, test types chosen from the catalog, environments and data, entry/exit criteria - and render it into the company template.
---

# /qa-plan — test plan

**Preflight:** these steps run Node scripts on the tester's computer. If `node --version` fails, or you cannot run shell commands here (claude.ai chat), stop and tell the tester this command needs Node.js and Cowork or Claude Code. Never do a script's work by hand.

Load the `qa-test-types` and `qa-documents` skills.

1. Facts first: `qa-project.cjs status`, `qa-rtm.cjs summary --json`. Count cards per slice and
   per risk from `cards/` front matter (Grep `^slice:` and `^risk:`), not by reading every card.
2. Choose test types per slice from the `qa-test-types` table by risk and by what the cards
   contain (limits → boundaries; roles → access checks; Arabic → localization). Read a type's
   reference only to write its line in the plan.
3. Write `deliverables/Test plan.md` from `${CLAUDE_PLUGIN_ROOT}/skills/qa-documents/templates/test-plan.md`.
   Include what the current surface cannot do (see the surfaces table in `qa-lifecycle`).
   Out of scope must name load, stress and penetration testing when the NFRs need them.
4. Render: `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-docx.cjs" render "deliverables/Test plan.md" --template <test-plan template> --out "deliverables/Test plan.docx"`.

**Gate:** the tester approves the plan, especially the slice order, the exit criteria and the
out-of-scope list. Next: `/qa-cases <first slice>`.
