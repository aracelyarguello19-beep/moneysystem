"use strict";

const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const { LOG_ARTIFACT_NAMES, logReadPath } = require("./log-paths.cjs");

const REQUIRED_ARTIFACTS = [
  "DESIGN.md",
  "tokens.json",
  "tokens-extended.json",
  "render-contract.json",
  "telemetry.json",
  "preview.html",
  "lint-report.json",
  "quality-score.json",
  "extraction-log.yaml",
  "style-fingerprint.json",
  "meta-defaults.json",
  "inputs-manifest.json",
  "run.log.ndjson",
  "extraction-asymmetries.md",
  "agent-prompt.txt",
];

function resolveArtifactPath(runDir, name) {
  return LOG_ARTIFACT_NAMES.has(name) ? logReadPath(runDir, name) : path.join(runDir, name);
}

function scoreRun(runDir) {
  const exists = (f) => fs.existsSync(resolveArtifactPath(runDir, f));
  const missing = REQUIRED_ARTIFACTS.filter((f) => !exists(f));
  const hasNoFallbacksReport = exists("no-fallbacks-report.json");
  const hasDesignMd = exists("DESIGN.md");
  const complete = missing.length === 0;

  let value = 0;
  let quality = null;
  let confidenceHigh = null;
  let lintErrors = null;
  let lintExecutionFailed = false;

  if (hasDesignMd) {
    try {
      const q = JSON.parse(fs.readFileSync(resolveArtifactPath(runDir, "quality-score.json"), "utf8"));
      quality = q.overall ?? 0;
      value += quality;
    } catch {}
    try {
      const log = YAML.parse(fs.readFileSync(resolveArtifactPath(runDir, "extraction-log.yaml"), "utf8"));
      confidenceHigh = log?.confidence_summary?.high ?? 0;
      value += confidenceHigh * 0.5;
    } catch {}
    try {
      const lint = JSON.parse(fs.readFileSync(resolveArtifactPath(runDir, "lint-report.json"), "utf8"));
      lintErrors = lint?.errors_count ?? 0;
      lintExecutionFailed = isLintExecutionFailure(lint);
      value -= lintExecutionFailed ? 25 : Math.max(0, lintErrors) * 5;
    } catch {}
  }

  return {
    complete,
    hasDesignMd,
    value,
    quality,
    confidenceHigh,
    lintErrors,
    lintExecutionFailed,
    missing,
    hasNoFallbacksReport,
  };
}

function isLintExecutionFailure(lint) {
  if (!lint || lint.ran !== true) return false;
  if (lint.execution_error === true) return true;
  if (Number(lint.errors_count) < 0) return true;
  const exitCode = lint.exit_code;
  const hasExit = typeof exitCode === "number";
  const errors = Number(lint.errors_count) || 0;
  const warnings = Number(lint.warnings_count) || 0;
  return hasExit && exitCode !== 0 && errors === 0 && warnings === 0;
}

module.exports = { REQUIRED_ARTIFACTS, scoreRun };
