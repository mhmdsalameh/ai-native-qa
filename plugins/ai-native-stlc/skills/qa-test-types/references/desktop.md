# Desktop applications

**Goal:** the Windows or macOS application does what the cards say.
**Oracle:** the cards.

## Checklist
- Functional cases as for web, plus: window resize and multi-monitor, keyboard shortcuts,
  file dialogs (paths with spaces and Arabic characters), printing and export files.
- Offline and reconnect behaviour where the app talks to a server.
- Regional settings: Arabic locale, date and number formats, right-to-left UI.

## Tools
The tester runs the steps (human-run protocol in `qa-execution`). Claude writes the steps,
reads the screenshots and logs the tester pastes, and records the result with evidence.

## Evidence
Screenshots saved into `evidence/<TC>/`, the app version, OS version.

## Not a bug
Behaviour caused by the test machine's own setup (G3 environment).
