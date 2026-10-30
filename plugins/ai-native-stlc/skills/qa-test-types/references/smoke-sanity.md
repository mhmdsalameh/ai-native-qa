# Smoke and sanity

**Goal:** decide in minutes whether a build is worth testing.
**Oracle:** the main flows load and complete; no crash, no HTTP 5xx.

## Checklist
- Smoke (new build): log in, open each main menu area, complete the top 3-5 P1 flows once.
- Sanity (after a fix): the fixed flow, plus the screens next to it.
- Stop and report when a smoke step fails: the build is BLOCKED for deeper testing.

## Tools
Replay the P1 specs (CLI) - this costs no model tokens. Elsewhere: the model drives the P1 cases.

## Evidence
One screenshot per flow end state; the failing step for a fail.

## Not a bug
Slow but working pages (note them for performance), cosmetic issues (normal cases cover them).
