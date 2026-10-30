# Recovery and resilience (functional level)

**Goal:** users do not lose work or money when something goes wrong.
**Oracle:** cards for timeouts and errors; named standard "data loss".

## Checklist
- Session timeout during a form: what is kept, what message appears, no silent loss.
- Network drop during submit (browser offline mode): no double transaction after reconnect.
- Server error during a multi-step flow: the user can resume or gets a clear state.
- Concurrent edit of the same record in two tabs or by two users.
- Long-running jobs (reports, imports): progress, cancel, and result after a page reload.

## Tools
Browser offline emulation and a second tab (CLI); the environment team for service restarts
(never stop shared services yourself).

## Evidence
Screenshots before and after, and the record state that proves loss or no loss.

## Not a bug
An environment outage that the app handles as the card says (environment note).
