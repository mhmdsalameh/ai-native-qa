---
description: Stage 1 - split the received FSD/BRD/SRS by script into hashed sections, then extract requirement cards and BA questions one section at a time. The model never reads the whole document.
argument-hint: "[source file] [--version v1]"
---

# /qa-ingest — split, then extract cards

**Preflight:** these steps run Node scripts on the tester's computer. If `node --version` fails, or you cannot run shell commands here (claude.ai chat), stop and tell the tester this command needs Node.js and Cowork or Claude Code. Never do a script's work by hand.

Load the `qa-requirements` skill.

1. Pick the source file in `source/` (or `$ARGUMENTS`). Version: `v1` for the first, then `v2`...
   PDF needs `pdftotext` on PATH; otherwise ask for the .docx.
2. Split (script, no model tokens):
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-ingest.cjs" ingest "source/<file>" --out fsd --version <v>`
   Then set `"fsd": { "current": "<v>" }` in `.qa/config.json`.
   If it is not the first version, stop here and run `/qa-delta` instead of extracting everything.
3. Read `fsd/<v>/index.md` (only this file). Report: sections, estimated tokens, page source.
   Plan the extraction order by feature; skip front matter and revision tables.
4. For each section, one at a time:
   - Read only that section file.
   - Write its cards (`cards/REQ-####.md`) and questions (`questions/Q-####.md`); ids from
     `qa-rtm.cjs next-id req` / `next-id q`.
   - A section with no testable rule gets no card; note it in the progress line.
5. Every 5-10 sections and at the end: `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-rtm.cjs" sync`. Fix every
   reported problem (a "quote not found" means a paraphrase: copy the exact sentence).
6. Long documents: stop at a clean point (after a sync), update STATE.md Last session with the
   next section id, and tell the user to `/clear` and run `/qa-ingest` again to continue.

**Gate:** the tester reviews the question list and the slice names. Report: cards per slice,
questions by kind, sections without testable rules.
