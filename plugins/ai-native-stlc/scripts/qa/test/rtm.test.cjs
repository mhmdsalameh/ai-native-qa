'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { init, status } = require('../qa-project.cjs');
const { ingest } = require('../qa-ingest.cjs');
const R = require('../qa-rtm.cjs');
const xlsx = require('../lib/xlsx.cjs');
const { fsdDocx, PNG } = require('./fixtures.cjs');

const QUOTE = 'The system shall reject a transfer above the daily limit and show message E-104.';

function project({ rule } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-rtm-'));
  init(dir, { name: 'Bank R3', client: 'Bank X', env: 'UAT=https://uat.bank.test' });
  fs.writeFileSync(path.join(dir, 'source', 'fsd.docx'), fsdDocx(rule ? { transferRule: rule } : {}));
  ingest(path.join(dir, 'source', 'fsd.docx'), { out: path.join(dir, 'fsd'), version: 'v1' });
  const cfgFile = path.join(dir, '.qa', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  cfg.fsd.current = 'v1';
  fs.writeFileSync(cfgFile, JSON.stringify(cfg));
  return dir;
}
const card = (dir, id, extra = {}) => {
  const m = { id, title: 'Transfer daily limit', section: 'S007', ref: '3.1.1', page: 2, slice: 'transfers', risk: 'high', quote: QUOTE, ...extra };
  const fm = Object.entries(m).map(([k, v]) => `${k}: ${typeof v === 'number' ? v : JSON.stringify(v)}`).join('\n');
  fs.writeFileSync(path.join(dir, 'cards', `${id}.md`), `---\n${fm}\n---\nExpected: transfer blocked, E-104 shown, balance unchanged.\n`);
};
const tc = (id, over = {}) => ({ id, req: ['REQ-0001'], title: 'Amount above the limit is rejected', technique: 'boundary-value', priority: 'P1', execution: 'web', steps: [{ action: 'Enter 5,001' }, { action: 'Select Confirm', expected: 'E-104 shown' }], expected: 'Transfer blocked', ...over });
const cases = (dir, list) => fs.writeFileSync(path.join(dir, 'cases', 'transfers.json'), JSON.stringify(list));
const evidence = (dir, name = 'evidence/TC-0001-01/run1.png') => { fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); fs.writeFileSync(path.join(dir, name), PNG); return name; };

test('init scaffolds once and never overwrites; status names the next step', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-init-'));
  const first = init(dir, { name: 'P', env: 'UAT=https://uat.x.test/path,PROD=https://x.com' });
  assert.ok(first.made.length > 5);
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.qa', 'config.json'), 'utf8'));
  assert.deepStrictEqual(cfg.environments.map(e => [e.name, e.base_url, e.kind, e.read_only]), [['UAT', 'https://uat.x.test', 'uat', false], ['PROD', 'https://x.com', 'production', true]]);
  fs.writeFileSync(path.join(dir, 'STATE.md'), 'mine');
  assert.strictEqual(init(dir, { name: 'P' }).made.length, 0);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'STATE.md'), 'utf8'), 'mine');
  assert.match(status(dir).next, /qa-ingest/);
  assert.throws(() => init(dir, { env: 'UAT=ftp://x' }), /NAME=https/);
  assert.throws(() => init(dir, { language: 'fr' }), /language/);
  assert.throws(() => init(dir, { 'data-class': 'D9' }), /data-class/);
});

test('init sets the orchestrator as the project agent and only reports on an existing settings file', () => {
  const settingsOf = dir => path.join(dir, '.claude', 'settings.json');
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-init-'));
  const r = init(fresh, { name: 'P' });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(settingsOf(fresh), 'utf8')), { agent: 'qa-orchestrator' });
  assert.deepStrictEqual(r.notes, []);
  assert.deepStrictEqual(init(fresh, { name: 'P' }).notes, []);
  const cases = [
    ['{"model":"opus"}', /no "agent" key/],
    ['{"agent":"sdlc-orchestrator"}', /do not start as qa-orchestrator/],
    ['{"agent":"ai-native-stlc:qa-orchestrator"}', null],
    ['{ broken', /not valid JSON/],
  ];
  for (const [text, note] of cases) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-init-'));
    fs.mkdirSync(path.join(dir, '.claude'));
    fs.writeFileSync(settingsOf(dir), text);
    const out = init(dir, { name: 'P' });
    assert.strictEqual(fs.readFileSync(settingsOf(dir), 'utf8'), text);
    if (note) { assert.strictEqual(out.notes.length, 1); assert.match(out.notes[0], note); } else assert.deepStrictEqual(out.notes, []);
  }
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-init-'));
  fs.mkdirSync(path.join(repo, '.git'));
  assert.match(init(repo, { name: 'P' }).notes.join('\n'), /git repository root/);
});

test('sync accepts a card whose quote is in the cited section, and rejects a paraphrase', () => {
  const dir = project();
  card(dir, 'REQ-0001');
  R.sync(dir);
  assert.strictEqual(R.load(dir).requirements['REQ-0001'].status, 'active');
  card(dir, 'REQ-0001', { quote: 'Transfers over the limit are blocked.' });
  assert.throws(() => R.sync(dir), /quote not found word for word in S007/);
  card(dir, 'REQ-0001', { section: 'S099' });
  assert.throws(() => R.sync(dir), /S099 is not in fsd\/v1/);
});

test('sync validates ids, file names, risk, and is all-or-nothing', () => {
  const dir = project();
  card(dir, 'REQ-0001');
  card(dir, 'REQ-0002', { risk: 'severe' });
  fs.writeFileSync(path.join(dir, 'cards', 'REQ-0003.md'), '---\nid: "REQ-0004"\ntitle: "x"\nsection: "S007"\nquote: "daily limit"\nslice: "t"\nrisk: "low"\n---\nbody\n');
  assert.throws(() => R.sync(dir), err => /risk must be one of/.test(err.message) && /file name must be REQ-0004.md/.test(err.message));
  assert.deepStrictEqual(R.load(dir).requirements, {});
});

test('cases: validation, id prefix must match a requirement, stale and removed tracking', () => {
  const dir = project();
  card(dir, 'REQ-0001');
  R.sync(dir);
  cases(dir, [tc('TC-0001-01'), tc('TC-0002-01')]);
  assert.throws(() => R.sync(dir), /first four digits must match/);
  cases(dir, [tc('TC-0001-01', { technique: 'magic', steps: [] })]);
  assert.throws(() => R.sync(dir), e => /technique must be one of/.test(e.message) && /steps must be a non-empty list/.test(e.message));
  cases(dir, [tc('TC-0001-01'), tc('TC-0001-02')]);
  R.sync(dir);
  assert.strictEqual(R.nextId(dir, 'tc', 'REQ-0001'), 'TC-0001-03');
  assert.strictEqual(R.nextId(dir, 'req'), 'REQ-0002');
  assert.strictEqual(R.nextId(dir, 'bug'), 'C-0001');
  cases(dir, [tc('TC-0001-01')]);
  R.sync(dir);
  assert.strictEqual(R.load(dir).cases['TC-0001-02'].status, 'removed');
});

test('record: no evidence, no pass; evidence must exist inside the project; blocked needs a note', () => {
  const dir = project();
  card(dir, 'REQ-0001');
  R.sync(dir);
  cases(dir, [tc('TC-0001-01')]);
  R.sync(dir);
  assert.throws(() => R.record(dir, { tc: 'TC-0001-01', result: 'pass' }), /No evidence, no pass/);
  assert.throws(() => R.record(dir, { tc: 'TC-0001-01', result: 'pass', evidence: 'evidence/missing.png' }), /not found/);
  assert.throws(() => R.record(dir, { tc: 'TC-0001-01', result: 'pass', evidence: '../outside.png' }), /inside the project/);
  fs.writeFileSync(path.join(dir, 'evidence', 'empty.png'), '');
  assert.throws(() => R.record(dir, { tc: 'TC-0001-01', result: 'fail', evidence: 'evidence/empty.png' }), /empty/);
  assert.throws(() => R.record(dir, { tc: 'TC-0001-01', result: 'blocked' }), /needs --note/);
  assert.throws(() => R.record(dir, { tc: 'TC-0001-01', result: 'passed', evidence: evidence(dir) }), /--result must be/);
  const e = R.record(dir, { tc: 'TC-0001-01', result: 'fail', evidence: evidence(dir), build: '2.4.1' });
  assert.strictEqual(e.run, 'R-0001');
  R.record(dir, { tc: 'TC-0001-01', result: 'blocked', note: 'UAT down' });
  const s = R.summary(dir);
  assert.strictEqual(s.cases.blocked, 1);
  assert.strictEqual(s.cases.fail, 0, 'the latest run wins');
  assert.deepStrictEqual(R.gaps(dir).requirements_without_cases, []);
});

test('stale: an FSD v2 delta marks the requirement and its cases stale; record refuses until updated', () => {
  const dir = project();
  card(dir, 'REQ-0001');
  R.sync(dir);
  cases(dir, [tc('TC-0001-01')]);
  R.sync(dir);
  fs.writeFileSync(path.join(dir, 'source', 'fsd-v2.docx'), fsdDocx({ transferRule: 'The system shall reject a transfer above the daily limit and show message E-105.' }));
  ingest(path.join(dir, 'source', 'fsd-v2.docx'), { out: path.join(dir, 'fsd'), version: 'v2' });
  require('../qa-ingest.cjs').diff(path.join(dir, 'fsd', 'v1'), path.join(dir, 'fsd', 'v2'));
  const r = R.stale(dir, 'fsd/v2/delta-from-v1.json');
  assert.deepStrictEqual(r, { requirements: ['REQ-0001'], cases: ['TC-0001-01'], added_sections: [] });
  assert.throws(() => R.record(dir, { tc: 'TC-0001-01', result: 'pass', evidence: evidence(dir) }), /stale/);
  assert.strictEqual(R.summary(dir).requirements.stale, 1);
});

test('import-replay: Playwright JSON results become RTM runs with their screenshots as evidence', () => {
  const dir = project();
  card(dir, 'REQ-0001');
  R.sync(dir);
  cases(dir, [tc('TC-0001-01'), tc('TC-0001-02'), tc('TC-0001-03')]);
  R.sync(dir);
  const runDir = path.join(dir, 'evidence', 'replay', 'r1');
  const shot = n => { const p = path.join(runDir, 'artifacts', n, 'test-finished-1.png'); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, PNG); return p; };
  const report = { suites: [{ title: 'TC-0001.spec.js', specs: [], suites: [{ title: 'nested', specs: [
    { title: 'TC-0001-01 limit-1 accepted', tests: [{ projectName: 'chromium', results: [{ status: 'passed', attachments: [{ name: 'screenshot', contentType: 'image/png', path: shot('a') }] }] }] },
    { title: 'TC-0001-02 limit+1 rejected', tests: [{ projectName: 'chromium', results: [{ status: 'failed', error: { message: 'expect(locator).toBeVisible() failed\nLocator: getByText(E-104)' }, attachments: [{ name: 'screenshot', contentType: 'image/png', path: shot('b') }] }] }] },
    { title: 'TC-0001-03 no screenshot', tests: [{ results: [{ status: 'passed', attachments: [] }] }] },
    { title: 'helper without id', tests: [{ results: [{ status: 'passed' }] }] },
  ] }] }] };
  fs.writeFileSync(path.join(runDir, 'results.json'), JSON.stringify(report));
  const r = R.importReplay(dir, 'evidence/replay/r1/results.json', { build: '2.4.2', env: 'UAT' });
  assert.deepStrictEqual(r.recorded, ['R-0001 TC-0001-01 pass [chromium]', 'R-0002 TC-0001-02 fail [chromium]']);
  assert.ok(r.skipped.some(s => /TC-0001-03.*No evidence, no pass/.test(s)));
  assert.ok(r.skipped.some(s => /title does not start with a TC id/.test(s)));
  const runs = R.load(dir).runs;
  assert.strictEqual(runs[1].note, 'expect(locator).toBeVisible() failed [chromium]');
  assert.match(runs[0].evidence[0], /^evidence\/replay\/r1\/artifacts\/a\/test-finished-1\.png$/);
});

test('setup-replay writes a config bound to a configured environment and never overwrites', () => {
  const dir = project();
  const { setupReplay } = require('../qa-project.cjs');
  assert.throws(() => setupReplay(dir, { env: 'NOPE' }), /--env must name an environment/);
  const made = setupReplay(dir, { env: 'UAT' });
  assert.strictEqual(made.length, 3);
  const conf = fs.readFileSync(path.join(dir, 'playwright.config.js'), 'utf8');
  assert.match(conf, /process\.env\.QA_ENV \|\| "UAT"/);
  assert.match(conf, /allow_production/);
  assert.match(conf, /evidence\/replay\/\$\{run\}\/artifacts/);
  assert.strictEqual(setupReplay(dir, { env: 'UAT' }).length, 0);
});

test('export: four sheets with real values; export-cases fills a company template keeping its header', () => {
  const dir = project();
  card(dir, 'REQ-0001');
  R.sync(dir);
  cases(dir, [tc('TC-0001-01')]);
  R.sync(dir);
  R.record(dir, { tc: 'TC-0001-01', result: 'pass', evidence: evidence(dir) });
  const out = R.exportXlsx(dir);
  const buf = fs.readFileSync(out);
  assert.deepStrictEqual(xlsx.readSheet(buf, 'RTM')[1].slice(0, 2), ['REQ-0001', 'Transfer daily limit']);
  assert.strictEqual(xlsx.readSheet(buf, 'RTM')[1][7], 'pass');
  assert.match(xlsx.readSheet(buf, 'Test cases')[1][8], /^1\. Enter 5,001\n2\. Select Confirm -> E-104 shown$/);
  assert.strictEqual(xlsx.readSheet(buf, 'Runs')[1][2], 'pass');

  const company = xlsx.writeWorkbook([{ name: 'Cases', columns: [{ header: 'ID' }, { header: 'Title' }, { header: 'Steps' }], rows: [['old', 'old', 'old'], ['old2', 'x', 'y']] }]);
  fs.writeFileSync(path.join(dir, 'templates', 'cases.xlsx'), company);
  const dest = R.exportCases(dir, { out: 'deliverables/cases.xlsx', template: 'templates/cases.xlsx', sheet: 'Cases', 'header-row': '1', columns: '0,2,8' });
  const rows = xlsx.readSheet(fs.readFileSync(dest), 'Cases');
  assert.deepStrictEqual(rows[0], ['ID', 'Title', 'Steps']);
  assert.strictEqual(rows.length, 2, 'old rows below the header are replaced');
  assert.deepStrictEqual(rows[1].slice(0, 2), ['TC-0001-01', 'Amount above the limit is rejected']);
  assert.throws(() => R.exportCases(dir, { out: 'x.xlsx', slice: 'nope' }), /no test cases in slice nope/);
});
