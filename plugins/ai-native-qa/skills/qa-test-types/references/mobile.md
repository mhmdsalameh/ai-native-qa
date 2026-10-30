# Mobile apps and mobile web

**Goal:** the app works on the supported devices and OS versions.
**Oracle:** cards plus platform behaviour the cards rely on (permissions, back button, notifications).

## Checklist
- Install/update from the test channel; first launch; permission prompts and denial paths.
- Rotation, background/foreground, interrupted network, low battery mode where relevant.
- Android back button and iOS swipe-back on each screen of a flow.
- Push notifications: received, tapped, opens the right screen.
- Keyboard types for fields (numeric for amounts), autofill, copy/paste.
- Mobile web: responsive checks from `compatibility.md` at 360x800 and 390x844.

## Tools
Native apps: the tester runs the steps on devices or emulators (human-run protocol in
`qa-execution`). Mobile web: Playwright device emulation (CLI) for layout only; real devices
for touch and keyboard behaviour.

## Evidence
Device screenshots or screen recordings the tester pastes; device model, OS version and app build in every result.

## Not a bug
Behaviour of an unsupported OS version (note it).
