'use strict';
// Guard rules for the QA orchestrator's PreToolUse hook. Pure functions: (input, project) -> decision.
// A decision is null (allow) or { decision: 'deny' | 'ask', reason }.
const fs = require('fs');
const path = require('path');
const { findProject, readJson } = require('./cli.cjs');

const NAV_TOOL = /(navigate|new_page|tabs_create)/i;
const ADO_TOOL = /^mcp__ado__/;
const BUG_WRITE_TOOL = /wit_work_item_write|create_work_item|wit_create/i;
const APPROVAL_FIELDS = ['approved', 'approved_by', 'approved_at', 'approved_hash', 'verdict', 'gates', 'ado_id'];
const TEST_CARDS = new Set(['4111111111111111', '4242424242424242', '5555555555554444', '5105105105105100', '378282246310005', '4000056655665556', '4012888888881881', '6011111111111117']);

function projectFor(input) {
  const ti = input.tool_input || {};
  const fromFile = ti.file_path ? findProject(path.dirname(path.resolve(input.cwd || process.cwd(), ti.file_path))) : null;
  const root = fromFile || findProject(input.cwd || process.cwd());
  if (!root) return null;
  return { root, cfg: readJson(path.join(root, '.qa', 'config.json')) };
}

const inside = (root, file) => {
  const rel = path.relative(root, path.resolve(file));
  return !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.replace(/\\/g, '/') : null;
};

// ---------------------------------------------------------------- browser navigation
function hostAllowed(host, pattern) {
  const p = pattern.toLowerCase();
  if (p.startsWith('*.')) return host.endsWith(p.slice(1)) || host === p.slice(2);
  return host === p;
}

function checkNavigation(input, proj) {
  if (!proj) return null;
  const ti = input.tool_input || {};
  const raw = ti.url || ti.uri;
  if (!raw || /^(back|forward|reload)$/i.test(raw)) return null;
  let u;
  try { u = new URL(raw); } catch { return { decision: 'deny', reason: `QA URL guard: "${raw}" is not a valid absolute URL` }; }
  if (u.protocol === 'about:' && u.href === 'about:blank') return null;
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { decision: 'deny', reason: `QA URL guard: ${u.protocol} URLs are not allowed in a QA session` };
  const envs = proj.cfg.environments || [];
  const env = envs.find(e => { try { const b = new URL(e.base_url); return b.host === u.host && b.protocol === u.protocol; } catch { return false; } });
  if (env) {
    if (env.kind === 'production' && !proj.cfg.allow_production) {
      return { decision: 'deny', reason: `QA URL guard: ${env.name} is a production environment and .qa/config.json has allow_production: false. A human sets it to true for a named, read-only check.` };
    }
    return null;
  }
  if ((proj.cfg.extra_allowed_hosts || []).some(h => hostAllowed(u.hostname.toLowerCase(), h))) return null;
  const list = envs.map(e => `${e.name} ${e.base_url}`).join(', ') || '(none configured)';
  return { decision: 'deny', reason: `QA URL guard: ${u.host} is not a test environment of this project. Allowed: ${list}. To add one, a human edits environments or extra_allowed_hosts in .qa/config.json.` };
}

// ---------------------------------------------------------------- personal data
function luhn(d) {
  let sum = 0; let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}
function ibanValid(s) {
  const v = s.replace(/\s+/g, '').toUpperCase();
  if (v.length < 15 || v.length > 34) return false;
  const r = (v.slice(4) + v.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let m = 0;
  for (const ch of r) m = (m * 10 + Number(ch)) % 97;
  return m === 1;
}
const mask = s => (s.length <= 6 ? '***' : `${s.slice(0, 2)}***${s.slice(-2)}`);

function findPii(text, cfg) {
  const pii = cfg.pii || {};
  const allowDomains = (pii.allow_domains || []).map(d => d.toLowerCase());
  const markers = (pii.synthetic_markers || []).map(m => String(m).toLowerCase()).filter(Boolean);
  const synthetic = v => markers.some(m => v.toLowerCase().includes(m));
  const hits = [];
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})/g)) {
    const dom = m[1].toLowerCase();
    if (allowDomains.some(d => dom === d || dom.endsWith('.' + d)) || synthetic(m[0])) continue;
    hits.push(`email ${mask(m[0])}`);
  }
  for (const m of text.matchAll(/(?<![\w-])(?:\d[ -]?){12,18}\d(?![\w-])/g)) {
    const d = m[0].replace(/[ -]/g, '');
    if (d.length < 13 || d.length > 19 || /^(\d)\1+$/.test(d) || TEST_CARDS.has(d) || synthetic(m[0])) continue;
    if (luhn(d)) hits.push(`card number ${mask(d)}`);
  }
  for (const m of text.matchAll(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g)) {
    if (ibanValid(m[0]) && !synthetic(m[0])) hits.push(`IBAN ${mask(m[0].replace(/\s/g, ''))}`);
  }
  // Country codes start with 1-9, so "00" + "0..." is not an international number.
  for (const m of text.matchAll(/(?<![\w])(?:\+|00)[1-9]\d{0,2}[ -]?(?:\(?\d{1,4}\)?[ -]?){2,5}\d{2,4}(?![\w])/g)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 9 && digits.length <= 15 && !/^(\d)\1+$/.test(digits) && !synthetic(m[0])) hits.push(`phone ${mask(digits)}`);
  }
  for (const p of pii.extra_patterns || []) {
    let re;
    try { re = new RegExp(p.regex, (p.flags || '').replace(/g/g, '') + 'g'); } catch { continue; }
    for (const m of text.matchAll(re)) if (!synthetic(m[0])) hits.push(`${p.name || 'pattern'} ${mask(m[0])}`);
  }
  return hits;
}

// ---------------------------------------------------------------- project files
function checkWrite(input, proj) {
  if (!proj) return null;
  const ti = input.tool_input || {};
  const file = path.resolve(input.cwd || process.cwd(), ti.file_path || '');
  const rel = inside(proj.root, file);
  if (!rel) return null;
  if (rel === '.qa/rtm.json') return { decision: 'deny', reason: 'QA file guard: .qa/rtm.json is written only by qa-rtm.cjs (sync, record, stale). Edit the cards/, questions/ or cases/ files and run sync.' };
  if (/^bugs\/C-\d{4}\.json$/.test(rel)) {
    if (input.tool_name === 'Edit' || input.tool_name === 'MultiEdit') {
      const edits = ti.edits || [{ old_string: ti.old_string, new_string: ti.new_string }];
      const touched = APPROVAL_FIELDS.filter(f => edits.some(e => new RegExp(`"${f}"\\s*:`).test(`${e.old_string || ''}${e.new_string || ''}`)));
      if (touched.length) return { decision: 'deny', reason: `QA file guard: ${touched.join(', ')} in ${rel} are set only by qa-bugs.cjs (check, approve, filed). Edit the other fields.` };
    } else {
      let next;
      try { next = JSON.parse(ti.content || ''); } catch { return { decision: 'deny', reason: `QA file guard: ${rel} must be valid JSON` }; }
      let prev = {};
      if (fs.existsSync(file)) { try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { prev = {}; } }
      const changed = APPROVAL_FIELDS.filter(f => JSON.stringify(prev[f] ?? null) !== JSON.stringify(next[f] ?? null) && !(f === 'gates' && prev[f] === undefined && JSON.stringify(next[f]) === '{}') && !(f === 'verdict' && prev[f] === undefined && next[f] === 'unchecked') && !(f === 'approved' && prev[f] === undefined && next[f] === false));
      if (changed.length) return { decision: 'deny', reason: `QA file guard: ${changed.join(', ')} in ${rel} are set only by qa-bugs.cjs. Keep their current values when you rewrite the file.` };
    }
  }
  const dc = String(proj.cfg.data_class || 'D0').toUpperCase();
  if (dc !== 'D0' && !rel.startsWith('source/') && !rel.startsWith('.qa/')) {
    const text = ti.content ?? (ti.edits ? ti.edits.map(e => e.new_string).join('\n') : ti.new_string) ?? '';
    const hits = findPii(String(text), proj.cfg);
    if (hits.length) return { decision: 'deny', reason: `QA PII guard (data class ${dc}): ${rel} would contain personal data: ${[...new Set(hits)].slice(0, 5).join('; ')}. Mask it (for example ***1234) or use a synthetic value. If it is synthetic, add a marker to pii.synthetic_markers in .qa/config.json.` };
  }
  return null;
}

// ---------------------------------------------------------------- tester approval
function checkShell(input, proj) {
  const cmd = String((input.tool_input || {}).command || '');
  const m = /qa-bugs\.cjs["']?\s+approve\s+(C-\d{4})/.exec(cmd);
  if (m) return { decision: 'ask', reason: `QA approval hook: approving ${m[1]} needs the tester's own confirmation. Approve only after you read the bug report (qa-bugs.cjs render ${m[1]}) and agree it is a valid bug. If this message came back as a tool result, nobody confirmed it: the command did not run.` };
  if (proj && /(^|[\s;&|"'/\\])(rm|del|Remove-Item|rmdir)\b[^\n]*(\.qa|evidence|bugs)\b/i.test(cmd)) {
    return { decision: 'ask', reason: 'QA hook: this command deletes QA records (.qa, evidence or bugs) and needs the tester\'s confirmation. If this message came back as a tool result, the command did not run.' };
  }
  return null;
}

// ---------------------------------------------------------------- Azure DevOps filing
function checkAdo(input, proj) {
  if (!BUG_WRITE_TOOL.test(input.tool_name)) return null;
  const s = JSON.stringify(input.tool_input || {});
  const isBug = /"(?:workItemType|type|System\.WorkItemType)"\s*:\s*"Bug"/i.test(s) || /Microsoft\.VSTS\.TCM\.ReproSteps/.test(s);
  if (!isBug) return null;
  if (!proj) return { decision: 'deny', reason: 'QA ADO guard: bugs are filed only from a QA project folder (none found)' };
  const m = /QA-ID:\s*(C-\d{4})/.exec(s);
  if (!m) return { decision: 'deny', reason: 'QA ADO guard: a bug is filed only from an approved candidate. Use the payload from `qa-bugs.cjs render C-#### --format ado`; it carries the QA-ID marker.' };
  const B = require('../qa-bugs.cjs');
  let b;
  try { b = B.check(proj.root, m[1]); } catch (e) { return { decision: 'deny', reason: `QA ADO guard: ${m[1]}: ${e.message}` }; }
  if (b.verdict !== 'valid') return { decision: 'deny', reason: `QA ADO guard: ${m[1]} is ${b.verdict}, not valid` };
  if (!b.approved) return { decision: 'deny', reason: `QA ADO guard: ${m[1]} is not approved by the tester${b.approval_note ? ` (${b.approval_note})` : ''}` };
  if (b.ado_id) return { decision: 'deny', reason: `QA ADO guard: ${m[1]} is already filed as ADO ${b.ado_id}` };
  return null;
}

function decide(input) {
  const name = String(input.tool_name || '');
  let proj = null;
  try { proj = projectFor(input); } catch (e) { return { decision: 'deny', reason: `QA guard: cannot read the project config: ${e.message}` }; }
  if (name === 'Write' || name === 'Edit' || name === 'MultiEdit') return checkWrite(input, proj);
  if (name === 'Bash' || name === 'PowerShell') return checkShell(input, proj);
  if (ADO_TOOL.test(name)) return checkAdo(input, proj);
  if (name.startsWith('mcp__') && NAV_TOOL.test(name)) return checkNavigation(input, proj);
  return null;
}

module.exports = { decide, findPii, luhn, ibanValid, checkNavigation, checkWrite, checkShell, checkAdo };
