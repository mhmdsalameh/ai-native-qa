# Integration and end-to-end

**Goal:** flows that cross systems work end to end (SSO, payment gateway, core system, email/SMS).
**Oracle:** the cards plus the interface spec; for each hop, what goes in and what must come out.

## Checklist
- Happy path through every system in the flow; confirm the effect in the downstream system or its UI.
- Each external failure the spec names: timeout, rejection, duplicate callback, partial success.
- Idempotency: double submit, browser back after submit, retry after a timeout.
- Data consistency: amounts, references and statuses match on both sides.

## Tools
Browser for the UI hops; the API reference for direct calls; a mailbox or SMS stub the
environment provides (ask; do not use real inboxes).

## Evidence
Screenshots of both ends plus the reference id that links them; network log (HAR) for failures.

## Not a bug
An external sandbox that is down (environment issue, G3), unless the app handles it worse than the card says.
