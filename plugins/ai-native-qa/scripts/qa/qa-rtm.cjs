#!/usr/bin/env node
'use strict';
// The RTM: requirement -> test case -> run -> bug. .qa/rtm.json is the truth; rtm.xlsx is a
// generated view (never edit it by hand). The model writes cards, questions and cases as files;
// this script validates and syncs them, and is the only way to record a result.
//
//   node qa-rtm.cjs sync                       validate cards/ questions/ cases/ and update the RTM
//   node qa-rtm.cjs next-id req|q|bug          next free REQ-/Q-/C- id
//   node qa-rtm.cjs next-id tc REQ-0142        next free TC-0142-NN id
//   node qa-rtm.cjs record --tc TC-0142-03 --result pass|fail|blocked|unclear
//                          [--evidence a.png,b.har] [--note "..."] [--build 2.4.1] [--env UAT]
//   node qa-rtm.cjs import-replay evidence/replay/<run>/results.json [--build 2.4.2] [--env UAT]
//   node qa-rtm.cjs stale --delta fsd/v2/delta-from-v1.json
//   node qa-rtm.cjs summary [--json]           metrics, computed (never estimated)
//   node qa-rtm.cjs gaps                       requirements without cases, cases without runs, fails without bugs
//   node qa-rtm.cjs export [--out deliverables/rtm.xlsx]
//   node qa-rtm.cjs export-cases --slice <name> --out <file.xlsx> [--template t.xlsx --sheet S --header-row 1]
// Options: --project <dir> (default: nearest folder with .qa/config.json)
const fs = require('fs');
const path = require('path');
const { parseArgs, fail, run, findProject, readJson, writeJson } = require('./lib/cli.cjs');
const { splitFrontMatter } = require('./lib/md.cjs');
const xlsx = require('./lib/xlsx.cjs');

const TECHNIQUES = ['equivalence-partitioning', 'boundary-value', 'decision-table', 'state-transition', 'pairwise', 'use-case', 'error-guessing', 'checklist', 'exploratory', 'standard'];
const EXECUTION = ['web', 'api', 'manual', 'desktop', 'mobile'];
const RESULTS = ['pass', 'fail', 'blocked', 'unclear'];
const RISK = ['high', 'medium', 'low'];

function project(opts) {
  const root = opts.project ? path.resolve(opts.project) : findProject();
  if (!root || !fs.existsSync(path.join(root, '.qa', 'config.json'))) fail('no QA project here: run /qa-init (or pass --project <dir>)');
  return root;
}
const rtmPath = root => path.join(root, '.qa', 'rtm.json');
function load(root) {
  return readJson(rtmPath(root), { schema: 1, requirements: {}, questions: {}, cases: {}, runs: [] });
}
const save = (root, rtm) => writeJson(rtmPath(root), rtm);
const normText = s => String(s).replace(/[*_`>|]/g, ' ').replace(/\\/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

function sectionIndex(root) {
  const cfg = readJson(path.join(root, '.qa', 'config.json'));
  const ver = cfg.fsd && cfg.fsd.current;
  if (!ver) return null;
  const idx = path.join(root, 'fsd', ver, 'index.json');
  if (!fs.existsSync(idx)) return null;
  const doc = readJson(idx);
  return { version: ver, dir: path.join(root, 'fsd', ver), byId: new Map(doc.sections.map(s => [s.id, s])) };
}

function listFiles(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(ext)).sort().map(f => path.join(dir, f));
}

function sync(root) {
  const rtm = load(root);
  const idx = sectionIndex(root);
  const errors = [];
  const seenReq = new Set();
  for (const file of listFiles(path.join(root, 'cards'), '.md')) {
    const rel = path.relative(root, file);
    const { meta, body } = splitFrontMatter(fs.readFileSync(file, 'utf8'));
    const e = m => errors.push(`${rel}: ${m}`);
    if (!/^REQ-\d{4}$/.test(meta.id || '')) { e('id must look like REQ-0001'); continue; }
    if (path.basename(file, '.md') !== meta.id) e(`file name must be ${meta.id}.md`);
    if (seenReq.has(meta.id)) { e(`duplicate id ${meta.id}`); continue; }
    for (const k of ['title', 'section', 'quote', 'slice']) if (!meta[k] || !String(meta[k]).trim()) e(`missing ${k}`);
    if (!RISK.includes(meta.risk)) e(`risk must be one of ${RISK.join(', ')}`);
    if (!body.trim()) e('body is empty: write the expected behaviour, rules and test hints');
    let sectionKey = null;
    if (idx && meta.section) {
      const sec = idx.byId.get(meta.section);
      if (!sec) e(`section ${meta.section} is not in fsd/${idx.version}/index.json`);
      else {
        sectionKey = sec.key;
        const secText = fs.readFileSync(path.join(idx.dir, sec.file), 'utf8');
        if (meta.quote && !normText(secText).includes(normText(meta.quote))) e(`quote not found word for word in ${meta.section} (${sec.title}). Copy it from the section; do not paraphrase.`);
      }
    }
    seenReq.add(meta.id);
    const prev = rtm.requirements[meta.id] || {};
    rtm.requirements[meta.id] = {
      id: meta.id, title: meta.title, section: meta.section, section_key: sectionKey || prev.section_key || null,
      ref: meta.ref || null, page: meta.page ?? null, slice: meta.slice, risk: meta.risk, quote: meta.quote,
      origin: meta.origin || 'fsd', status: prev.status === 'stale' && prev.section === meta.section && prev.quote === meta.quote ? 'stale' : 'active',
      file: rel.replace(/\\/g, '/'),
    };
  }
  for (const id of Object.keys(rtm.requirements)) if (!seenReq.has(id)) rtm.requirements[id].status = 'removed';

  const seenQ = new Set();
  for (const file of listFiles(path.join(root, 'questions'), '.md')) {
    const rel = path.relative(root, file);
    const { meta, body } = splitFrontMatter(fs.readFileSync(file, 'utf8'));
    if (!/^Q-\d{4}$/.test(meta.id || '')) { errors.push(`${rel}: id must look like Q-0001`); continue; }
    if (!['open', 'answered', 'withdrawn'].includes(meta.status)) errors.push(`${rel}: status must be open, answered or withdrawn`);
    if (!body.trim()) errors.push(`${rel}: the question text is empty`);
    if (meta.status === 'answered' && !String(meta.answer || '').trim()) errors.push(`${rel}: an answered question needs answer:`);
    seenQ.add(meta.id);
    rtm.questions[meta.id] = { id: meta.id, status: meta.status, section: meta.section || null, req: meta.req || null, asked_to: meta.asked_to || null, answer: meta.answer || null, text: body.trim().split(/\r?\n/)[0], file: rel.replace(/\\/g, '/') };
  }
  for (const id of Object.keys(rtm.questions)) if (!seenQ.has(id)) delete rtm.questions[id];

  const seenTc = new Set();
  for (const file of listFiles(path.join(root, 'cases'), '.json')) {
    const rel = path.relative(root, file);
    let list;
    try { list = readJson(file); } catch (err) { errors.push(`${rel}: ${err.message}`); continue; }
    if (!Array.isArray(list)) { errors.push(`${rel}: must be a JSON array of test cases`); continue; }
    list.forEach((c, i) => {
      const e = m => errors.push(`${rel}[${i}]${c && c.id ? ` ${c.id}` : ''}: ${m}`);
      if (!c || !/^TC-\d{4}-\d{2}$/.test(c.id || '')) return e('id must look like TC-0142-01');
      if (seenTc.has(c.id)) return e('duplicate id');
      const reqs = Array.isArray(c.req) ? c.req : [c.req].filter(Boolean);
      if (!reqs.length) e('req must list at least one REQ id');
      if (!reqs.includes(`REQ-${c.id.slice(3, 7)}`)) e(`the first four digits must match one of its requirements (REQ-${c.id.slice(3, 7)})`);
      for (const r of reqs) if (!rtm.requirements[r] || rtm.requirements[r].status === 'removed') e(`unknown or removed requirement ${r}`);
      if (!c.title) e('missing title');
      if (!TECHNIQUES.includes(c.technique)) e(`technique must be one of ${TECHNIQUES.join(', ')}`);
      if (!/^P[1-3]$/.test(c.priority || '')) e('priority must be P1, P2 or P3');
      if (!EXECUTION.includes(c.execution)) e(`execution must be one of ${EXECUTION.join(', ')}`);
      if (!Array.isArray(c.steps) || !c.steps.length || c.steps.some(s => !s || !String(s.action || '').trim())) e('steps must be a non-empty list of { action, expected? }');
      if (!String(c.expected || '').trim()) e('missing expected result');
      seenTc.add(c.id);
      const prev = rtm.cases[c.id] || {};
      const stale = reqs.some(r => rtm.requirements[r] && rtm.requirements[r].status === 'stale');
      rtm.cases[c.id] = { ...c, req: reqs, slice: path.basename(file, '.json'), file: rel.replace(/\\/g, '/'), status: stale ? 'stale' : 'active', script: c.script || prev.script || null };
    });
  }
  for (const id of Object.keys(rtm.cases)) if (!seenTc.has(id)) rtm.cases[id].status = 'removed';
  if (errors.length) fail(`sync found ${errors.length} problem(s); nothing was saved:\n  ${errors.join('\n  ')}`);
  save(root, rtm);
  return rtm;
}

function nextId(root, kind, req) {
  const rtm = load(root);
  const nums = (ids, re) => ids.map(i => re.exec(i)).filter(Boolean).map(m => Number(m[1]));
  const fileIds = (dir, re) => listFiles(path.join(root, dir), dir === 'cases' ? '.json' : (dir === 'bugs' ? '.json' : '.md')).map(f => path.basename(f).replace(/\.(md|json)$/, '')).filter(x => re.test(x));
  const next = list => (list.length ? Math.max(...list) : 0) + 1;
  const pad = (n, w) => String(n).padStart(w, '0');
  if (kind === 'req') return `REQ-${pad(next(nums([...Object.keys(rtm.requirements), ...fileIds('cards', /^REQ-\d{4}$/)], /^REQ-(\d{4})$/)), 4)}`;
  if (kind === 'q') return `Q-${pad(next(nums([...Object.keys(rtm.questions), ...fileIds('questions', /^Q-\d{4}$/)], /^Q-(\d{4})$/)), 4)}`;
  if (kind === 'bug') return `C-${pad(next(nums(fileIds('bugs', /^C-\d{4}$/), /^C-(\d{4})$/)), 4)}`;
  if (kind === 'tc') {
    if (!/^REQ-\d{4}$/.test(req || '')) fail('usage: next-id tc REQ-0142');
    const d = req.slice(4);
    const n = next(nums(Object.keys(rtm.cases), new RegExp(`^TC-${d}-(\\d{2})$`)));
    if (n > 99) fail(`${req} already has 99 test cases`);
    return `TC-${d}-${pad(n, 2)}`;
  }
  fail('usage: next-id req|q|bug | next-id tc REQ-0142');
}

function insideProject(root, p) {
  const abs = path.resolve(root, p);
  const rel = path.relative(root, abs);
  return !rel.startsWith('..') && !path.isAbsolute(rel) ? abs : null;
}

function record(root, opts) {
  const rtm = load(root);
  const tc = rtm.cases[opts.tc];
  if (!tc) fail(`unknown test case ${opts.tc}: run sync first`);
  if (tc.status === 'removed') fail(`${opts.tc} was removed from cases/`);
  if (tc.status === 'stale' && !opts.force) fail(`${opts.tc} is stale (its requirement changed in a new FSD version). Update the case, run sync, then record.`);
  const result = String(opts.result || '').toLowerCase();
  if (!RESULTS.includes(result)) fail(`--result must be one of ${RESULTS.join(', ')}`);
  const evidence = String(opts.evidence || '').split(',').map(s => s.trim()).filter(Boolean);
  if ((result === 'pass' || result === 'fail') && !evidence.length) fail(`a ${result} needs --evidence: a screenshot, log or trace file saved in the project. No evidence, no ${result}.`);
  for (const ev of evidence) {
    const abs = insideProject(root, ev);
    if (!abs) fail(`evidence must be inside the project folder: ${ev}`);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) fail(`evidence file not found: ${ev}`);
    if (fs.statSync(abs).size === 0) fail(`evidence file is empty: ${ev}`);
  }
  if ((result === 'blocked' || result === 'unclear') && !String(opts.note || '').trim()) fail(`a ${result} result needs --note explaining why`);
  const runId = `R-${String(rtm.runs.length + 1).padStart(4, '0')}`;
  const entry = { run: runId, tc: tc.id, result, evidence: evidence.map(e => e.replace(/\\/g, '/')), note: opts.note || null, build: opts.build || null, env: opts.env || null, by: opts.by || 'qa-orchestrator', at: new Date().toISOString() };
  rtm.runs.push(entry);
  save(root, rtm);
  return entry;
}

// Playwright JSON reporter -> RTM runs. The test title starts with the TC id. A result is
// recorded only with an attachment inside the project as evidence.
function importReplay(root, resultsFile, opts = {}) {
  const abs = path.resolve(root, resultsFile);
  const report = readJson(abs);
  const out = { recorded: [], skipped: [] };
  const walk = suite => {
    for (const spec of suite.specs || []) {
      const m = /^(TC-\d{4}-\d{2})\b/.exec(spec.title || '');
      if (!m) { out.skipped.push(`${spec.title}: title does not start with a TC id`); continue; }
      for (const t of spec.tests || []) {
        const r = (t.results || [])[(t.results || []).length - 1];
        if (!r || r.status === 'skipped') { out.skipped.push(`${m[1]}: skipped`); continue; }
        const result = r.status === 'passed' ? 'pass' : (r.status === 'failed' || r.status === 'timedOut') ? 'fail' : 'blocked';
        const evidence = (r.attachments || []).filter(a => a.path).map(a => path.relative(root, path.resolve(path.dirname(abs), a.path))).filter(p => !p.startsWith('..') && !path.isAbsolute(p));
        const project = t.projectName ? ` [${t.projectName}]` : '';
        const note = result === 'blocked' ? `replay status ${r.status}${project}` : (r.error && r.error.message ? String(r.error.message).split('\n')[0].slice(0, 300) + project : (project.trim() || null));
        try {
          const e = record(root, { tc: m[1], result, evidence: evidence.join(','), note, build: opts.build, env: opts.env, by: 'replay' });
          out.recorded.push(`${e.run} ${m[1]} ${result}${project}`);
        } catch (err) { out.skipped.push(`${m[1]}${project}: ${err.message}`); }
      }
    }
    for (const s of suite.suites || []) walk(s);
  };
  for (const s of report.suites || []) walk(s);
  return out;
}

function stale(root, deltaFile) {
  const delta = readJson(path.resolve(root, deltaFile));
  const keys = new Set([...(delta.changed || []), ...(delta.removed || [])].map(s => s.key));
  const rtm = load(root);
  const reqs = Object.values(rtm.requirements).filter(r => r.status === 'active' && r.section_key && keys.has(r.section_key));
  for (const r of reqs) r.status = 'stale';
  const ids = new Set(reqs.map(r => r.id));
  const cases = Object.values(rtm.cases).filter(c => c.status === 'active' && c.req.some(r => ids.has(r)));
  for (const c of cases) c.status = 'stale';
  save(root, rtm);
  return { requirements: reqs.map(r => r.id), cases: cases.map(c => c.id), added_sections: (delta.added || []).map(s => s.id) };
}

function latest(rtm) {
  const m = new Map();
  for (const r of rtm.runs) m.set(r.tc, r);
  return m;
}

function bugsOf(root) {
  return listFiles(path.join(root, 'bugs'), '.json').map(f => { try { return readJson(f); } catch { return null; } }).filter(Boolean);
}

function summary(root) {
  const rtm = load(root);
  const reqs = Object.values(rtm.requirements);
  const active = reqs.filter(r => r.status === 'active');
  const cases = Object.values(rtm.cases).filter(c => c.status !== 'removed');
  const last = latest(rtm);
  const covered = active.filter(r => cases.some(c => c.status === 'active' && c.req.includes(r.id)));
  const byResult = { pass: 0, fail: 0, blocked: 0, unclear: 0, not_run: 0 };
  for (const c of cases) byResult[last.get(c.id)?.result || 'not_run']++;
  const executed = cases.length - byResult.not_run;
  const bugs = bugsOf(root);
  const verdicts = {};
  for (const b of bugs) verdicts[b.verdict || 'unchecked'] = (verdicts[b.verdict || 'unchecked'] || 0) + 1;
  const validBySeverity = {};
  for (const b of bugs.filter(b => b.verdict === 'valid')) validBySeverity[b.severity || 'unset'] = (validBySeverity[b.severity || 'unset'] || 0) + 1;
  const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
  return {
    requirements: { active: active.length, stale: reqs.filter(r => r.status === 'stale').length, removed: reqs.filter(r => r.status === 'removed').length, covered: covered.length, coverage_pct: pct(covered.length, active.length) },
    cases: { total: cases.length, stale: cases.filter(c => c.status === 'stale').length, ...byResult, executed, executed_pct: pct(executed, cases.length), pass_pct_of_executed: pct(byResult.pass, executed) },
    runs: rtm.runs.length,
    bugs: { candidates: bugs.length, verdicts, valid_by_severity: validBySeverity, approved: bugs.filter(b => b.approved).length, filed: bugs.filter(b => b.ado_id).length },
    questions: { open: Object.values(rtm.questions).filter(q => q.status === 'open').length, answered: Object.values(rtm.questions).filter(q => q.status === 'answered').length },
  };
}

function gaps(root) {
  const rtm = load(root);
  const last = latest(rtm);
  const cases = Object.values(rtm.cases).filter(c => c.status === 'active');
  const bugs = bugsOf(root);
  return {
    requirements_without_cases: Object.values(rtm.requirements).filter(r => r.status === 'active' && !cases.some(c => c.req.includes(r.id))).map(r => r.id),
    cases_not_run: cases.filter(c => !last.has(c.id)).map(c => c.id),
    fails_without_candidate: cases.filter(c => last.get(c.id)?.result === 'fail' && !bugs.some(b => b.tc === c.id)).map(c => c.id),
    stale_cases: Object.values(rtm.cases).filter(c => c.status === 'stale').map(c => c.id),
    open_questions: Object.values(rtm.questions).filter(q => q.status === 'open').map(q => q.id),
  };
}

const stepsText = c => c.steps.map((s, i) => `${i + 1}. ${s.action}${s.expected ? ` -> ${s.expected}` : ''}`).join('\n');

function caseRow(c, last, bugs) {
  return [c.id, c.req.join(', '), c.title, c.technique, c.priority, c.execution, c.preconditions || '', c.data || '', stepsText(c), c.expected, last.get(c.id)?.result || 'not run', bugs.filter(b => b.tc === c.id).map(b => b.ado_id ? `ADO ${b.ado_id}` : b.id).join(', '), c.status];
}
const CASE_COLUMNS = [['Test case', 14], ['Requirements', 16], ['Title', 40], ['Technique', 18], ['Priority', 9], ['Execution', 11], ['Preconditions', 30], ['Test data', 24], ['Steps', 60], ['Expected result', 40], ['Latest result', 12], ['Bugs', 16], ['Status', 10]];

function exportXlsx(root, out) {
  const rtm = load(root);
  const cfg = readJson(path.join(root, '.qa', 'config.json'));
  const last = latest(rtm);
  const bugs = bugsOf(root);
  const cases = Object.values(rtm.cases).filter(c => c.status !== 'removed');
  const reqRows = Object.values(rtm.requirements).filter(r => r.status !== 'removed').map(r => {
    const rc = cases.filter(c => c.req.includes(r.id));
    const res = rc.map(c => last.get(c.id)?.result || 'not run');
    const overall = !rc.length ? 'no cases' : res.includes('fail') ? 'fail' : res.includes('blocked') ? 'blocked' : res.every(x => x === 'pass') ? 'pass' : 'in progress';
    return [r.id, r.title, `${r.section}${r.ref ? ` (${r.ref})` : ''}${r.page != null ? `, p. ${r.page}` : ''}`, r.quote, r.slice, r.risk, rc.map(c => c.id).join(', '), overall, bugs.filter(b => b.req === r.id && b.verdict === 'valid').map(b => b.ado_id ? `ADO ${b.ado_id}` : b.id).join(', '), r.status];
  });
  const buf = xlsx.writeWorkbook([
    { name: 'RTM', columns: [['Requirement', 13], ['Title', 36], ['Source', 22], ['Source quote', 60], ['Slice', 16], ['Risk', 8], ['Test cases', 28], ['Result', 12], ['Valid bugs', 16], ['Status', 10]].map(([header, width]) => ({ header, width })), rows: reqRows },
    { name: 'Test cases', columns: CASE_COLUMNS.map(([header, width]) => ({ header, width })), rows: cases.map(c => caseRow(c, last, bugs)) },
    { name: 'Runs', columns: [['Run', 9], ['Test case', 14], ['Result', 10], ['Evidence', 50], ['Note', 40], ['Build', 12], ['Environment', 14], ['At (UTC)', 22]].map(([header, width]) => ({ header, width })), rows: rtm.runs.map(r => [r.run, r.tc, r.result, r.evidence.join('\n'), r.note || '', r.build || '', r.env || '', r.at]) },
    { name: 'Questions', columns: [['Question', 10], ['Status', 10], ['Section', 10], ['Requirement', 13], ['Question text', 60], ['Answer', 50]].map(([header, width]) => ({ header, width })), rows: Object.values(rtm.questions).map(q => [q.id, q.status, q.section || '', q.req || '', q.text, q.answer || '']) },
  ], { rtl: cfg.language === 'ar' });
  const dest = path.resolve(root, out || 'deliverables/rtm.xlsx');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return dest;
}

function exportCases(root, opts) {
  const rtm = load(root);
  const last = latest(rtm);
  const bugs = bugsOf(root);
  const cases = Object.values(rtm.cases).filter(c => c.status !== 'removed' && (!opts.slice || c.slice === opts.slice));
  if (!cases.length) fail(`no test cases${opts.slice ? ` in slice ${opts.slice}` : ''}`);
  const rows = cases.map(c => caseRow(c, last, bugs));
  const dest = path.resolve(root, opts.out || fail('--out is required'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (opts.template) {
    const cols = opts.columns ? String(opts.columns).split(',').map(Number) : null;
    const shaped = cols ? rows.map(r => cols.map(i => r[i])) : rows;
    fs.writeFileSync(dest, xlsx.fillTemplate(fs.readFileSync(path.resolve(root, opts.template)), { sheet: opts.sheet || null, headerRow: Number(opts['header-row'] || 1), rows: shaped }));
  } else {
    fs.writeFileSync(dest, xlsx.writeWorkbook([{ name: 'Test cases', columns: CASE_COLUMNS.map(([header, width]) => ({ header, width })), rows }]));
  }
  return dest;
}

function main() {
  const { _: [cmd, ...pos], ...opts } = parseArgs(process.argv.slice(2));
  if (!cmd) fail('usage: qa-rtm.cjs sync | next-id <kind> [REQ] | record ... | stale --delta f | summary [--json] | gaps | export | export-cases', 2);
  const root = project(opts);
  switch (cmd) {
    case 'sync': {
      const r = sync(root);
      const s = summary(root);
      console.log(`synced: ${s.requirements.active} active requirements (${s.requirements.stale} stale), ${s.cases.total} cases, ${Object.keys(r.questions).length} questions`);
      break;
    }
    case 'next-id': console.log(nextId(root, pos[0], pos[1])); break;
    case 'record': { const e = record(root, opts); console.log(`${e.run} ${e.tc} ${e.result}${e.evidence.length ? ` evidence: ${e.evidence.join(', ')}` : ''}`); break; }
    case 'stale': { const r = stale(root, opts.delta || fail('--delta <file> is required')); console.log(JSON.stringify(r, null, 2)); break; }
    case 'import-replay': {
      const r = importReplay(root, pos[0] || fail('usage: import-replay <results.json> [--build x] [--env UAT]'), opts);
      for (const l of r.recorded) console.log(`recorded ${l}`);
      for (const l of r.skipped) console.log(`not recorded: ${l}`);
      break;
    }
    case 'summary': {
      const s = summary(root);
      if (opts.json) { console.log(JSON.stringify(s, null, 2)); break; }
      console.log(`Requirements: ${s.requirements.active} active, ${s.requirements.covered} covered (${s.requirements.coverage_pct ?? '-'}%), ${s.requirements.stale} stale`);
      console.log(`Cases: ${s.cases.total} (pass ${s.cases.pass}, fail ${s.cases.fail}, blocked ${s.cases.blocked}, unclear ${s.cases.unclear}, not run ${s.cases.not_run}); executed ${s.cases.executed_pct ?? '-'}%`);
      console.log(`Bug candidates: ${s.bugs.candidates}; verdicts ${JSON.stringify(s.bugs.verdicts)}; approved ${s.bugs.approved}; filed ${s.bugs.filed}`);
      console.log(`Questions: ${s.questions.open} open, ${s.questions.answered} answered`);
      break;
    }
    case 'gaps': console.log(JSON.stringify(gaps(root), null, 2)); break;
    case 'export': console.log(`wrote ${exportXlsx(root, opts.out)}`); break;
    case 'export-cases': console.log(`wrote ${exportCases(root, opts)}`); break;
    default: fail(`unknown command ${cmd}`, 2);
  }
}

if (require.main === module) run(main);
module.exports = { sync, nextId, record, importReplay, stale, summary, gaps, exportXlsx, exportCases, load, TECHNIQUES, EXECUTION };
