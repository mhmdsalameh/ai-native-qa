#!/usr/bin/env node
'use strict';
// SessionStart hook of the ai-native-stlc plugin: in a QA project, prints the project's state so the
// session starts from the files, not from memory. stdout becomes session context. Never blocks.
// Outside a project it speaks only to the orchestrator, so other sessions get no QA text.
const fs = require('fs');
const path = require('path');
const { projectAt, isOrchestrator, standaloneRuns } = require('./scope.cjs');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch { /* fall back to the process cwd */ }
  try {
    if (standaloneRuns(input)) return;
    const root = projectAt(input.cwd || process.cwd());
    if (!root) {
      if (isOrchestrator(input)) process.stdout.write('[QA] No QA project in this folder. Run /ai-native-stlc:qa-init to create one, or open a project folder (it has .qa/config.json).\n');
      return;
    }
    const qa = path.join(__dirname, '..', '..', 'scripts', 'qa');
    const { status } = require(path.join(qa, 'qa-project.cjs'));
    const R = require(path.join(qa, 'qa-rtm.cjs'));
    const s = status(root);
    const m = R.summary(root);
    const lines = [
      `[QA] Project: ${s.project}${s.client ? ` (${s.client})` : ''} at ${root}`,
      `[QA] Agent: ${isOrchestrator(input) ? `${input.agent_type} (QA instructions and gates active)` : `${input.agent_type || 'none'}. This session is not the QA orchestrator: .claude/settings.json in this folder needs "agent": "qa-orchestrator", then start a new session. The safety checks still apply in this folder.`}`,
      `Language: ${s.language}. Data class: ${s.data_class}. Environments: ${s.environments.join('; ') || 'none'}.`,
      `FSD: ${s.fsd_version || 'not ingested'}. Requirements: ${m.requirements.active} active, ${m.requirements.stale} stale, coverage ${m.requirements.coverage_pct ?? '-'}%.`,
      `Cases: ${m.cases.total} (pass ${m.cases.pass}, fail ${m.cases.fail}, blocked ${m.cases.blocked}, not run ${m.cases.not_run}). Bug candidates: ${m.bugs.candidates}, approved ${m.bugs.approved}, filed ${m.bugs.filed}. Open questions: ${m.questions.open}.`,
      `Next: ${s.next}`,
    ];
    const state = path.join(root, 'STATE.md');
    if (fs.existsSync(state)) {
      const t = fs.readFileSync(state, 'utf8');
      const i = t.indexOf('## Last session');
      if (i >= 0) lines.push('', t.slice(i, i + 1500).trim());
    }
    process.stdout.write(lines.join('\n') + '\n');
  } catch (e) {
    process.stdout.write(`[QA] session context unavailable: ${e.message}\n`);
  }
});
