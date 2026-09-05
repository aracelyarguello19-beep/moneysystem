"use strict";

const fs = require("fs");
const path = require("path");

const { LOG_ARTIFACT_NAMES, logReadPath } = require("./log-paths.cjs");

const SCHEMA_VERSION = "1.0";

function resolveArtifactPath(runDir, name) {
  return LOG_ARTIFACT_NAMES.has(name) ? logReadPath(runDir, name) : path.join(runDir, name);
}

const CORE_ARTIFACTS = [
  "DESIGN.md",
  "tokens.json",
  "tokens-extended.json",
  "render-contract.json",
  "quality-score.json",
  "lint-report.json",
  "telemetry.json",
  "preview.html",
  "extraction-log.yaml",
  "agent-prompt.txt",
];

const LIVE_EVIDENCE_ARTIFACTS = [
  "inputs/page.html",
  "inputs/css-collected.css",
  "inputs/css-vars-detected.json",
  "inputs/component-properties.json",
  "inputs/font-faces.json",
  "inputs/motion.json",
  "inputs/selector-provenance.json",
  "inputs/atomic-classification.json",
];

const IMPORT_CORE_ARTIFACTS = [
  "DESIGN.md",
  "tokens.json",
  "tokens-extended.json",
  "render-contract.json",
  "quality-score.json",
  "telemetry.json",
  "preview.html",
  "extraction-log.yaml",
  "agent-prompt.txt",
];

const FALLBACK_SUSPECT_PATTERNS = [
  {
    id: "sentinel-info-blue-6a9bcc",
    pattern: /#6a9bcc\b/gi,
    severity: "high",
    description: "Universal info-blue sentinel named by no-fallbacks doctrine.",
  },
  {
    id: "generic-cta-get-started",
    pattern: /\bGet started\b/gi,
    severity: "medium",
    description: "Generic CTA verb often emitted as a fallback instead of source copy.",
  },
  {
    id: "generic-cta-learn-more",
    pattern: /\bLearn more\b/gi,
    severity: "medium",
    description: "Generic CTA verb often emitted as a fallback instead of source copy.",
  },
  {
    id: "universal-size-40px",
    pattern: /(?<![\d.])40px\b/gi,
    evidencePattern: /(?<![\d.])(?:40px|2\.5rem)\b/gi,
    severity: "medium",
    description: "Common button-height/Tailwind scale stamp; requires evidence review.",
  },
  {
    id: "universal-size-64px",
    pattern: /(?<![\d.])64px\b/gi,
    evidencePattern: /(?<![\d.])(?:64px|4rem)\b/gi,
    severity: "medium",
    description: "Common nav-height/Tailwind scale stamp; requires evidence review.",
  },
];

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function dirExists(dirPath) {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function readText(filePath) {
  try {
    return fileExists(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  } catch {
    return "";
  }
}

function readJson(filePath) {
  try {
    return fileExists(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
  } catch {
    return null;
  }
}

function countMatches(text, pattern) {
  if (!text) return 0;
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function countExtractionGapsInText(text) {
  if (!text) return 0;
  let count = countMatches(text, /extraction_gap\(/gi);
  const lines = text.split(/\r?\n/);
  let inBlock = false;
  for (const line of lines) {
    if (/^extraction_gaps:\s*$/i.test(line.trim())) {
      inBlock = true;
      continue;
    }
    if (!inBlock) continue;
    if (/^\s*-\s+\S/.test(line)) {
      count++;
      continue;
    }
    if (/^[A-Za-z0-9_-]+:\s*/.test(line)) {
      inBlock = false;
    }
  }
  return count;
}

function scanFallbackSuspects(text) {
  return FALLBACK_SUSPECT_PATTERNS
    .map((rule) => ({
      id: rule.id,
      severity: rule.severity,
      description: rule.description,
      count: countMatches(text, rule.pattern),
      source_backed: false,
      source_count: 0,
    }))
    .filter((item) => item.count > 0);
}

function scanFallbackSuspectsWithEvidence(text, evidenceText) {
  return FALLBACK_SUSPECT_PATTERNS
    .map((rule) => {
      const count = countMatches(text, rule.pattern);
      if (count === 0) return null;
      const sourceCount = countMatches(evidenceText, rule.evidencePattern || rule.pattern);
      return {
        id: rule.id,
        severity: rule.severity,
        description: rule.description,
        count,
        source_backed: sourceCount > 0,
        source_count: sourceCount,
      };
    })
    .filter(Boolean);
}

function sourceEvidenceTextFor(runDir) {
  const rels = [
    "inputs/page.html",
    "inputs/page.md",
    "inputs/page-copy.json",
    "inputs/css-collected.css",
    "inputs/css-for-llm.css",
    "inputs/css-vars-detected.json",
    "inputs/tokens-detected.json",
    "inputs/component-properties.json",
    "inputs/selector-provenance.json",
    "inputs/token-usage-graph.json",
    "inputs/motion.json",
    "inputs/breakpoints.json",
  ];
  return rels.map((rel) => readText(path.join(runDir, rel))).filter(Boolean).join("\n");
}

function listPresentMissing(runDir, names) {
  const present = [];
  const missing = [];
  for (const rel of names) {
    const probe = LOG_ARTIFACT_NAMES.has(rel) ? logReadPath(runDir, rel) : path.join(runDir, rel);
    if (fileExists(probe)) present.push(rel);
    else missing.push(rel);
  }
  return { present, missing };
}

function inferMode({ runDir, telemetry, quality, extended, hasDesign, hasTokens, hasCurated, hasCrash, hasInputs, hasBotGateDiagnostic }) {
  const provider = telemetry?.provider || telemetry?.llm?.provider || null;
  const qualitySource = quality?.source || null;
  const extendedSourceType = extended?.source?.type || null;
  const manualRecovery =
    telemetry?.manual_recovery === true ||
    telemetry?.llm?.provenance === "manual_recovery" ||
    telemetry?.operational_mode === "manual_recovery" ||
    provider === "manual";

  if (
    provider === "awesome-design-md" ||
    qualitySource === "imported-design-md" ||
    extendedSourceType === "awesome-design-md"
  ) {
    return "imported_curated_md";
  }

  if (hasCurated && !hasDesign) return "curated_orphan";
  if (hasCrash || (hasBotGateDiagnostic && !hasDesign)) return "partial_failed";
  if (hasDesign && hasTokens && manualRecovery) return "manual_recovery";
  if (hasInputs && (!hasDesign || !hasTokens)) return "scratch_orphan";
  if (hasDesign && hasTokens && provider && provider !== "awesome-design-md") return "live_extraction";
  if (hasDesign && !provider) return "manual_or_legacy";
  if (dirExists(runDir) && fs.readdirSync(runDir).some((name) => name.startsWith(".run-"))) return "scratch_container";
  if (dirExists(runDir) && dirExists(path.join(runDir, "history", "_incomplete")) && !hasDesign && !hasTokens) return "archived_scratch_container";
  if (dirExists(runDir)) return "unknown";
  return "missing";
}

function statusFor(mode, requiredMissing, hasCrash, hasBotGateDiagnostic = false) {
  if (hasCrash || hasBotGateDiagnostic) return "failed";
  if (mode === "curated_orphan" || mode === "scratch_orphan" || mode === "scratch_container" || mode === "archived_scratch_container") return "incomplete";
  if (requiredMissing.length === 0) return "complete";
  if (requiredMissing.length < CORE_ARTIFACTS.length) return "partial";
  return "empty";
}

function requiredArtifactsForMode(mode) {
  if (mode === "imported_curated_md") return IMPORT_CORE_ARTIFACTS;
  if (mode === "manual_or_legacy") return ["DESIGN.md"];
  if (mode === "scratch_container" || mode === "archived_scratch_container") return [];
  return CORE_ARTIFACTS;
}

function sourceUrlFor({ url, telemetry, renderContract, quality, extended }) {
  return (
    url ||
    telemetry?.url ||
    telemetry?.source_url ||
    renderContract?.source?.url ||
    quality?.source_url ||
    extended?.source?.url ||
    null
  );
}

function inferMeasurementMode(mode) {
  if (mode === "live_extraction") return "measured";
  if (mode === "manual_recovery") return "manual_static_evidence";
  if (mode === "imported_curated_md") return "synthetic_import";
  if (mode === "manual_or_legacy") return "manual_or_unknown";
  return "none";
}

function buildRecommendations({ mode, status, fallbackSuspects, extractionGapCount, coreMissing, evidenceMissing }) {
  const recommendations = [];
  if (mode === "live_extraction") {
    if (fallbackSuspects.length > 0 && extractionGapCount === 0) {
      recommendations.push("review_fallback_suspects_or_rerun_with_no_fallback_prompt");
    }
    if (coreMissing.length > 0 || evidenceMissing.length > 0) {
      recommendations.push("backfill_deterministic_sidecars");
    }
    if (recommendations.length === 0) recommendations.push("keep_as_live_reference");
  } else if (mode === "imported_curated_md") {
    recommendations.push("exclude_from_live_coverage_metrics");
    recommendations.push("keep_as_curated_reference");
  } else if (mode === "manual_recovery") {
    recommendations.push("exclude_from_live_coverage_metrics");
    recommendations.push("review_manual_recovery_provenance");
  } else if (mode === "curated_orphan") {
    recommendations.push("move_to_curated_corpus_or_run_pipeline");
  } else if (mode === "scratch_orphan") {
    recommendations.push("archive_or_rerun_partial_scratch");
  } else if (mode === "scratch_container") {
    recommendations.push("inspect_scratch_runs_then_archive_or_rerun");
  } else if (mode === "archived_scratch_container") {
    recommendations.push("rerun_or_keep_archived_scratch_only");
  } else if (mode === "partial_failed") {
    recommendations.push("inspect_crash_context_then_rerun");
  } else if (mode === "manual_or_legacy") {
    recommendations.push("label_manual_artifact_and_backfill_sidecars_if_needed");
  }
  if (status !== "complete" && !recommendations.includes("backfill_deterministic_sidecars")) {
    recommendations.push("do_not_count_as_complete_extraction");
  }
  return recommendations;
}

function classifyRunDir(runDir, options = {}) {
  const slug = options.slug || path.basename(runDir);
  const telemetry = readJson(resolveArtifactPath(runDir, "telemetry.json"));
  const quality = readJson(path.join(runDir, "quality-score.json"));
  const extended = readJson(path.join(runDir, "tokens-extended.json"));
  const renderContract = readJson(path.join(runDir, "render-contract.json"));
  const designMd = readText(path.join(runDir, "DESIGN.md"));
  const tokensText = readText(path.join(runDir, "tokens.json"));
  const previewHtml = readText(path.join(runDir, "preview.html"));
  const showcaseHtml = readText(path.join(runDir, "showcase.html"));

  const core = listPresentMissing(runDir, CORE_ARTIFACTS);
  const evidence = listPresentMissing(runDir, LIVE_EVIDENCE_ARTIFACTS);
  const hasDesign = fileExists(path.join(runDir, "DESIGN.md"));
  const hasTokens = fileExists(path.join(runDir, "tokens.json"));
  const hasCurated = fileExists(path.join(runDir, "DESIGN-curated.md"));
  const hasCrash = fileExists(path.join(runDir, "crash-context.json"));
  const hasBotGateDiagnostic = fileExists(path.join(runDir, "inputs", "bot-detection-diagnostic.json"));
  const hasInputs = dirExists(path.join(runDir, "inputs"));
  const mode = inferMode({ runDir, telemetry, quality, extended, hasDesign, hasTokens, hasCurated, hasCrash, hasInputs, hasBotGateDiagnostic });
  const required = listPresentMissing(runDir, requiredArtifactsForMode(mode));
  const status = statusFor(mode, required.missing, hasCrash, hasBotGateDiagnostic);
  const extractionGapCount = countExtractionGapsInText(designMd) + countExtractionGapsInText(tokensText);
  const fallbackSuspects = scanFallbackSuspectsWithEvidence(
    `${designMd}\n${tokensText}`,
    sourceEvidenceTextFor(runDir)
  );
  const base64Occurrences = countMatches(`${previewHtml}\n${showcaseHtml}`, /base64,/gi);
  const coverageReal = mode === "live_extraction" && hasInputs && evidence.present.length >= 3;

  return {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    slug,
    run_ts: options.runTs || telemetry?.run_ts || null,
    source_url: sourceUrlFor({ url: options.url, telemetry, renderContract, quality, extended }),
    operational_mode: mode,
    status,
    coverage_real: coverageReal,
    measurement_mode: inferMeasurementMode(mode),
    provider: telemetry?.provider || telemetry?.llm?.provider || null,
    artifacts: {
      core_present: core.present,
      core_missing: core.missing,
      required_present: required.present,
      required_missing: required.missing,
      evidence_present: evidence.present,
      evidence_missing: evidence.missing,
      has_inputs_dir: hasInputs,
      has_history_dir: dirExists(path.join(runDir, "history")),
      has_crash_context: hasCrash,
      has_bot_gate_diagnostic: hasBotGateDiagnostic,
      scratch_runs_present: dirExists(runDir)
        ? fs.readdirSync(runDir).filter((name) => name.startsWith(".run-")).length
        : 0,
      archived_scratch_runs_present: dirExists(path.join(runDir, "history", "_incomplete"))
        ? fs.readdirSync(path.join(runDir, "history", "_incomplete"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).length
        : 0,
    },
    quality: {
      overall: quality?.overall ?? null,
      grade: quality?.grade ?? null,
      source: quality?.source || null,
    },
    evidence: {
      extraction_gap_count: extractionGapCount,
      fallback_suspects: fallbackSuspects,
      base64_occurrences: base64Occurrences,
    },
    recommendations: buildRecommendations({
      mode,
      status,
      fallbackSuspects,
      extractionGapCount,
      coreMissing: core.missing,
      evidenceMissing: evidence.missing,
    }),
  };
}

function annotateTelemetry(telemetry, classification) {
  if (!telemetry || typeof telemetry !== "object") return telemetry;
  return {
    ...telemetry,
    operational_mode: classification.operational_mode,
    coverage_real: classification.coverage_real,
    measurement_mode: classification.measurement_mode,
    extraction_gap_count: classification.evidence.extraction_gap_count,
    artifacts_complete: classification.status === "complete",
  };
}

function writeExtractionClass(runDir, classification) {
  fs.writeFileSync(path.join(runDir, "extraction-class.json"), JSON.stringify(classification, null, 2) + "\n");
}

module.exports = {
  SCHEMA_VERSION,
  CORE_ARTIFACTS,
  LIVE_EVIDENCE_ARTIFACTS,
  IMPORT_CORE_ARTIFACTS,
  FALLBACK_SUSPECT_PATTERNS,
  classifyRunDir,
  annotateTelemetry,
  writeExtractionClass,
  countExtractionGapsInText,
  scanFallbackSuspects,
  scanFallbackSuspectsWithEvidence,
};
