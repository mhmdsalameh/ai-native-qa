#!/usr/bin/env node
'use strict';
// Stage 1 (script part): turn a requirements document into small, hashed sections so the
// model reads one section at a time and never the whole document.
//
//   node qa-ingest.cjs ingest <file.docx|.md|.txt|.pdf> --out <dir> [--version v1]
//                      [--split-level 3] [--max-chars 24000]
//   node qa-ingest.cjs diff <oldVersionDir> <newVersionDir>
//
// Output in <out>/<version>/: source.md, sections/S###-slug.md, media/, index.json, index.md.
// est_tokens is chars/4: a rough planning number, not a measurement (Arabic text costs more).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { readDocx } = require('./lib/docx.cjs');
const { toMarkdown, fromMarkdown, frontMatter, splitFrontMatter } = require('./lib/md.cjs');
const { parseArgs, fail, run } = require('./lib/cli.cjs');

function loadBlocks(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.docx') {
    const r = readDocx(fs.readFileSync(file));
    return { blocks: r.blocks, media: r.media, pages: r.pages, pageSource: r.pageSource };
  }
  if (ext === '.md' || ext === '.markdown') {
    return { blocks: fromMarkdown(fs.readFileSync(file, 'utf8')).blocks, media: new Map(), pages: null, pageSource: 'none' };
  }
  let text;
  if (ext === '.pdf') {
    const r = spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', file, '-'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    if (r.error || r.status !== 0) fail('PDF input needs `pdftotext` (poppler) on PATH. Install it, or save the PDF as .docx and ingest that.');
    text = r.stdout;
  } else if (ext === '.txt') text = fs.readFileSync(file, 'utf8');
  else fail(`unsupported input type ${ext || '(none)'}: use .docx, .md, .txt or .pdf`);
  return { ...textToBlocks(text), media: new Map() };
}

// Plain text: form feeds mark pages; numbered lines like "4.3.2 Transfer limits" are headings.
function textToBlocks(text) {
  const blocks = [];
  let page = 1;
  let para = [];
  const flush = () => { if (para.length) blocks.push({ type: 'para', text: para.join(' '), page }); para = []; };
  for (const rawLine of text.split(/\r?\n/)) {
    const pieces = rawLine.split('\f');
    pieces.forEach((line, i) => {
      if (i > 0) { flush(); page++; }
      const t = line.trim();
      const m = /^(\d+(?:\.\d+){0,5})\s+([^\d\s].{0,150})$/.exec(t);
      if (!t) flush();
      else if (m && !/[.:;,]$/.test(m[2])) { flush(); blocks.push({ type: 'heading', level: m[1].split('.').length, number: m[1], text: m[2].trim(), page }); }
      else para.push(t);
    });
  }
  flush();
  return { blocks, pages: page, pageSource: 'form-feeds' };
}

const slug = s => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'section';
const norm = s => s.replace(/\s+/g, ' ').trim();
const hash = s => crypto.createHash('sha256').update(norm(s)).digest('hex').slice(0, 16);
const label = h => (h.number ? `${h.number} ${h.text}` : h.text);

function buildSections(blocks, splitLevel) {
  const sections = [];
  const stack = [];
  let cur = { heading: null, path: [], blocks: [] };
  for (const b of blocks) {
    if (b.type === 'heading') {
      while (stack.length && stack[stack.length - 1].level >= b.level) stack.pop();
      stack.push(b);
      if (b.level <= splitLevel) {
        if (cur.heading || cur.blocks.length) sections.push(cur);
        cur = { heading: b, path: stack.slice(), blocks: [b] };
        continue;
      }
    }
    cur.blocks.push(b);
  }
  if (cur.heading || cur.blocks.length) sections.push(cur);
  return sections;
}

function sizeOf(blocks) { return toMarkdown(blocks).length; }

// Oversized sections split at their next heading level, then at block boundaries.
function enforceMax(section, maxChars) {
  if (sizeOf(section.blocks) <= maxChars) return [section];
  const baseLevel = section.heading ? section.heading.level : 0;
  const sub = section.blocks.slice(section.heading ? 1 : 0);
  const nextLevel = Math.min(...sub.filter(b => b.type === 'heading' && b.level > baseLevel).map(b => b.level));
  if (Number.isFinite(nextLevel)) {
    const parts = buildSections(sub, nextLevel).map(s => ({ heading: s.heading, path: s.heading ? [...section.path, ...s.path.filter(h => h.level > baseLevel)] : section.path, blocks: s.blocks }));
    if (parts[0] && !parts[0].heading) parts[0] = { ...section, blocks: section.heading ? [section.heading, ...parts[0].blocks] : parts[0].blocks };
    else if (section.heading) parts.unshift({ ...section, blocks: [section.heading] });
    return parts.flatMap(p => enforceMax(p, maxChars));
  }
  const parts = [];
  let chunk = [];
  for (const b of section.blocks) {
    if (chunk.length && sizeOf([...chunk, b]) > maxChars) { parts.push(chunk); chunk = []; }
    chunk.push(b);
  }
  if (chunk.length) parts.push(chunk);
  return parts.map((blocks, i) => ({ ...section, blocks, part: [i + 1, parts.length] }));
}

function ingest(file, opts) {
  if (!file || !fs.existsSync(file)) fail(`input file not found: ${file || '(none)'}`);
  const out = opts.out || fail('--out <dir> is required');
  const version = opts.version || 'v1';
  if (!/^[\w.-]+$/.test(version)) fail('--version may use letters, digits, ".", "_" and "-" only');
  const splitLevel = Number(opts['split-level'] || 3);
  const maxChars = Number(opts['max-chars'] || 24000);
  if (!(splitLevel >= 1 && splitLevel <= 9) || !(maxChars >= 1000)) fail('--split-level must be 1-9 and --max-chars at least 1000');
  const dir = path.join(out, version);
  if (fs.existsSync(path.join(dir, 'index.json')) && !opts.force) fail(`${dir} already has an index.json. Use a new --version, or --force to replace it.`);
  const { blocks, media, pages, pageSource } = loadBlocks(file);
  if (!blocks.some(b => b.type === 'heading')) process.stderr.write('warning: no headings found; sections are split by size only\n');
  fs.rmSync(path.join(dir, 'sections'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'sections'), { recursive: true });
  if (media.size) {
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    for (const [name, data] of media) fs.writeFileSync(path.join(dir, 'media', name), data);
  }
  fs.writeFileSync(path.join(dir, 'source.md'), toMarkdown(blocks));
  const sections = buildSections(blocks, splitLevel).flatMap(s => enforceMax(s, maxChars));
  const keys = new Map();
  const index = [];
  sections.forEach((s, i) => {
    const id = `S${String(i).padStart(3, '0')}`;
    const crumbs = s.path.map(label);
    const title = s.heading ? label(s.heading) : 'Front matter';
    const partTxt = s.part && s.part[1] > 1 ? ` (part ${s.part[0]} of ${s.part[1]})` : '';
    let key = (s.path.length ? s.path.map(h => h.text.toLowerCase()) : ['front matter']).join(' > ') + (s.part ? `#${s.part[0]}` : '');
    const seen = keys.get(key) || 0;
    keys.set(key, seen + 1);
    if (seen) key += `~${seen + 1}`;
    const body = toMarkdown(s.blocks, { mediaPrefix: '../media/' });
    const pagesOf = s.blocks.map(b => b.page).filter(p => p != null);
    const meta = {
      id, title: title + partTxt, breadcrumb: crumbs.join(' > ') || 'Front matter', key,
      pages: pagesOf.length ? `${Math.min(...pagesOf)}-${Math.max(...pagesOf)}` : 'unknown',
      hash: hash(body), chars: body.length, est_tokens: Math.ceil(body.length / 4),
    };
    const fileName = `${id}-${slug(title)}.md`;
    fs.writeFileSync(path.join(dir, 'sections', fileName), frontMatter(meta) + body);
    index.push({ ...meta, file: `sections/${fileName}`, number: s.heading?.number || null, level: s.heading?.level || 0 });
  });
  const total = index.reduce((a, s) => a + s.est_tokens, 0);
  const doc = { source: path.basename(file), version, split_level: splitLevel, max_chars: maxChars, pages, page_source: pageSource, sections: index, est_tokens_total: total };
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(doc, null, 2) + '\n');
  const rows = index.map(s => `| ${s.id} | ${s.breadcrumb.replace(/\|/g, '\\|')} | ${s.pages} | ${s.est_tokens} | ${s.hash} |`);
  fs.writeFileSync(path.join(dir, 'index.md'),
    `# Section index: ${path.basename(file)} (${version})\n\n` +
    `Pages: ${pages ?? 'unknown'} (from ${pageSource}; page numbers are hints, not exact). ` +
    `Sections: ${index.length}. Estimated tokens (chars/4): ${total}.\n\n` +
    `| id | section | pages | est. tokens | hash |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n`);
  return doc;
}

function diff(oldDir, newDir) {
  const load = d => {
    const f = path.join(d, 'index.json');
    if (!fs.existsSync(f)) fail(`no index.json in ${d}`);
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  };
  const a = load(oldDir); const b = load(newDir);
  const am = new Map(a.sections.map(s => [s.key, s]));
  const bm = new Map(b.sections.map(s => [s.key, s]));
  const result = { from: a.version, to: b.version, added: [], removed: [], changed: [], unchanged: 0 };
  for (const [k, s] of bm) {
    const o = am.get(k);
    if (!o) result.added.push({ key: k, id: s.id, title: s.title });
    else if (o.hash !== s.hash) result.changed.push({ key: k, old_id: o.id, id: s.id, title: s.title });
    else result.unchanged++;
  }
  for (const [k, s] of am) if (!bm.has(k)) result.removed.push({ key: k, old_id: s.id, title: s.title });
  fs.writeFileSync(path.join(newDir, `delta-from-${a.version}.json`), JSON.stringify(result, null, 2) + '\n');
  return result;
}

function main() {
  const { _: [cmd, ...pos], ...opts } = parseArgs(process.argv.slice(2));
  if (cmd === 'ingest') {
    const r = ingest(pos[0], opts);
    console.log(`ingested ${r.source} as ${r.version}: ${r.sections.length} sections, ~${r.est_tokens_total} tokens (chars/4), pages ${r.pages ?? 'unknown'} (${r.page_source})`);
    console.log(`read ${path.join(opts.out, r.version, 'index.md')} first; then one section file per extraction call`);
  } else if (cmd === 'diff') {
    if (pos.length !== 2) fail('usage: qa-ingest.cjs diff <oldVersionDir> <newVersionDir>');
    const r = diff(pos[0], pos[1]);
    console.log(JSON.stringify({ added: r.added.length, removed: r.removed.length, changed: r.changed.length, unchanged: r.unchanged }));
    for (const k of ['changed', 'added', 'removed']) for (const s of r[k]) console.log(`${k}\t${s.id || s.old_id}\t${s.title}`);
  } else {
    fail('usage: qa-ingest.cjs ingest <file> --out <dir> [--version v1] [--split-level 3] [--max-chars 24000] | diff <oldDir> <newDir>', 2);
  }
}

if (require.main === module) run(main);
module.exports = { ingest, diff, textToBlocks, buildSections, splitFrontMatter };
