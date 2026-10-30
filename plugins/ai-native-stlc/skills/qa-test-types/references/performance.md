# Performance (single user)

**Goal:** pages and actions meet the numbers the NFRs give.
**Oracle:** the NFR numbers in cards. Without numbers, use Core Web Vitals "good" thresholds as
recommendations: LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1. A threshold miss is a bug only when a card sets the number.

## Checklist
- Main pages: LCP, CLS, total transfer size, slowest requests.
- Main actions: time from click to result (search, submit, report generation).
- Repeat 3 times; report the median, not the best run.

## Tools (CLI)
chrome-devtools MCP `performance_start_trace` / `performance_stop_trace` and `lighthouse_audit`;
the `debug-optimize-lcp` skill for LCP. Load, stress and soak tests need JMeter/k6 and written
approval: out of scope for the harness; list them in the plan if the NFRs need them.

## Evidence
The trace or report file; the median table in the check report.

## Not a bug
One slow run; a slow shared test environment (record it as an environment note).
