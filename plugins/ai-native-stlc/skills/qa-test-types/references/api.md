# API testing

**Goal:** endpoints meet the documented contract.
**Oracle:** the API spec (OpenAPI/Swagger or the FSD's interface section) as cards.

## Checklist
- Status codes, response schema, required fields, types, enums, error body format.
- Validation: missing field, wrong type, too long, boundary values, unknown fields.
- Auth: no token, expired token, another user's resource (expect 401/403, never data).
- Idempotency and concurrency where the spec promises it.
- Never 5xx for invalid input (an HTTP 5xx is a named-standard oracle).

## Tools (CLI only)
`curl` through the Bash tool, one request per step, saving the exchange:
`curl -sS -D evidence/TC-0301-01/run1.headers -o evidence/TC-0301-01/run1.json -w "%{http_code}" -H "Authorization: Bearer $QA_TOKEN" https://api.uat.bank.test/v1/transfers`
Read tokens from environment variables; never write a token into a file or a report.
Hosts must be on the project allowlist. Chrome side panel: not supported; mark API cases BLOCKED there.

## Evidence
The saved headers and body files; mask personal data before saving in D1-D3 projects.

## Not a bug
Undocumented fields in a response (question), unless they expose personal or secret data (security).
