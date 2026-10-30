'use strict';
// Small XML parser and serializer for OOXML parts. Not a validating parser: no DTDs,
// no external entities (so it cannot be abused for XXE). Elements become
// { name, attrs, children } where children holds elements and text strings.

const ENTITY = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decode(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return ENTITY[e] ?? m;
  });
}

function escText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) {
  return escText(s).replace(/"/g, '&quot;');
}

function parse(xml) {
  const root = { name: '#document', attrs: {}, children: [] };
  const stack = [root];
  let i = 0;
  const n = xml.length;
  while (i < n) {
    const lt = xml.indexOf('<', i);
    if (lt === -1) {
      pushText(stack[stack.length - 1], xml.slice(i));
      break;
    }
    if (lt > i) pushText(stack[stack.length - 1], xml.slice(i, lt));
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      if (end === -1) throw new Error('unterminated comment');
      i = end + 3;
    } else if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      if (end === -1) throw new Error('unterminated CDATA');
      stack[stack.length - 1].children.push(xml.slice(lt + 9, end));
      i = end + 3;
    } else if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2);
      if (end === -1) throw new Error('unterminated processing instruction');
      i = end + 2;
    } else if (xml.startsWith('<!', lt)) {
      throw new Error('DOCTYPE/DTD is not supported');
    } else if (xml[lt + 1] === '/') {
      const end = xml.indexOf('>', lt);
      const name = xml.slice(lt + 2, end).trim();
      const top = stack.pop();
      if (!top || top.name !== name) throw new Error(`mismatched closing tag </${name}>`);
      i = end + 1;
    } else {
      const end = findTagEnd(xml, lt);
      let body = xml.slice(lt + 1, end);
      const selfClose = body.endsWith('/');
      if (selfClose) body = body.slice(0, -1);
      const m = /^([^\s/>]+)/.exec(body);
      if (!m) throw new Error(`bad tag at ${lt}`);
      const el = { name: m[1], attrs: parseAttrs(body.slice(m[1].length)), children: [] };
      stack[stack.length - 1].children.push(el);
      if (!selfClose) stack.push(el);
      i = end + 1;
    }
  }
  if (stack.length !== 1) throw new Error(`unclosed element <${stack[stack.length - 1].name}>`);
  return root;
}

function findTagEnd(xml, from) {
  let q = null;
  for (let j = from + 1; j < xml.length; j++) {
    const c = xml[j];
    if (q) { if (c === q) q = null; }
    else if (c === '"' || c === "'") q = c;
    else if (c === '>') return j;
  }
  throw new Error('unterminated tag');
}

function parseAttrs(s) {
  const attrs = {};
  const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(s))) attrs[m[1]] = decode(m[3] ?? m[4]);
  return attrs;
}

function pushText(el, raw) {
  if (raw.length) el.children.push(decode(raw));
}

function serialize(node) {
  if (typeof node === 'string') return escText(node);
  if (node.name === '#document') return node.children.map(serialize).join('');
  const attrs = Object.entries(node.attrs).map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('');
  if (!node.children.length) return `<${node.name}${attrs}/>`;
  return `<${node.name}${attrs}>${node.children.map(serialize).join('')}</${node.name}>`;
}

const elements = el => el.children.filter(c => typeof c !== 'string');
const child = (el, name) => el.children.find(c => typeof c !== 'string' && c.name === name);
const kids = (el, name) => el.children.filter(c => typeof c !== 'string' && c.name === name);

function find(el, name) {
  for (const c of elements(el)) {
    if (c.name === name) return c;
    const r = find(c, name);
    if (r) return r;
  }
  return null;
}
function findAll(el, name, out = []) {
  for (const c of elements(el)) {
    if (c.name === name) out.push(c);
    findAll(c, name, out);
  }
  return out;
}
function text(el) {
  return el.children.map(c => (typeof c === 'string' ? c : text(c))).join('');
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

module.exports = { parse, serialize, elements, child, kids, find, findAll, text, escText, escAttr, XML_DECL };
