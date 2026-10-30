#!/usr/bin/env node
'use strict';
// Validity gate for bug candidates (bugs/C-0001.json). The verdict is computed here from
// the five checks; nobody writes it by hand.
//
//   node qa-bugs.cjs new --tc TC-0142-03 [--run R-0007]   create a candidate from a failed run
//   node qa-bugs.cjs check C-0001 | --all                 compute gates and verdict
//   node qa-bugs.cjs approve C-0001 --by "<tester>"       tester approval (valid only; asks the human)
//   node qa-bugs.cjs render C-0001 [--format md|ado]      bug report (Markdown) or ADO payload (JSON)
//   node qa-bugs.cjs filed C-0001 --ado 12345             record the ADO work item id
//   node qa-bugs.cjs list
//
// G1 oracle      a requirement card quote, or a named standard, states the expected result
// G2 reproduce   at least two clean replays, all failing, each with evidence
// G3 cause       the cause is the product, not the environment, test data or access
// G4 duplicate   a search ran, and no open item has the same requirement and symptom
// G5 complete    title, steps, expected, actual, evidence and a severity from the matrix
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseArgs, fail, run, findProject, readJson, writeJson } = require('./lib/cli.cjs');
const R = require('./qa-rtm.cjs');

const STANDARD = /^(WCAG 2\.[0-2] SC \d+\.\d+\.\d+|HTTP 5\d\d|crash|data loss|unhandled error|broken link|OWASP\b.+|security:.+)/i;
const ROUTE = { G1: 'question', G2: 'not-reproducible', G3: 'environment', G4: 'duplicate', G5: 'incomplete' };
const ADO_SEVERITY = { Critical: '1 - Critical', High: '2 - High', Medium: '3 - Medium', Low: '4 - Low' };
const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

function root(opts) {
  const r = opts.project ? path.resolve(opts.project) : findProject();
  if (!r) fail('no QA project here: run /qa-init');
  return r;
}
const file = (root, id) => {
  if (!/^C-\d{4}$/.test(id || '')) fail('a candidate id looks like C-0001');
  return path.join(root, 'bugs', `${id}.json`);
};
const load = (root, id) => readJson(file(root, id));
const exists = (root, p) => {
  const abs = path.resolve(root, p || '');
  const rel = path.relative(root, abs);
  return !rel.startsWith('..') && !path.isAbsolute(rel) && fs.existsSync(abs) && fs.statSync(abs).isFile() && fs.statSync(abs).size > 0;
};

const CONTENT_KEYS = ['id', 'tc', 'req', 'run', 'title', 'oracle', 'steps', 'expected', 'actual', 'evidence', 'env', 'build', 'data', 'replays', 'cause', 'duplicate_check', 'severity', 'priority'];
const contentHash = b => crypto.createHash('sha256').update(JSON.stringify(CONTENT_KEYS.map(k => b[k] ?? null))).digest('hex').slice(0, 16);

function createCandidate(root, opts) {
  const rtm = R.load(root);
  const tc = rtm.cases[opts.tc];
  if (!tc) fail(`unknown test case ${opts.tc}`);
  const runs = rtm.runs.filter(r => r.tc === tc.id && (!opts.run || r.run === opts.run));
  const runEntry = runs[runs.length - 1];
  if (!runEntry || runEntry.result !== 'fail') fail(`${tc.id} has no failed run${opts.run ? ` ${opts.run}` : ''}: record the failure with evidence first`);
  const id = R.nextId(root, 'bug');
  const req = rtm.requirements[tc.req[0]];
  const b = {
    id, tc: tc.id, req: tc.req[0], run: runEntry.run,
    title: '',
    oracle: { type: 'requirement', req: tc.req[0], quote: req ? req.quote : '', source: req ? `${req.section}${req.ref ? ` (${req.ref})` : ''}${req.page != null ? `, p. ${req.page}` : ''}` : '' },
    steps: tc.steps.map(s => s.action), expected: tc.expected, actual: '',
    evidence: runEntry.evidence.slice(), env: runEntry.env, build: runEntry.build, data: '',
    replays: [], cause: { kind: 'unknown', note: '' }, duplicate_check: { query: '', matches: [] },
    severity: '', priority: '',
    verdict: 'unchecked', gates: {}, approved: false, ado_id: null,
  };
  writeJson(file(root, id), b);
  return b;
}

function evaluate(root, b) {
  const cfg = readJson(path.join(root, '.qa', 'config.json'));
  const rtm = R.load(root);
  const g = {};
  const o = b.oracle || {};
  if (o.type === 'requirement') {
    const req = rtm.requirements[o.req];
    if (!req) g.G1 = { pass: false, why: `requirement ${o.req || '(none)'} is not in the RTM` };
    else if (req.status !== 'active') g.G1 = { pass: false, why: `${o.req} is ${req.status}; the expected result is not current` };
    else if (!norm(o.quote) || norm(o.quote) !== norm(req.quote)) g.G1 = { pass: false, why: `oracle.quote must equal the quote on ${o.req}'s card` };
    else g.G1 = { pass: true, why: `${o.req}: "${req.quote}"` };
  } else if (o.type === 'standard') {
    g.G1 = STANDARD.test(o.standard || '') && String(o.reference || '').trim()
      ? { pass: true, why: `${o.standard}: ${o.reference}` }
      : { pass: false, why: 'a standard oracle needs standard (e.g. "WCAG 2.2 SC 1.4.3", "HTTP 500", "crash", "data loss") and reference' };
  } else g.G1 = { pass: false, why: 'oracle.type must be requirement or standard' };

  const reps = Array.isArray(b.replays) ? b.replays : [];
  const withEvidence = reps.filter(r => exists(root, r.evidence));
  if (reps.length < 2) g.G2 = { pass: false, pending: true, why: `${reps.length} of 2 replays recorded` };
  else if (withEvidence.length !== reps.length) g.G2 = { pass: false, pending: true, why: 'every replay needs an evidence file in the project' };
  else if (reps.some(r => r.result !== 'fail')) g.G2 = { pass: false, why: `replays: ${reps.map(r => r.result).join(', ')}; not reproducible` };
  else g.G2 = { pass: true, why: `${reps.length} of ${reps.length} replays failed` };

  const kind = b.cause && b.cause.kind;
  if (kind === 'product') g.G3 = { pass: true, why: b.cause.note || 'product behaviour' };
  else if (['environment', 'test-data', 'access'].includes(kind)) g.G3 = { pass: false, why: `${kind}: ${b.cause.note || ''}`.trim() };
  else g.G3 = { pass: false, pending: true, why: 'cause.kind must be product, environment, test-data or access' };

  const d = b.duplicate_check || {};
  if (!String(d.query || '').trim() || !Array.isArray(d.matches)) g.G4 = { pass: false, pending: true, why: 'run a duplicate search and record query and matches' };
  else {
    const same = d.matches.filter(m => m && m.same_symptom === true);
    g.G4 = same.length ? { pass: false, why: `same symptom as ${same.map(m => m.id).join(', ')}` } : { pass: true, why: `${d.matches.length} match(es) checked, none with the same symptom` };
  }

  const missing = [];
  if (!String(b.title || '').trim()) missing.push('title');
  if (!Array.isArray(b.steps) || !b.steps.length || b.steps.some(s => !String(s).trim())) missing.push('steps');
  if (!String(b.expected || '').trim()) missing.push('expected');
  if (!String(b.actual || '').trim()) missing.push('actual');
  if (!Array.isArray(b.evidence) || !b.evidence.length || b.evidence.some(e => !exists(root, e))) missing.push('evidence (files must exist)');
  if (!Object.keys(cfg.severity_matrix || {}).includes(b.severity)) missing.push(`severity (one of ${Object.keys(cfg.severity_matrix || {}).join(', ')})`);
  g.G5 = missing.length ? { pass: false, why: `missing: ${missing.join(', ')}` } : { pass: true, why: 'complete' };

  let verdict = 'valid';
  for (const k of ['G1', 'G2', 'G3', 'G4', 'G5']) {
    if (!g[k].pass) { verdict = g[k].pending ? 'incomplete' : ROUTE[k]; break; }
  }
  return { gates: g, verdict };
}

function check(root, id) {
  const b = load(root, id);
  const { gates, verdict } = evaluate(root, b);
  b.gates = gates;
  b.verdict = verdict;
  if (b.approved && b.approved_hash !== contentHash(b)) {
    b.approved = false;
    b.approval_note = 'approval removed: the candidate changed after it was approved';
  }
  if (b.approved && verdict !== 'valid') { b.approved = false; b.approval_note = 'approval removed: the candidate is no longer valid'; }
  writeJson(file(root, id), b);
  return b;
}

function approve(root, id, by) {
  if (!String(by || '').trim()) fail('--by "<tester name>" is required');
  const b = check(root, id);
  if (b.verdict !== 'valid') fail(`${id} is ${b.verdict}, not valid; only a valid candidate can be approved`);
  b.approved = true;
  b.approved_by = by;
  b.approved_at = new Date().toISOString();
  b.approved_hash = contentHash(b);
  delete b.approval_note;
  writeJson(file(root, id), b);
  return b;
}

const html = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function render(root, id, format = 'md') {
  const b = check(root, id);
  const oracle = b.oracle.type === 'requirement' ? `"${b.oracle.quote}" (${b.oracle.req}, ${b.oracle.source})` : `${b.oracle.standard}: ${b.oracle.reference}`;
  if (format === 'ado') {
    if (!b.approved) fail(`${id} is not approved; the tester approves it with: qa-bugs.cjs approve ${id} --by "<name>"`);
    if (b.ado_id) fail(`${id} is already filed as ADO ${b.ado_id}`);
    const repro = `<p><b>QA-ID: ${b.id}</b></p><p><b>Steps</b></p><ol>${b.steps.map(s => `<li>${html(s)}</li>`).join('')}</ol>` +
      `<p><b>Expected</b><br>${html(b.expected)}<br><i>Source: ${html(oracle)}</i></p><p><b>Actual</b><br>${html(b.actual)}</p>` +
      `<p><b>Reproduced</b><br>${b.replays.length} of ${b.replays.length} clean replays failed</p>` +
      `<p><b>Evidence</b><br>${b.evidence.map(html).join('<br>')}</p>` + (b.data ? `<p><b>Test data</b><br>${html(b.data)}</p>` : '');
    return {
      qa_id: b.id,
      workItemType: 'Bug',
      title: b.title,
      fields: {
        'System.Title': b.title,
        'Microsoft.VSTS.TCM.ReproSteps': repro,
        'Microsoft.VSTS.Common.Severity': ADO_SEVERITY[b.severity] || b.severity,
        'Microsoft.VSTS.TCM.SystemInfo': `Environment: ${b.env || '-'}; Build: ${b.build || '-'}`,
        'System.Tags': ['qa-harness', b.req, b.tc].filter(Boolean).join('; '),
      },
      attachments: b.evidence,
    };
  }
  return [
    `# ${b.id}: ${b.title || '(no title)'}`, '',
    `Verdict: **${b.verdict}**${b.approved ? ` (approved by ${b.approved_by})` : ''}${b.ado_id ? `, ADO ${b.ado_id}` : ''}`, '',
    `| Field | Value |`, `| --- | --- |`,
    `| Links | ${[b.req, b.tc, b.run, b.build && `build ${b.build}`, b.env].filter(Boolean).join(', ')} |`,
    `| Severity | ${b.severity || '-'} |`,
    `| Expected | ${String(b.expected).replace(/\|/g, '\\|')} |`,
    `| Oracle | ${oracle.replace(/\|/g, '\\|')} |`,
    `| Actual | ${String(b.actual).replace(/\|/g, '\\|')} |`,
    `| Reproduced | ${b.replays.map(r => r.result).join(', ') || 'not yet'} |`,
    `| Evidence | ${b.evidence.join(', ')} |`,
    `| Test data | ${b.data || '-'} |`, '',
    '## Steps', '', ...b.steps.map((s, i) => `${i + 1}. ${s}`), '',
    '## Checks', '', ...['G1', 'G2', 'G3', 'G4', 'G5'].map(k => `- ${k} ${b.gates[k].pass ? 'pass' : 'not passed'}: ${b.gates[k].why}`), '',
  ].join('\n');
}

function filed(root, id, adoId) {
  if (!/^\d+$/.test(String(adoId || ''))) fail('--ado <work item number> is required');
  const b = check(root, id);
  if (!b.approved) fail(`${id} is not approved`);
  b.ado_id = Number(adoId);
  writeJson(file(root, id), b);
  return b;
}

function list(root) {
  const dir = path.join(root, 'bugs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /^C-\d{4}\.json$/.test(f)).sort().map(f => check(root, f.slice(0, -5)));
}

function main() {
  const { _: [cmd, id], ...opts } = parseArgs(process.argv.slice(2));
  if (!cmd) fail('usage: qa-bugs.cjs new --tc <TC> | check <C-id>|--all | approve <C-id> --by <name> | render <C-id> [--format md|ado] | filed <C-id> --ado <n> | list', 2);
  const r = root(opts);
  switch (cmd) {
    case 'new': { const b = createCandidate(r, opts); console.log(`created bugs/${b.id}.json from ${b.tc} ${b.run}. Fill title, actual, severity; then replay twice, check the cause and search for duplicates.`); break; }
    case 'check': {
      const items = opts.all ? list(r) : [check(r, id)];
      for (const b of items) console.log(`${b.id} ${b.verdict}${b.verdict === 'valid' ? '' : ` (${Object.entries(b.gates).find(([, v]) => !v.pass)?.[0]}: ${Object.values(b.gates).find(v => !v.pass)?.why})`}`);
      break;
    }
    case 'approve': { const b = approve(r, id, opts.by); console.log(`${b.id} approved by ${b.approved_by}`); break; }
    case 'render': { const out = render(r, id, opts.format || 'md'); console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2)); break; }
    case 'filed': { const b = filed(r, id, opts.ado); console.log(`${b.id} filed as ADO ${b.ado_id}`); break; }
    case 'list': for (const b of list(r)) console.log(`${b.id}\t${b.verdict}\t${b.approved ? 'approved' : '-'}\t${b.ado_id || '-'}\t${b.title}`); break;
    default: fail(`unknown command ${cmd}`, 2);
  }
}

if (require.main === module) run(main);
module.exports = { createCandidate, evaluate, check, approve, render, filed, list, contentHash, STANDARD };
