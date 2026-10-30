'use strict';
// Minimal .xlsx writer, template filler and reader. Node built-ins only.
// Strings are written as inline strings, so templates never need their sharedStrings rewritten.
const { readZip, writeZip } = require('./zip.cjs');
const X = require('./xml.cjs');

const col = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const colIndex = ref => { let n = 0; for (const ch of /^[A-Z]+/.exec(ref)[0]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
// Excel rejects control characters other than tab/newline in cell text.
const clean = v => String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

function cellXml(ref, v, style) {
  const s = style != null ? ` s="${style}"` : '';
  if (v == null || v === '') return style != null ? `<c r="${ref}"${s}/>` : '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
  if (typeof v === 'boolean') return `<c r="${ref}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${X.escText(clean(v).slice(0, 32767))}</t></is></c>`;
}

function sheetName(name) {
  const n = String(name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim();
  if (!n) throw new Error('sheet name is empty');
  return n;
}

// sheets: [{ name, columns: [{ header, width? }], rows: [[value]] }]
function writeWorkbook(sheets, { rtl = false } = {}) {
  if (!sheets.length) throw new Error('a workbook needs at least one sheet');
  const names = sheets.map(s => sheetName(s.name));
  if (new Set(names.map(n => n.toLowerCase())).size !== names.length) throw new Error('sheet names must be unique');
  const parts = [];
  sheets.forEach((sh, i) => {
    const cols = sh.columns.map((c, j) => `<col min="${j + 1}" max="${j + 1}" width="${c.width || 18}" customWidth="1"/>`).join('');
    const header = `<row r="1">${sh.columns.map((c, j) => cellXml(`${col(j)}1`, c.header, 1)).join('')}</row>`;
    const body = sh.rows.map((r, k) => `<row r="${k + 2}">${r.map((v, j) => cellXml(`${col(j)}${k + 2}`, v, 2)).join('')}</row>`).join('');
    const last = `${col(Math.max(sh.columns.length - 1, 0))}${sh.rows.length + 1}`;
    parts.push([`xl/worksheets/sheet${i + 1}.xml`, X.XML_DECL +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}"/>` +
      `<sheetViews><sheetView workbookViewId="0"${rtl ? ' rightToLeft="1"' : ''}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
      `<cols>${cols}</cols><sheetData>${header}${body}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`]);
  });
  const styles = X.XML_DECL + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDE5EA"/></patternFill></fill></fills>' +
    '<borders count="2"><border/><border><left style="thin"><color rgb="FFBFC8CF"/></left><right style="thin"><color rgb="FFBFC8CF"/></right><top style="thin"><color rgb="FFBFC8CF"/></top><bottom style="thin"><color rgb="FFBFC8CF"/></bottom></border></borders>' +
    '<cellStyleXfs count="1"><xf/></cellStyleXfs>' +
    '<cellXfs count="3"><xf/><xf fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"><alignment wrapText="1" vertical="top"/></xf><xf borderId="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>' +
    '</styleSheet>';
  return writeZip([
    ['[Content_Types].xml', X.XML_DECL + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>'],
    ['_rels/.rels', X.XML_DECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', X.XML_DECL + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      names.map((n, i) => `<sheet name="${X.escAttr(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', X.XML_DECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ...parts,
    ['xl/styles.xml', styles],
  ]);
}

function sheetPath(zip, name) {
  const wb = X.parse(zip.get('xl/workbook.xml').toString('utf8'));
  const sheets = X.findAll(wb, 'sheet');
  const sh = name == null ? sheets[0] : sheets.find(s => s.attrs.name.toLowerCase() === String(name).toLowerCase());
  if (!sh) throw new Error(`sheet not found: ${name}. Sheets: ${sheets.map(s => s.attrs.name).join(', ')}`);
  const rels = X.parse(zip.get('xl/_rels/workbook.xml.rels').toString('utf8'));
  const rel = X.findAll(rels, 'Relationship').find(r => r.attrs.Id === sh.attrs['r:id']);
  return 'xl/' + rel.attrs.Target.replace(/^\/?xl\//, '').replace(/^\//, '');
}

// Write rows below headerRow (1-based) in an existing template sheet. Rows below the header
// are replaced. Each column takes the style of the first data row in the template, so the
// company's formatting (borders, wrap, fonts) carries over.
function fillTemplate(templateBuf, { sheet, headerRow = 1, rows }) {
  const zip = readZip(templateBuf);
  const p = sheetPath(zip, sheet);
  const doc = X.parse(zip.get(p).toString('utf8'));
  const data = X.find(doc, 'sheetData');
  const rowEls = X.kids(data, 'row');
  const proto = rowEls.find(r => Number(r.attrs.r) === headerRow + 1);
  const styleOf = new Map();
  if (proto) for (const c of X.kids(proto, 'c')) if (c.attrs.s != null) styleOf.set(colIndex(c.attrs.r), c.attrs.s);
  data.children = data.children.filter(r => typeof r === 'string' || Number(r.attrs.r) <= headerRow);
  const xml = rows.map((r, k) => {
    const rn = headerRow + 1 + k;
    return `<row r="${rn}">${r.map((v, j) => cellXml(`${col(j)}${rn}`, v, styleOf.get(j))).join('')}</row>`;
  }).join('');
  data.children.push({ name: '#raw', xml, attrs: {}, children: [] });
  const width = Math.max(1, ...rows.map(r => r.length), ...[...styleOf.keys()].map(k => k + 1));
  const dim = X.find(doc, 'dimension');
  if (dim) dim.attrs.ref = `A1:${col(width - 1)}${headerRow + rows.length}`;
  for (const t of ['mergeCells', 'tableParts']) {
    const el = X.find(doc, t);
    if (el && t === 'mergeCells') el.children = el.children.filter(m => typeof m === 'string' || Number(/\d+/.exec(m.attrs.ref.split(':')[0])[0]) <= headerRow);
  }
  const ser = n => (typeof n !== 'string' && n.name === '#raw') ? n.xml : (typeof n === 'string' ? X.escText(n)
    : n.name === '#document' ? n.children.map(ser).join('')
      : `<${n.name}${Object.entries(n.attrs).map(([k, v]) => ` ${k}="${X.escAttr(v)}"`).join('')}${n.children.length ? `>${n.children.map(ser).join('')}</${n.name}>` : '/>'}`);
  zip.set(p, Buffer.from(X.XML_DECL + ser(doc)));
  zip.delete('xl/calcChain.xml');
  return writeZip(zip);
}

// Returns rows as arrays of strings (numbers as their text), gaps filled with ''.
function readSheet(buf, name) {
  const zip = readZip(buf);
  const shared = [];
  if (zip.get('xl/sharedStrings.xml')) {
    for (const si of X.findAll(X.parse(zip.get('xl/sharedStrings.xml').toString('utf8')), 'si')) shared.push(X.findAll(si, 't').map(X.text).join(''));
  }
  const doc = X.parse(zip.get(sheetPath(zip, name)).toString('utf8'));
  const rows = [];
  for (const r of X.findAll(doc, 'row')) {
    const idx = Number(r.attrs.r) - 1;
    const row = [];
    for (const c of X.kids(r, 'c')) {
      const j = colIndex(c.attrs.r);
      let v = '';
      if (c.attrs.t === 'inlineStr') v = X.findAll(c, 't').map(X.text).join('');
      else if (c.attrs.t === 's') v = shared[Number(X.text(X.child(c, 'v')))] ?? '';
      else if (X.child(c, 'v')) v = X.text(X.child(c, 'v'));
      row[j] = v;
    }
    rows[idx] = Array.from(row, x => x ?? '');
  }
  return Array.from(rows, x => x ?? []);
}

module.exports = { writeWorkbook, fillTemplate, readSheet, col };
