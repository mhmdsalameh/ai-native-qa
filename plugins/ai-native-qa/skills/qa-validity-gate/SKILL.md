---
name: qa-validity-gate
description: The five checks that turn a failed step into a valid bug report (oracle, two clean replays, cause is the product, duplicate search, complete report), the named standards accepted as oracles, the severity matrix, how to write the report, tester approval, and filing in Azure DevOps (or pasting it when ADO is not connected). Use during /qa-gate and /qa-explore, whenever a bug is about to be reported, and when reviewing bug reports.
---

# Validity gate

Every failure goes through five checks in order. `qa-bugs.cjs check` computes the verdict from
what you record; you never write a verdict. A finding that stops at a check is still useful -
it goes where it belongs, not into ADO.

| Check | Question | If not passed |
|-------|----------|---------------|
| G1 Oracle | Does a requirement card quote, or a named standard, state the expected result? | `question`: write a Q-#### for the BA |
| G2 Reproduce | Did it fail again on two clean replays, each with evidence? | `not-reproducible`: keep the log, do not file |
| G3 Cause | Is the cause the product, not the environment, test data or access? | `environment`: tell the environment owner; mark the case BLOCKED |
| G4 Duplicate | Did a search find no open item with the same requirement and symptom? | `duplicate`: add your evidence to the open item |
| G5 Complete | Title, steps, expected, actual, evidence files, severity from the matrix? | `incomplete`: fix the report |

## Procedure for one failure

1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-bugs.cjs" new --tc TC-0142-03` - creates `bugs/C-####.json`,
   prefilled with the card quote, steps and the failed run's evidence.
2. **G1**: keep `oracle.type: requirement` with the card's exact quote, OR set
   `{"type": "standard", "standard": "WCAG 2.2 SC 1.4.3", "reference": "contrast 2.9:1 on Confirm"}`.
   Accepted standards: `WCAG 2.x SC n.n.n`, `HTTP 5xx`, `crash`, `data loss`, `unhandled error`,
   `broken link`, `OWASP ...`, `security: ...`. If neither fits, it is a question - stop here.
3. **G2**: replay from a clean state (new session or fresh test data) twice - the replay spec, or
   the same steps by the model. Add each to `replays`: `{"result": "fail", "evidence": "evidence/TC-0142-03/replay1/3-confirm.png"}`.
4. **G3**: before blaming the product, check: is the environment up for other flows? Is the test
   data in the state the precondition says? Does the user have the role? Set
   `cause: {"kind": "product" | "environment" | "test-data" | "access", "note": "..."}`.
5. **G4**: search ADO (connected: `search_workitem` with the REQ id and key words, or `wit_query`
   WIQL on open Bugs with the REQ tag) and the other candidates in `bugs/`. Record
   `duplicate_check: {"query": "...", "matches": [{"id": 812, "title": "...", "same_symptom": false}]}`.
   No ADO connection: search what you can (`bugs/`, a list the tester gives) and say so in the query text.
6. **G5**: write `title`, `actual`, `severity`, `data` (masked); keep steps from the replay.
7. `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-bugs.cjs" check C-####` - read the verdict and fix what it names.

## Writing the report

- Title: `[Area] What happens - in which condition`, from the user's side:
  "[Transfers] Amount above the daily limit is accepted for Tier 1 users". No "error", "issue", "bug" as the subject.
- Steps: numbered, one action each, from a clean start, with the exact data.
- Expected: the quote (with REQ and page) or the standard. Actual: what was observed, in the
  same terms; no guesses about the cause.
- Severity from `.qa/config.json` severity_matrix, by impact on the user, not effort to fix.
  The tester sets priority.
- One problem per bug. Two symptoms with one cause: one bug, both symptoms listed.

## Approval and filing

1. Show the tester `qa-bugs.cjs render C-####` (Markdown). The tester decides.
2. Approval: `qa-bugs.cjs approve C-#### --by "<tester name>"` - a hook asks the human to confirm.
   Any later edit to the candidate removes the approval.
3. ADO connected: `qa-bugs.cjs render C-#### --format ado` gives the payload with the
   `QA-ID: C-####` marker. Create the Bug with `wit_work_item_write` (action create) using those
   fields; upload and link the evidence files (`wit_work_item_attachment_upload`, `_link`).
   The ADO hook refuses a Bug without an approved, valid, unfiled candidate.
4. Record the id: `qa-bugs.cjs filed C-#### --ado 4521`.
5. No ADO connection (Chrome, Cowork in the cloud): give the tester the Markdown report and the
   evidence file list to paste; after they file it, record the id with `filed`.

## Optional second read

For Critical or High candidates, or when the tester asks, offer the `qa-reviewer` agent (fresh
context, reads only the candidate, its card and its evidence). It is opt-in: it costs a second
context.
