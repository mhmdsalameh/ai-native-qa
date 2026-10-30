---
description: Write the test summary report for a release - every number copied from the RTM script, defects by gate verdict, exit criteria from the test plan, and what was not tested - and render it. The release decision stays with a human.
---

# /qa-report — test summary report

**Preflight:** these steps run Node scripts on the tester's computer. If `node --version` fails, or you cannot run shell commands here (claude.ai chat), stop and tell the tester this command needs Node.js and Cowork or Claude Code. Never do a script's work by hand.

Load the `qa-documents` skill.

1. Numbers: `qa-rtm.cjs summary --json`, `qa-rtm.cjs gaps`, `qa-bugs.cjs list`. Copy them; never
   compute, round or estimate a number by hand.
2. Per-slice table: from `qa-rtm.cjs export` (sheet Test cases), grouped by slice.
3. Exit criteria: copy them from `deliverables/Test plan.md`; mark each Met / Not met with the figure.
4. Write `deliverables/Test summary report.md` from
   `${CLAUDE_PLUGIN_ROOT}/skills/qa-documents/templates/summary-report.md`. "Not tested and limits" lists
   every blocked case, every type out of scope, and every surface limit.
5. Render it; also refresh `deliverables/rtm.xlsx` with `qa-rtm.cjs export`.

**Gate:** the report states facts and gaps; it never recommends shipping on its own. The named
release owner decides.
