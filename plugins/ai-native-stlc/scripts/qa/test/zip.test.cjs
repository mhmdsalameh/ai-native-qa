'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { readZip, writeZip, crc32 } = require('../lib/zip.cjs');
const xml = require('../lib/xml.cjs');

test('crc32 matches the known check value', () => {
  assert.strictEqual(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('round trip: empty, text, unicode name, binary, compressible', () => {
  const big = Buffer.from('abc'.repeat(10000));
  const bin = Buffer.from([0, 255, 1, 254, 2, 253]);
  const entries = [['empty.txt', Buffer.alloc(0)], ['a.txt', 'hello'], ['مجلد/ملف.txt', 'نص عربي'], ['b.bin', bin], ['big.txt', big]];
  const out = readZip(writeZip(entries));
  assert.deepStrictEqual([...out.keys()], entries.map(e => e[0]));
  assert.strictEqual(out.get('empty.txt').length, 0);
  assert.strictEqual(out.get('a.txt').toString(), 'hello');
  assert.strictEqual(out.get('مجلد/ملف.txt').toString(), 'نص عربي');
  assert.deepStrictEqual(out.get('b.bin'), bin);
  assert.deepStrictEqual(out.get('big.txt'), big);
});

test('output is deterministic', () => {
  const e = [['x', 'y']];
  assert.deepStrictEqual(writeZip(e), writeZip(e));
});

test('rejects non-zip input with a clear error', () => {
  assert.throws(() => readZip(Buffer.from('not a zip at all, just text padding......')), /not a zip/);
  assert.throws(() => readZip('string'), /expects a Buffer/);
});

test('interoperates with the system tar (bsdtar) when available', t => {
  const candidates = ['tar', process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : null].filter(Boolean);
  const tarBin = candidates.find(c => /bsdtar/i.test(spawnSync(c, ['--version'], { encoding: 'utf8' }).stdout || ''));
  if (!tarBin) return t.skip('bsdtar not available');
  const tar = (args, opts) => spawnSync(tarBin, args, opts);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-zip-'));
  const ours = path.join(dir, 'ours.zip');
  fs.writeFileSync(ours, writeZip([['doc/a.txt', 'alpha'], ['b.txt', 'beta'.repeat(500)]]));
  const list = tar(['-tf', ours], { encoding: 'utf8' });
  assert.strictEqual(list.status, 0, list.stderr);
  assert.match(list.stdout, /doc\/a\.txt/);
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'c.txt'), 'gamma'.repeat(300));
  const theirs = path.join(dir, 'theirs.zip');
  const mk = tar(['-a', '-cf', theirs, '-C', path.join(dir, 'src'), 'c.txt']);
  assert.strictEqual(mk.status, 0);
  assert.strictEqual(readZip(fs.readFileSync(theirs)).get('c.txt').toString(), 'gamma'.repeat(300));
});

test('xml: parse, entities, namespaces, round trip', () => {
  const src = '<?xml version="1.0"?><w:p a="1 &amp; 2"><w:r><w:t xml:space="preserve"> a &lt; b &#x41;</w:t></w:r><w:br/></w:p>';
  const doc = xml.parse(src);
  const p = doc.children[0];
  assert.strictEqual(p.name, 'w:p');
  assert.strictEqual(p.attrs.a, '1 & 2');
  assert.strictEqual(xml.text(p), ' a < b A');
  assert.strictEqual(xml.findAll(doc, 'w:br').length, 1);
  assert.strictEqual(xml.serialize(xml.parse(xml.serialize(doc))), xml.serialize(doc));
});

test('xml: rejects DTD and mismatched tags', () => {
  assert.throws(() => xml.parse('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>'), /DTD/);
  assert.throws(() => xml.parse('<a><b></a>'), /mismatched/);
  assert.throws(() => xml.parse('<a>'), /unclosed/);
});
