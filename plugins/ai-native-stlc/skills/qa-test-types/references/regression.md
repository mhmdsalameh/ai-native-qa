# Regression

**Goal:** what passed before still passes on the new build.
**Oracle:** the earlier PASS result and its card.

## Checklist
- Replay every saved spec (CLI: `npx playwright test` in the project) - no model tokens.
- Re-run manual cases by risk: all P1, P2 in areas the release notes touch, P3 by sampling.
- Cases whose cards went stale in an FSD delta are not regression: redesign them first (`/qa-delta`).

## Evidence
The runner's report and trace for failures; the RTM run entries.

## Not a bug
A changed behaviour that a new FSD version or release note describes: update the card and case.
