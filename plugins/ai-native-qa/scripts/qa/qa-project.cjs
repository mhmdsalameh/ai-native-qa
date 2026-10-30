#!/usr/bin/env node
'use strict';
// QA project folder: scaffold and status.
//
//   node qa-project.cjs init <dir> --name "Online Banking R3" --client "Bank X"
//        [--language en|ar|en+ar] [--data-class D0|D1|D2|D3]
//        [--env "UAT=https://uat.bank.test,SIT=https://sit.bank.test"] [--allow-hosts login.microsoftonline.com]
//        [--templates <folder with company .docx/.xlsx>] [--ado-org <org> --ado-project <project>]
//   node qa-project.cjs status [--project <dir>] [--json]
//
// init never overwrites an existing file.
const fs = require('fs');
const path = require('path');
const { parseArgs, fail, run, findProject, readJson, writeJson } = require('./lib/cli.cjs');
const { defaultTemplate } = require('./lib/docx.cjs');

const DATA_CLASSES = {
  D0: 'synthetic test data only',
  D1: 'masked copy of production data',
  D2: 'real customer data in a test environment',
  D3: 'production system',
};
const LANGS = ['en', 'ar', 'en+ar'];
const DIRS = ['source', 'fsd', 'cards', 'questions', 'cases', 'scripts', 'evidence', 'bugs', 'deliverables', 'templates', 'notes'];
const TEMPLATE_KEYS = ['fsd', 'test-plan', 'manual', 'summary-report', 'bug-report', 'exploratory-report', 'check-report'];
// The desktop app has no --agent switch; the project's `agent` setting starts every session here
// as the orchestrator, so its hooks run on every surface that reads settings files.
const AGENT = 'qa-orchestrator';

const SEVERITY = {
  Critical: 'Data loss, security breach, money or legal impact, or the main flow is unusable with no workaround',
  High: 'A requirement fails in a main flow, or a wrong business result, and the workaround is hard',
  Medium: 'A requirement fails in a secondary flow, or a main flow has an easy workaround',
  Low: 'Cosmetic, wording or layout issue that does not change the result',
};

function parseEnvs(s) {
  if (!s) return [];
  return String(s).split(',').map(x => x.trim()).filter(Boolean).map(pair => {
    const m = /^([^=]+)=(https?:\/\/\S+)$/.exec(pair);
    if (!m) fail(`--env entries look like NAME=https://host: got "${pair}"`);
    let u;
    try { u = new URL(m[2]); } catch { fail(`invalid URL in --env: ${m[2]}`); }
    const name = m[1].trim();
    return { name, base_url: u.origin, kind: /prod/i.test(name) ? 'production' : /uat/i.test(name) ? 'uat' : 'test', read_only: /prod/i.test(name) };
  });
}

function writeIfMissing(file, content, made) {
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  made.push(file);
}

function init(dir, opts) {
  if (!dir) fail('usage: qa-project.cjs init <dir> --name <project> --client <client>', 2);
  const root = path.resolve(dir);
  const lang = opts.language || 'en';
  if (!LANGS.includes(lang)) fail(`--language must be one of ${LANGS.join(', ')}`);
  const dc = (opts['data-class'] || 'D0').toUpperCase();
  if (!DATA_CLASSES[dc]) fail(`--data-class must be one of ${Object.keys(DATA_CLASSES).join(', ')}`);
  const envs = parseEnvs(opts.env);
  const made = [];
  for (const d of DIRS) fs.mkdirSync(path.join(root, d), { recursive: true });
  const templates = {};
  const src = opts.templates ? path.resolve(opts.templates) : null;
  if (src && !fs.existsSync(src)) fail(`templates folder not found: ${src}`);
  if (src) for (const f of fs.readdirSync(src).filter(f => /\.(docx|xlsx)$/i.test(f))) {
    writeIfMissing(path.join(root, 'templates', f), fs.readFileSync(path.join(src, f)), made);
  }
  for (const k of TEMPLATE_KEYS) {
    const company = src && fs.readdirSync(path.join(root, 'templates')).find(f => f.toLowerCase().replace(/[\s_]+/g, '-').startsWith(k) && f.endsWith('.docx'));
    const file = company || `${k}.docx`;
    if (!company) writeIfMissing(path.join(root, 'templates', file), defaultTemplate(), made);
    templates[k] = `templates/${file}`;
  }
  const cfg = {
    schema: 1,
    project: opts.name || path.basename(root),
    client: opts.client || '',
    language: lang,
    data_class: dc,
    data_class_meaning: DATA_CLASSES[dc],
    environments: envs,
    extra_allowed_hosts: String(opts['allow-hosts'] || '').split(',').map(s => s.trim()).filter(Boolean),
    allow_production: false,
    fsd: { current: null },
    ado: { organization: opts['ado-org'] || '', project: opts['ado-project'] || '', area_path: '', bug_type: 'Bug' },
    severity_matrix: SEVERITY,
    templates,
    pii: { allow_domains: ['example.com', 'example.org', 'example.net', 'test', 'invalid', 'localhost'], synthetic_markers: [], extra_patterns: [] },
  };
  const cfgFile = path.join(root, '.qa', 'config.json');
  if (!fs.existsSync(cfgFile)) { writeJson(cfgFile, cfg); made.push(cfgFile); }
  writeIfMissing(path.join(root, '.qa', 'rtm.json'), JSON.stringify({ schema: 1, requirements: {}, questions: {}, cases: {}, runs: [] }, null, 2) + '\n', made);
  if (cfg.ado.organization) {
    writeIfMissing(path.join(root, '.mcp.json'), JSON.stringify({ mcpServers: { ado: { type: 'stdio', command: 'npx', args: ['-y', '@azure-devops/mcp', cfg.ado.organization, '-d', 'core', 'work', 'work-items', 'search', 'test-plans'] } } }, null, 2) + '\n', made);
  }
  const notes = [];
  const settingsFile = path.join(root, '.claude', 'settings.json');
  if (fs.existsSync(settingsFile)) {
    let agent;
    try { agent = JSON.parse(fs.readFileSync(settingsFile, 'utf8')).agent; } catch (e) { agent = null; notes.push(`.claude/settings.json is not valid JSON (${e.message}): fix it, then add "agent": "${AGENT}"`); }
    if (agent === undefined) notes.push(`.claude/settings.json has no "agent" key: add "agent": "${AGENT}" so sessions here start as the orchestrator`);
    else if (agent && agent !== AGENT && !agent.endsWith(`:${AGENT}`)) notes.push(`.claude/settings.json sets "agent": "${agent}", so sessions here do not start as ${AGENT}; the plugin's hooks still guard this folder`);
  } else {
    writeIfMissing(settingsFile, JSON.stringify({ agent: AGENT }, null, 2) + '\n', made);
    if (fs.existsSync(path.join(root, '.git'))) notes.push(`this folder is a git repository root: once .claude/settings.json is committed, everyone who opens it starts as ${AGENT}. If developers work here too, move "agent" to .claude/settings.local.json`);
  }
  writeIfMissing(path.join(root, 'STATE.md'), `# STATE.md — ${cfg.project}\n\n## Verified facts\n\n## General rules\n\n## Open failures\n\n## Lessons learned\n\n## Last session\n`, made);
  writeIfMissing(path.join(root, 'README.md'),
    `# ${cfg.project}\n\nQA project folder managed by the ai-native-qa harness. Start a session in this folder (CLI, IDE or the desktop app's Code tab) and run \`/qa\`; \`.claude/settings.json\` starts it as the qa-orchestrator agent.\n\n` +
    '| Folder | Holds |\n| --- | --- |\n| source/ | The documents you received (FSD, BRD, designs) |\n| fsd/<version>/ | The split document: index.md and one file per section |\n| cards/ | One requirement card per testable rule (REQ-0001.md) |\n| questions/ | Questions for the BA (Q-0001.md) |\n| cases/ | Test cases per feature slice (<slice>.json) |\n| scripts/ | Saved replay scripts (Playwright) |\n| evidence/ | Screenshots, logs and traces, by test case and run |\n| bugs/ | Bug candidates and their five checks (C-0001.json) |\n| deliverables/ | Generated Word and Excel files |\n| templates/ | Company or client templates |\n| .qa/ | config.json and rtm.json (the RTM). Do not edit rtm.json by hand |\n', made);
  return { root, made, notes };
}

function status(root) {
  const cfg = readJson(path.join(root, '.qa', 'config.json'));
  const count = (d, re) => (fs.existsSync(path.join(root, d)) ? fs.readdirSync(path.join(root, d)).filter(f => re.test(f)).length : 0);
  const rtm = readJson(path.join(root, '.qa', 'rtm.json'), { runs: [], cases: {} });
  const facts = {
    sources: count('source', /\.(docx|pdf|md|txt)$/i),
    fsd_version: cfg.fsd?.current || null,
    cards: count('cards', /^REQ-\d{4}\.md$/),
    questions: count('questions', /^Q-\d{4}\.md$/),
    case_files: count('cases', /\.json$/),
    cases: Object.keys(rtm.cases || {}).length,
    runs: (rtm.runs || []).length,
    bug_candidates: count('bugs', /^C-\d{4}\.json$/),
    deliverables: count('deliverables', /\.(docx|xlsx)$/i),
  };
  let next;
  if (!facts.sources && !facts.fsd_version) next = 'Put the FSD/BRD in source/ (or note that only the running app exists), then run /qa-ingest';
  else if (!facts.fsd_version) next = '/qa-ingest: split the document and set fsd.current';
  else if (!facts.cards) next = '/qa-ingest: extract requirement cards, one section per call';
  else if (!facts.cases) next = '/qa-plan, then /qa-cases for the first slice';
  else if (!facts.runs) next = '/qa-run for the first slice';
  else next = '/qa-gate for failed steps, /qa-report when the exit criteria are met';
  return { project: cfg.project, client: cfg.client, language: cfg.language, data_class: cfg.data_class, environments: cfg.environments.map(e => `${e.name} ${e.base_url}${e.read_only ? ' (read-only)' : ''}`), ...facts, next };
}

// Replay setup: package.json + playwright.config.js. Each run writes into its own folder
// (QA_RUN), because Playwright empties its output folder at the start of a run and the RTM's
// evidence paths must stay valid.
const PLAYWRIGHT_VERSION = '1.64.1';
function setupReplay(root, opts) {
  const cfg = readJson(path.join(root, '.qa', 'config.json'));
  const name = opts.env || (cfg.environments[0] && cfg.environments[0].name);
  if (!name || !cfg.environments.some(e => e.name === name)) fail(`--env must name an environment in .qa/config.json (${cfg.environments.map(e => e.name).join(', ') || 'none configured'})`);
  const made = [];
  writeIfMissing(path.join(root, 'package.json'), JSON.stringify({ name: 'qa-replay', private: true, scripts: { replay: 'playwright test' }, devDependencies: { '@playwright/test': PLAYWRIGHT_VERSION } }, null, 2) + '\n', made);
  writeIfMissing(path.join(root, 'playwright.config.js'), `// Generated by qa-project.cjs setup-replay. The base URL comes from .qa/config.json.
// Run: QA_RUN=<run-name> npx playwright test   (QA_ENV=<name> to pick another environment)
const { defineConfig } = require('@playwright/test');
const cfg = require('./.qa/config.json');
const run = process.env.QA_RUN;
if (!run || !/^[\\w.-]+$/.test(run)) throw new Error('Set QA_RUN to a run name (letters, digits, . _ -), for example QA_RUN=r1-2.4.2');
const envName = process.env.QA_ENV || ${JSON.stringify(name)};
const env = cfg.environments.find(e => e.name === envName);
if (!env) throw new Error('QA_ENV ' + envName + ' is not in .qa/config.json');
if (env.kind === 'production' && !cfg.allow_production) throw new Error(envName + ' is production and allow_production is false');
module.exports = defineConfig({
  testDir: './scripts',
  testMatch: /TC-\\d{4}-\\d{2}.*\\.spec\\.js$/,
  outputDir: \`./evidence/replay/\${run}/artifacts\`,
  reporter: [['json', { outputFile: \`evidence/replay/\${run}/results.json\` }], ['list']],
  retries: 0,
  use: { baseURL: env.base_url, screenshot: 'on', trace: 'retain-on-failure' },
});
`, made);
  writeIfMissing(path.join(root, '.gitignore'), 'node_modules/\n', made);
  return made;
}

function main() {
  const { _: [cmd, ...pos], ...opts } = parseArgs(process.argv.slice(2));
  if (cmd === 'setup-replay') {
    const root = opts.project ? path.resolve(opts.project) : findProject();
    if (!root) fail('no QA project here: run /qa-init');
    const made = setupReplay(root, opts);
    for (const f of made) console.log(`created ${path.relative(root, f)}`);
    console.log(made.length ? `next: run \`npm install\` in ${root} (downloads @playwright/test ${PLAYWRIGHT_VERSION}), then QA_RUN=r1 npx playwright test` : 'nothing created: files already exist');
    return;
  }
  if (cmd === 'init') {
    const r = init(pos[0], opts);
    console.log(`QA project at ${r.root}`);
    for (const f of r.made) console.log(`created ${path.relative(r.root, f)}`);
    if (!r.made.length) console.log('nothing created: every file already existed');
    for (const n of r.notes) console.log(`check: ${n}`);
  } else if (cmd === 'status') {
    const root = opts.project ? path.resolve(opts.project) : findProject();
    if (!root) fail('no QA project here: run /qa-init');
    const s = status(root);
    if (opts.json) console.log(JSON.stringify(s, null, 2));
    else for (const [k, v] of Object.entries(s)) console.log(`${k}: ${Array.isArray(v) ? v.join('; ') || '(none)' : v ?? '(none)'}`);
  } else fail('usage: qa-project.cjs init <dir> --name ... | status [--json] | setup-replay [--env UAT]', 2);
}

if (require.main === module) run(main);
module.exports = { init, status, setupReplay, DATA_CLASSES, SEVERITY };
