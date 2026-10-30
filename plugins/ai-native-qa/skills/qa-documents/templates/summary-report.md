---
title: "Test Summary Report"
subtitle: "<system name> <release>, build <build>"
client: "<client>"
project: "<project>"
version: "1.0"
---
# Summary

<Three to five sentences: what was tested, on which build and environment, the result against the exit criteria, and the open risks. The release decision belongs to <role>; this report gives the facts.>

# Results

<Every number below is copied from `qa-rtm.cjs summary --json`. Do not compute or round by hand.>

| Measure | Value |
| --- | --- |
| Active requirements | <n> |
| Requirements covered by at least one case | <n> (<pct>%) |
| Test cases | <n> |
| Executed | <n> (<pct>%) |
| Passed / failed / blocked / unclear | <n> / <n> / <n> / <n> |
| Not run | <n> |

## By feature slice

| Slice | Cases | Passed | Failed | Blocked | Not run |
| --- | --- | --- | --- | --- | --- |
| <slice> | <n> | <n> | <n> | <n> | <n> |

# Defects

| Verdict after the validity gate | Count |
| --- | --- |
| Valid (filed) | <n> |
| Questions for the BA | <n> |
| Environment issues | <n> |
| Not reproducible | <n> |
| Duplicates | <n> |

## Open valid bugs

| Bug | Title | Severity | Requirement |
| --- | --- | --- | --- |
| <ADO id> | <title> | <severity> | <REQ> |

# Exit criteria

| Criterion | Met? | Evidence |
| --- | --- | --- |
| <criterion from the test plan> | <Yes / No> | <RTM figure or bug list> |

# Not tested and limits

<What was not tested, on which surface, and why. Blocked cases and their reasons. A gap that is not listed here reads as a pass.>

# Open questions

| Question | Status | Effect if unanswered |
| --- | --- | --- |
| <Q-0001> | open | <effect> |
