#!/usr/bin/env node
'use strict';
// Render a deliverable written in the harness's Markdown into a company or client .docx template.
//
//   node qa-docx.cjs render <in.md> --template templates/fsd.docx --out deliverables/FSD.docx
//                    [--rtl] [--allow-unfilled]
//   node qa-docx.cjs inspect <template.docx>     styles found, {{placeholders}}, {{BODY}} present?
//   node qa-docx.cjs make-template <out.docx>    write the neutral default template
//
// Template contract: a paragraph whose whole text is {{BODY}} is replaced by the document body,
// in the template's own heading/list/table/caption styles. Other {{key}} placeholders (also in
// headers and footers) take values from the Markdown front matter (title, subtitle, version,
// date, client, project, ...). A placeholder left unfilled is an error unless --allow-unfilled.
// Front matter `language: ar` (or --rtl) writes the document right-to-left.
const fs = require('fs');
const path = require('path');
const { parseArgs, fail, run } = require('./lib/cli.cjs');
const { renderDocx, defaultTemplate } = require('./lib/docx.cjs');
const { fromMarkdown } = require('./lib/md.cjs');
const { readZip } = require('./lib/zip.cjs');
const X = require('./lib/xml.cjs');

function render(input, opts) {
  if (!input || !fs.existsSync(input)) fail(`input not found: ${input || '(none)'}`);
  const tpl = opts.template || fail('--template <file.docx> is required');
  if (!fs.existsSync(tpl)) fail(`template not found: ${tpl}`);
  const out = opts.out || fail('--out <file.docx> is required');
  const { meta, blocks } = fromMarkdown(fs.readFileSync(input, 'utf8'));
  for (const b of blocks) if (b.type === 'image' && !fs.existsSync(path.resolve(path.dirname(input), b.path))) fail(`image not found: ${b.path} (paths are relative to ${path.dirname(input)})`);
  const rtl = Boolean(opts.rtl) || meta.language === 'ar';
  const vars = { date: new Date().toISOString().slice(0, 10), ...meta };
  const { buffer, unfilled } = renderDocx(fs.readFileSync(tpl), { blocks, vars, rtl, baseDir: path.dirname(path.resolve(input)) });
  if (unfilled.length && !opts['allow-unfilled']) fail(`the template has placeholders with no value: ${unfilled.map(k => `{{${k}}}`).join(', ')}. Add them to the front matter of ${input}.`);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, buffer);
  return { out, blocks: blocks.length, rtl, unfilled };
}

function inspect(tpl) {
  if (!tpl || !fs.existsSync(tpl)) fail(`template not found: ${tpl || '(none)'}`);
  const zip = readZip(fs.readFileSync(tpl));
  const styles = [];
  if (zip.get('word/styles.xml')) {
    for (const s of X.findAll(X.parse(zip.get('word/styles.xml').toString('utf8')), 'w:style')) styles.push(X.child(s, 'w:name')?.attrs['w:val'] || s.attrs['w:styleId']);
  }
  const placeholders = new Set();
  let body = false;
  for (const [name, data] of zip) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) continue;
    for (const p of X.findAll(X.parse(data.toString('utf8')), 'w:p')) {
      const t = X.findAll(p, 'w:t').map(X.text).join('');
      if (t.trim() === '{{BODY}}') body = true;
      for (const m of t.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) if (m[1] !== 'BODY') placeholders.add(m[1]);
    }
  }
  const want = ['heading 1', 'heading 2', 'heading 3', 'list bullet', 'list paragraph', 'table grid', 'caption'];
  const lower = new Set(styles.map(s => s.toLowerCase()));
  return { body, placeholders: [...placeholders], styles_found: want.filter(w => lower.has(w)), styles_missing: want.filter(w => !lower.has(w)) };
}

function main() {
  const { _: [cmd, arg], ...opts } = parseArgs(process.argv.slice(2));
  if (cmd === 'render') {
    const r = render(arg, opts);
    console.log(`wrote ${r.out} (${r.blocks} blocks${r.rtl ? ', right-to-left' : ''})`);
  } else if (cmd === 'inspect') {
    const r = inspect(arg);
    console.log(`{{BODY}} paragraph: ${r.body ? 'yes' : 'NO - the body will be appended at the end; add a paragraph containing only {{BODY}}'}`);
    console.log(`placeholders: ${r.placeholders.join(', ') || '(none)'}`);
    console.log(`styles found: ${r.styles_found.join(', ') || '(none)'}`);
    console.log(`styles missing (direct formatting is used instead): ${r.styles_missing.join(', ') || '(none)'}`);
  } else if (cmd === 'make-template') {
    if (!arg) fail('usage: qa-docx.cjs make-template <out.docx>', 2);
    if (fs.existsSync(arg)) fail(`${arg} exists; not overwriting`);
    fs.writeFileSync(arg, defaultTemplate());
    console.log(`wrote ${arg}`);
  } else fail('usage: qa-docx.cjs render <in.md> --template <t.docx> --out <o.docx> | inspect <t.docx> | make-template <out.docx>', 2);
}

if (require.main === module) run(main);
module.exports = { render, inspect };
