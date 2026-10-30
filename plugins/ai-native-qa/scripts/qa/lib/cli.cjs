'use strict';
// Shared CLI helpers for the QA scripts.
const fs = require('fs');
const path = require('path');

// --key value, --key=value, --flag (true). Everything else is positional in `_`.
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { out._.push(...argv.slice(i + 1)); break; }
    const m = /^--([\w-]+)(?:=(.*))?$/.exec(a);
    if (!m) { out._.push(a); continue; }
    if (m[2] !== undefined) out[m[1]] = m[2];
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[m[1]] = argv[++i];
    else out[m[1]] = true;
  }
  return out;
}

class QaError extends Error {
  constructor(msg, code = 1) { super(msg); this.exitCode = code; }
}

function fail(msg, code = 1) {
  throw new QaError(msg, code);
}

// Entry point wrapper: QaError -> "error: ..." on stderr and its exit code; anything else is a bug.
function run(main) {
  try {
    const r = main();
    if (r && typeof r.then === 'function') r.catch(report);
  } catch (e) { report(e); }
  function report(e) {
    if (e instanceof QaError) { process.stderr.write(`error: ${e.message}\n`); process.exitCode = e.exitCode; }
    else { process.stderr.write(`${e && e.stack || e}\n`); process.exitCode = 1; }
  }
}

// The project root is the nearest directory (from start upwards) holding .qa/config.json.
function findProject(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.qa', 'config.json'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) {
    if (fallback !== undefined) return fallback;
    throw new QaError(`missing file: ${file}`);
  }
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); }
  catch (e) { throw new QaError(`invalid JSON in ${file}: ${e.message}`); }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

module.exports = { parseArgs, fail, run, findProject, readJson, writeJson, QaError };
