# Accessibility (WCAG 2.2 AA)

**Goal:** people using keyboards, screen readers, zoom or high contrast can complete the flows.
**Oracle:** WCAG 2.2 success criteria. Cite the criterion in the bug: `WCAG 2.2 SC 1.4.3`.

## Checklist (most-failed criteria first)
- 1.1.1 Images and icon buttons have text alternatives.
- 1.3.1 Headings, lists, tables and form labels are real structure, not styling.
- 1.4.3 Text contrast at least 4.5:1 (3:1 for large text); 1.4.11 controls and focus 3:1.
- 1.4.10 Reflow at 320 CSS px width without horizontal scrolling; 1.4.4 text resized to 200%.
- 2.1.1 Every function works with the keyboard; 2.1.2 no keyboard trap.
- 2.4.3 Focus order is logical; 2.4.7 focus is visible; 2.4.11 focus not hidden by sticky bars.
- 2.5.8 Targets at least 24x24 CSS px.
- 3.3.1 / 3.3.2 Errors are identified in text and inputs have labels or instructions.
- 4.1.2 Controls expose name, role and state (check the accessibility snapshot).

## Tools
CLI: Lighthouse accessibility audit (chrome-devtools MCP `lighthouse_audit`), the accessibility
snapshot, and one keyboard-only pass with the browser tools. The `a11y-debugging` skill helps.
Automated audits find only part of the issues; the keyboard pass is required.

## Evidence
The audit report file; screenshot with the focus position; the snapshot extract for name/role issues.

## Not a bug
A best-practice warning that maps to no success criterion (note it as a recommendation).
