---
name: qa-execution
description: How to execute test cases cheaply and with evidence - web cases driven once by the model through a text snapshot and then saved as Playwright replay specs, API cases with curl, desktop/mobile cases run by the tester with Claude recording, evidence naming, recording results in the RTM, and replay imports. Use during /qa-run, /qa-explore and /qa-check, and whenever a test is executed or a result is recorded.
---

# Execution

Run ONE slice per session. Order: smoke (P1 flows), then P1, P2, P3. Every result goes into the
RTM through `qa-rtm.cjs record`, which refuses a pass or fail without an evidence file.

## Who drives each case (`execution` field)

| execution | CLI / VS Code | Chrome side panel | Evidence |
|-----------|---------------|-------------------|----------|
| web | model drives once (Playwright MCP), then a replay spec | model drives every run | screenshot of the checked state |
| api | `curl` via Bash (`qa-test-types/references/api.md`) | BLOCKED: not supported | saved headers + body |
| manual / desktop / mobile | tester runs; Claude records | same | screenshot the tester saves into `evidence/` |

## Web: first run (model drives)

1. Open the environment's base URL from `.qa/config.json` (the URL hook blocks other hosts).
2. For each step: read the page with an accessibility **snapshot** (text), act, read again.
   Do not take a screenshot to "look" - the snapshot has the roles, names and text you need.
3. At each step that has an `expected`, check it against the snapshot text. Then take ONE
   screenshot as evidence and save it as `evidence/<TC>/<run>/<step>-<word>.png`. If the tool
   saves elsewhere, copy the file into `evidence/` and confirm it with `ls`.
4. On a mismatch: take the failing screenshot, read the console errors (and the network request
   if relevant), save them as files, stop the case.
5. Record: `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-rtm.cjs" record --tc TC-0142-03 --result fail --evidence evidence/TC-0142-03/r1/3-confirm.png,evidence/TC-0142-03/r1/console.txt --build 2.4.1 --env UAT`
6. Write the replay spec `scripts/TC-0142-03.spec.js` (below) from the steps that worked.

## Web: replay specs (CLI, no model tokens)

Set up once per project: `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-project.cjs" setup-replay --env UAT`, then
`npm install` in the project (asks the user: it downloads @playwright/test).

```js
// TC-0142-03 | REQ-0142 | recorded 2026-10-29 from the first run
const { test, expect } = require('@playwright/test');
test('TC-0142-03 Tier 1 transfer of 5,001 is rejected with E-104', async ({ page }) => {
  await page.goto('/transfers');
  await page.getByLabel('Amount').fill('5001');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('E-104')).toBeVisible();
});
```

- Test title starts with the TC id. Use role, label and text locators from the snapshot; no CSS
  paths or XPath. No fixed waits (`waitForTimeout`); assert on visible state.
- Secrets come from environment variables (`process.env.QA_PASSWORD`), never from the spec.
- Run all: `npx playwright test` (in the project folder). Import the results:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-rtm.cjs" import-replay evidence/replay/results.json --build 2.4.2 --env UAT`
  The config saves a screenshot for every test, so passes also have evidence.
- Read only the failures (`qa-rtm.cjs gaps`, then the failing test's error and screenshot).
  A failure caused by an intended UI change: update the spec and say so; never weaken an assertion
  to make it pass.

## Manual, desktop and mobile (human-run protocol)

1. Give the tester the case steps, one at a time or as a short numbered list.
2. The tester performs them and saves a screenshot per checked step into `evidence/<TC>/<run>/`
   (Claude cannot save an image pasted into the chat).
3. Read the saved image, compare with the expected result, and record with that file as evidence.
4. If the tester's description and the screenshot disagree, the screenshot wins; ask.

## Results

| Result | Use when | Needs |
|--------|----------|-------|
| pass | every checked step matched | evidence |
| fail | a checked step did not match the expected result | evidence of the failing step |
| blocked | you could not run it: environment down, no data, no access, unsupported surface | `--note` |
| unclear | you ran it but the expected result is ambiguous | `--note` and a question in `questions/` |

A fail is not a bug yet: next is `/qa-gate`. A flaky step (passes on retry) is recorded as it
happened, and the gate's replay check decides.

## Token rules during execution

- One slice per session; close the browser tab when the slice is done.
- Snapshots over screenshots; one evidence screenshot per checked step, not per action.
- Save console and network output to files; read only the lines you need.
- Never paste a whole snapshot or log into a report; cite the evidence file.
