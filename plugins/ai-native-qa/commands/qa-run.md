---
description: Stage 5 - execute ONE slice's test cases with evidence - smoke first, model-driven first run with a text snapshot then saved Playwright replay specs, API via curl, desktop/mobile run by the tester - and record every result in the RTM.
argument-hint: "<slice> [--replay] [--build x] [--env UAT]"
---

# /qa-run — execute one slice

**Preflight:** these steps run Node scripts on the tester's computer. If `node --version` fails, or you cannot run shell commands here (claude.ai chat), stop and tell the tester this command needs Node.js and Cowork or Claude Code. Never do a script's work by hand.

Load the `qa-execution` skill (and `qa-data-handling` when the data class is not D0).

1. Confirm build and environment with the tester. Smoke first: the slice's P1 cases, or the
   saved P1 specs. A smoke failure stops the run: report the build as BLOCKED.
2. **Replay what exists** (CLI): if `scripts/` has specs for this slice and `node_modules` exists,
   run `QA_RUN=<slice>-<build> npx playwright test scripts/TC-<...>` in the project folder, then
   `qa-rtm.cjs import-replay evidence/replay/<run>/results.json --build <b> --env <e>`.
   First time: `qa-project.cjs setup-replay --env <e>`, then ask before `npm install`.
3. **Drive the rest** in priority order (P1, P2, P3), per the `execution` field:
   web → snapshot-driven first run, evidence screenshot per checked step, then write the replay
   spec; api → curl with saved exchanges; manual/desktop/mobile → human-run protocol.
4. Record every case: `qa-rtm.cjs record --tc <id> --result <r> --evidence <files> --build <b> --env <e>`
   (blocked/unclear with `--note`). Never leave a case you touched unrecorded.
5. End of slice: `qa-rtm.cjs summary` and `gaps`; update STATE.md Last session; suggest `/clear`.

**Gate:** failures go to `/qa-gate` - none is called a bug before it. Report: pass/fail/blocked/
unclear counts, specs written, and what the surface could not run.
