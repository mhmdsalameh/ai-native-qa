'use strict';
// Builders for test fixtures: a realistic .docx FSD made from raw OOXML parts.
const { writeZip } = require('../lib/zip.cjs');
const X = require('../lib/xml.cjs');

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

// 1x1 transparent PNG
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360000000000500010d0a2db40000000049454e44ae426082', 'hex');

const p = (text, { style, num, extra = '' } = {}) => {
  const pPr = (style ? `<w:pStyle w:val="${style}"/>` : '') + (num ? `<w:numPr><w:ilvl w:val="${num[1]}"/><w:numId w:val="${num[0]}"/></w:numPr>` : '');
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${extra}<w:r><w:t xml:space="preserve">${X.escText(text)}</w:t></w:r></w:p>`;
};
const pageBreakPara = text => `<w:p><w:r><w:lastRenderedPageBreak/><w:t>${X.escText(text)}</w:t></w:r></w:p>`;

function fsdDocx({ transferRule = 'The system shall reject a transfer above the daily limit and show message E-104.' } = {}) {
  const body = [
    p('Online Banking FSD', { style: 'Title' }),
    p('Prepared for the QA team.'),
    p('Introduction', { style: 'Heading1', num: [1, 0] }),
    p('This document describes the online banking portal.'),
    p('Login', { style: 'Heading1', num: [1, 0] }),
    p('Password rules', { style: 'Heading2', num: [1, 1] }),
    p('A password has at least 12 characters.'),
    p('Lockout', { style: 'Heading2', num: [1, 1] }),
    pageBreakPara('After five failed attempts the account is locked for 30 minutes.'),
    p('Transfers', { style: 'Heading1', num: [1, 0] }),
    p('Limits', { style: 'Heading2', num: [1, 1] }),
    p('Daily limit', { style: 'CustomHead3', num: [1, 2] }),
    p(transferRule),
    p('Tier 1 limit is 5,000.', { num: [2, 0] }),
    p('Tier 2 limit is 20,000.', { num: [2, 0] }),
    `<w:tbl><w:tr><w:tc>${p('Tier')}</w:tc><w:tc>${p('Limit | JOD')}</w:tc></w:tr><w:tr><w:tc>${p('1')}</w:tc><w:tc>${p('5,000')}</w:tc></w:tr></w:tbl>`,
    `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="9525" cy="9525"/><wp:docPr id="1" name="Picture 1" descr="Transfer screen mockup"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="rIdImg"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`,
    p('Outline-only heading', { extra: '' }).replace('<w:p>', '<w:p><w:pPr><w:outlineLvl w:val="0"/></w:pPr>'),
    `<w:sdt><w:sdtContent>${p('Text inside a content control.')}</w:sdtContent></w:sdt>`,
    `<w:p><w:r><w:t>kept </w:t></w:r><w:del><w:r><w:delText>deleted</w:delText></w:r></w:del><w:ins><w:r><w:t>inserted</w:t></w:r></w:ins></w:p>`,
  ].join('');
  const styles = `<w:styles ${W}>
<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="CustomHead3"><w:name w:val="Bank Heading Three"/><w:basedOn w:val="Heading3"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/></w:style>
</w:styles>`;
  const numbering = `<w:numbering ${W}>
<w:abstractNum w:abstractNumId="10"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2"/></w:lvl><w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2.%3"/></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="20"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="20"/></w:num>
</w:numbering>`;
  return writeZip([
    ['[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/></Types>'],
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`],
    ['word/styles.xml', styles],
    ['word/numbering.xml', numbering],
    ['word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>'],
    ['word/media/image1.png', PNG],
  ]);
}

module.exports = { fsdDocx, PNG };
