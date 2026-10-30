'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readDocx, defaultTemplate, imageSize } = require('../lib/docx.cjs');
const { readZip, writeZip } = require('../lib/zip.cjs');
const { render, inspect } = require('../qa-docx.cjs');
const { PNG } = require('./fixtures.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qa-docx-'));

const MANUAL = `---
title: "User manual"
subtitle: "Online banking"
client: "Bank X"
project: "R3"
version: "1.0"
---
# Send a transfer

Use this task to send money to a saved beneficiary. **Check the amount** before you confirm.

1. Open Transfers.
2. Enter the amount.
3. Select Confirm.

- Tier 1 limit: 5,000
- Tier 2 limit: 20,000

| Field | Rule |
| --- | --- |
| Amount | 1 to the daily limit |
| Note | Optional, 140 characters, may contain a \\| pipe |

![The transfer screen](shot.png)

## Messages

E-104 means the amount is above your daily limit.
`;

test('render: headings, inline bold, lists, table, image, placeholders; the result reads back', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'm.md'), MANUAL);
  fs.writeFileSync(path.join(dir, 'shot.png'), PNG);
  fs.writeFileSync(path.join(dir, 't.docx'), defaultTemplate());
  const r = render(path.join(dir, 'm.md'), { template: path.join(dir, 't.docx'), out: path.join(dir, 'out', 'manual.docx') });
  assert.strictEqual(r.rtl, false);
  const buf = fs.readFileSync(r.out);
  const back = readDocx(buf);
  const heads = back.blocks.filter(b => b.type === 'heading').map(b => `${b.level}:${b.text}`);
  assert.deepStrictEqual(heads, ['1:User manual', '1:Send a transfer', '2:Messages']);
  const texts = back.blocks.filter(b => b.type === 'para').map(b => b.text);
  assert.ok(texts.includes('Online banking'));
  assert.ok(texts.some(t => /Client: Bank X {3}Project: R3 {3}Version: 1\.0 {3}Date: \d{4}-\d{2}-\d{2}/.test(t)), 'placeholders in one paragraph are all filled');
  assert.ok(texts.includes('Use this task to send money to a saved beneficiary. Check the amount before you confirm.'));
  assert.ok(texts.includes('1. Open Transfers.'));
  assert.ok(texts.includes('• Tier 1 limit: 5,000'));
  assert.ok(!texts.some(t => t.includes('{{')), 'no placeholder left');
  const table = back.blocks.find(b => b.type === 'table');
  assert.deepStrictEqual(table.rows[2], ['Note', 'Optional, 140 characters, may contain a | pipe']);
  assert.strictEqual(back.blocks.filter(b => b.type === 'image').length, 1);
  const docXml = readZip(buf).get('word/document.xml').toString();
  assert.match(docXml, /<w:b\/><w:bCs\/><\/w:rPr><w:t xml:space="preserve">Check the amount<\/w:t>/);
  assert.match(docXml, /<w:pStyle w:val="Heading2"\/>/);
  assert.match(docXml, /<w:tblStyle w:val="TableGrid"\/>/);
  const ct = readZip(buf).get('[Content_Types].xml').toString();
  assert.match(ct, /Extension="png"/);
});

test('render: Arabic front matter writes right-to-left paragraphs, runs and tables', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'ar.md'), '---\ntitle: "دليل المستخدم"\nsubtitle: "الخدمات المصرفية"\nclient: "بنك"\nproject: "R3"\nversion: "1.0"\nlanguage: "ar"\n---\n# إرسال تحويل\n\n١. افتح صفحة التحويلات.\n\n| الحقل | القاعدة |\n| --- | --- |\n| المبلغ | حتى الحد اليومي |\n');
  fs.writeFileSync(path.join(dir, 't.docx'), defaultTemplate());
  const r = render(path.join(dir, 'ar.md'), { template: path.join(dir, 't.docx'), out: path.join(dir, 'ar.docx') });
  assert.strictEqual(r.rtl, true);
  const xml = readZip(fs.readFileSync(r.out)).get('word/document.xml').toString();
  assert.match(xml, /<w:bidi\/>/);
  assert.match(xml, /<w:rtl\/>/);
  assert.match(xml, /<w:bidiVisual\/>/);
  assert.ok(!/<w:p>(?!<w:pPr>[^]*?<w:bidi\/>)/.test(xml.replace(/<w:pPr>[^]*?<\/w:pPr>/g, m => m.includes('<w:bidi/>') ? '<w:pPr><w:bidi/></w:pPr>' : m)), 'every paragraph is right-to-left');
  assert.ok(readDocx(fs.readFileSync(r.out)).blocks.some(b => b.text === 'إرسال تحويل'));
});

test('render refuses unfilled placeholders and missing images; inspect reports the template contract', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 't.docx'), defaultTemplate());
  fs.writeFileSync(path.join(dir, 'm.md'), '---\ntitle: "x"\n---\n# A\n\ntext\n');
  assert.throws(() => render(path.join(dir, 'm.md'), { template: path.join(dir, 't.docx'), out: path.join(dir, 'o.docx') }), /\{\{subtitle\}\}, \{\{client\}\}, \{\{project\}\}, \{\{version\}\}/);
  assert.doesNotThrow(() => render(path.join(dir, 'm.md'), { template: path.join(dir, 't.docx'), out: path.join(dir, 'o.docx'), 'allow-unfilled': true }));
  fs.writeFileSync(path.join(dir, 'img.md'), '# A\n\n![x](missing.png)\n');
  assert.throws(() => render(path.join(dir, 'img.md'), { template: path.join(dir, 't.docx'), out: path.join(dir, 'o2.docx'), 'allow-unfilled': true }), /image not found/);
  const i = inspect(path.join(dir, 't.docx'));
  assert.strictEqual(i.body, true);
  assert.deepStrictEqual(i.placeholders.sort(), ['client', 'date', 'project', 'subtitle', 'title', 'version']);
  assert.ok(i.styles_found.includes('heading 1') && i.styles_found.includes('table grid'));
});

test('a placeholder split across runs by Word is still filled; a template without {{BODY}} appends before sectPr', () => {
  const dir = tmp();
  const zip = readZip(defaultTemplate());
  let doc = zip.get('word/document.xml').toString();
  doc = doc.replace(/<w:p><w:r><w:t xml:space="preserve">\{\{title\}\}<\/w:t><\/w:r><\/w:p>/, '<w:p><w:r><w:t>{{ti</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>tle}}</w:t></w:r></w:p>');
  doc = doc.replace(/<w:p><w:r><w:t xml:space="preserve">\{\{BODY\}\}<\/w:t><\/w:r><\/w:p>/, '');
  assert.ok(!doc.includes('{{BODY}}'));
  zip.set('word/document.xml', Buffer.from(doc));
  fs.writeFileSync(path.join(dir, 't.docx'), writeZip(zip));
  fs.writeFileSync(path.join(dir, 'm.md'), '---\ntitle: "Split title"\n---\n# Body heading\n');
  const r = render(path.join(dir, 'm.md'), { template: path.join(dir, 't.docx'), out: path.join(dir, 'o.docx'), 'allow-unfilled': true });
  const blocks = readDocx(fs.readFileSync(r.out)).blocks;
  assert.strictEqual(blocks[0].text, 'Split title');
  assert.strictEqual(blocks[blocks.length - 1].text, 'Body heading');
  assert.match(readZip(fs.readFileSync(r.out)).get('word/document.xml').toString(), /Body heading<\/w:t><\/w:r><\/w:p><w:sectPr>/);
});

test('imageSize reads PNG and JPEG headers and rejects other formats', () => {
  assert.deepStrictEqual(imageSize(PNG), { w: 1, h: 1, ext: 'png' });
  const jpeg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffc0001108002000400301220002110103110100', 'hex');
  assert.deepStrictEqual(imageSize(jpeg), { w: 64, h: 32, ext: 'jpeg' });
  assert.throws(() => imageSize(Buffer.from('GIF89a......')), /only PNG and JPEG/);
});
