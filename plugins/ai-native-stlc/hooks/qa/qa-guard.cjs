#!/usr/bin/env node
'use strict';
// PreToolUse hook of the ai-native-stlc plugin. It runs in every session and acts only in QA
// sessions (scope.cjs). Rules live in scripts/qa/lib/guards.cjs.
// Deny/ask via JSON on stdout, exit 0. In a QA session an internal error denies: in a project with
// real data a silent allow is the worse failure. Outside one it never blocks.
const path = require('path');
const { inQaSession } = require('./scope.cjs');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  let input = null;
  try { input = JSON.parse(raw || '{}'); } catch { /* decided below, once we know it is a QA session */ }
  if (!inQaSession(input || {})) process.exit(0);
  let out = null;
  try {
    if (!input) throw new Error('hook input is not JSON');
    const { decide } = require(path.join(__dirname, '..', '..', 'scripts', 'qa', 'lib', 'guards.cjs'));
    out = decide(input);
  } catch (e) {
    out = { decision: 'deny', reason: `QA guard failed: ${e.message}. Fix the hook or the project config; the tool call was blocked.` };
  }
  if (out) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: out.decision, permissionDecisionReason: out.reason } }));
  }
  process.exit(0);
});
