"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { test } = require("node:test");

const { REQUIRED_ARTIFACTS, scoreRun } = require("./scoring.cjs");

function writeCompleteLegacyRun(dir) {
  fs.mkdirSync(path.join(dir, ".logs"), { recursive: true });
  for (const name of REQUIRED_ARTIFACTS) {
    const target = ["telemetry.json", "extraction-log.yaml", "run.log.ndjson", "inputs-manifest.json"].includes(name)
      ? path.join(dir, ".logs", name)
      : path.join(dir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (name === "quality-score.json") {
      fs.writeFileSync(target, JSON.stringify({ overall: 91 }));
    } else if (name === "lint-report.json") {
      fs.writeFileSync(target, JSON.stringify({ ran: true, exit_code: 0, errors_count: 0, warnings_count: 0 }));
    } else if (name === "extraction-log.yaml") {
      fs.writeFileSync(target, "confidence_summary:\n  high: 4\n");
    } else {
      fs.writeFileSync(target, name.endsWith(".json") ? "{}" : "");
    }
  }
}

test("scoreRun treats no-fallbacks-report as modern gate metadata, not legacy completeness", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "design-md-score-"));
  writeCompleteLegacyRun(dir);

  const score = scoreRun(dir);

  assert.equal(REQUIRED_ARTIFACTS.includes("no-fallbacks-report.json"), false);
  assert.equal(score.complete, true);
  assert.equal(score.hasNoFallbacksReport, false);
  assert.deepEqual(score.missing, []);

  fs.rmSync(dir, { recursive: true, force: true });
});
