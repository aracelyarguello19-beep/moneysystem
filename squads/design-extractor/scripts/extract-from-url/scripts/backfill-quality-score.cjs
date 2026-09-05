#!/usr/bin/env node
/**
 * Backfill quality-score.json for existing extracts.
 *
 * Recomputes quality-score.json from already-extracted deterministic inputs:
 * tokens.json, extraction-log.yaml, lint-report.json, css-vars-detected.json,
 * and font-faces.json. It also normalizes old lint reports where a non-zero
 * lint exit had no structured findings, so infra failures cannot be scored as
 * clean lint.
 *
 * Usage:
 *   node squads/design-ops/scripts/extract-from-url/scripts/backfill-quality-score.cjs [--dry-run] [--only=slug1,slug2]
 *
 * Exit codes: 0 ok · 1 error · 2 no-op (no extracts found)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const EXTRACTS_ROOT = path.join(REPO_ROOT, "outputs", "design-ops", "url-extracts");

const {
  classifyLintResult,
  computeQualityScore,
  formatLintSummary,
  isLintExecutionFailure,
} = require("../lib/design-md.cjs");
const { logReadPath } = require("../lib/log-paths.cjs");

function parseArgs(argv) {
  const args = { dryRun: false, only: null };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--only=")) args.only = new Set(arg.slice(7).split(",").map((s) => s.trim()).filter(Boolean));
  }
  return args;
}

function listExtracts(filterSet) {
  if (!fs.existsSync(EXTRACTS_ROOT)) return [];
  return fs.readdirSync(EXTRACTS_ROOT)
    .filter((name) => {
      const runDir = path.join(EXTRACTS_ROOT, name);
      if (!fs.statSync(runDir).isDirectory()) return false;
      if (name.startsWith(".") || name.startsWith("_")) return false;
      if (filterSet && !filterSet.has(name)) return false;
      return fs.existsSync(path.join(runDir, "DESIGN.md"))
        && fs.existsSync(path.join(runDir, "tokens.json"));
    });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function readExtractionLog(file) {
  try {
    if (!fs.existsSync(file)) return { confidence_summary: {} };
    return YAML.parse(fs.readFileSync(file, "utf8")) || { confidence_summary: {} };
  } catch {
    return { confidence_summary: {} };
  }
}

function normalizeLintReport(lint) {
  if (!lint || lint.ran !== true) return lint || { ran: false, error: "missing lint-report.json" };
  if (!isLintExecutionFailure(lint) || lint.execution_error === true) return lint;
  const normalized = classifyLintResult(
    null,
    lint.exit_code,
    lint.stdout_excerpt || lint.stdout || "",
    lint.stderr_excerpt || lint.stderr || "",
  );
  return {
    ...lint,
    ...normalized,
    errors: Array.isArray(lint.errors) ? lint.errors : normalized.errors,
    warnings: Array.isArray(lint.warnings) ? lint.warnings : normalized.warnings,
  };
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

function processOne(slug, dryRun) {
  const runDir = path.join(EXTRACTS_ROOT, slug);
  const tokens = readJson(path.join(runDir, "tokens.json"), {});
  const logPath = logReadPath(runDir, "extraction-log.yaml");
  const extractionLog = readExtractionLog(logPath);
  const lintPath = path.join(runDir, "lint-report.json");
  const lintOriginal = readJson(lintPath, { ran: false, error: "missing lint-report.json" });
  const lintResult = normalizeLintReport(lintOriginal);
  const cssVars = readJson(path.join(runDir, "inputs", "css-vars-detected.json"), []);
  const fontFaces = readJson(path.join(runDir, "inputs", "font-faces.json"), []);

  const quality = computeQualityScore(tokens, extractionLog, lintResult, cssVars, fontFaces);
  if (!dryRun) {
    writeJson(path.join(runDir, "quality-score.json"), quality);
    if (JSON.stringify(lintOriginal) !== JSON.stringify(lintResult)) writeJson(lintPath, lintResult);
    if (extractionLog && typeof extractionLog === "object") {
      extractionLog.lint = lintResult;
      fs.writeFileSync(logPath, YAML.stringify(extractionLog));
    }
  }

  const blockers = quality.gates?.blockers?.length ? ` blockers=${quality.gates.blockers.join(",")}` : "";
  return `${dryRun ? "dry " : "ok  "} ${slug}: quality=${quality.grade} ${quality.overall}/100 avg=${quality.average ?? quality.overall} lint=${formatLintSummary(lintResult)}${blockers}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const slugs = listExtracts(args.only);
  if (slugs.length === 0) {
    console.error("[backfill-quality-score] no eligible extracts found");
    process.exit(2);
  }

  console.log(`[backfill-quality-score] ${slugs.length} extracts ${args.dryRun ? "(dry-run)" : ""}`);
  let ok = 0;
  let fail = 0;
  for (const slug of slugs) {
    try {
      console.log(`  ${processOne(slug, args.dryRun)}`);
      ok++;
    } catch (err) {
      fail++;
      console.error(`  fail ${slug}: ${err.message}`);
    }
  }
  console.log(`[backfill-quality-score] done — ${ok} ok, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
