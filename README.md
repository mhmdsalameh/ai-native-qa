# ai-native-qa

Plugin marketplace for **AI-Native QA**: the complete QA lifecycle with Claude, from requirements
to release. The tester approves every decision.

- Plugin: [`plugins/ai-native-qa`](plugins/ai-native-qa) (details, requirements and rollout in its README)
- Marketplace file: [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json)

## Install

- Organization (Owner): **Organization settings > Plugins & skills > Add > Sync from GitHub**, select
  this repository, keep **Sync automatically** on, then set the plugin's **Default access**.
- Claude Code CLI: `claude plugin marketplace add mhmdsalameh/ai-native-qa`, then
  `claude plugin install ai-native-qa@ai-native-qa`.

## Release

1. Raise `version` in `plugins/ai-native-qa/.claude-plugin/plugin.json` and in `.claude-plugin/marketplace.json`.
2. Run the tests: `cd plugins/ai-native-qa && node --test scripts/qa/test/*.test.cjs`.
3. Push to `main`. The organization syncs on push.
