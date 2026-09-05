"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_PROCESS_CONTRACT_PATH = path.join(
  __dirname,
  "..",
  "data",
  "extraction-process-contract.json",
);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function requirePath(object, dottedPath, missing) {
  const value = dottedPath.split(".").reduce((current, segment) => {
    if (!current || typeof current !== "object") return undefined;
    return current[segment];
  }, object);
  if (value === undefined || value === null || value === "") {
    missing.push(dottedPath);
  }
}

function validateProcessContract(contract) {
  const missing = [];
  requirePath(contract, "schema_version", missing);
  requirePath(contract, "contract_id", missing);
  requirePath(contract, "version", missing);
  requirePath(contract, "source_rules", missing);
  requirePath(contract, "no_fallbacks", missing);
  requirePath(contract, "design_md.frontmatter.required_keys", missing);
  requirePath(contract, "design_md.canonical_sections", missing);
  requirePath(contract, "design_md.implementation_section.heading", missing);
  requirePath(contract, "design_md.agent_prompt_guide.heading", missing);

  if (!Array.isArray(contract.source_rules) || contract.source_rules.length === 0) {
    missing.push("source_rules[]");
  }
  if (!Array.isArray(contract.design_md?.canonical_sections) || contract.design_md.canonical_sections.length < 9) {
    missing.push("design_md.canonical_sections[9]");
  }

  if (missing.length) {
    throw new Error(`Invalid process contract: missing ${missing.join(", ")}`);
  }
}

function loadProcessContract(contractPath = DEFAULT_PROCESS_CONTRACT_PATH) {
  const raw = fs.readFileSync(contractPath, "utf8");
  const contract = JSON.parse(raw);
  validateProcessContract(contract);
  return contract;
}

function renderList(items) {
  return asArray(items).map((item) => `- ${item}`).join("\n");
}

function renderTokenDefault(item) {
  if (!item || typeof item !== "object") return String(item);
  return `${item.token}: ${item.value}`;
}

function renderProcessContractForPrompt(contract) {
  validateProcessContract(contract);

  const noFallbacks = contract.no_fallbacks || {};
  const forbidden = noFallbacks.forbidden_patterns || {};
  const designMd = contract.design_md || {};
  const frontmatter = designMd.frontmatter || {};
  const implementation = designMd.implementation_section || {};
  const agentGuide = designMd.agent_prompt_guide || {};
  const fidelity = designMd.fidelity_notes || {};
  const sourceRules = asArray(contract.source_rules)
    .map((rule) => `${rule.id} (${rule.path})`)
    .join(", ");

  const lines = [
    `# Loaded Process Contract: ${contract.contract_id} v${contract.version}`,
    `Source rules: ${sourceRules}`,
    "",
    "## No-Fallback Doctrine",
    noFallbacks.principle,
    `Coverage rule: ${noFallbacks.coverage_rule}`,
    `Missing values: emit null and ${noFallbacks.missing_value?.gap_marker_format || "extraction_gap(<reason>)"}.`,
    "",
    "Allowed value sources:",
    renderList(noFallbacks.allowed_value_sources),
    "",
    "Forbidden fallback patterns:",
    renderList([
      `Universal hex defaults: ${asArray(forbidden.universal_hex_defaults).join(", ")}`,
      `Universal token defaults: ${asArray(forbidden.universal_token_defaults).map(renderTokenDefault).join(", ")}`,
      `Generic CTA verbs: ${asArray(forbidden.generic_cta_verbs).join(", ")}`,
      ...asArray(forbidden.disallowed_inferences),
    ]),
    "",
    "## DESIGN.md Structure",
    `Required frontmatter keys: ${asArray(frontmatter.required_keys).join(", ")}`,
    `Minimum components: ${asArray(frontmatter.minimum_components).join(", ")}`,
    frontmatter.literal_value_rule,
    "",
    "Required canonical sections, in order:",
    renderList(designMd.canonical_sections),
    "",
    `${implementation.heading} is required. Required fields: ${asArray(implementation.required_fields).join("; ")}.`,
    implementation.section_name_rule,
    `${agentGuide.heading} is required for URL-extracted DESIGN.md. Subsections: ${asArray(agentGuide.required_subsections).join("; ")}.`,
    `Example prompts: at least ${agentGuide.minimum_example_prompts}; iteration tips: ${asArray(agentGuide.iteration_tips_range).join("-")}; brand-specific: ${agentGuide.brand_specific === true}.`,
    `${fidelity.heading} is required when extraction has limits. Fields: ${asArray(fidelity.fields).join(", ")}.`,
    fidelity.intent,
  ];

  return lines.filter((line) => line !== undefined && line !== null).join("\n");
}

module.exports = {
  DEFAULT_PROCESS_CONTRACT_PATH,
  loadProcessContract,
  renderProcessContractForPrompt,
  validateProcessContract,
};
