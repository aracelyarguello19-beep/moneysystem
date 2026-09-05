"use strict";

const { classifyRunDir } = require("./extraction-classifier.cjs");
const { validateProcessContract } = require("./process-contract.cjs");

const GATE_ID = "GATE-FALLBACKS";
const SCHEMA_VERSION = "1.0";

function contractSummary(contract) {
  if (!contract) {
    return {
      loaded: false,
      contract_id: null,
      version: null,
      source_rule_ids: [],
      required_source_rules_present: false,
    };
  }

  validateProcessContract(contract);
  const sourceRuleIds = (contract.source_rules || []).map((rule) => rule.id);
  return {
    loaded: true,
    contract_id: contract.contract_id,
    version: contract.version,
    source_rule_ids: sourceRuleIds,
    required_source_rules_present:
      sourceRuleIds.includes("extraction-no-fallbacks") &&
      sourceRuleIds.includes("design-md-convention"),
  };
}

function failureFromClassification(item, unbacked) {
  return {
    slug: item.slug,
    source_url: item.source_url,
    fallback_suspects: unbacked.map((suspect) => ({
      id: suspect.id,
      count: suspect.count,
      severity: suspect.severity,
      source_backed: suspect.source_backed,
      source_count: suspect.source_count,
    })),
    recommendation: "rerun_with_loaded_no_fallback_contract_or_add_source-backed_extraction_gap_markers",
  };
}

function warningFromClassification(item) {
  return {
    slug: item.slug,
    extraction_gap_count: item.evidence.extraction_gap_count,
    fallback_suspects: item.evidence.fallback_suspects.map((suspect) => {
      const source = suspect.source_backed ? ` source=${suspect.source_count}` : " source=0";
      return `${suspect.id}:${suspect.count}${source}`;
    }),
  };
}

function validateNoFallbacksForRunDir(runDir, options = {}) {
  const item = classifyRunDir(runDir, {
    slug: options.slug,
    url: options.url,
    runTs: options.runTs,
  });
  const contract = contractSummary(options.contract || null);
  const isLive = item.operational_mode === "live_extraction";
  const unbacked = item.evidence.fallback_suspects.filter((suspect) => !suspect.source_backed);
  const failures = [];

  if (isLive && !contract.required_source_rules_present) {
    failures.push({
      slug: item.slug,
      source_url: item.source_url,
      fallback_suspects: [],
      recommendation: "load_valid_extraction_process_contract_before_promotion",
    });
  }

  if (isLive && unbacked.length > 0 && item.evidence.extraction_gap_count === 0) {
    failures.push(failureFromClassification(item, unbacked));
  }

  const warnings =
    isLive &&
    item.evidence.fallback_suspects.length > 0 &&
    !failures.some((failure) => failure.fallback_suspects.length > 0)
      ? [warningFromClassification(item)]
      : [];

  return {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    gate_id: GATE_ID,
    advisory: options.advisory === true,
    pass: failures.length === 0,
    process_contract: contract,
    run: {
      slug: item.slug,
      source_url: item.source_url,
      operational_mode: item.operational_mode,
      status: item.status,
      coverage_real: item.coverage_real,
      extraction_gap_count: item.evidence.extraction_gap_count,
      fallback_suspect_count: item.evidence.fallback_suspects.length,
    },
    totals: {
      live_extractions: isLive ? 1 : 0,
      failures: failures.length,
      warnings: warnings.length,
    },
    failures,
    warnings,
  };
}

module.exports = {
  GATE_ID,
  validateNoFallbacksForRunDir,
};
