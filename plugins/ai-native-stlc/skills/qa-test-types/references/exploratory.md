# Exploratory testing (session-based)

**Goal:** find what scripted cases miss, in a fixed time, with a written trail.
**Oracle:** named standards (crash, HTTP 5xx, data loss, WCAG, security) and consistency between
screens of the same app. A surprise without an oracle is a question.

## Charter (write it before you start, in `notes/explore-<date>-<area>.md`)
`Explore <area> with <resources/data> to discover <kind of risk>.` Timebox: 30-60 minutes of
tool calls. Stop at the timebox even when the area is interesting; write a new charter instead.

## Tours that find bugs
- Money/data tour: create, edit, cancel, repeat; check totals and history.
- Interruption tour: back, refresh, second tab, session timeout, double submit.
- Boundary tour: empty, max length, Arabic text, paste, very large numbers.
- Role tour: the same screens as each role.
- Error tour: trigger every error message you can find; read each one.

## Notes format
Time-ordered lines: what you did, what you saw, `IDEA:` for a new case, `Q:` for a question,
`FAIL:` for a candidate (with an evidence file). Text snapshots, not screenshots, while exploring.

## After the session
Candidates go through `/qa-gate`; ideas become cases with `technique: exploratory`; questions go
to `questions/`. The session report (outline in `qa-documents/templates/exploratory-report.md`)
says what was covered and what was not.
