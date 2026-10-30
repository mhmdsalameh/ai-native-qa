---
name: qa-lifecycle
description: The ai-native-qa lifecycle - how Claude does a QA team's work (requirements analysis, FSD, test plan, test cases, web/API/manual execution, valid bug reports, user manuals, summary reports) at low token cost. Covers the stage map and /qa-* commands, the project folder, the scripts that hold the state, the session and token rules, data classes, and what works on each Claude surface. Use at the start of any QA session, when the user mentions an FSD/BRD/SRS, test cases, a bug report, an RTM, a user manual or /qa, and before choosing which /qa-* command to run.
---

# ai-native-qa lifecycle

Claude does the QA work; the tester owns every judgment. Two failures shaped this harness, from
an unguided run on a 70-page FSD: **83 bugs reported, 15 valid (18%)** and **26 million tokens**.
The causes were one long chat that re-sent everything, no expected result to compare with, and
no check before a finding became a bug. Each rule below removes one of those causes.

## Stage map

| # | Command | Does | Output |
|---|---------|------|--------|
| 0 | `/qa-init` | Create the project folder, config, templates | `.qa/config.json`, folders |
| 1 | `/qa-ingest` | Split the document by script; extract requirement cards one section at a time | `fsd/<v>/`, `cards/`, `questions/` |
| 2 | `/qa-analyze` | Gaps and questions; write the FSD when only a BRD or the app exists | `questions/`, `deliverables/FSD.docx` |
| 3 | `/qa-plan` | Risk, test types, feature slices, environments, entry/exit criteria | `deliverables/Test plan.docx` |
| 4 | `/qa-cases` | Test cases for ONE slice with named techniques | `cases/<slice>.json`, Excel export |
| 5 | `/qa-run` | Execute ONE slice: model drives once, script replays after | RTM results, `evidence/`, `scripts/` |
| 6 | `/qa-gate` | Five checks per failure; only valid bugs reach the tester and ADO | `bugs/C-####.json`, ADO bugs |
| - | `/qa-explore` | Charter-based exploratory session, same gate | notes, candidates |
| - | `/qa-check <type>` | Non-functional and special checks (a11y, perf, security, RTL ...) | check report |
| - | `/qa-manual` | User manual from cards + real screens, EN/AR | `deliverables/User manual*.docx` |
| - | `/qa-report` | Test summary report; metrics computed by script | `deliverables/Test summary report.docx` |
| - | `/qa-delta` | New build or FSD version: re-run only what changed | stale list, re-runs |
| - | `/qa` | Where is this project, what is next | - |

Run `/qa` when unsure. Stages pass work through files, never through the chat.
From this plugin each command is typed as `/ai-native-qa:<name>` (for example
`/ai-native-qa:qa-init`); the files write `/qa-init` for short.

## The project folder (state lives in files)

```
.qa/config.json   client, language, data class, environment allowlist, ADO, severity matrix, templates
.qa/rtm.json      the RTM - written ONLY by qa-rtm.cjs (a hook blocks direct edits)
source/           documents received          fsd/<v>/     index.md + one file per section
cards/REQ-####.md requirement cards           questions/Q-####.md  questions for the BA
cases/<slice>.json test cases per slice       scripts/     Playwright replay specs
evidence/<TC>/... screenshots, logs, traces   bugs/C-####.json  bug candidates + checks
deliverables/     generated .docx/.xlsx       templates/   company or client templates
STATE.md          verified facts and the Last session block for this project
```

Scripts (Node built-ins only; run them with the Bash tool):

| Script | Commands |
|--------|----------|
| `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-project.cjs"` | `init <dir> ...`, `status` |
| `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-ingest.cjs"` | `ingest <file> --out fsd --version v1`, `diff <old> <new>` |
| `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-rtm.cjs"` | `sync`, `next-id`, `record`, `stale`, `summary`, `gaps`, `export`, `export-cases` |
| `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-bugs.cjs"` | `new`, `check`, `approve`, `render`, `filed`, `list` |
| `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-docx.cjs"` | `render <md> --template <t> --out <o>`, `inspect <t>`, `make-template` |

## Rules that make the output valid

1. **The quote is the oracle.** Every card holds a verbatim quote from the FSD section it cites.
   `qa-rtm.cjs sync` rejects a quote that is not in the section. A bug's expected result is that
   quote, or a named standard (WCAG 2.2 criterion, HTTP 5xx, crash, data loss, security rule).
   The model's own expectation is never an oracle.
2. **Unclear text is a question, not a bug.** Ambiguous, missing, conflicting or untestable
   requirements become `questions/Q-####.md` for the BA.
3. **No evidence, no result.** `qa-rtm.cjs record` refuses pass/fail without an evidence file.
4. **A failure is a bug only after five checks** (`qa-validity-gate` skill): oracle, two clean
   replays, cause is the product, not a duplicate, report complete. The verdict is computed by
   `qa-bugs.cjs`; the tester approves; the ADO hook files only approved candidates.
5. **Never hide a gap.** A step you could not run is BLOCKED or UNCLEAR with a note, not PASS.
6. **Scripts or nothing.** If the scripts cannot run (no Node.js, or claude.ai chat, which runs
   nothing on the tester's computer), stop and tell the tester. Never do a script's work by hand.

## Session and token rules

- **One feature slice per session.** After a slice, update STATE.md's Last session block and tell
  the user to `/clear` (or start a new session). The next session reads the files.
- **Read the index, not the document.** Read `fsd/<v>/index.md`, then one section file per
  extraction. Later stages read cards, never the FSD.
- **Text before pixels.** Read pages with an accessibility snapshot or page text. A screenshot is
  evidence or a layout check only: an image costs about width x height / 750 tokens and stays in
  the context for every later request of the session.
- **Scripts do everything that has one right answer**: converting, splitting, numbering IDs,
  counting, metrics, document layout.
- **Record once, replay many** (CLI): a case the model drove becomes a Playwright spec; re-runs cost
  no model tokens. The model reads only failures.
- **No subagents by default.** The one opt-in exception: `qa-reviewer` for Critical/High candidates
  or a deliverable the tester wants a second read on.
- Large outputs (search results, logs) go to a file; read the part you need.
- **Ask with options.** When the tester must choose (a setting, a gate, the next step), use the
  AskUserQuestion tool: 2 to 4 options, the recommended one first and marked "(Recommended)", at
  most 4 questions per call. Free text only for names, URLs, paths and answers to BA questions.
  On a surface without that tool, write the options as a numbered list.

## Data classes (`.qa/config.json` data_class)

| Class | Meaning | Extra rules |
|-------|---------|-------------|
| D0 | synthetic test data only | none |
| D1 | masked copy of production | PII hook active |
| D2 | real customer data in a test environment | PII hook active; mask before every screenshot |
| D3 | production system | PII hook; navigation needs `allow_production: true` set by a human; read-only steps only |

Details: the `qa-data-handling` skill.

## Surfaces (what the tester gets where)

| | CLI / VS Code / desktop Code tab (project `agent` setting) | Cowork desktop | Chrome side panel |
|-|-|-|-|
| Skills + commands | yes | yes | Cowork mode only |
| Hooks (URL, PII, file, ADO, approval) | yes (desktop: confirm the `[QA]` session line) | loads; test on your OS | not documented: treat as absent |
| Azure DevOps MCP (`.mcp.json`) | yes | when the session runs on your computer | no: paste the rendered bug |
| Replay scripts | yes | to test | no: the model drives every run |

Without hooks, the same rules still apply as instructions; say so in reports from those surfaces.

## Related skills

`qa-requirements` (cards, questions, FSD), `qa-test-design` (techniques, case format),
`qa-test-types` (catalog of test types, one reference each), `qa-execution` (browser, API,
manual runs, replay), `qa-validity-gate` (five checks, bug reports, ADO), `qa-documents`
(templates, Word/Excel, Arabic), `qa-data-handling` (data classes, masking).
