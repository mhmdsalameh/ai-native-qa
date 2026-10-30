'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { init } = require('../qa-project.cjs');
const { findPii, luhn, ibanValid } = require('../lib/guards.cjs');
const { ingest } = require('../qa-ingest.cjs');
const R = require('../qa-rtm.cjs');
const B = require('../qa-bugs.cjs');
const { fsdDocx, PNG } = require('./fixtures.cjs');

const HOOKS = path.join(__dirname, '..', '..', '..', 'hooks', 'qa');
const GUARD = path.join(HOOKS, 'qa-guard.cjs');
const SESSION = path.join(HOOKS, 'qa-session.cjs');

// An empty config dir, so a standalone harness installed on the test machine does not change the verdicts.
const NO_STANDALONE = { CLAUDE_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'qa-nocfg-')) };
function hook(script, input, env = NO_STANDALONE) {
  const r = spawnSync(process.execPath, [script], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', env: { ...process.env, ...env } });
  assert.strictEqual(r.status, 0, r.stderr);
  if (script === SESSION) return r.stdout;
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null;
}
function proj(over = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-hooks-'));
  init(dir, { name: 'Bank', env: 'UAT=https://uat.bank.test,PROD=https://bank.com', 'allow-hosts': 'login.microsoftonline.com,*.cdn.bank.test', ...over });
  return dir;
}
const setCfg = (dir, fn) => { const f = path.join(dir, '.qa', 'config.json'); const c = JSON.parse(fs.readFileSync(f, 'utf8')); fn(c); fs.writeFileSync(f, JSON.stringify(c)); };

test('URL guard: test environments and allowed hosts pass; others, production and odd schemes are denied', () => {
  const dir = proj();
  const nav = url => hook(GUARD, { tool_name: 'mcp__plugin_playwright_playwright__browser_navigate', cwd: dir, tool_input: { url } });
  assert.strictEqual(nav('https://uat.bank.test/transfers?x=1'), null);
  assert.strictEqual(nav('https://login.microsoftonline.com/oauth'), null);
  assert.strictEqual(nav('https://img.cdn.bank.test/a.png'), null);
  assert.strictEqual(nav('about:blank'), null);
  assert.match(nav('https://evil.example/').permissionDecisionReason, /not a test environment/);
  assert.match(nav('http://uat.bank.test/').permissionDecisionReason, /not a test environment/, 'scheme must match too');
  assert.match(nav('https://bank.com/').permissionDecisionReason, /production/);
  assert.match(nav('file:///C:/secrets.txt').permissionDecisionReason, /file: URLs/);
  assert.match(nav('not a url').permissionDecisionReason, /not a valid absolute URL/);
  assert.strictEqual(hook(GUARD, { tool_name: 'mcp__claude-in-chrome__navigate', cwd: dir, tool_input: { url: 'back', tabId: 1 } }), null);
  assert.strictEqual(hook(GUARD, { tool_name: 'mcp__plugin_chrome-devtools-mcp_chrome-devtools__new_page', cwd: dir, tool_input: { url: 'https://x.org' } }).permissionDecision, 'deny');
  setCfg(dir, c => { c.allow_production = true; });
  assert.strictEqual(nav('https://bank.com/'), null);
  assert.strictEqual(hook(GUARD, { tool_name: 'mcp__plugin_playwright_playwright__browser_navigate', cwd: os.tmpdir(), tool_input: { url: 'https://anything.org' } }), null, 'outside a QA project the guard does not apply');
});

test('file guard: rtm.json and bug approval fields are script-only', () => {
  const dir = proj();
  const w = (file, content) => hook(GUARD, { tool_name: 'Write', cwd: dir, tool_input: { file_path: path.join(dir, file), content } });
  assert.match(w('.qa/rtm.json', '{}').permissionDecisionReason, /written only by qa-rtm\.cjs/);
  assert.strictEqual(w('bugs/C-0001.json', JSON.stringify({ id: 'C-0001', verdict: 'unchecked', gates: {}, approved: false, ado_id: null })), null, 'a fresh candidate is fine');
  fs.writeFileSync(path.join(dir, 'bugs', 'C-0001.json'), JSON.stringify({ id: 'C-0001', verdict: 'incomplete', gates: {}, approved: false, ado_id: null }));
  assert.match(w('bugs/C-0001.json', JSON.stringify({ id: 'C-0001', verdict: 'valid', gates: {}, approved: false, ado_id: null })).permissionDecisionReason, /verdict/);
  assert.strictEqual(w('bugs/C-0001.json', JSON.stringify({ id: 'C-0001', title: 'x', verdict: 'incomplete', gates: {}, approved: false, ado_id: null })), null);
  const e = hook(GUARD, { tool_name: 'Edit', cwd: dir, tool_input: { file_path: path.join(dir, 'bugs', 'C-0001.json'), old_string: '"approved": false', new_string: '"approved": true' } });
  assert.match(e.permissionDecisionReason, /approved/);
  assert.match(w('bugs/C-0001.json', '{not json').permissionDecisionReason, /valid JSON/);
});

test('PII guard: active only above D0, outside source/; masks what it reports', () => {
  const d0 = proj();
  const realish = 'Customer omar.k@gmail.com paid with 4539 1488 0343 6467, phone +962 79 555 1234, IBAN JO94CBJO0010000000000131000302.';
  assert.strictEqual(hook(GUARD, { tool_name: 'Write', cwd: d0, tool_input: { file_path: path.join(d0, 'bugs', 'n.md'), content: realish } }), null);
  const d2 = proj({ 'data-class': 'D2' });
  const r = hook(GUARD, { tool_name: 'Write', cwd: d2, tool_input: { file_path: path.join(d2, 'deliverables', 'report.md'), content: realish } });
  assert.strictEqual(r.permissionDecision, 'deny');
  for (const k of ['email', 'card number', 'phone', 'IBAN']) assert.match(r.permissionDecisionReason, new RegExp(k));
  assert.ok(!r.permissionDecisionReason.includes('omar.k@gmail.com') && !r.permissionDecisionReason.includes('4539148803436467'), 'the reason itself is masked');
  assert.strictEqual(hook(GUARD, { tool_name: 'Write', cwd: d2, tool_input: { file_path: path.join(d2, 'source', 'x.md'), content: realish } }), null);
  const ok = 'User qa1@example.com, card 4111 1111 1111 1111, TC-0142-03, build 2.4.1, amount 5,001, date 2026-10-29, REQ-0142.';
  assert.strictEqual(hook(GUARD, { tool_name: 'Edit', cwd: d2, tool_input: { file_path: path.join(d2, 'cards', 'REQ-0001.md'), old_string: 'a', new_string: ok } }), null);
  setCfg(d2, c => { c.pii.extra_patterns = [{ name: 'national id', regex: '\\b[12]\\d{9}\\b' }]; c.pii.synthetic_markers = ['qa-synth']; });
  assert.match(hook(GUARD, { tool_name: 'Write', cwd: d2, tool_input: { file_path: path.join(d2, 'notes', 'n.md'), content: 'ID 2987654321' } }).permissionDecisionReason, /national id/);
  assert.strictEqual(hook(GUARD, { tool_name: 'Write', cwd: d2, tool_input: { file_path: path.join(d2, 'notes', 'n.md'), content: 'mail qa-synth.user@gmail.com' } }), null);
});

test('pii helpers: luhn, iban, no false positives on ids and dates', () => {
  assert.ok(luhn('4539148803436467'));
  assert.ok(!luhn('4539148803436468'));
  assert.ok(ibanValid('GB82 WEST 1234 5698 7654 32'));
  assert.ok(!ibanValid('GB82 WEST 1234 5698 7654 33'));
  assert.deepStrictEqual(findPii('TC-0142-03 R-0007 2026-10-29 10:15 v2.4.1 1234567890123 0000000000000000', { pii: {} }), []);
});

test('approval asks the human; deleting QA records asks too', () => {
  const dir = proj();
  const sh = command => hook(GUARD, { tool_name: 'Bash', cwd: dir, tool_input: { command } });
  const a = sh('node "$HOME/.claude/scripts/qa/qa-bugs.cjs" approve C-0007 --by "Sara"');
  assert.strictEqual(a.permissionDecision, 'ask');
  assert.match(a.permissionDecisionReason, /C-0007/);
  assert.strictEqual(sh('node qa-bugs.cjs check C-0007'), null);
  assert.strictEqual(sh('rm -rf evidence/TC-0001-01').permissionDecision, 'ask');
  assert.strictEqual(hook(GUARD, { tool_name: 'PowerShell', cwd: dir, tool_input: { command: 'Remove-Item -Recurse .qa' } }).permissionDecision, 'ask');
});

test('ADO guard: a bug is filed only from an approved, valid, unfiled candidate', () => {
  const dir = proj();
  fs.writeFileSync(path.join(dir, 'source', 'fsd.docx'), fsdDocx());
  ingest(path.join(dir, 'source', 'fsd.docx'), { out: path.join(dir, 'fsd'), version: 'v1' });
  setCfg(dir, c => { c.fsd.current = 'v1'; });
  const quote = 'The system shall reject a transfer above the daily limit and show message E-104.';
  fs.writeFileSync(path.join(dir, 'cards', 'REQ-0001.md'), `---\nid: "REQ-0001"\ntitle: "Limit"\nsection: "S007"\nslice: "t"\nrisk: "high"\nquote: ${JSON.stringify(quote)}\n---\nBlocked.\n`);
  R.sync(dir);
  fs.writeFileSync(path.join(dir, 'cases', 't.json'), JSON.stringify([{ id: 'TC-0001-01', req: ['REQ-0001'], title: 'x', technique: 'boundary-value', priority: 'P1', execution: 'web', steps: [{ action: 'a' }], expected: 'blocked' }]));
  R.sync(dir);
  for (const f of ['r1.png', 'r2.png', 'r3.png']) fs.writeFileSync(path.join(dir, 'evidence', f), PNG);
  R.record(dir, { tc: 'TC-0001-01', result: 'fail', evidence: 'evidence/r1.png' });
  B.createCandidate(dir, { tc: 'TC-0001-01' });
  const file = path.join(dir, 'bugs', 'C-0001.json');
  const b = JSON.parse(fs.readFileSync(file, 'utf8'));
  Object.assign(b, { title: 'Limit not enforced', actual: 'accepted', severity: 'High', replays: [{ result: 'fail', evidence: 'evidence/r2.png' }, { result: 'fail', evidence: 'evidence/r3.png' }], cause: { kind: 'product' }, duplicate_check: { query: 'limit', matches: [] } });
  fs.writeFileSync(file, JSON.stringify(b));
  const file1 = input => hook(GUARD, { tool_name: 'mcp__ado__wit_work_item_write', cwd: dir, tool_input: input });
  const payload = { action: 'create', project: 'Bank', workItemType: 'Bug', fields: { 'System.Title': 'x', 'Microsoft.VSTS.TCM.ReproSteps': '<p><b>QA-ID: C-0001</b></p>' } };
  assert.match(file1(payload).permissionDecisionReason, /not approved/);
  assert.match(file1({ ...payload, fields: { 'System.Title': 'invented bug' } }).permissionDecisionReason, /approved candidate/);
  B.approve(dir, 'C-0001', 'Sara');
  assert.strictEqual(file1(payload), null);
  assert.strictEqual(file1({ action: 'update', id: 5, fields: { 'System.State': 'Active' } }), null, 'non-bug writes pass');
  B.filed(dir, 'C-0001', '777');
  assert.match(file1(payload).permissionDecisionReason, /already filed/);
});

test('session hook prints project state, or how to start', () => {
  const dir = proj();
  fs.writeFileSync(path.join(dir, 'STATE.md'), '# S\n\n## Last session\n### 2026-10-29\n- next: ingest the FSD\n');
  const out = hook(SESSION, { cwd: dir, hook_event_name: 'SessionStart' });
  assert.match(out, /\[QA\] Project: Bank/);
  assert.match(out, /Environments: UAT https:\/\/uat\.bank\.test; PROD https:\/\/bank\.com \(read-only\)/);
  assert.match(out, /next: ingest the FSD/);
  assert.match(out, /\[QA\] Agent: none\. This session is not the QA orchestrator.*safety checks still apply/);
  assert.match(hook(SESSION, { cwd: dir, agent_type: 'qa-orchestrator' }), /\[QA\] Agent: qa-orchestrator \(QA instructions and gates active\)/);
  assert.match(hook(SESSION, { cwd: dir, agent_type: 'ai-native-stlc:qa-orchestrator' }), /\[QA\] Agent: ai-native-stlc:qa-orchestrator \(QA instructions/);
  assert.match(hook(SESSION, { cwd: dir, agent_type: 'not-qa-orchestrator' }), /\[QA\] Agent: not-qa-orchestrator\. This session is not/);
  assert.strictEqual(hook(SESSION, { cwd: os.tmpdir() }), '', 'outside a project, other sessions get no QA text');
  assert.match(hook(SESSION, { cwd: os.tmpdir(), agent_type: 'qa-orchestrator' }), /No QA project/);
  assert.match(hook(SESSION, { cwd: os.tmpdir(), agent_type: 'ai-native-stlc:qa-orchestrator' }), /No QA project/);
});

test('plugin scope: the guard acts for the orchestrator or inside a project, and nowhere else', () => {
  const dir = proj();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-outside-'));
  const adoBug = { workItemType: 'Bug', title: 'x' };
  const ado = extra => hook(GUARD, { tool_name: 'mcp__ado__wit_create_work_item', cwd: outside, tool_input: adoBug, ...extra });
  assert.strictEqual(ado({}), null, 'another session outside a project is not guarded');
  assert.strictEqual(ado({ agent_type: 'sdlc-orchestrator' }), null);
  assert.strictEqual(ado({ agent_type: 'ai-native-stlc:qa-orchestrator' }).permissionDecision, 'deny');
  assert.strictEqual(ado({ agent_type: 'not-qa-orchestrator' }), null);
  const intoProject = hook(GUARD, { tool_name: 'Write', cwd: outside, tool_input: { file_path: path.join(dir, '.qa', 'rtm.json'), content: '{}' } });
  assert.strictEqual(intoProject.permissionDecision, 'deny', 'a write into a project is guarded from any folder');
  assert.strictEqual(hook(GUARD, { tool_name: 'Write', cwd: outside, tool_input: { file_path: path.join(outside, 'a.md'), content: 'x' } }), null);
});

test('plugin scope: broken hook input blocks only inside a QA session', () => {
  const dir = proj();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-outside-'));
  const run = (script, cwd) => spawnSync(process.execPath, [script], { input: '{not json', cwd, encoding: 'utf8' });
  const out = run(GUARD, outside);
  assert.strictEqual(out.status, 0);
  assert.strictEqual(out.stdout, '');
  const inside = run(GUARD, dir);
  assert.strictEqual(inside.status, 0);
  assert.strictEqual(JSON.parse(inside.stdout).hookSpecificOutput.permissionDecision, 'deny');
  assert.strictEqual(run(SESSION, outside).stdout, '');
  assert.match(run(SESSION, dir).stdout, /\[QA\] Project: Bank/);
});

test('plugin scope: with the standalone orchestrator installed, its session is left to the standalone hooks', () => {
  const dir = proj();
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-cfg-'));
  fs.mkdirSync(path.join(cfg, 'agents'));
  const env = { CLAUDE_CONFIG_DIR: cfg };
  const rtmWrite = agent_type => hook(GUARD, { tool_name: 'Write', cwd: dir, agent_type, tool_input: { file_path: path.join(dir, '.qa', 'rtm.json'), content: '{}' } }, env);
  assert.strictEqual(rtmWrite('qa-orchestrator').permissionDecision, 'deny', 'no standalone agent: the plugin guards');
  fs.writeFileSync(path.join(cfg, 'agents', 'qa-orchestrator.md'), '---\nname: qa-orchestrator\nhooks:\n  PreToolUse: []\n---\n');
  assert.strictEqual(rtmWrite('qa-orchestrator'), null, 'standalone agent with hooks: it guards, the plugin stays out');
  assert.strictEqual(hook(SESSION, { cwd: dir, agent_type: 'qa-orchestrator' }, env), '');
  assert.strictEqual(rtmWrite('ai-native-stlc:qa-orchestrator').permissionDecision, 'deny', 'the plugin agent is still guarded');
  assert.strictEqual(rtmWrite('Explore').permissionDecision, 'deny', 'other agents inside a project are still guarded');
  fs.writeFileSync(path.join(cfg, 'agents', 'qa-orchestrator.md'), '---\nname: qa-orchestrator\n---\n');
  assert.strictEqual(rtmWrite('qa-orchestrator').permissionDecision, 'deny', 'a user agent without hooks does not switch the plugin off');
});

test('guard fails closed on a broken project config', () => {
  const dir = proj();
  fs.writeFileSync(path.join(dir, '.qa', 'config.json'), '{broken');
  const r = hook(GUARD, { tool_name: 'Write', cwd: dir, tool_input: { file_path: path.join(dir, 'notes', 'a.md'), content: 'x' } });
  assert.strictEqual(r.permissionDecision, 'deny');
  assert.match(r.permissionDecisionReason, /invalid JSON/);
});
