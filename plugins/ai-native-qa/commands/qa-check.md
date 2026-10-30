---
description: Run a special or non-functional check - accessibility, performance, compatibility, security (basic), localization/RTL, data migration, installation, mobile, recovery, or any type in the catalog - against its standard, and write a check report.
argument-hint: "<type> [pages or flows]"
---

# /qa-check — one check type

**Preflight:** these steps run Node scripts on the tester's computer. If `node --version` fails, or you cannot run shell commands here (claude.ai chat), stop and tell the tester this command needs Node.js and Cowork or Claude Code. Never do a script's work by hand.

Load the `qa-test-types` skill and read ONLY `references/<type>.md` for `$ARGUMENTS`
(ask which type if empty; list the catalog).

1. Scope: the pages or flows to check (from the plan or the tester), the oracle (standard or NFR
   numbers), the tools the reference names for this surface. Say what the surface cannot do.
2. Run the checks; save every tool report and screenshot into `evidence/checks/<type>/`.
3. Each failure against a criterion → a test case if none exists (`technique: checklist` or
   `standard`), a recorded fail, and the `/qa-gate` procedure with a standard oracle
   (for example `WCAG 2.2 SC 1.4.3`). Recommendations without a criterion stay in the report only.
4. Write the report from `${CLAUDE_PLUGIN_ROOT}/skills/qa-documents/templates/check-report.md`; render it.

**Gate:** the tester reviews the report and the candidates.
