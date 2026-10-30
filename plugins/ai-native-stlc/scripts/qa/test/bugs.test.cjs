'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { init } = require('../qa-project.cjs');
const { ingest } = require('../qa-ingest.cjs');
const R = require('../qa-rtm.cjs');
const B = require('../qa-bugs.cjs');
const { fsdDocx, PNG } = require('./fixtures.cjs');

const QUOTE = 'The system shall reject a transfer above the daily limit and show message E-104.';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-bugs-'));
  init(dir, { name: 'Bank', env: 'UAT=https://uat.bank.test' });
  fs.writeFileSync(path.join(dir, 'source', 'fsd.docx'), fsdDocx());
  ingest(path.join(dir, 'source', 'fsd.docx'), { out: path.join(dir, 'fsd'), version: 'v1' });
  const cfgFile = path.join(dir, '.qa', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); cfg.fsd.current = 'v1'; fs.writeFileSync(cfgFile, JSON.stringify(cfg));
  fs.writeFileSync(path.join(dir, 'cards', 'REQ-0001.md'), `---\nid: "REQ-0001"\ntitle: "Daily limit"\nsection: "S007"\nslice: "transfers"\nrisk: "high"\nquote: ${JSON.stringify(QUOTE)}\n---\nBlocked above the limit.\n`);
  R.sync(dir);
  fs.writeFileSync(path.join(dir, 'cases', 'transfers.json'), JSON.stringify([{ id: 'TC-0001-01', req: ['REQ-0001'], title: 'Above limit', technique: 'boundary-value', priority: 'P1', execution: 'web', steps: [{ action: 'Enter 5,001' }, { action: 'Confirm' }], expected: 'E-104 shown, transfer blocked' }]));
  R.sync(dir);
  ev(dir, 'evidence/TC-0001-01/run1.png');
  return dir;
}
function ev(dir, rel) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), PNG); return rel; }
function edit(dir, id, fn) { const f = path.join(dir, 'bugs', `${id}.json`); const b = JSON.parse(fs.readFileSync(f, 'utf8')); fn(b); fs.writeFileSync(f, JSON.stringify(b)); }
function complete(dir, b) {
  b.title = '[Transfers] Amount above the daily limit is accepted';
  b.actual = 'Transfer of 5,001 succeeds';
  b.severity = 'High';
  b.replays = [{ result: 'fail', evidence: ev(dir, 'evidence/TC-0001-01/replay1.png') }, { result: 'fail', evidence: ev(dir, 'evidence/TC-0001-01/replay2.png') }];
  b.cause = { kind: 'product', note: 'same result with a fresh user' };
  b.duplicate_check = { query: 'REQ-0001 limit', matches: [{ id: 812, same_symptom: false }] };
}

test('new: only from a failed run; prefills oracle from the card', () => {
  const dir = setup();
  assert.throws(() => B.createCandidate(dir, { tc: 'TC-0001-01' }), /no failed run/);
  R.record(dir, { tc: 'TC-0001-01', result: 'fail', evidence: 'evidence/TC-0001-01/run1.png' });
  const b = B.createCandidate(dir, { tc: 'TC-0001-01' });
  assert.strictEqual(b.id, 'C-0001');
  assert.strictEqual(b.oracle.quote, QUOTE);
  assert.strictEqual(B.check(dir, 'C-0001').verdict, 'incomplete', 'a fresh candidate is never valid');
});

test('each gate routes the candidate to its own outcome', () => {
  const dir = setup();
  R.record(dir, { tc: 'TC-0001-01', result: 'fail', evidence: 'evidence/TC-0001-01/run1.png' });
  B.createCandidate(dir, { tc: 'TC-0001-01' });
  edit(dir, 'C-0001', b => complete(dir, b));
  assert.strictEqual(B.check(dir, 'C-0001').verdict, 'valid');
  const cases = [
    [b => { b.oracle.quote = 'Transfers over the limit fail'; }, 'question'],
    [b => { b.oracle = { type: 'standard', standard: 'looks wrong to me', reference: 'x' }; }, 'question'],
    [b => { b.replays[1].result = 'pass'; }, 'not-reproducible'],
    [b => { b.replays.pop(); }, 'incomplete'],
    [b => { b.cause = { kind: 'test-data', note: 'user had no limit set' }; }, 'environment'],
    [b => { b.duplicate_check.matches.push({ id: 900, same_symptom: true }); }, 'duplicate'],
    [b => { b.duplicate_check = { query: '', matches: [] }; }, 'incomplete'],
    [b => { b.severity = 'Blocker'; }, 'incomplete'],
    [b => { b.evidence = ['evidence/nope.png']; }, 'incomplete'],
  ];
  for (const [mutate, expected] of cases) {
    edit(dir, 'C-0001', b => { complete(dir, b); b.oracle = { type: 'requirement', req: 'REQ-0001', quote: QUOTE, source: 'S007' }; b.evidence = ['evidence/TC-0001-01/run1.png']; mutate(b); });
    assert.strictEqual(B.check(dir, 'C-0001').verdict, expected, `mutation ${mutate} should give ${expected}`);
  }
  edit(dir, 'C-0001', b => { complete(dir, b); b.oracle = { type: 'standard', standard: 'WCAG 2.2 SC 1.4.3', reference: 'contrast 2.9:1 on the Confirm button' }; b.evidence = ['evidence/TC-0001-01/run1.png']; });
  assert.strictEqual(B.check(dir, 'C-0001').verdict, 'valid', 'a named standard is an accepted oracle');
});

test('approval: valid only, needs a name, and is revoked by any later edit', () => {
  const dir = setup();
  R.record(dir, { tc: 'TC-0001-01', result: 'fail', evidence: 'evidence/TC-0001-01/run1.png' });
  B.createCandidate(dir, { tc: 'TC-0001-01' });
  assert.throws(() => B.approve(dir, 'C-0001', 'Sara'), /incomplete, not valid/);
  edit(dir, 'C-0001', b => complete(dir, b));
  assert.throws(() => B.approve(dir, 'C-0001', ''), /--by/);
  assert.throws(() => B.render(dir, 'C-0001', 'ado'), /not approved/);
  B.approve(dir, 'C-0001', 'Sara');
  const payload = B.render(dir, 'C-0001', 'ado');
  assert.match(payload.fields['Microsoft.VSTS.TCM.ReproSteps'], /QA-ID: C-0001/);
  assert.strictEqual(payload.fields['Microsoft.VSTS.Common.Severity'], '2 - High');
  edit(dir, 'C-0001', b => { b.actual = 'changed after approval'; });
  const after = B.check(dir, 'C-0001');
  assert.strictEqual(after.approved, false);
  assert.match(after.approval_note, /changed after it was approved/);
  B.approve(dir, 'C-0001', 'Sara');
  B.filed(dir, 'C-0001', '4521');
  assert.throws(() => B.render(dir, 'C-0001', 'ado'), /already filed/);
  assert.match(B.render(dir, 'C-0001'), /Verdict: \*\*valid\*\* \(approved by Sara\), ADO 4521/);
  assert.strictEqual(R.summary(dir).bugs.filed, 1);
});
