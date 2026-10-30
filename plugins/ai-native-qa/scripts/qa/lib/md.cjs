'use strict';
// Conversion between the block model (lib/docx.cjs) and the restricted Markdown the
// QA harness writes: # headings, paragraphs, "-" / "1." lists, | tables |, ![alt](path),
// **bold**, and a line containing only <!-- pagebreak -->.

function cell(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function toMarkdown(blocks, { mediaPrefix = 'media/' } = {}) {
  const out = [];
  for (const b of blocks) {
    if (b.type === 'heading') out.push(`${'#'.repeat(Math.min(b.level, 6))} ${b.number ? b.number + ' ' : ''}${b.text}`, '');
    else if (b.type === 'para') {
      if (b.list) {
        const marker = b.list.ordered ? (b.list.marker || '1.') : '-';
        out.push(`${'  '.repeat(b.list.level || 0)}${marker} ${b.text.replace(/\n/g, ' ')}`);
      } else out.push(b.text, '');
    } else if (b.type === 'table') {
      const width = Math.max(...b.rows.map(r => r.length));
      const norm = b.rows.map(r => Array.from({ length: width }, (_, i) => cell(r[i] ?? '')));
      out.push(`| ${norm[0].join(' | ')} |`, `| ${norm[0].map(() => '---').join(' | ')} |`);
      for (const r of norm.slice(1)) out.push(`| ${r.join(' | ')} |`);
      out.push('');
    } else if (b.type === 'image') out.push(`![${(b.alt || 'figure').replace(/[\[\]]/g, '')}](${b.path || mediaPrefix + b.name})`, '');
    else if (b.type === 'pagebreak') out.push('<!-- pagebreak -->', '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function splitFrontMatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md);
  if (!m) return { meta: {}, body: md };
  return { meta: parseFrontMatter(m[1]), body: md.slice(m[0].length) };
}

// Front matter subset: `key: value`, quoted strings, and inline lists `[a, b]`.
function parseFrontMatter(src) {
  const meta = {};
  for (const line of src.split(/\r?\n/)) {
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    meta[m[1]] = parseScalar(m[2].trim());
  }
  return meta;
}
function parseScalar(v) {
  if (v === '') return '';
  if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(',').map(s => parseScalar(s.trim())).filter(s => s !== '');
  if (/^".*"$/.test(v)) { try { return JSON.parse(v); } catch { return v.slice(1, -1); } }
  if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
  if (/^(true|false)$/.test(v)) return v === 'true';
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v === 'null' || v === '~') return null;
  return v;
}
function fmValue(v) {
  if (Array.isArray(v)) return `[${v.map(fmValue).join(', ')}]`;
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return String(v);
  return JSON.stringify(String(v));
}
function frontMatter(meta) {
  return `---\n${Object.entries(meta).map(([k, v]) => `${k}: ${fmValue(v)}`).join('\n')}\n---\n`;
}

function fromMarkdown(md) {
  const { meta, body } = splitFrontMatter(md);
  const lines = body.split(/\r?\n/);
  const blocks = [];
  let para = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'para', text: para.join(' ') });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if (!line.trim()) { flush(); continue; }
    if (/^\s*<!--\s*pagebreak\s*-->\s*$/i.test(line)) { flush(); blocks.push({ type: 'pagebreak' }); continue; }
    if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) { flush(); blocks.push({ type: 'heading', level: m[1].length, text: m[2] }); continue; }
    if ((m = /^!\[(.*?)\]\((.+?)\)\s*$/.exec(line.trim()))) { flush(); blocks.push({ type: 'image', alt: m[1], path: m[2] }); continue; }
    if (/^\s*\|/.test(line)) {
      flush();
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const r = lines[i].trim().replace(/^\|/, '').replace(/\|$/, '');
        const cells = r.split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
        if (!cells.every(c => /^:?-{3,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      i--;
      blocks.push({ type: 'table', rows });
      continue;
    }
    if ((m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line))) {
      flush();
      const ordered = /\d/.test(m[2]);
      blocks.push({ type: 'para', text: m[3], list: { ordered, level: Math.floor(m[1].replace(/\t/g, '  ').length / 2), ...(ordered ? { marker: m[2] } : {}) } });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return { meta, blocks };
}

module.exports = { toMarkdown, fromMarkdown, splitFrontMatter, parseFrontMatter, frontMatter };
