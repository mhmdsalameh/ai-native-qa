'use strict';
// Consistency of the QA harness's instruction files with its scripts: every command, script
// subcommand, skill, reference and template that a file names must exist.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { splitFrontMatter } = require('../lib/md.cjs');

const HOME = path.join(__dirname, '..', '..', '..');
const read = p => fs.readFileSync(p, 'utf8');
const ls = (dir, re) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => re.test(f)) : []);

const skillDirs = ls(path.join(HOME, 'skills'), /^qa-/);
const commands = ls(path.join(HOME, 'commands'), /^qa(-[\w-]+)?\.md$/);
const agents = ls(path.join(HOME, 'agents'), /^qa-[\w-]+\.md$/);
const files = [
  ...skillDirs.flatMap(d => {
    const base = path.join(HOME, 'skills', d);
    const out = [path.join(base, 'SKILL.md')];
    for (const sub of ['references', 'templates']) for (const f of ls(path.join(base, sub), /\.md$/)) out.push(path.join(base, sub, f));
    return out;
  }),
  ...commands.map(f => path.join(HOME, 'commands', f)),
  ...agents.map(f => path.join(HOME, 'agents', f)),
];

test('the harness has its skills, commands and agents', () => {
  for (const s of ['qa-lifecycle', 'qa-requirements', 'qa-test-design', 'qa-test-types', 'qa-execution', 'qa-validity-gate', 'qa-documents', 'qa-data-handling']) assert.ok(skillDirs.includes(s), `missing skill ${s}`);
  for (const c of ['qa', 'qa-init', 'qa-ingest', 'qa-analyze', 'qa-plan', 'qa-cases', 'qa-run', 'qa-gate', 'qa-explore', 'qa-check', 'qa-manual', 'qa-report', 'qa-delta']) assert.ok(commands.includes(`${c}.md`), `missing command ${c}`);
  for (const a of ['qa-orchestrator.md', 'qa-reviewer.md']) assert.ok(agents.includes(a), `missing agent ${a}`);
});

test('skills: name matches folder, description says when to use, body under 500 lines', () => {
  for (const d of skillDirs) {
    const { meta, body } = splitFrontMatter(read(path.join(HOME, 'skills', d, 'SKILL.md')));
    assert.strictEqual(meta.name, d);
    assert.ok(meta.description && meta.description.length <= 1024, `${d}: description missing or over 1024 chars`);
    assert.doesNotMatch(meta.description, /[<>]/, `${d}: claude.ai rejects XML tags in a skill description; write the placeholder in words`);
    assert.match(meta.description, /\bUse (at|in|during|when|whenever)\b/, `${d}: description must say when to use it`);
    assert.ok(body.split('\n').length < 500, `${d}: SKILL.md over 500 lines`);
  }
  for (const c of commands) {
    const { description } = splitFrontMatter(read(path.join(HOME, 'commands', c))).meta;
    assert.ok(description, `${c}: no description`);
    assert.doesNotMatch(description, /[<>]/, `${c}: chat loads a command as a skill, and claude.ai rejects XML tags in its description`);
  }
});

test('every /qa-* command, qa-* skill, reference and template that a file names exists', () => {
  const problems = [];
  for (const f of files) {
    const t = read(f);
    const rel = path.relative(HOME, f);
    for (const m of t.matchAll(/(?<![\w/.~-])\/(qa(?:-[a-z]+)*)\b/g)) if (!commands.includes(`${m[1]}.md`)) problems.push(`${rel}: /${m[1]}`);
    for (const m of t.matchAll(/`(qa-[a-z-]+)`/g)) {
      const n = m[1];
      if (/\.cjs$/.test(n) || commands.includes(`${n}.md`) || skillDirs.includes(n) || agents.includes(`${n}.md`)) continue;
      if (n === 'qa-harness') continue;
      problems.push(`${rel}: \`${n}\` is not a skill, command or agent`);
    }
    for (const m of t.matchAll(/references\/([\w-]+\.md)/g)) if (!fs.existsSync(path.join(HOME, 'skills', 'qa-test-types', 'references', m[1]))) problems.push(`${rel}: references/${m[1]}`);
    for (const m of t.matchAll(/qa-documents\/templates\/([\w-]+\.md)/g)) if (!fs.existsSync(path.join(HOME, 'skills', 'qa-documents', 'templates', m[1]))) problems.push(`${rel}: templates/${m[1]}`);
    for (const m of t.matchAll(/`templates\/([\w-]+\.md)`/g)) if (rel.includes('qa-documents') && !fs.existsSync(path.join(HOME, 'skills', 'qa-documents', 'templates', m[1]))) problems.push(`${rel}: templates/${m[1]}`);
  }
  assert.deepStrictEqual(problems, []);
});

test('every script subcommand the instructions use is implemented', () => {
  const scripts = {};
  for (const s of ls(path.join(HOME, 'scripts', 'qa'), /^qa-[\w-]+\.cjs$/)) {
    const src = read(path.join(HOME, 'scripts', 'qa', s));
    scripts[s] = new Set([...src.matchAll(/case '([\w-]+)'/g), ...src.matchAll(/cmd === '([\w-]+)'/g)].map(m => m[1]));
  }
  const hooks = new Set(ls(path.join(HOME, 'hooks', 'qa'), /\.cjs$/));
  const problems = [];
  for (const f of files) {
    for (const m of read(f).matchAll(/(qa-[\w-]+\.cjs)["']?[ \t]+([a-z][\w-]*)/g)) {
      if (hooks.has(m[1])) continue;
      if (!scripts[m[1]]) problems.push(`${path.relative(HOME, f)}: no script ${m[1]}`);
      else if (!scripts[m[1]].has(m[2])) problems.push(`${path.relative(HOME, f)}: ${m[1]} has no subcommand "${m[2]}"`);
    }
  }
  assert.deepStrictEqual(problems, []);
});

test('the plugin hooks point to existing scripts, and the reviewer cannot write', () => {
  const { hooks } = JSON.parse(read(path.join(HOME, 'hooks', 'hooks.json')));
  const cmds = [...hooks.SessionStart, ...hooks.PreToolUse].flatMap(e => e.hooks.map(h => h.command));
  assert.strictEqual(cmds.length, 2);
  for (const c of cmds) {
    const m = /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)"; exit 0$/.exec(c);
    assert.ok(m, `hook command must run a plugin script and exit 0 when node is missing: ${c}`);
    assert.ok(fs.existsSync(path.join(HOME, m[1])), `hook script missing: ${m[1]}`);
  }
  assert.strictEqual(hooks.PreToolUse[0].matcher, 'Write|Edit|MultiEdit|Bash|PowerShell|mcp__ado__.*|mcp__.*(navigate|new_page|tabs_create).*');
  assert.doesNotMatch(read(path.join(HOME, 'agents', 'qa-orchestrator.md')), /^hooks:/m, 'plugin agents ignore hooks frontmatter');
  const rev = splitFrontMatter(read(path.join(HOME, 'agents', 'qa-reviewer.md'))).meta;
  assert.strictEqual(rev.tools, 'Read, Grep, Glob');
});

test('the plugin description counts the commands, skills and agents it ships', () => {
  const { description } = JSON.parse(read(path.join(HOME, '.claude-plugin', 'plugin.json')));
  const count = word => Number((new RegExp(`(\\d+) ${word}\\b`).exec(description) || [])[1]);
  assert.strictEqual(count('commands'), commands.length);
  assert.strictEqual(count('skills'), skillDirs.length);
  assert.strictEqual(count('agents'), agents.length);
  assert.doesNotMatch(description, /[<>]/);
  assert.ok(description.length <= 500, `claude.ai rejects a plugin description over 500 characters (this one has ${description.length})`);
});

test('instruction files name plugin paths, never the standalone ~/.claude copy', () => {
  const problems = [];
  for (const f of files) for (const m of read(f).matchAll(/(~|\$HOME)\/\.claude\/[\w/.-]*/g)) problems.push(`${path.relative(HOME, f)}: ${m[0]}`);
  for (const m of read(path.join(HOME, 'skills', 'qa-lifecycle', 'SKILL.md')).matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w/.-]+\.cjs)/g)) {
    if (!fs.existsSync(path.join(HOME, m[1]))) problems.push(`qa-lifecycle names a missing script: ${m[1]}`);
  }
  assert.deepStrictEqual(problems, []);
});
