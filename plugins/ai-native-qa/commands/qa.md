---
description: Print the ai-native-qa lifecycle map and detect where the current QA project is and what to run next. Router/help for the /qa-* commands.
---

# /qa — where are we, what is next

**Preflight:** these steps run Node scripts on the tester's computer. If `node --version` fails, or you cannot run shell commands here (claude.ai chat), stop and tell the tester this command needs Node.js and Cowork or Claude Code. Never do a script's work by hand.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-project.cjs" status`. If it reports no project, show the map
   below and suggest `/qa-init`.
2. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-rtm.cjs" summary` and `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-rtm.cjs" gaps`.
3. Report in five lines or fewer: project, FSD version, coverage, results, bug candidates by verdict,
   open questions, and the ONE next command with its slice. Read STATE.md's Last session block
   when it exists; prefer its `next:` when it is still valid.

Map (details: the `qa-lifecycle` skill):

```
/qa-init → /qa-ingest → /qa-analyze → /qa-plan → per slice: /qa-cases → /qa-run → /qa-gate
                                         any time: /qa-explore  /qa-check <type>  /qa-manual
                         new build / FSD v2: /qa-delta          release: /qa-report
```
