"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { test } = require("node:test");

const { loadProcessContract } = require("./process-contract.cjs");
const { validateNoFallbacksForRunDir } = require("./no-fallbacks-gate.cjs");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function makeLive(root, designMd, evidenceHtml = "<html></html>") {
  fs.mkdirSync(path.join(root, "inputs"), { recursive: true });
  fs.writeFileSync(path.join(root, "DESIGN.md"), designMd);
  writeJson(path.join(root, "tokens.json"), {});
  writeJson(path.join(root, "telemetry.json"), { provider: "codex-cli" });
  fs.writeFileSync(path.join(root, "inputs", "page.html"), evidenceHtml);
  fs.writeFileSync(path.join(root, "inputs", "css-collected.css"), "body{}");
  writeJson(path.join(root, "inputs", "css-vars-detected.json"), {});
  writeJson(path.join(root, "inputs", "component-properties.json"), {});
}

test("no-fallbacks gate fails live unbacked suspects without extraction gaps", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "design-md-gate-bad-"));
  makeLive(root, "---\nname: Bad\n---\nUse #6a9bcc and Get started.");

  const report = validateNoFallbacksForRunDir(root, {
    slug: "bad",
    contract: loadProcessContract(),
  });

  assert.equal(report.gate_id, "GATE-FALLBACKS");
  assert.equal(report.pass, false);
  assert.equal(report.totals.failures, 1);
  assert.equal(report.process_contract.required_source_rules_present, true);
  assert.deepEqual(report.failures.map((failure) => failure.slug), ["bad"]);
});

test("no-fallbacks gate warns when suspect is backed by source or gap exists", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "design-md-gate-warn-"));
  makeLive(root, "---\nname: Ok\n---\nnull # extraction_gap(no_cta_in_source)\nGet started");

  const report = validateNoFallbacksForRunDir(root, {
    slug: "ok",
    contract: loadProcessContract(),
  });

  assert.equal(report.pass, true);
  assert.equal(report.totals.failures, 0);
  assert.equal(report.totals.warnings, 1);
});

test("no-fallbacks gate fails if live run lacks loaded process contract", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "design-md-gate-contract-"));
  makeLive(root, "---\nname: Missing Contract\n---\nNo suspect.");

  const report = validateNoFallbacksForRunDir(root, { slug: "missing-contract" });

  assert.equal(report.pass, false);
  assert.equal(report.process_contract.loaded, false);
  assert.match(report.failures[0].recommendation, /load_valid_extraction_process_contract/);
});
