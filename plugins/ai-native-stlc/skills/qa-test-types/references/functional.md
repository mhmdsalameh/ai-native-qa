# Functional testing

**Goal:** each requirement card behaves as its quote says.
**Oracle:** the card quote (and values in the card body).

## Checklist
- Positive path for every card; negative and boundary cases for medium/high risk (`qa-test-design`).
- Field rules: required, length, format, allowed characters (Arabic, spaces, emoji, paste).
- Messages: exact code/text the card names; shown at the right moment; cleared after a fix.
- Business results: totals, balances, statuses, emails or notifications the card promises.
- Persistence: reload the page or log in again; the result is still there.
- Roles: the action works for the roles in the card and is refused for others.

## Tools by surface
CLI: Playwright MCP first run, then a replay spec. Chrome: the side panel drives the page.
Desktop/mobile: tester runs the steps; Claude records.

## Evidence
Screenshot of the result state; for fails, the failing step's screenshot plus console errors.

## Not a bug
Behaviour the card does not cover (question); wording you would prefer (question to BA).
