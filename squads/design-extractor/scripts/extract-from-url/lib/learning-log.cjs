"use strict";

const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const SKILL_ID = "extract-from-url";

function learningEnabled(args = {}, env = process.env) {
  return !args["no-learning"] && env.DESIGN_MD_SKIP_LEARNING !== "1";
}

function safeRelative(root, target) {
  if (!target) return null;
  try {
    return path.relative(root, target).replace(/\\/g, "/") || ".";
  } catch {
    return String(target).replace(/\\/g, "/");
  }
}

function compactList(items, fallback = "null") {
  const filtered = (items || []).filter(Boolean).map((item) => String(item).trim()).filter(Boolean);
  return filtered.length ? filtered.join(" | ") : fallback;
}

function round(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function lintCounts(lintResult) {
  if (!lintResult || typeof lintResult !== "object") {
    return { errors: null, warnings: null, ran: false, failed: false };
  }
  const errors = Number.isFinite(Number(lintResult.errors_count))
    ? Number(lintResult.errors_count)
    : (Array.isArray(lintResult.errors) ? lintResult.errors.length : 0);
  const warnings = Number.isFinite(Number(lintResult.warnings_count))
    ? Number(lintResult.warnings_count)
    : (Array.isArray(lintResult.warnings) ? lintResult.warnings.length : 0);
  const exitCode = Number(lintResult.exit_code || 0);
  const failed = lintResult.execution_error === true || exitCode !== 0;
  return { errors, warnings, ran: lintResult.ran === true, failed };
}

function deriveGateResult({ outcome, qualityScore, lintResult, extractionClass }) {
  if (outcome !== "completed") return "FAIL";
  const lint = lintCounts(lintResult);
  if (lint.failed || (lint.errors || 0) > 0) return "FAIL";
  const quality = Number(qualityScore?.overall);
  if (Number.isFinite(quality) && quality < 80) return "CONCERNS";
  if (extractionClass?.status && extractionClass.status !== "complete") return "CONCERNS";
  return (lint.warnings || 0) > 0 ? "CONCERNS" : "PASS";
}

function qualityConfidence({ outcome, qualityScore, lintResult, extractionClass }) {
  if (outcome !== "completed") return "LOW";
  const lint = lintCounts(lintResult);
  const quality = Number(qualityScore?.overall);
  if (lint.failed || (lint.errors || 0) > 0) return "LOW";
  if (Number.isFinite(quality) && quality >= 85 && extractionClass?.status === "complete") return "HIGH";
  return "MEDIUM";
}

function fallbackSummary(extractionClass) {
  const suspects = extractionClass?.evidence?.fallback_suspects;
  if (!Array.isArray(suspects) || suspects.length === 0) {
    return { total: 0, unbacked: 0, ids: [] };
  }
  const unbacked = suspects.filter((item) => item && item.source_backed === false);
  return {
    total: suspects.length,
    unbacked: unbacked.length,
    ids: unbacked.map((item) => item.id).filter(Boolean).slice(0, 6),
  };
}

function buildWorkedPattern({ telemetry, extractionClass, qualityScore, promotion, reuseTrace }) {
  const mode = extractionClass?.operational_mode || telemetry?.operational_mode || "unknown_mode";
  const status = extractionClass?.status || telemetry?.status || "unknown_status";
  const quality = Number.isFinite(Number(qualityScore?.overall)) ? `${qualityScore.overall}/100` : "unknown quality";
  const coverage = extractionClass?.coverage_real === true ? "real coverage" : "non-live or synthetic coverage";
  const promotionText = promotion
    ? (promotion.promoted ? "promoted to canonical company root" : "archived to history because score did not beat previous best")
    : "kept in explicit output directory";
  const reuseHits = Object.values(reuseTrace || {}).filter((value) => value === "HIT").length;
  const reuseText = reuseHits > 0 ? ` with ${reuseHits} reused phase(s)` : "";
  return `extract-from-url completed ${mode}/${status}${reuseText}; telemetry, extraction-class, quality-score, and DESIGN.md evidence were available for Dream Cycle D10; quality=${quality}; coverage=${coverage}; outcome=${promotionText}.`;
}

function buildFailedPattern({ error, lastPhase, extractionClass, qualityScore, lintResult }) {
  const details = [];
  if (lastPhase) details.push(`last_phase=${lastPhase}`);
  if (error?.message) details.push(`error=${String(error.message).slice(0, 180)}`);
  if (extractionClass?.operational_mode) details.push(`mode=${extractionClass.operational_mode}/${extractionClass.status || "unknown_status"}`);
  const quality = Number(qualityScore?.overall);
  if (Number.isFinite(quality)) details.push(`quality=${quality}/100`);
  const lint = lintCounts(lintResult);
  if (lint.ran) details.push(`lint=${lint.errors || 0}E/${lint.warnings || 0}W`);
  return `extract-from-url run did not complete cleanly; ${details.join("; ") || "no structured failure detail was available"}.`;
}

function buildIssuePattern({ qualityScore, lintResult, extractionClass }) {
  const issues = [];
  const quality = Number(qualityScore?.overall);
  if (Number.isFinite(quality) && quality < 85) {
    issues.push(`quality below target (${quality}/100, grade=${qualityScore?.grade || "unknown"})`);
  }
  const lint = lintCounts(lintResult);
  if (lint.failed) {
    issues.push("design.md lint execution failed");
  } else if ((lint.errors || 0) > 0 || (lint.warnings || 0) > 0) {
    issues.push(`design.md lint reported ${lint.errors || 0} error(s) and ${lint.warnings || 0} warning(s)`);
  }
  if (extractionClass?.coverage_real === false && extractionClass?.operational_mode === "live_extraction") {
    issues.push("live extraction was not classified as real coverage");
  }
  const fallback = fallbackSummary(extractionClass);
  if (fallback.unbacked > 0) {
    issues.push(`unbacked fallback suspects detected (${fallback.ids.join(", ")})`);
  }
  return compactList(issues);
}

function buildDecisionDrift({ args, telemetry, promotion, extractionClass }) {
  const decisions = [];
  if (args?.["manual-recovery"] || telemetry?.manual_recovery === true) {
    decisions.push("manual recovery mode replaced model-authored provenance for this run");
  }
  if (args?.["no-content-gate"]) {
    decisions.push("operator bypassed content-validation gate with --no-content-gate");
  }
  if (promotion && promotion.promoted === false) {
    decisions.push("promotion path archived the run because new score was below previous canonical score");
  }
  if (telemetry?.fetch?.strategy === "browser") {
    decisions.push("fetch path used browser-compatible strategy after honest fetch was insufficient");
  }
  if (extractionClass?.operational_mode && extractionClass.operational_mode !== "live_extraction") {
    decisions.push(`run classified as ${extractionClass.operational_mode}, so corpus consumers must not treat it as live coverage`);
  }
  return compactList(decisions);
}

function buildFilesModified({ repoRoot, finalDir, outDir }) {
  const base = finalDir || outDir;
  const { LOG_ARTIFACT_NAMES, logReadPath } = require("./log-paths.cjs");
  const candidates = [
    "DESIGN.md",
    "tokens.json",
    "tokens-extended.json",
    "render-contract.json",
    "quality-score.json",
    "lint-report.json",
    "extraction-class.json",
    "telemetry.json",
    "preview.html",
    "extraction-log.yaml",
  ];
  return candidates
    .map((name) => LOG_ARTIFACT_NAMES.has(name) ? logReadPath(base, name) : path.join(base, name))
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => safeRelative(repoRoot, filePath));
}

function buildDecisions({ telemetry, extractionClass, promotion }) {
  const decisions = [];
  if (telemetry?.llm?.provider || telemetry?.provider) {
    decisions.push({
      description: `LLM provider resolved to ${telemetry?.llm?.provider || telemetry?.provider}${telemetry?.llm?.model ? ` (${telemetry.llm.model})` : ""}.`,
      type: "library-choice",
      alternatives: ["claude-cli", "codex-cli", "openrouter", "openai", "anthropic-api", "generic-http"],
      rationale: "Provider routing is part of the universal DESIGN.md extraction contract.",
    });
  }
  if (extractionClass?.operational_mode) {
    decisions.push({
      description: `Run classified as ${extractionClass.operational_mode}/${extractionClass.status || "unknown"}.`,
      type: "governance",
      alternatives: ["live_extraction", "imported_curated_md", "manual_recovery", "partial_failed"],
      rationale: "Corpus consumers need mode-aware coverage and quality interpretation.",
    });
  }
  if (promotion) {
    decisions.push({
      description: promotion.promoted ? "Promoted run to canonical company directory." : "Archived run under history instead of replacing canonical output.",
      type: "algorithm",
      alternatives: ["always overwrite canonical output", "always append history", "score-based promote-or-archive"],
      rationale: "Score-based promotion preserves the best known extraction while retaining regressions for audit.",
    });
  }
  return decisions;
}

function buildErrors({ outcome, error, lastPhase, lintResult }) {
  const errors = [];
  if (outcome !== "completed" && error) {
    errors.push({
      phase: lastPhase || "unknown",
      message: String(error.message || error).slice(0, 500),
      resolution: null,
    });
  }
  const lint = lintCounts(lintResult);
  if (lint.failed) {
    errors.push({
      phase: "phase_7_log",
      message: "DESIGN.md lint execution failed.",
      resolution: "Inspect lint-report.json and rerun after correcting the lint command or DESIGN.md shape.",
    });
  }
  return errors;
}

function buildExtractUrlLearningLog({
  repoRoot,
  runTs,
  url,
  company,
  baseCompany,
  outDir,
  finalDir,
  telemetry,
  extractionClass,
  promotion,
  qualityScore,
  lintResult,
  reuseTrace,
  args,
  outcome = "completed",
  error = null,
  lastPhase = null,
  completedPhases = null,
}) {
  const now = new Date().toISOString();
  const runId = `${company || "extract"}-${runTs || inferRunTs(outDir)}`;
  const durationMinutes = round((telemetry?.wall_clock_ms || 0) / 60000, 2);
  const confidence = qualityConfidence({ outcome, qualityScore, lintResult, extractionClass });
  const whatFailed = outcome === "completed"
    ? buildIssuePattern({ qualityScore, lintResult, extractionClass })
    : buildFailedPattern({ error, lastPhase, extractionClass, qualityScore, lintResult });

  return {
    schema_version: "1.0",
    skill_id: SKILL_ID,
    run_id: runId,
    timestamp: telemetry?.generated_at || now,
    timestamp_started: null,
    timestamp_updated: now,
    timestamp_completed: now,
    story_id: runId,
    executor: "system",
    duration_minutes: durationMinutes,
    mode: "cli",
    files_modified: buildFilesModified({ repoRoot, finalDir, outDir }),
    decisions: buildDecisions({ telemetry, extractionClass, promotion }),
    errors: buildErrors({ outcome, error, lastPhase, lintResult }),
    outcome,
    coderabbit_iterations: 0,
    gate_result: deriveGateResult({ outcome, qualityScore, lintResult, extractionClass }),
    process_context: {
      process_id: SKILL_ID,
      source_type: "url_extraction",
      url,
      company: company || null,
      base_company: baseCompany || null,
      out_dir: safeRelative(repoRoot, outDir),
      final_dir: safeRelative(repoRoot, finalDir || outDir),
      last_phase: lastPhase || null,
    },
    metrics: {
      quality_overall: Number.isFinite(Number(qualityScore?.overall)) ? Number(qualityScore.overall) : null,
      quality_grade: qualityScore?.grade || null,
      lint: lintCounts(lintResult),
      operational_mode: extractionClass?.operational_mode || telemetry?.operational_mode || null,
      extraction_status: extractionClass?.status || telemetry?.status || null,
      coverage_real: extractionClass?.coverage_real ?? telemetry?.coverage_real ?? null,
      extraction_gap_count: extractionClass?.evidence?.extraction_gap_count ?? telemetry?.extraction_gap_count ?? null,
      fallback_suspects: fallbackSummary(extractionClass),
      reuse_hits: Object.values(reuseTrace || {}).filter((value) => value === "HIT").length,
      cost_usd: telemetry?.llm?.cost_estimate?.usd ?? null,
      completed_phases: completedPhases || telemetry?.phases || null,
    },
    evidence_refs: buildFilesModified({ repoRoot, finalDir, outDir }),
    epilogue: {
      what_worked: outcome === "completed"
        ? buildWorkedPattern({ telemetry, extractionClass, qualityScore, promotion, reuseTrace })
        : "null",
      what_failed: whatFailed,
      decision_drift: buildDecisionDrift({ args, telemetry, promotion, extractionClass }),
      confidence,
      source_type: "skill_execution",
    },
  };
}

function inferRunTs(outDir) {
  const base = path.basename(outDir || "");
  const match = base.match(/(?:\.run-|^)(\d{8}-\d{6})/);
  if (match) return match[1];
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function writeExtractUrlLearningLog({ repoRoot, payload }) {
  const runId = payload.run_id || `${SKILL_ID}-${inferRunTs()}`;
  const logsDir = path.join(repoRoot, ".aiox", "learning", "logs", SKILL_ID);
  const filePath = path.join(logsDir, `${SKILL_ID}-${runId}.yaml`);
  fs.mkdirSync(logsDir, { recursive: true });
  const header = [
    "# Execution Log - extract-from-url",
    "# Generated by squads/design-ops/scripts/extract-from-url/run.cjs",
    "# Consumed by scripts/learning-digester.js during Dream Cycle D10",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, header + YAML.stringify(payload, { lineWidth: 0 }), "utf8");
  return {
    learningLog: safeRelative(repoRoot, filePath),
    absolutePath: filePath,
  };
}

function buildFailureLearningLog({ repoRoot, url, outDir, inputsDir, error, lastPhase, completedPhases }) {
  const company = (() => {
    try {
      const host = new URL(url).host.replace(/^www\./, "");
      return host.split(".")[0].replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "extract";
    } catch {
      return "extract";
    }
  })();
  const runTs = inferRunTs(outDir);
  return buildExtractUrlLearningLog({
    repoRoot,
    runTs,
    url,
    company,
    baseCompany: company,
    outDir,
    finalDir: outDir,
    telemetry: { generated_at: new Date().toISOString(), phases: completedPhases || {}, wall_clock_ms: 0 },
    extractionClass: null,
    promotion: null,
    qualityScore: null,
    lintResult: null,
    reuseTrace: null,
    args: {},
    outcome: "failed",
    error,
    lastPhase,
    completedPhases,
    inputsDir,
  });
}

module.exports = {
  SKILL_ID,
  learningEnabled,
  buildExtractUrlLearningLog,
  buildFailureLearningLog,
  writeExtractUrlLearningLog,
  lintCounts,
};
