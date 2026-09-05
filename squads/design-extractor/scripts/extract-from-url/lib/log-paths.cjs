"use strict";

// Single source of truth for where extractor diagnostic/log artifacts live.
//
// Logs and run-level diagnostics are written under `<runDir>/.logs/` so the
// canonical artifacts at the run root (DESIGN.md, tokens.json, preview.html,
// render-contract.json, …) stay uncluttered.
//
// Readers MUST go through `logReadPath()` so older runs that predate the
// `.logs/` layout continue to resolve correctly via fallback to the run root.

const fs = require("fs");
const path = require("path");

const LOG_DIR_NAME = ".logs";

// Filenames that should live under `<runDir>/.logs/` going forward.
const LOG_ARTIFACT_NAMES = new Set([
  "telemetry.json",
  "extraction-log.yaml",
  "run.log.ndjson",
  "inputs-manifest.json",
  "DESIGN.md.codex.last-message.txt",
  "DESIGN.md.codex.stdout.log",
  "DESIGN.md.codex.stderr.log",
]);

function logsDir(runDir) {
  return path.join(runDir, LOG_DIR_NAME);
}

function ensureLogsDir(runDir) {
  const dir = logsDir(runDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Resolve the path a log artifact MUST be written to. Always under `.logs/`.
// Auto-creates the dir so callers don't need to.
function logWritePath(runDir, filename) {
  ensureLogsDir(runDir);
  return path.join(runDir, LOG_DIR_NAME, filename);
}

// Resolve a log artifact for READING. Prefer `<runDir>/.logs/<name>`, fall
// back to `<runDir>/<name>` so consumers stay compatible with runs produced
// before the `.logs/` reorganization.
function logReadPath(runDir, filename) {
  const inLogs = path.join(runDir, LOG_DIR_NAME, filename);
  if (fs.existsSync(inLogs)) return inLogs;
  return path.join(runDir, filename);
}

function logExists(runDir, filename) {
  return fs.existsSync(path.join(runDir, LOG_DIR_NAME, filename))
    || fs.existsSync(path.join(runDir, filename));
}

module.exports = {
  LOG_DIR_NAME,
  LOG_ARTIFACT_NAMES,
  logsDir,
  ensureLogsDir,
  logWritePath,
  logReadPath,
  logExists,
};
