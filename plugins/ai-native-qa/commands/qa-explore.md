---
description: Charter-based, timeboxed exploratory testing session with a written trail - text snapshots while exploring, candidates through the validity gate, ideas into test cases, questions to the BA, and a session report.
argument-hint: "<area>"
---

# /qa-explore — one charter

**Preflight:** these steps run Node scripts on the tester's computer. If `node --version` fails, or you cannot run shell commands here (claude.ai chat), stop and tell the tester this command needs Node.js and Cowork or Claude Code. Never do a script's work by hand.

Load the `qa-test-types` skill and read `references/exploratory.md`; load `qa-execution`.

1. Write the charter in `notes/explore-<date>-<area>.md`: "Explore <area> with <data> to
   discover <risk>", timebox, build, environment. Confirm it with the tester.
2. Explore with text snapshots; log notes as you go (`IDEA:`, `Q:`, `FAIL:` + evidence file).
   Stop at the timebox.
3. FAIL lines → `/qa-gate` procedure (a case for the candidate first, `technique: exploratory`,
   then record the fail with its evidence). IDEA lines → cases. Q lines → questions.
4. Write the session report from `${CLAUDE_PLUGIN_ROOT}/skills/qa-documents/templates/exploratory-report.md`;
   render it if the tester wants a Word file.

**Gate:** the tester reads the coverage and "not covered" list; candidates follow `/qa-gate`.
