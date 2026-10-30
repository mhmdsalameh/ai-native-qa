# Compatibility and responsive

**Goal:** the app works on the browsers and screen sizes the client supports.
**Oracle:** the support matrix in the plan or contract. Without one, ask - do not invent it.

## Checklist
- Pairwise over browser x viewport x language (`qa-test-design`), not every combination.
- Viewports: the client's list, or 360x800, 768x1024, 1366x768, 1920x1080.
- Layout breaks, hidden controls, horizontal scrolling, date and number pickers, file upload.

## Tools
CLI: replay specs with Playwright projects for chromium, firefox and webkit, and `browser_resize`
for viewports. Chrome side panel: Chrome only - list the other browsers as not covered.

## Evidence
Screenshot per combination that fails, named `<browser>-<width>x<height>.png`.

## Not a bug
A browser outside the matrix (note it); a pixel-level difference that does not hide content or controls.
