# AI-Native QA

Claude does a QA team's work; the tester owns every judgment. Requirement cards with verbatim
quotes, FSD, test plan, test cases, web/API/manual execution with evidence, a five-check bug
validity gate, Azure DevOps filing, user manuals and summary reports. Start with `/ai-native-qa:qa`.

## Requirements

- **Node.js on PATH** (tested with v22.14.0). The scripts and the hooks use Node built-ins only.
  Without Node the plugin stays silent: the hooks exit cleanly, and every `/qa-*` command stops at
  its preflight and says that Node is missing.
- **Cowork or Claude Code** (CLI, IDE, desktop Code tab). Chat loads the skills and commands as
  text but runs nothing on the tester's computer, so the commands stop there too.
- **Azure DevOps filing (optional):** `npx` and access to the npm registry, plus a Microsoft
  sign-in. Without them the tester pastes the rendered bug.
- **Replay (optional):** `npm install` in the project folder (downloads @playwright/test).

## Install

| Where | How |
|---|---|
| Organization (Owner) | **Organization settings > Plugins & skills > Add > Sync from GitHub** with `mhmdsalameh/ai-native-qa`, then set **Default access** |
| One account | **Customize > Plugins > Add > Upload plugin** with the zip, or **Add > Add marketplace** with `mhmdsalameh/ai-native-qa` |
| Claude Code CLI only | `claude plugin marketplace add mhmdsalameh/ai-native-qa`, then `claude plugin install ai-native-qa@ai-native-qa` |

A plugin on a claude.ai account also syncs to that person's Claude Code.

Commands are namespaced: `/ai-native-qa:qa-init`. A bare `/qa-init` in the files means that.

## Rollout to an organization

1. Pilot: upload to your own account and share it with two or three testers (Team plans), or give
   one group access (Enterprise). Run one real slice in Cowork and in the Code tab.
2. Publish with **Default access: Available to install**. Do not use **Installed by default** or
   **Required**: the hooks start a short Node process on every file write and shell command in
   every session of every member who has the plugin, QA work or not (about the cost of starting
   Node; they do nothing outside QA work).
3. Check the security scan result in the Inventory tab. The plugin runs hooks on members'
   computers, so members see the "agents and hooks run commands" notice when they add it.
4. Each release: raise `version` in `.claude-plugin/plugin.json` and in the root
   `.claude-plugin/marketplace.json`, run the tests, push to `main`. With **Sync automatically** on,
   the organization gets the new version. A synced plugin has no revert: push a fix, or set it to
   **Not available** meanwhile.

## Start a QA session

`/ai-native-qa:qa-init` creates the project folder and its `.claude/settings.json` with
`"agent": "qa-orchestrator"`, so every session opened in that folder (CLI, IDE, desktop Code tab)
starts as the orchestrator. The CLI also takes `claude --agent qa-orchestrator`.

Check it once per surface: the first context line of a session in a project folder starts with
`[QA] Project:`. Ask Claude to quote it. No line means the hooks are not running there.

## Hooks

Plugin agents cannot declare hooks, so the plugin wires two hooks for every session:

- **SessionStart** prints the project state and the Last session block.
- **PreToolUse** enforces the URL allowlist, the PII guard, script-only RTM and bug verdicts,
  tester approval, and the ADO filing guard.

Both act only in a QA session: the session runs as `qa-orchestrator`, or the folder or the target
file is inside a QA project (it has `.qa/config.json`). Everywhere else they exit at once and
print nothing. Inside a QA session an internal error blocks the tool call; outside one, nothing
the plugin does can block.

| Surface | Skills + commands | Hooks | ADO MCP | Replay scripts |
|---|---|---|---|---|
| CLI / IDE / desktop Code tab | yes | yes | yes | yes |
| Cowork on your computer | yes | yes (Node needed); not yet tested | not verified: Cowork may not read the project `.mcp.json` | to test |
| Chat | as text only; commands stop at preflight | no | no | no |

## Machines that also have the standalone harness in `~/.claude`

Nothing breaks. When the session runs as the standalone `qa-orchestrator` (whose frontmatter
already runs these hooks), the plugin's hooks stay out, so nothing runs twice. The skills and
commands appear twice (`/qa-init` and `/ai-native-qa:qa-init`); use one set. To keep the plugin out
of Claude Code on that machine, set `"syncClaudeAiPlugins": false` in `~/.claude/settings.json`.

## Maintainers

- Tests: `node --test scripts/qa/test/*.test.cjs` from the plugin folder.
- The plugin is a copy of the standalone harness. After a change on either side, run
  `node ~/.claude/scripts/qa-plugin-drift.cjs`; it lists every difference that is not by design.
