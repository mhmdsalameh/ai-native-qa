---
description: Handle change - a new FSD version (diff sections by hash, re-extract only changed and added sections, mark affected cards and cases stale) or a new build (replay all specs, re-run cases in areas the release notes touch).
argument-hint: "fsd <new file> | build <build id>"
---

# /qa-delta — re-run only what changed

**Preflight:** these steps run Node scripts on the tester's computer. If `node --version` fails, or you cannot run shell commands here (claude.ai chat), stop and tell the tester this command needs Node.js and Cowork or Claude Code. Never do a script's work by hand.

## New FSD version

1. `qa-ingest.cjs ingest "source/<new file>" --out fsd --version <vN>`
2. `qa-ingest.cjs diff fsd/<vN-1> fsd/<vN>` → `fsd/<vN>/delta-from-<vN-1>.json`
3. `qa-rtm.cjs stale --delta fsd/<vN>/delta-from-<vN-1>.json` (marks cards and cases from changed
   or removed sections; uses the cards' section keys).
4. Set `fsd.current` to `<vN>`. For each changed or added section only: read it, update its cards
   (`section:` and `quote:` to the new text) or write new ones; questions as usual. Cards from
   removed sections: delete the card file. Run `sync`.
5. For the stale cases: update them, `sync`, and run them again (`/qa-run`).

## New build

1. Smoke: replay the P1 specs (or drive the P1 cases).
2. Replay all specs; import the results. Read only failures.
3. Re-run manual cases in the areas the release notes name, plus P1 everywhere.
4. Verify fixed bugs: replay the bug's steps; record the result on its case.

**Gate:** report what changed, what was re-run, and what was not; the tester confirms the scope.
