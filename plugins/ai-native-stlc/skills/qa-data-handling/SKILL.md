---
name: qa-data-handling
description: Rules for test data and personal data in QA work - the four data classes (D0 synthetic, D1 masked, D2 real customer data in test, D3 production), masking before screenshots, what may appear in cards, cases, bug reports and evidence, production read-only rules, and how the PII and URL hooks behave. Use at /qa-init when choosing the data class, before any execution in D1-D3 projects, and whenever personal data, production, or customer records come up.
---

# Data handling

The data class in `.qa/config.json` is set by a human at `/qa-init`. Ask; never assume D0.

| Class | Meaning | Screens may show | Evidence and reports |
|-------|---------|------------------|---------------------|
| D0 | synthetic data only | synthetic data | as captured |
| D1 | masked copy of production | masked data; some may slip through | mask anything that looks real |
| D2 | real customer data in a test environment | real people's data | mask before every screenshot; never copy values into text |
| D3 | production | real data, real money | read-only steps only; navigation needs `allow_production: true` set by a human; mask everything |

## Rules for D1-D3

- **Refer, do not copy.** Cases and bugs name a test account id or a record reference, never a
  customer's name, phone, email, national id, card number or IBAN.
- **Mask before the screenshot.** Before an evidence screenshot, replace personal values on the
  page with `***` through the browser's evaluate/script tool (page only, nothing is saved to the
  server), or crop to the checked element. Screenshots are images: the PII hook cannot read them.
- **Mask in logs.** Network and console files: remove tokens, cookies and personal fields before
  saving them into `evidence/`.
- **No exports of customer data** into the project folder, except an extract the client provides
  already masked.
- The PII hook blocks writing emails, phone numbers, card numbers (Luhn-valid) and IBANs into the
  project's text files. Known test cards (4111 1111 1111 1111 ...) and allow-listed domains
  (example.com, .test ...) pass. Client-specific ids (for example a national id format) are
  added by a human to `pii.extra_patterns`; synthetic values the hook flags get a marker in
  `pii.synthetic_markers`.

## Production (D3)

- Only the checks named in the plan, as the named user, at the agreed time.
- Read-only: open, search, view, download a report. No create, edit, delete, submit, payment or
  message that reaches a real person.
- Stop and ask before any step whose effect you are not sure is read-only.

## Secrets

Passwords and tokens come from environment variables the tester sets (`QA_PASSWORD`,
`QA_TOKEN`). Never write them into cases, specs, notes, evidence or reports.
