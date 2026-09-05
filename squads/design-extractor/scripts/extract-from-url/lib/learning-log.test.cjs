"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { test } = require("node:test");

const {
  buildExtractUrlLearningLog,
  buildFailureLearningLog,
  lintCounts,
  learningEnabled,
  writeExtractUrlLearningLog,
} = require("./learning-log.cjs");

function tempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "design-md-learning-"));
}

function write(filePath, content = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test("learningEnabled respects CLI and env opt-outs", () => {
  assert.equal(learningEnabled({}, {}), true);
  assert.equal(learningEnabled({ "no-learning": true }, {}), false);
  assert.equal(learningEnabled({}, { DESIGN_MD_SKIP_LEARNING: "1" }), false);
});

test("buildExtractUrlLearningLog creates a digester-compatible execution log", () => {
  const repoRoot = tempRepo();
  const finalDir = path.join(repoRoot, "outputs", "design-ops", "url-extracts", "stripe");
  write(path.join(finalDir, "DESIGN.md"), "---\nname: Stripe\n---\n");
  write(path.join(finalDir, "telemetry.json"), "{}");
  write(path.join(finalDir, "quality-score.json"), "{}");
  write(path.join(finalDir, "extraction-class.json"), "{}");

  const payload = buildExtractUrlLearningLog({
    repoRoot,
    runTs: "20260507-120000",
    url: "https://stripe.com/",
    company: "stripe",
    baseCompany: "stripe",
    outDir: finalDir,
    finalDir,
    telemetry: {
      generated_at: "2026-05-07T12:00:00.000Z",
      provider: "openrouter",
      wall_clock_ms: 90000,
      llm: { provider: "openrouter", model: "anthropic/claude-haiku-4-5", cost_estimate: { usd: 0.12 } },
      fetch: { strategy: "honest" },
      phases: { phase_1_fetch: 10 },
    },
    extractionClass: {
      operational_mode: "live_extraction",
      status: "complete",
      coverage_real: true,
      evidence: { extraction_gap_count: 2, fallback_suspects: [] },
    },
    promotion: { promoted: true },
    qualityScore: { overall: 91, grade: "A" },
    lintResult: { ran: true, exit_code: 0, errors_count: 0, warnings_count: 0 },
    reuseTrace: { fetch: "MISS", collect: "MISS", detect: "MISS", markdown: "MISS", llm: "MISS" },
    args: {},
  });

  assert.equal(payload.skill_id, "extract-from-url");
  assert.equal(payload.story_id, "stripe-20260507-120000");
  assert.equal(payload.outcome, "completed");
  assert.equal(payload.gate_result, "PASS");
  assert.equal(payload.epilogue.source_type, "skill_execution");
  assert.match(payload.epilogue.what_worked, /Dream Cycle D10/);
  assert.equal(payload.epilogue.what_failed, "null");
  assert.ok(payload.files_modified.includes("outputs/design-ops/url-extracts/stripe/DESIGN.md"));
});

test("writeExtractUrlLearningLog writes to canonical .aiox learning logs", () => {
  const repoRoot = tempRepo();
  const payload = buildExtractUrlLearningLog({
    repoRoot,
    runTs: "20260507-120000",
    url: "https://example.com/",
    company: "example",
    baseCompany: "example",
    outDir: path.join(repoRoot, "outputs", "design-ops", "url-extracts", "example"),
    finalDir: path.join(repoRoot, "outputs", "design-ops", "url-extracts", "example"),
    telemetry: { generated_at: "2026-05-07T12:00:00.000Z", wall_clock_ms: 1 },
    extractionClass: { operational_mode: "live_extraction", status: "complete", coverage_real: true, evidence: {} },
    promotion: null,
    qualityScore: { overall: 88, grade: "B" },
    lintResult: { ran: true, exit_code: 0, errors_count: 0, warnings_count: 1 },
    reuseTrace: {},
    args: {},
  });

  const result = writeExtractUrlLearningLog({ repoRoot, payload });
  assert.equal(result.learningLog, ".aiox/learning/logs/extract-from-url/extract-from-url-example-20260507-120000.yaml");
  assert.ok(fs.existsSync(result.absolutePath));
  const raw = fs.readFileSync(result.absolutePath, "utf8");
  assert.match(raw, /skill_id: extract-from-url/);
  assert.match(raw, /what_failed:/);
});

test("lintCounts marks non-zero lint exit with zero reported errors as failed", () => {
  const counts = lintCounts({ ran: true, exit_code: 1, errors_count: 0, warnings_count: 0 });

  assert.equal(counts.ran, true);
  assert.equal(counts.errors, 0);
  assert.equal(counts.warnings, 0);
  assert.equal(counts.failed, true);
});

test("buildFailureLearningLog captures crash context for failed runs", () => {
  const repoRoot = tempRepo();
  const outDir = path.join(repoRoot, "outputs", "design-ops", "url-extracts", "example", ".run-20260507-120000");
  write(path.join(outDir, "crash-context.json"), "{}");

  const payload = buildFailureLearningLog({
    repoRoot,
    url: "https://example.com/pricing",
    outDir,
    inputsDir: path.join(outDir, "inputs"),
    error: new Error("Content-validation gate failed"),
    lastPhase: "phase_2_collect",
    completedPhases: { phase_1_fetch: 20 },
  });

  assert.equal(payload.outcome, "failed");
  assert.equal(payload.gate_result, "FAIL");
  assert.equal(payload.epilogue.what_worked, "null");
  assert.match(payload.epilogue.what_failed, /phase_2_collect/);
  assert.match(payload.epilogue.what_failed, /Content-validation gate failed/);
});
