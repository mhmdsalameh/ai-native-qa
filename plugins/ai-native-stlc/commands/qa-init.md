---
description: Create a QA project folder - config (client, language, data class, environment allowlist, ADO), folders, templates (company or default), STATE.md. Asks the human for every setting that changes safety. Never overwrites.
argument-hint: "[project folder]"
---

# /qa-init — create the project

**Preflight:** these steps run Node scripts on the tester's computer. If `node --version` fails, or you cannot run shell commands here (claude.ai chat), stop and tell the tester this command needs Node.js and Cowork or Claude Code. Never do a script's work by hand.

Load the `qa-lifecycle` and `qa-data-handling` skills.

1. Ask with the AskUserQuestion tool, not as an open list of questions. Never guess these.
   - **Call 1, four choices:**
     - Language: English (`en`) / Arabic (`ar`) / Both (`en+ar`)
     - Data class: D0 synthetic test data (Recommended for a first project) / D1 masked copy of
       production / D2 real customer data in a test environment / D3 production system
     - Company templates: No, use the default templates (Recommended) / Yes, I have a folder
       (the tester types the path under Other)
     - Azure DevOps: Not now, I paste bugs myself (Recommended) / Yes, connect it (the tester types
       the organization and project under Other)
   - **Call 2, two choices:**
     - Project folder: This folder (show its path) (Recommended) / `$ARGUMENTS` when given / Other
     - Project name: the folder's name (Recommended) / Other
   - **Free text, one short message**, only for what has no options: the client name, and each test
     environment as `NAME=https://address` (example: `UAT=https://uat.example.com`; production
     only if it will be checked).
   - If this surface has no AskUserQuestion tool, ask the same questions as a numbered list with
     the options written out.
2. Run:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-project.cjs" init "<folder>" --name "<name>" --client "<client>" --language <lang> --data-class <D#> --env "UAT=https://...,SIT=https://..." [--allow-hosts <sso host>] [--templates "<folder>"] [--ado-org <org> --ado-project <project>]`
   The script creates `.claude/settings.json` with `"agent": "qa-orchestrator"`, so every session
   in this folder (CLI, IDE, desktop Code tab) starts as the orchestrator with its hooks. For each
   `check:` line it prints about an existing settings file, show the tester the line and ask before
   you add the `agent` key with Edit; never replace the file.
3. For each company .docx template: `node "${CLAUDE_PLUGIN_ROOT}/scripts/qa/qa-docx.cjs" inspect templates/<file>.docx`.
   Report missing `{{BODY}}` or styles, and map each company file to a key in `.qa/config.json`
   `templates` (fsd, test-plan, manual, summary-report, bug-report, exploratory-report, check-report)
   when its name did not match. Show the tester the mapping.
4. If an ADO organization was given: run `npx --version`. If it fails, tell the tester that ADO
   filing needs npx and access to the npm registry, and that bugs are pasted until then.
   `.mcp.json` now defines the `ado` server. Tell the user to
   restart the session in this folder and approve the server; the first call opens a Microsoft
   sign-in. Without ADO, bugs are pasted by the tester.
5. Tell the user to put the received documents in `source/` and run `/qa-ingest`.

**Gate:** the tester confirms the data class and the environment list. These two settings drive
the PII and URL hooks; only a human changes them later.
