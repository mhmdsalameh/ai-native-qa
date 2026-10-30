---
description: Stage 6 - run every failed step through the five validity checks (oracle, two clean replays, cause, duplicate search, complete report), show the tester the valid bug reports for approval, and file approved bugs in Azure DevOps.
argument-hint: "[TC id | slice]"
---

# /qa-gate — valid bugs only

**Preflight:** these steps run Node scripts on the tester's computer. If `node --version` fails, or you cannot run shell commands here (claude.ai chat), stop and tell the tester this command needs Node.js and Cowork or Claude Code. Never do a script's work by hand.

Load the `qa-validity-gate` skill.

1. List failures without a candidate: `qa-rtm.cjs gaps` (fails_without_candidate). Limit to
   `$ARGUMENTS` when given.
2. For each failure: `qa-bugs.cjs new --tc <id>`, then G1-G5 as the skill describes, then
   `qa-bugs.cjs check C-####`. Route by verdict:
   - question → write `questions/Q-####.md`; environment → tell the tester which environment owner;
     duplicate → add the evidence to the open item (comment); not-reproducible → keep, report.
3. Show the tester each **valid** candidate: `qa-bugs.cjs render C-####`. Offer the
   `qa-reviewer` agent for Critical/High (opt-in, it costs a second context).
4. The tester approves: `qa-bugs.cjs approve C-#### --by "<name>"` (the hook asks the human).
5. File: `qa-bugs.cjs render C-#### --format ado` → create the Bug with the ADO tools → upload
   and link the evidence → `qa-bugs.cjs filed C-#### --ado <id>`. Not connected: hand the
   Markdown report and evidence list to the tester, then record the id they give you.
6. Report the verdict counts: `qa-bugs.cjs list`.

**Gate:** only the tester approves. Never file, and never call something a bug in a message,
before its verdict is valid.
