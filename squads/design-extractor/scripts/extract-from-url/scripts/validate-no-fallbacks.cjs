#!/usr/bin/env node
/**
 * Validate no-fallback doctrine signals for live design-md extractions.
 *
 * This does not prove a value is fabricated. It blocks only the strongest
 * observable failure shape: live extraction + unbacked fallback suspect + zero
 * explicit extraction_gap(...) markers. Source-backed suspects remain warnings.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const { loadProcessContract, DEFAULT_PROCESS_CONTRACT_PATH } = require("../lib/process-contract.cjs");
const { validateNoFallbacksForRunDir } = require("../lib/no-fallbacks-gate.cjs");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const DEFAULT_ROOT = path.join(REPO_ROOT, "outputs", "design-ops", "url-extracts");

function parseArgs(argv) {
  const args = {
    root: DEFAULT_ROOT,
    only: null,
    advisory: false,
    json: false,
    contract: DEFAULT_PROCESS_CONTRACT_PATH,
  };
  for (const arg of argv) {
    if (arg === "--advisory") args.advisory = true;
    else if (arg === "--json") args.json = true;
    else if (arg.startsWith("--root=")) args.root = path.resolve(arg.slice(7));
    else if (arg.startsWith("--only=")) args.only = new Set(arg.slice(7).split(",").map((item) => item.trim()).filter(Boolean));
    else if (arg.startsWith("--contract=")) args.contract = path.resolve(arg.slice(11));
  }
  return args;
}

function listBrandDirs(root, only) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith(".") && !name.startsWith("_"))
    .filter((name) => !only || only.has(name))
    .sort((a, b) => a.localeCompare(b));
}

function validate(args) {
  const contract = loadProcessContract(args.contract);
  const reports = listBrandDirs(args.root, args.only)
    .map((slug) => validateNoFallbacksForRunDir(path.join(args.root, slug), {
      slug,
      advisory: args.advisory,
      contract,
    }))
    .filter((report) => report.totals.live_extractions > 0);

  const failures = reports.flatMap((report) => report.failures);
  const warnings = reports.flatMap((report) => report.warnings);

  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    source_root: path.relative(REPO_ROOT, args.root),
    advisory: args.advisory,
    process_contract: reports[0]?.process_contract || {
      loaded: true,
      contract_id: contract.contract_id,
      version: contract.version,
      source_rule_ids: (contract.source_rules || []).map((rule) => rule.id),
      required_source_rules_present: true,
    },
    totals: {
      live_extractions: reports.length,
      failures: failures.length,
      warnings: warnings.length,
    },
    failures,
    warnings,
  };
}

function printReport(report) {
  console.log(`[validate-no-fallbacks] live=${report.totals.live_extractions} failures=${report.totals.failures} warnings=${report.totals.warnings}`);
  for (const failure of report.failures) {
    console.log(`  fail ${failure.slug}: ${failure.fallback_suspects.map((item) => `${item.id}:${item.count}`).join(", ")}`);
  }
  for (const warning of report.warnings) {
    console.log(`  warn ${warning.slug}: gaps=${warning.extraction_gap_count} suspects=${warning.fallback_suspects.join(", ")}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = validate(args);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
  if (!args.advisory && report.failures.length > 0) process.exit(1);
}

if (require.main === module) main();

module.exports = { validate };
