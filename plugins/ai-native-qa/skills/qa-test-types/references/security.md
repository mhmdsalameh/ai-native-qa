# Security (basic, black-box)

**Goal:** catch the access and data-exposure defects a tester can see without attack tooling.
**Oracle:** access rules in cards; named items from the OWASP Top 10 and ASVS level 1. Cite the
item in the bug: `security: OWASP A01 Broken Access Control`.

## Checklist (no attacks, only the tester's own test accounts)
- Access control: open another user's record by changing an id in the URL or request (A01).
- Role checks: a lower role cannot reach admin pages or actions by URL.
- Session: logout ends the session; back button after logout shows no data; timeout as specified.
- Authentication: lockout after the specified attempts; error messages do not reveal which part was wrong.
- Input: special characters (`'"<>&;`) are shown as text, not executed; no stack traces in errors (A05).
- Data exposure: no personal or secret data in URLs, page source, console logs or local storage.
- Transport: HTTPS everywhere; no mixed content.

## Not allowed
Scanners, fuzzers, brute force, denial-of-service, other people's accounts, or anything outside
the allowlisted test hosts. Penetration testing needs a separate, written authorization.

## Evidence
Request/response pair (masked), screenshot, and the two accounts used.

## Not a bug
Missing hardening headers alone (recommendation), unless a card or the client's standard requires them.
