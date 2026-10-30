---
name: qa-test-design
description: How to design test cases from requirement cards - the named techniques (equivalence partitioning, boundary values, decision tables, state transitions, pairwise, use cases, error guessing, checklists) with when to use each and how many cases they give, the per-slice cases JSON format, priorities from risk, and test data rules. Use during /qa-cases, when reviewing test cases, or when the user asks how many cases a requirement needs.
---

# Test design

Design cases for ONE slice per session. Read only that slice's cards (`cards/` where
`slice:` matches). Each case names its technique, so coverage is a choice, not a guess.

## Techniques

| Technique | Use when the card has | Cases it gives |
|-----------|----------------------|----------------|
| `equivalence-partitioning` | input classes (valid / each invalid kind) | one per class |
| `boundary-value` | a numeric, length, date or count limit | min-1, min, max, max+1 (and min+1/max-1 for high risk) |
| `decision-table` | 2+ conditions that combine into outcomes | one per rule column; merge rules with the same outcome |
| `state-transition` | statuses (draft/submitted/approved, locked/unlocked) | every valid transition + the key invalid ones |
| `pairwise` | 3+ independent parameters (browser x role x language) | all pairs, not all combinations |
| `use-case` | an end-to-end flow with main and alternate paths | main path + each alternate/exception path |
| `error-guessing` | known weak spots: empty, spaces, unicode/Arabic, paste, double submit, back button, session timeout, concurrent edit | one per credible guess, high-risk cards only |
| `checklist` | a standard (WCAG, OWASP item, style guide) | one per checklist item that applies |
| `exploratory` | a charter result promoted to a scripted case | one |
| `standard` | a case derived from a named standard, not a card rule | one |

Depth by risk: high = all applicable techniques; medium = partitions + boundaries + main paths;
low = one positive case, plus a negative case where input exists.

## Case format (`cases/<slice>.json`, a JSON array)

```json
[
  {
    "id": "TC-0142-03",
    "req": ["REQ-0142"],
    "title": "Tier 1 transfer of limit+1 (5,001) is rejected with E-104",
    "technique": "boundary-value",
    "priority": "P1",
    "execution": "web",
    "preconditions": "Tier 1 test user with 0 transferred today; saved beneficiary",
    "data": "user qa-t1-004; amount 5,001",
    "steps": [
      { "action": "Log in as qa-t1-004" },
      { "action": "Open Transfers and choose the saved beneficiary" },
      { "action": "Enter 5,001 and select Confirm", "expected": "Message E-104 is shown" }
    ],
    "expected": "Transfer blocked; E-104 shown; balance unchanged"
  }
]
```

- `id`: `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-rtm.cjs" next-id tc REQ-0142`. The four digits match the first REQ.
- `priority`: P1 = high-risk card or main flow; P2 = medium; P3 = low.
- `execution`: web | api | manual | desktop | mobile (decides who drives it in `/qa-run`).
- One expected result per step that checks something; the case `expected` is the end state.
- Steps use the screen, field and button names from the cards.
- Run `qa-rtm.cjs sync` after writing; fix every reported problem.

## Test data rules

- Name the data in the case (`data`), never "any user". Data that a case changes (balances,
  counters) needs a precondition that sets it.
- D0 projects: invent clearly synthetic values (qa-…@example.com, 4111 1111 1111 1111).
- D1-D3 projects: never copy real customer values into cases; refer to them by test-account id.

## Before you finish a slice

- Every active card of the slice has at least one case (`qa-rtm.cjs gaps`).
- High-risk cards have a negative case and boundary cases where a limit exists.
- Export for the tester: `qa-rtm.cjs export-cases --slice <slice> --out "deliverables/Test cases - <slice>.xlsx"`
  (with `--template` when the company has a test-case workbook; see `qa-documents`).
