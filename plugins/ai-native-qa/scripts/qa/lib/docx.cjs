'use strict';
// .docx reader (to ordered blocks) and writer (blocks into a template). Node built-ins only.
//
// Block model shared by reader and writer:
//   { type: 'heading', level: 1..9, text, number?, page }
//   { type: 'para', text, list?: { ordered: bool, level: 0..8, marker? }, page }
//   { type: 'table', rows: [[cellText]], page }
//   { type: 'image', name, alt, page }          (reader: name = media file name)
//   { type: 'image', path, alt, widthPx?, heightPx? }   (writer: path to png/jpg)
const fs = require('fs');
const path = require('path');
const { readZip, writeZip } = require('./zip.cjs');
const X = require('./xml.cjs');

// ---------------------------------------------------------------- reading

function loadStyles(zip) {
  const styles = new Map();
  const part = zip.get('word/styles.xml');
  if (!part) return styles;
  for (const s of X.findAll(X.parse(part.toString('utf8')), 'w:style')) {
    const id = s.attrs['w:styleId'];
    if (!id) continue;
    const name = X.child(s, 'w:name')?.attrs['w:val'] || id;
    const basedOn = X.child(s, 'w:basedOn')?.attrs['w:val'] || null;
    const pPr = X.child(s, 'w:pPr');
    const ol = pPr && X.child(pPr, 'w:outlineLvl');
    const numPr = pPr && X.child(pPr, 'w:numPr');
    styles.set(id, {
      id, name, basedOn, type: s.attrs['w:type'],
      outline: ol ? Number(ol.attrs['w:val']) : null,
      numId: numPr ? X.child(numPr, 'w:numId')?.attrs['w:val'] ?? null : null,
      ilvl: numPr ? Number(X.child(numPr, 'w:ilvl')?.attrs['w:val'] ?? 0) : null,
    });
  }
  return styles;
}

function styleChain(styles, id) {
  const out = [];
  const seen = new Set();
  while (id && styles.has(id) && !seen.has(id)) {
    seen.add(id);
    const s = styles.get(id);
    out.push(s);
    id = s.basedOn;
  }
  return out;
}

function headingLevel(styles, styleId, directOutline) {
  if (directOutline != null && directOutline < 9) return directOutline + 1;
  for (const s of styleChain(styles, styleId)) {
    if (s.outline != null && s.outline < 9) return s.outline + 1;
    const m = /^heading\s*(\d)$/i.exec(s.name);
    if (m) return Number(m[1]);
    if (/^title$/i.test(s.name)) return 1;
  }
  return 0;
}

function loadNumbering(zip) {
  const part = zip.get('word/numbering.xml');
  const abstract = new Map();
  const nums = new Map();
  if (!part) return { abstract, nums };
  const doc = X.parse(part.toString('utf8'));
  for (const a of X.findAll(doc, 'w:abstractNum')) {
    const lvls = new Map();
    for (const l of X.kids(a, 'w:lvl')) {
      lvls.set(Number(l.attrs['w:ilvl']), {
        fmt: X.child(l, 'w:numFmt')?.attrs['w:val'] || 'decimal',
        text: X.child(l, 'w:lvlText')?.attrs['w:val'] ?? '',
        start: Number(X.child(l, 'w:start')?.attrs['w:val'] ?? 1),
      });
    }
    abstract.set(a.attrs['w:abstractNumId'], lvls);
  }
  for (const n of X.findAll(doc, 'w:num')) {
    nums.set(n.attrs['w:numId'], X.child(n, 'w:abstractNumId')?.attrs['w:val']);
  }
  return { abstract, nums };
}

function formatNumber(n, fmt) {
  switch (fmt) {
    case 'lowerLetter': return letters(n).toLowerCase();
    case 'upperLetter': return letters(n);
    case 'lowerRoman': return roman(n).toLowerCase();
    case 'upperRoman': return roman(n);
    case 'bullet': case 'none': return '';
    default: return String(n);
  }
}
function letters(n) {
  let s = '';
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}
function roman(n) {
  const t = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
  return s;
}

class Counters {
  constructor(numbering) { this.numbering = numbering; this.state = new Map(); }
  next(numId, ilvl) {
    const absId = this.numbering.nums.get(numId);
    const lvls = absId != null ? this.numbering.abstract.get(absId) : null;
    if (!lvls) return { ordered: false, marker: '' };
    const lvl = lvls.get(ilvl) || { fmt: 'decimal', text: '', start: 1 };
    const key = absId;
    const c = this.state.get(key) || [];
    for (let i = 0; i < ilvl; i++) if (c[i] == null) c[i] = (lvls.get(i)?.start ?? 1);
    c[ilvl] = c[ilvl] == null ? lvl.start : c[ilvl] + 1;
    c.length = ilvl + 1;
    this.state.set(key, c);
    const ordered = lvl.fmt !== 'bullet' && lvl.fmt !== 'none';
    const marker = ordered
      ? lvl.text.replace(/%(\d)/g, (_, d) => formatNumber(c[Number(d) - 1] ?? lvls.get(Number(d) - 1)?.start ?? 1, lvls.get(Number(d) - 1)?.fmt))
      : '';
    return { ordered, marker };
  }
}

function loadRels(zip, part) {
  const rels = new Map();
  const relPart = zip.get(part.replace(/([^/]+)$/, '_rels/$1.rels'));
  if (!relPart) return rels;
  for (const r of X.findAll(X.parse(relPart.toString('utf8')), 'Relationship')) rels.set(r.attrs.Id, r.attrs);
  return rels;
}

function readDocx(buf) {
  const zip = readZip(buf);
  const docPart = zip.get('word/document.xml');
  if (!docPart) throw new Error('not a .docx: word/document.xml is missing');
  const styles = loadStyles(zip);
  const counters = new Counters(loadNumbering(zip));
  const rels = loadRels(zip, 'word/document.xml');
  const body = X.find(X.parse(docPart.toString('utf8')), 'w:body');
  const hasRendered = docPart.includes('w:lastRenderedPageBreak');
  const media = new Map();
  const blocks = [];
  let page = 1;

  function runsText(el, acc) {
    for (const c of X.elements(el)) {
      switch (c.name) {
        case 'w:t': acc.text += X.text(c); break;
        case 'w:tab': acc.text += '\t'; break;
        case 'w:cr': acc.text += '\n'; break;
        case 'w:br':
          if (c.attrs['w:type'] === 'page') { if (!hasRendered) acc.breaks++; }
          else acc.text += '\n';
          break;
        case 'w:lastRenderedPageBreak': acc.breaks++; break;
        case 'w:drawing': case 'w:pict': case 'w:object': acc.images.push(c); break;
        case 'w:del': case 'w:delText': case 'w:instrText': case 'w:rPr': case 'w:pPr': break;
        default: runsText(c, acc);
      }
    }
    return acc;
  }

  function imageBlock(el, pageNo) {
    const blip = X.find(el, 'a:blip');
    const id = blip?.attrs['r:embed'] || X.find(el, 'v:imagedata')?.attrs['r:id'];
    const rel = id && rels.get(id);
    if (!rel || rel.TargetMode === 'External') return null;
    const target = path.posix.normalize(path.posix.join('word', rel.Target.replace(/^\//, '').replace(/^word\//, '')));
    const data = zip.get(target);
    if (!data) return null;
    const name = path.posix.basename(target);
    media.set(name, data);
    const docPr = X.find(el, 'wp:docPr');
    return { type: 'image', name, alt: docPr?.attrs.descr || docPr?.attrs.title || docPr?.attrs.name || '', page: pageNo };
  }

  function paragraph(p, out) {
    const pPr = X.child(p, 'w:pPr');
    const styleId = pPr && X.child(pPr, 'w:pStyle')?.attrs['w:val'];
    const ol = pPr && X.child(pPr, 'w:outlineLvl');
    const level = headingLevel(styles, styleId, ol ? Number(ol.attrs['w:val']) : null);
    let numId = null; let ilvl = 0;
    const numPr = pPr && X.child(pPr, 'w:numPr');
    if (numPr) {
      numId = X.child(numPr, 'w:numId')?.attrs['w:val'] ?? null;
      ilvl = Number(X.child(numPr, 'w:ilvl')?.attrs['w:val'] ?? 0);
    } else {
      const s = styleChain(styles, styleId).find(x => x.numId != null);
      if (s) { numId = s.numId; ilvl = s.ilvl ?? 0; }
    }
    const startPage = page;
    const acc = runsText(p, { text: '', breaks: 0, images: [] });
    const text = acc.text.replace(/[ \t]+$/g, '').replace(/^\s+$/, '');
    const num = numId && numId !== '0' ? counters.next(numId, ilvl) : null;
    if (level > 0 && text.trim()) {
      out.push({ type: 'heading', level, text: text.trim(), ...(num?.marker ? { number: num.marker.replace(/\.$/, '') } : {}), page: startPage });
    } else if (text.trim()) {
      out.push({ type: 'para', text, ...(num ? { list: { ordered: num.ordered, level: ilvl, ...(num.marker ? { marker: num.marker } : {}) } } : {}), page: startPage });
    }
    for (const img of acc.images) {
      const b = imageBlock(img, startPage);
      if (b) out.push(b);
    }
    page += acc.breaks;
    if (pPr && X.child(pPr, 'w:sectPr') && !hasRendered) page++;
  }

  function cellText(tc) {
    const parts = [];
    for (const p of X.findAll(tc, 'w:p')) {
      const t = runsText(p, { text: '', breaks: 0, images: [] }).text.trim();
      if (t) parts.push(t);
    }
    return parts.join(' / ');
  }

  function table(tbl, out) {
    const startPage = page;
    const rows = X.kids(tbl, 'w:tr').map(tr => X.kids(tr, 'w:tc').map(cellText));
    for (const p of X.findAll(tbl, 'w:p')) page += runsText(p, { text: '', breaks: 0, images: [] }).breaks;
    if (rows.length) out.push({ type: 'table', rows, page: startPage });
  }

  function walk(el, out) {
    for (const c of X.elements(el)) {
      if (c.name === 'w:p') paragraph(c, out);
      else if (c.name === 'w:tbl') table(c, out);
      else if (c.name === 'w:sdt') { const content = X.child(c, 'w:sdtContent'); if (content) walk(content, out); }
      else if (c.name === 'w:customXml' || c.name === 'w:smartTag') walk(c, out);
    }
  }
  walk(body, blocks);
  return { blocks, media, pages: page, pageSource: hasRendered ? 'rendered-page-breaks' : 'explicit-page-breaks' };
}

// ---------------------------------------------------------------- writing

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), ext: 'png' };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5), ext: 'jpeg' };
      i += 2 + len;
    }
  }
  throw new Error('unsupported image: only PNG and JPEG are accepted');
}

function styleIds(zip) {
  const byName = new Map();
  for (const s of loadStyles(zip).values()) byName.set(s.name.toLowerCase(), s.id);
  return name => byName.get(name) || null;
}

// Inline markup in generated text: **bold** only. Everything else is literal.
function runsXml(text, rtl, bold) {
  const out = [];
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g).filter(s => s.length);
  for (const part of parts) {
    const isBold = bold || /^\*\*[^*]+\*\*$/.test(part);
    const t = isBold && part.startsWith('**') ? part.slice(2, -2) : part;
    const rPr = (isBold ? '<w:b/><w:bCs/>' : '') + (rtl ? '<w:rtl/>' : '');
    const lines = t.split('\n');
    lines.forEach((line, i) => {
      if (i) out.push(`<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:br/></w:r>`);
      out.push(`<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${X.escText(line)}</w:t></w:r>`);
    });
  }
  return out.join('');
}

function paraXml(text, { style, rtl, bold, keepNext } = {}) {
  const pPr = (style ? `<w:pStyle w:val="${X.escAttr(style)}"/>` : '') + (keepNext ? '<w:keepNext/>' : '') + (rtl ? '<w:bidi/>' : '');
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${runsXml(text, rtl, bold)}</w:p>`;
}

function renderDocx(templateBuf, { blocks = [], vars = {}, rtl = false, baseDir = process.cwd() } = {}) {
  const zip = readZip(templateBuf);
  const docPart = zip.get('word/document.xml');
  if (!docPart) throw new Error('template is not a .docx: word/document.xml is missing');
  const sid = styleIds(zip);
  const doc = X.parse(docPart.toString('utf8'));
  const body = X.find(doc, 'w:body');
  const relsPath = 'word/_rels/document.xml.rels';
  const rels = X.parse((zip.get(relsPath) || Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')).toString('utf8'));
  const relRoot = X.find(rels, 'Relationships');
  const ctDoc = X.parse(zip.get('[Content_Types].xml').toString('utf8'));
  const ctRoot = X.find(ctDoc, 'Types');
  const sect = X.find(body, 'w:sectPr');
  let maxEmu = 5486400;
  if (sect) {
    const pg = X.child(sect, 'w:pgSz'); const mar = X.child(sect, 'w:pgMar');
    if (pg && mar) maxEmu = (Number(pg.attrs['w:w']) - Number(mar.attrs['w:left'] || 0) - Number(mar.attrs['w:right'] || 0)) * 635;
  }
  let imgN = 0;
  let relN = 1000;
  const ensureDefault = ext => {
    if (!X.kids(ctRoot, 'Default').some(d => d.attrs.Extension === ext)) {
      ctRoot.children.push({ name: 'Default', attrs: { Extension: ext, ContentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` }, children: [] });
    }
  };

  const H = l => sid(`heading ${l}`);
  const out = [];
  for (const b of blocks) {
    if (b.type === 'heading') {
      const label = b.number ? `${b.number} ${b.text}` : b.text;
      const st = H(Math.min(Math.max(b.level, 1), 9));
      out.push(paraXml(label, { style: st, rtl, bold: !st, keepNext: true }));
    } else if (b.type === 'para') {
      if (b.list) {
        const indent = '  '.repeat(b.list.level || 0);
        const marker = b.list.ordered ? `${b.list.marker || '1.'} ` : (sid('list bullet') ? '' : '• ');
        const st = !b.list.ordered && sid('list bullet') ? sid('list bullet') : (sid('list paragraph') || null);
        out.push(paraXml(indent + marker + b.text, { style: st, rtl }));
      } else out.push(paraXml(b.text, { rtl }));
    } else if (b.type === 'table') {
      const grid = sid('table grid');
      const borders = grid ? '' : '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join('') + '</w:tblBorders>';
      const tblPr = `<w:tblPr>${grid ? `<w:tblStyle w:val="${grid}"/>` : ''}<w:tblW w:w="5000" w:type="pct"/>${rtl ? '<w:bidiVisual/>' : ''}${borders}</w:tblPr>`;
      const rows = b.rows.map((r, i) => `<w:tr>${i === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${r.map(c => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${paraXml(c, { rtl, bold: i === 0 })}</w:tc>`).join('')}</w:tr>`).join('');
      out.push(`<w:tbl>${tblPr}${rows}</w:tbl>`, paraXml('', { rtl }));
    } else if (b.type === 'image') {
      const file = path.resolve(baseDir, b.path);
      const data = fs.readFileSync(file);
      const size = imageSize(data);
      imgN++;
      const ext = size.ext === 'jpeg' ? 'jpg' : 'png';
      const media = `media/qa-image-${imgN}.${ext}`;
      zip.set(`word/${media}`, data);
      ensureDefault(ext);
      const rid = `rIdQa${relN++}`;
      relRoot.children.push({ name: 'Relationship', attrs: { Id: rid, Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', Target: media }, children: [] });
      let cx = Math.round((b.widthPx || size.w) * 9525);
      let cy = Math.round((b.heightPx || size.h) * 9525);
      if (cx > maxEmu) { cy = Math.round(cy * maxEmu / cx); cx = maxEmu; }
      const alt = X.escAttr(b.alt || '');
      out.push(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${9000 + imgN}" name="Picture ${imgN}" descr="${alt}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${9000 + imgN}" name="Picture ${imgN}" descr="${alt}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
      if (b.alt) out.push(paraXml(b.alt, { style: sid('caption'), rtl }));
    } else if (b.type === 'pagebreak') {
      out.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    } else {
      throw new Error(`unknown block type: ${b.type}`);
    }
  }
  const raw = { name: '#raw', xml: out.join(''), attrs: {}, children: [] };
  const bodyIdx = body.children.findIndex(c => typeof c !== 'string' && c.name === 'w:p' && X.text(c).trim() === '{{BODY}}');
  if (bodyIdx >= 0) body.children.splice(bodyIdx, 1, raw);
  else {
    const sIdx = body.children.findIndex(c => typeof c !== 'string' && c.name === 'w:sectPr');
    body.children.splice(sIdx >= 0 ? sIdx : body.children.length, 0, raw);
  }
  const missing = new Set();
  const fill = node => replaceVars(node, vars, rtl, missing);
  fill(doc);
  const ser = n => serializeRaw(n);
  zip.set('word/document.xml', Buffer.from(X.XML_DECL + ser(doc)));
  for (const name of [...zip.keys()]) {
    if (/^word\/(header|footer)\d*\.xml$/.test(name)) {
      const part = X.parse(zip.get(name).toString('utf8'));
      fill(part);
      zip.set(name, Buffer.from(X.XML_DECL + ser(part)));
    }
  }
  zip.set(relsPath, Buffer.from(X.XML_DECL + X.serialize(rels)));
  zip.set('[Content_Types].xml', Buffer.from(X.XML_DECL + X.serialize(ctDoc)));
  return { buffer: writeZip(zip), unfilled: [...missing] };
}

function serializeRaw(node) {
  if (typeof node !== 'string' && node.name === '#raw') return node.xml;
  if (typeof node === 'string') return X.escText(node);
  if (node.name === '#document') return node.children.map(serializeRaw).join('');
  const attrs = Object.entries(node.attrs).map(([k, v]) => ` ${k}="${X.escAttr(v)}"`).join('');
  if (!node.children.length) return `<${node.name}${attrs}/>`;
  return `<${node.name}${attrs}>${node.children.map(serializeRaw).join('')}</${node.name}>`;
}

// A {{key}} may be split across runs by Word. Join the paragraph's text, replace, and put the
// result in the first run (keeping that run's formatting).
function replaceVars(node, vars, rtl, missing) {
  for (const p of X.findAll(node, 'w:p')) {
    const full = X.findAll(p, 'w:t').map(X.text).join('');
    if (!full.includes('{{')) continue;
    const replaced = full.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, k) => {
      if (k === 'BODY') return m;
      if (vars[k] == null) { missing.add(k); return m; }
      return String(vars[k]);
    });
    if (replaced === full) continue;
    const ts = X.findAll(p, 'w:t');
    ts[0].children = [replaced];
    ts[0].attrs['xml:space'] = 'preserve';
    for (const t of ts.slice(1)) t.children = [];
    if (rtl) {
      let pPr = X.child(p, 'w:pPr');
      if (!pPr) { pPr = { name: 'w:pPr', attrs: {}, children: [] }; p.children.unshift(pPr); }
      if (!X.child(pPr, 'w:bidi')) pPr.children.push({ name: 'w:bidi', attrs: {}, children: [] });
    }
  }
}

// A neutral default template: title, subtitle, document info table, {{BODY}}.
function defaultTemplate() {
  const doc = `<w:document ${NS}><w:body>
${paraXml('{{title}}', { style: 'Title' })}
${paraXml('{{subtitle}}', { style: 'Subtitle' })}
${paraXml('Client: {{client}}   Project: {{project}}   Version: {{version}}   Date: {{date}}')}
${paraXml('{{BODY}}')}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>
</w:body></w:document>`;
  const st = (id, name, rPr, pPr = '', type = 'paragraph') => `<w:style w:type="${type}" w:styleId="${id}"><w:name w:val="${name}"/>${type === 'paragraph' && id !== 'Normal' ? '<w:basedOn w:val="Normal"/>' : ''}${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}</w:style>`;
  const styles = `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
${st('Normal', 'Normal', '')}
${st('Title', 'Title', '<w:b/><w:sz w:val="48"/><w:szCs w:val="48"/>', '<w:spacing w:after="240"/>')}
${st('Subtitle', 'Subtitle', '<w:color w:val="555555"/><w:sz w:val="28"/><w:szCs w:val="28"/>')}
${[1, 2, 3, 4, 5, 6].map(l => st(`Heading${l}`, `heading ${l}`, `<w:b/><w:sz w:val="${[32, 28, 26, 24, 22, 22][l - 1]}"/><w:szCs w:val="${[32, 28, 26, 24, 22, 22][l - 1]}"/>`, `<w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${l - 1}"/>`)).join('\n')}
${st('ListParagraph', 'List Paragraph', '', '<w:ind w:left="360"/>')}
${st('Caption', 'caption', '<w:i/><w:color w:val="555555"/><w:sz w:val="18"/>', '<w:jc w:val="center"/>')}
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;
  return writeZip([
    ['[Content_Types].xml', X.XML_DECL + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'],
    ['_rels/.rels', X.XML_DECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/_rels/document.xml.rels', X.XML_DECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['word/document.xml', X.XML_DECL + doc],
    ['word/styles.xml', X.XML_DECL + styles],
  ]);
}

module.exports = { readDocx, renderDocx, defaultTemplate, imageSize };
