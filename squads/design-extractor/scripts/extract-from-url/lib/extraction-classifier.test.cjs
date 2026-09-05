"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { test } = require("node:test");

const {
  classifyRunDir,
  annotateTelemetry,
  countExtractionGapsInText,
  scanFallbackSuspects,
  scanFallbackSuspectsWithEvidence,
} = require("./extraction-classifier.cjs");

function tempRun() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "design-md-classifier-"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

test("classifies complete live extraction and preserves real coverage", () => {
  const dir = tempRun();
  fs.mkdirSync(path.join(dir, "inputs"), { recursive: true });
  fs.writeFileSync(path.join(dir, "DESIGN.md"), "---\nname: Test\n---\n## 1. Visual Theme\n");
  writeJson(path.join(dir, "tokens.json"), { name: "Test" });
  writeJson(path.join(dir, "tokens-extended.json"), {});
  writeJson(path.join(dir, "render-contract.json"), { source: { url: "https://example.com" } });
  writeJson(path.join(dir, "quality-score.json"), { overall: 90, grade: "A" });
  writeJson(path.join(dir, "lint-report.json"), { ran: true, errors: [], warnings: [] });
  writeJson(path.join(dir, "telemetry.json"), { provider: "codex-cli", run_ts: "20260507-120000" });
  fs.writeFileSync(path.join(dir, "preview.html"), "<html></html>");
  fs.writeFileSync(path.join(dir, "extraction-log.yaml"), "source_url: https://example.com\n");
  fs.writeFileSync(path.join(dir, "agent-prompt.txt"), "Use Test");
  for (const rel of ["page.html", "css-collected.css", "css-vars-detected.json", "component-properties.json"]) {
    fs.writeFileSync(path.join(dir, "inputs", rel), rel.endsWith(".json") ? "{}" : "body{}");
  }

  const classification = classifyRunDir(dir, { slug: "test" });

  assert.equal(classification.operational_mode, "live_extraction");
  assert.equal(classification.status, "complete");
  assert.equal(classification.coverage_real, true);
  assert.equal(classification.measurement_mode, "measured");
});

test("classifies imported curated markdown as synthetic import", () => {
  const dir = tempRun();
  fs.writeFileSync(path.join(dir, "DESIGN.md"), "---\nname: Imported\n---\n");
  writeJson(path.join(dir, "tokens.json"), { name: "Imported" });
  writeJson(path.join(dir, "quality-score.json"), { overall: 82, source: "imported-design-md" });
  writeJson(path.join(dir, "telemetry.json"), { provider: "awesome-design-md" });
  writeJson(path.join(dir, "tokens-extended.json"), { source: { type: "awesome-design-md" } });

  const classification = classifyRunDir(dir, { slug: "imported" });

  assert.equal(classification.operational_mode, "imported_curated_md");
  assert.equal(classification.coverage_real, false);
  assert.equal(classification.measurement_mode, "synthetic_import");
  assert.ok(classification.recommendations.includes("exclude_from_live_coverage_metrics"));
});

test("classifies scratch orphan and failed run", () => {
  const scratch = tempRun();
  fs.mkdirSync(path.join(scratch, "inputs"), { recursive: true });
  fs.writeFileSync(path.join(scratch, "inputs", "page.html"), "<html></html>");
  assert.equal(classifyRunDir(scratch).operational_mode, "scratch_orphan");

  const failed = tempRun();
  writeJson(path.join(failed, "crash-context.json"), { last_phase: "phase_6_llm" });
  assert.equal(classifyRunDir(failed).operational_mode, "partial_failed");
  assert.equal(classifyRunDir(failed).status, "failed");

  const botGate = tempRun();
  writeJson(path.join(botGate, "inputs", "bot-detection-diagnostic.json"), { verdict: "aws-waf-challenge" });
  assert.equal(classifyRunDir(botGate).operational_mode, "partial_failed");
  assert.equal(classifyRunDir(botGate).status, "failed");
});

test("classifies root with hidden scratch runs as scratch container", () => {
  const dir = tempRun();
  fs.mkdirSync(path.join(dir, ".run-20260507-120000"), { recursive: true });
  const classification = classifyRunDir(dir);
  assert.equal(classification.operational_mode, "scratch_container");
  assert.equal(classification.status, "incomplete");
  assert.equal(classification.artifacts.scratch_runs_present, 1);
});

test("classifies root with archived scratch runs as archived scratch container", () => {
  const dir = tempRun();
  fs.mkdirSync(path.join(dir, "history", "_incomplete", "20260507-120000"), { recursive: true });
  const classification = classifyRunDir(dir);
  assert.equal(classification.operational_mode, "archived_scratch_container");
  assert.equal(classification.status, "incomplete");
  assert.equal(classification.artifacts.archived_scratch_runs_present, 1);
});

test("flags fallback suspects without treating them as proof", () => {
  const suspects = scanFallbackSuspects("Use #6a9bcc and Learn more at 64px.");
  assert.deepEqual(suspects.map((item) => item.id), [
    "sentinel-info-blue-6a9bcc",
    "generic-cta-learn-more",
    "universal-size-64px",
  ]);
});

test("counts YAML extraction_gaps list entries", () => {
  assert.equal(countExtractionGapsInText("extraction_gaps:\n  - one\n  - two\nnext: true"), 2);
});

test("classifies manually recovered extraction separately from live extraction", () => {
  const dir = tempRun();
  writeJson(path.join(dir, "telemetry.json"), {
    provider: "manual",
    manual_recovery: true,
    llm: { provenance: "manual_recovery" },
  });
  fs.writeFileSync(path.join(dir, "DESIGN.md"), "---\nname: Manual\n---\n");
  writeJson(path.join(dir, "tokens.json"), {});
  writeJson(path.join(dir, "tokens-extended.json"), {});
  writeJson(path.join(dir, "render-contract.json"), {});
  writeJson(path.join(dir, "quality-score.json"), {});
  writeJson(path.join(dir, "lint-report.json"), {});
  fs.writeFileSync(path.join(dir, "preview.html"), "");
  fs.writeFileSync(path.join(dir, "extraction-log.yaml"), "");
  fs.writeFileSync(path.join(dir, "agent-prompt.txt"), "");
  fs.mkdirSync(path.join(dir, "inputs"), { recursive: true });

  const classification = classifyRunDir(dir, { slug: "manual" });
  assert.equal(classification.operational_mode, "manual_recovery");
  assert.equal(classification.coverage_real, false);
  assert.equal(classification.measurement_mode, "manual_static_evidence");
});

test("marks fallback suspects as source-backed when evidence contains the literal", () => {
  const suspects = scanFallbackSuspectsWithEvidence("Use #6a9bcc and Learn more.", "source css: --swatch--sky:#6a9bcc;");
  assert.deepEqual(suspects.map((item) => [item.id, item.source_backed]), [
    ["sentinel-info-blue-6a9bcc", true],
    ["generic-cta-learn-more", false],
  ]);
});

test("does not use generated extraction-log as source evidence for fallback suspects", () => {
  const dir = tempRun();
  fs.writeFileSync(path.join(dir, "DESIGN.md"), "---\nname: Test\n---\n\nUse #6a9bcc.\n");
  fs.writeFileSync(path.join(dir, "extraction-log.yaml"), "source_evidence: '#6a9bcc'\n");

  const classification = classifyRunDir(dir, { slug: "generated-log-only" });
  const sentinel = classification.evidence.fallback_suspects.find((item) =>
    item.id === "sentinel-info-blue-6a9bcc"
  );

  assert.equal(sentinel.source_backed, false);
  assert.equal(sentinel.source_count, 0);
});

test("marks px suspects as source-backed when equivalent rem appears in evidence", () => {
  const suspects = scanFallbackSuspectsWithEvidence("Spacing uses 64px and 40px.", ".x{padding:4rem;height:2.5rem}");
  assert.deepEqual(suspects.map((item) => [item.id, item.source_backed]), [
    ["universal-size-40px", true],
    ["universal-size-64px", true],
  ]);
});

test("annotates telemetry with mode and coverage fields", () => {
  const telemetry = annotateTelemetry({ provider: "codex-cli" }, {
    operational_mode: "live_extraction",
    coverage_real: true,
    measurement_mode: "measured",
    status: "complete",
    evidence: { extraction_gap_count: 3 },
  });
  assert.equal(telemetry.operational_mode, "live_extraction");
  assert.equal(telemetry.coverage_real, true);
  assert.equal(telemetry.extraction_gap_count, 3);
  assert.equal(telemetry.artifacts_complete, true);
});
