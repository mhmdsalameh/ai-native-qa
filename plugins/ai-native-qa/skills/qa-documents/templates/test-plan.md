---
title: "Test Plan"
subtitle: "<system name> <release>"
client: "<client>"
project: "<project>"
version: "1.0"
---
# Scope

## In scope

<Feature slices and the requirement count of each, from the cards.>

| Slice | Requirements | High risk | Test types |
| --- | --- | --- | --- |
| <slice> | <n> | <n> | <functional, accessibility, ...> |

## Out of scope

<What will not be tested and why: load/stress, penetration, unsupported browsers, third-party systems.>

# Approach

## Risk

<How risk was set (money, personal data, security, main flows) and how it changes depth: high = all techniques; medium = partitions, boundaries, main paths; low = positive and one negative.>

## Test types

<For each type chosen, one line: why, which slices, oracle. Reference: qa-test-types.>

## Execution

<Web: model-driven first run, then replay specs. API: scripted requests. Desktop/mobile: tester-run with Claude recording. Surface used and what it cannot do.>

# Environments and data

| Environment | URL | Use | Data class |
| --- | --- | --- | --- |
| <UAT> | <https://...> | <functional, regression> | <D0> |

<Test accounts per role (ids only), data preparation, masking rules for the data class.>

# Entry and exit criteria

## Entry

- The build passes the smoke test.
- Test environment and accounts are available.
- Open questions that block a slice are answered.

## Exit

- Every active requirement has at least one executed case.
- No open Critical bugs; open High bugs accepted in writing by <role>.
- Every failed case has a candidate that went through the validity gate.

# Deliverables and schedule

| Deliverable | Owner | Date |
| --- | --- | --- |
| Test cases (Excel) | <tester> | <date> |
| Test summary report | <tester> | <date> |

# Risks and assumptions

| Risk or assumption | Impact | Mitigation |
| --- | --- | --- |
| <risk> | <impact> | <action> |
