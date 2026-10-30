---
description: Stage 4 - design test cases for ONE feature slice from its requirement cards with named techniques, validate them into the RTM, and export the slice's test cases to Excel (company template when one exists).
argument-hint: "<slice>"
---

# /qa-cases — test cases for one slice

**Preflight:** these steps run Node scripts on the tester's computer. If `node --version` fails, or you cannot run shell commands here (claude.ai chat), stop and tell the tester this command needs Node.js and Cowork or Claude Code. Never do a script's work by hand.

Load the `qa-test-design` skill. Slice: `$ARGUMENTS` (ask if empty; list slices from `cards/`).

1. Read only this slice's cards (Grep `slice: "<slice>"` in `cards/`, then read those files).
2. For each card choose techniques by its content and risk; write the cases into
   `cases/<slice>.json` (ids from `qa-rtm.cjs next-id tc REQ-####`).
3. `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-rtm.cjs" sync` — fix every problem it reports.
4. `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-rtm.cjs" gaps` — every active card of the slice has a case.
5. Export: `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-rtm.cjs" export-cases --slice <slice> --out "deliverables/Test cases - <slice>.xlsx"`
   (add `--template --sheet --header-row --columns` for a company workbook; see `qa-documents`).
6. Update STATE.md Last session (slice done, case count, next slice) and suggest `/clear`.

**Gate:** the tester reviews the cases (the Excel file) before execution. Report per technique
and per priority, and any card that got only one case although it is high risk.
