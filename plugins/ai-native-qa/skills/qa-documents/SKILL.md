---
name: qa-documents
description: How QA deliverables (FSD, test plan, test cases workbook, RTM, user manual, test summary report, exploratory and check reports) are written and produced - Markdown with front matter rendered by script into the company or client Word/Excel template, the template contract ({{BODY}} and placeholders), mapping company templates, English/Arabic/bilingual output with a glossary, and the outlines for each deliverable. Use whenever a deliverable is written, a template is added or checked, or the user asks for a Word or Excel file.
---

# Deliverables

The model writes Markdown; a script does the layout. Layout never costs model tokens, and the
company template decides fonts, colours, headers and footers.

## Flow

1. Copy the outline from `templates/<deliverable>.md` (this skill) to `deliverables/<name>.md`.
2. Fill it from the files (cards, cases, RTM summary, bugs) - not from memory.
3. Render: `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-docx.cjs" render "deliverables/Test plan.md" --template templates/test-plan.docx --out "deliverables/Test plan.docx"`
4. The tester reviews the .docx; you edit the .md and render again.

Excel: `qa-rtm.cjs export` (full RTM workbook) and `qa-rtm.cjs export-cases` (test cases).

## Markdown you can use

`#`-`######` headings, paragraphs, `- ` and `1. ` lists, `| tables |` (first row = header),
`![caption](relative/path.png)` (PNG or JPEG; the caption is written under it), `**bold**`,
and a line `<!-- pagebreak -->`. Nothing else is rendered (no links, italics or HTML).
Front matter keys fill `{{key}}` placeholders: title, subtitle, client, project, version, date
(defaults to today), plus any key the template uses. `language: "ar"` writes right-to-left.

## Templates

- `templates/<key>.docx` per deliverable, listed in `.qa/config.json` templates. `/qa-init`
  copies company templates and creates the neutral default for anything missing.
- Contract: one paragraph containing only `{{BODY}}` where the body goes; `{{key}}` anywhere
  else (also headers and footers). Without `{{BODY}}` the body is appended at the end.
- Check a template before first use: `qa-docx.cjs inspect templates/fsd.docx` - it lists the
  placeholders, whether `{{BODY}}` exists, and which styles (heading 1-3, list bullet, table grid,
  caption) the template has. Missing styles fall back to direct formatting; tell the tester.
- Company test-case workbook: `qa-rtm.cjs export-cases --template templates/<file>.xlsx --sheet <name> --header-row <n> --columns 0,2,8,9`
  (column indexes of: 0 id, 1 requirements, 2 title, 3 technique, 4 priority, 5 execution,
  6 preconditions, 7 data, 8 steps, 9 expected, 10 latest result, 11 bugs, 12 status). Rows below
  the header are replaced; each column keeps the first data row's style.
- Different clients: put each client's templates in its project's `templates/`. An Arabic edition
  uses `templates/<key>.ar.docx` when it exists.

## Languages

- `language: en | ar | en+ar` in `.qa/config.json`. For `en+ar`, write the English edition first,
  then the Arabic edition from it, as two files.
- Keep `notes/glossary.md`: one line per term, `English | العربية | note`. Use the screen's own
  Arabic labels when the app has them; a term is translated once and reused everywhere.
- Arabic text: Modern Standard Arabic, short sentences, the same terms as the screens.

## Writing style for manuals and reports

Simplified Technical English (ASD-STE100) at about 80%: short sentences (instructions max 20
words), one instruction per sentence, active voice, imperative for steps ("Select Confirm."),
one word for one meaning, warnings before the step they apply to.

## Outlines

| Deliverable | Outline | Built from |
|-------------|---------|-----------|
| FSD (when only a BRD or the app exists) | `templates/fsd.md` | cards, questions |
| Test plan | `templates/test-plan.md` | cards (risk), slices, environments, `qa-test-types` |
| User manual | `templates/user-manual.md` | cards, real screens |
| Test summary report | `templates/summary-report.md` | `qa-rtm.cjs summary --json`, bugs |
| Exploratory session report | `templates/exploratory-report.md` | session notes |
| Check report (a11y, performance, ...) | `templates/check-report.md` | check results |
