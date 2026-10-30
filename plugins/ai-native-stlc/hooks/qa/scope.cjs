'use strict';
// A plugin agent cannot declare hooks, so the plugin wires the QA hooks for every session. They act
// only in a QA session: the orchestrator runs, or the folder or the target file is in a QA project.
// Node built-ins only: a damaged install must not block sessions that are not QA work.
const fs = require('fs');
const os = require('os');
const path = require('path');

function projectAt(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.qa', 'config.json'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

const isOrchestrator = input => /(^|:)qa-orchestrator$/.test(String(input.agent_type || ''));

// The standalone harness runs the same hooks from its agent's frontmatter, and a user agent wins
// the bare-name lookup; in that session the plugin's copy stays out so nothing runs twice.
function standaloneRuns(input) {
  if (input.agent_type !== 'qa-orchestrator') return false;
  const home = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  try { return /^hooks:/m.test(fs.readFileSync(path.join(home, 'agents', 'qa-orchestrator.md'), 'utf8')); } catch { return false; }
}

function inQaSession(input) {
  if (standaloneRuns(input)) return false;
  if (isOrchestrator(input)) return true;
  const cwd = input.cwd || process.cwd();
  const file = (input.tool_input || {}).file_path;
  return Boolean(projectAt(cwd) || (file && projectAt(path.dirname(path.resolve(cwd, String(file))))));
}

module.exports = { projectAt, isOrchestrator, standaloneRuns, inQaSession };
