'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { readDocx } = require('../lib/docx.cjs');
const { ingest, diff, textToBlocks } = require('../qa-ingest.cjs');
const { fsdDocx } = require('./fixtures.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qa-ingest-'));
const CLI = path.join(__dirname, '..', 'qa-ingest.cjs');

test('readDocx: headings with auto numbers, lists, table, image, pages, content controls, tracked changes', () => {
  const { blocks, media, pages, pageSource } = readDocx(fsdDocx());
  const heads = blocks.filter(b => b.type === 'heading').map(b => `${b.level}|${b.number || ''}|${b.text}`);
  assert.deepStrictEqual(heads, [
    '1||Online Banking FSD', '1|1|Introduction', '1|2|Login', '2|2.1|Password rules', '2|2.2|Lockout',
    '1|3|Transfers', '2|3.1|Limits', '3|3.1.1|Daily limit', '1||Outline-only heading',
  ]);
  const bullets = blocks.filter(b => b.list && !b.list.ordered).map(b => b.text);
  assert.deepStrictEqual(bullets, ['Tier 1 limit is 5,000.', 'Tier 2 limit is 20,000.']);
  const table = blocks.find(b => b.type === 'table');
  assert.deepStrictEqual(table.rows, [['Tier', 'Limit | JOD'], ['1', '5,000']]);
  const img = blocks.find(b => b.type === 'image');
  assert.strictEqual(img.alt, 'Transfer screen mockup');
  assert.ok(media.get(img.name).length > 0);
  assert.strictEqual(pageSource, 'rendered-page-breaks');
  assert.strictEqual(pages, 2);
  assert.strictEqual(blocks.find(b => b.text === 'Daily limit').page, 2);
  assert.ok(blocks.some(b => b.text === 'Text inside a content control.'));
  assert.ok(blocks.some(b => b.text === 'kept inserted'));
  assert.ok(!JSON.stringify(blocks).includes('deleted'));
});

test('ingest: sections by heading level, front matter, index, media, est tokens', () => {
  const dir = tmp();
  const src = path.join(dir, 'fsd.docx');
  fs.writeFileSync(src, fsdDocx());
  const r = ingest(src, { out: path.join(dir, 'fsd'), version: 'v1' });
  const titles = r.sections.map(s => s.title);
  assert.deepStrictEqual(titles, ['Online Banking FSD', '1 Introduction', '2 Login', '2.1 Password rules', '2.2 Lockout', '3 Transfers', '3.1 Limits', '3.1.1 Daily limit', 'Outline-only heading']);
  const daily = r.sections.find(s => s.title === '3.1.1 Daily limit');
  assert.strictEqual(daily.breadcrumb, '3 Transfers > 3.1 Limits > 3.1.1 Daily limit');
  assert.strictEqual(daily.pages, '2-2');
  const text = fs.readFileSync(path.join(dir, 'fsd', 'v1', daily.file), 'utf8');
  assert.match(text, /^---\nid: "S007"/);
  assert.match(text, /reject a transfer above the daily limit/);
  assert.match(text, /\| Tier \| Limit \\\| JOD \|/);
  assert.match(text, /!\[Transfer screen mockup\]\(\.\.\/media\/image1\.png\)/);
  assert.ok(fs.existsSync(path.join(dir, 'fsd', 'v1', 'media', 'image1.png')));
  assert.ok(fs.readFileSync(path.join(dir, 'fsd', 'v1', 'index.md'), 'utf8').includes('| S007 | 3 Transfers > 3.1 Limits > 3.1.1 Daily limit |'));
  assert.strictEqual(r.est_tokens_total, r.sections.reduce((a, s) => a + s.est_tokens, 0));
});

test('ingest refuses to overwrite a version without --force, and validates options', () => {
  const dir = tmp();
  const src = path.join(dir, 'fsd.docx');
  fs.writeFileSync(src, fsdDocx());
  ingest(src, { out: dir, version: 'v1' });
  assert.throws(() => ingest(src, { out: dir, version: 'v1' }), /already has an index.json/);
  assert.doesNotThrow(() => ingest(src, { out: dir, version: 'v1', force: true }));
  assert.throws(() => ingest(src, { out: dir, version: '../x' }), /--version/);
  assert.throws(() => ingest(src, { out: dir, version: 'v9', 'split-level': '0' }), /split-level/);
  assert.throws(() => ingest(path.join(dir, 'missing.docx'), { out: dir }), /not found/);
  const odd = path.join(dir, 'x.rtf'); fs.writeFileSync(odd, 'x');
  assert.throws(() => ingest(odd, { out: dir, version: 'v2' }), /unsupported input type/);
});

test('diff: a changed rule, an added and a removed section, and renumbering are detected by title path', () => {
  const dir = tmp();
  const a = path.join(dir, 'a.docx'); const b = path.join(dir, 'b.docx');
  fs.writeFileSync(a, fsdDocx());
  fs.writeFileSync(b, fsdDocx({ transferRule: 'The system shall reject a transfer above the daily limit and show message E-105.' }));
  ingest(a, { out: dir, version: 'v1' });
  ingest(b, { out: dir, version: 'v2' });
  const r = diff(path.join(dir, 'v1'), path.join(dir, 'v2'));
  assert.deepStrictEqual(r.changed.map(c => c.title), ['3.1.1 Daily limit']);
  assert.strictEqual(r.added.length, 0);
  assert.strictEqual(r.removed.length, 0);
  assert.ok(fs.existsSync(path.join(dir, 'v2', 'delta-from-v1.json')));

  const md1 = path.join(dir, 'm1.md'); const md2 = path.join(dir, 'm2.md');
  fs.writeFileSync(md1, '# Intro\n\nHello.\n\n# Old\n\nGone soon.\n');
  fs.writeFileSync(md2, '# Preface\n\nNew first section.\n\n# Intro\n\nHello.\n');
  ingest(md1, { out: dir, version: 'm1' });
  ingest(md2, { out: dir, version: 'm2' });
  const r2 = diff(path.join(dir, 'm1'), path.join(dir, 'm2'));
  assert.deepStrictEqual(r2.added.map(s => s.title), ['Preface']);
  assert.deepStrictEqual(r2.removed.map(s => s.title), ['Old']);
  assert.strictEqual(r2.unchanged, 1);
});

test('oversized sections split at deeper headings, then at block boundaries', () => {
  const dir = tmp();
  const long = Array.from({ length: 60 }, (_, i) => `Paragraph ${i} ` + 'x'.repeat(80)).join('\n\n');
  const md = path.join(dir, 'big.md');
  fs.writeFileSync(md, `# Big\n\n${long}\n\n#### Deep A\n\nshort\n`);
  const r = ingest(md, { out: dir, version: 'v1', 'split-level': '1', 'max-chars': '2000' });
  assert.ok(r.sections.length > 3, `expected several parts, got ${r.sections.length}`);
  assert.ok(r.sections.every(s => s.chars <= 2000 + 200), 'every part stays near the limit');
  assert.ok(r.sections.some(s => /part 1 of/.test(s.title)));
  assert.strictEqual(new Set(r.sections.map(s => s.key)).size, r.sections.length, 'keys stay unique');
});

test('duplicate headings get unique keys; plain text uses numbered lines and form feeds', () => {
  const dir = tmp();
  const md = path.join(dir, 'dup.md');
  fs.writeFileSync(md, '# Notes\n\none\n\n# Notes\n\ntwo\n');
  const r = ingest(md, { out: dir, version: 'v1' });
  assert.deepStrictEqual(r.sections.map(s => s.key), ['notes', 'notes~2']);
  const t = textToBlocks('1 Scope\nThe portal.\n\f2 Login\n2.1 Rules\n1. not a heading:\nText.');
  const heads = t.blocks.filter(b => b.type === 'heading').map(b => `${b.number}@${b.page}`);
  assert.deepStrictEqual(heads, ['1@1', '2@2', '2.1@2']);
  assert.strictEqual(t.pages, 2);
});

test('CLI: usage error exits 2, bad input exits 1 with a message', () => {
  const u = spawnSync(process.execPath, [CLI], { encoding: 'utf8' });
  assert.strictEqual(u.status, 2);
  assert.match(u.stderr, /usage/);
  const m = spawnSync(process.execPath, [CLI, 'ingest', 'nope.docx', '--out', tmp()], { encoding: 'utf8' });
  assert.strictEqual(m.status, 1);
  assert.match(m.stderr, /^error: input file not found/);
});
