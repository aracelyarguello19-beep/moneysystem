"use strict";

// Pricing table — updated 2026-04
// Source: https://anthropic.com/pricing (consulted 2026-04-27)
// Claude CLI model IDs (short form)
const MODEL_PRICING = {
  "claude-haiku-4-5": {
    input: 1.0,        // $/MTok
    output: 5.0,
    cache_write: 1.25,
    cache_read: 0.10,
  },
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cache_write: 3.75,
    cache_read: 0.30,
  },
  "claude-opus-4-7": {
    input: 15.0,
    output: 75.0,
    cache_write: 18.75,
    cache_read: 1.50,
  },
  // OpenRouter format model IDs (AC3.2)
  "anthropic/claude-haiku-4-5": {
    input: 1.0,
    output: 5.0,
    cache_write: 1.25,
    cache_read: 0.10,
  },
  "anthropic/claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cache_write: 3.75,
    cache_read: 0.30,
  },
  "anthropic/claude-opus-4-7": {
    input: 15.0,
    output: 75.0,
    cache_write: 18.75,
    cache_read: 1.50,
  },
  // Codex CLI does not expose authoritative usage/cost metadata to this
  // adapter yet. These local proxy rates keep budget preflight from falling
  // back to Opus pricing for known Codex budget models; telemetry still marks
  // Codex usage metadata as unsupported.
  "gpt-5.4-mini": {
    input: 1.0,
    output: 5.0,
    cache_write: 0,
    cache_read: 0,
  },
  "gpt-5.5": {
    input: 15.0,
    output: 75.0,
    cache_write: 0,
    cache_read: 0,
  },
  "codex-config-default": {
    input: 3.0,
    output: 15.0,
    cache_write: 0,
    cache_read: 0,
  },
};

const FALLBACK_MODEL = "claude-opus-4-7";
const DEFAULT_MAX_COST_USD = 10;
const BUDGET_MAX_COST_USD = {
  cheap: 0.25,
  standard: 3,
  premium: 10,
};

// Required sections — matches the 9-section numbered format emitted by
// squads/design-ops/data/url-extract-prompt.txt (Markdown Body — 9 Numbered
// Sections). Sections 6–9 (Depth, Dos/Donts, Responsive, Agent Prompt) are
// emitted but not enforced as required.
const REQUIRED_SECTIONS = [
  /^## 1\. Visual Theme/m,
  /^## 2\. Color Palette/m,
  /^## 3\. Typography Rules/m,
  /^## 4\. Components/m,
  /^## 5\. Layout Principles/m,
];
const REQUIRED_SECTION_LABELS = [
  "## 1. Visual Theme",
  "## 2. Color Palette",
  "## 3. Typography Rules",
  "## 4. Components",
  "## 5. Layout Principles",
];

// ── Phase timer ─────────────────────────────────────────────────────
function createPhaseTimer() {
  const phases = {};
  const starts = {};
  let _currentPhase = null;

  function start(name) {
    starts[name] = Date.now();
    _currentPhase = name;
  }

  function end(name) {
    if (starts[name] !== undefined) {
      phases[name] = Date.now() - starts[name];
    }
    if (_currentPhase === name) _currentPhase = null;
  }

  function report() {
    return { ...phases };
  }

  function currentPhase() {
    return _currentPhase;
  }

  return { start, end, report, currentPhase };
}

// ── Parse claude -p stdout metadata (AC3.1 rename) ──────────────────
// Per headless-pipeline.md R8: JSON metadata lines are prefixed with
// {"type":"result" or {"error": — separate them from LLM text output.
function parseClaudeCliStdout(rawStdout) {
  if (!rawStdout) {
    return {
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_creation_tokens: null,
      total_cost_usd: null,
      model: null,
      turns_used: null,
      error_max_turns: false,
    };
  }

  const lines = rawStdout.split("\n");
  let input_tokens = null;
  let output_tokens = null;
  let cache_read_tokens = null;
  let cache_creation_tokens = null;
  let total_cost_usd = null;
  let model = null;
  let turns_used = null;
  let error_max_turns = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (parsed.type === "result") {
      if (parsed.subtype === "error_max_turns") {
        error_max_turns = true;
      }
      if (parsed.usage) {
        input_tokens = parsed.usage.input_tokens ?? input_tokens;
        output_tokens = parsed.usage.output_tokens ?? output_tokens;
        cache_read_tokens = parsed.usage.cache_read_input_tokens ?? cache_read_tokens;
        cache_creation_tokens = parsed.usage.cache_creation_input_tokens ?? cache_creation_tokens;
      }
      if (parsed.model) model = parsed.model;
      if (!model && parsed.modelUsage && typeof parsed.modelUsage === "object") {
        const modelNames = Object.keys(parsed.modelUsage).filter(Boolean);
        if (modelNames.length > 0) model = modelNames[0];
      }
      if (typeof parsed.total_cost_usd === "number") {
        total_cost_usd = parsed.total_cost_usd;
      }
      if (parsed.turns_used !== undefined) turns_used = parsed.turns_used;
      if (parsed.num_turns !== undefined) turns_used = parsed.num_turns;
    }

    if (parsed.error) {
      if (parsed.error === "max_turns_exceeded" || parsed.subtype === "error_max_turns") {
        error_max_turns = true;
      }
    }
  }

  return {
    input_tokens,
    output_tokens,
    cache_read_tokens,
    cache_creation_tokens,
    total_cost_usd,
    model,
    turns_used,
    error_max_turns,
  };
}

// Backward-compat alias — run.cjs may import parseClaudeStdout pre-migration
const parseClaudeStdout = parseClaudeCliStdout;

// ── Parse OpenRouter JSON response (AC3.1) ───────────────────────────
// Extracts usage and finish_reason from the OpenRouter response shape.
function parseOpenRouterResponse(jsonResponse) {
  if (!jsonResponse || typeof jsonResponse !== "object") {
    return {
      input_tokens: null,
      output_tokens: null,
      model: null,
      finish_reason: null,
    };
  }

  const usage = jsonResponse.usage || {};
  const choice = jsonResponse.choices && jsonResponse.choices[0];

  return {
    input_tokens: usage.prompt_tokens ?? null,
    output_tokens: usage.completion_tokens ?? null,
    model: jsonResponse.model || null,
    finish_reason: choice?.finish_reason || null,
  };
}

// ── Cost estimator (AC3.2) ───────────────────────────────────────────
// Accepts both short model IDs (claude-haiku-4-5) and OpenRouter format
// (anthropic/claude-haiku-4-5). Unknown models return { usd: null, source: "unknown-model" }.
function estimateCost(usage, model) {
  const resolvedModel = model || (usage && usage.model) || FALLBACK_MODEL;
  const pricing = MODEL_PRICING[resolvedModel];
  const fallback_model = !pricing;

  if (fallback_model && resolvedModel !== FALLBACK_MODEL) {
    return {
      usd: null,
      source: "unknown-model",
      model: resolvedModel,
    };
  }

  const effectivePricing = pricing || MODEL_PRICING[FALLBACK_MODEL];

  const inputTok = (usage && usage.input_tokens) || 0;
  const outputTok = (usage && usage.output_tokens) || 0;
  const cacheReadTok = (usage && usage.cache_read_tokens) || 0;
  const cacheWriteTok = (usage && usage.cache_creation_tokens) || 0;

  const inputCost = (inputTok / 1_000_000) * effectivePricing.input;
  const outputCost = (outputTok / 1_000_000) * effectivePricing.output;
  const cacheReadCost = (cacheReadTok / 1_000_000) * (effectivePricing.cache_read || 0);
  const cacheWriteCost = (cacheWriteTok / 1_000_000) * (effectivePricing.cache_write || 0);
  const usd = inputCost + outputCost + cacheReadCost + cacheWriteCost;

  return {
    usd: Math.round(usd * 10000) / 10000,
    source: "sdk-usage",
    model: resolvedModel,
    breakdown: {
      input_usd: Math.round(inputCost * 10000) / 10000,
      output_usd: Math.round(outputCost * 10000) / 10000,
      cache_read_usd: Math.round(cacheReadCost * 10000) / 10000,
      cache_write_usd: Math.round(cacheWriteCost * 10000) / 10000,
    },
  };
}

// ── Char-based cost fallback (when SDK usage not available) ──────────
// Per headless-pipeline.md R5: 4 chars/token estimate
function estimateCostFromChars(promptChars, outputChars, model) {
  const resolvedModel = model || FALLBACK_MODEL;
  const pricing = MODEL_PRICING[resolvedModel] || MODEL_PRICING[FALLBACK_MODEL];
  const fallback_model = !MODEL_PRICING[resolvedModel];

  const inputTok = Math.ceil(promptChars / 4);
  const outputTok = Math.ceil(outputChars / 4);

  const inputCost = (inputTok / 1_000_000) * pricing.input;
  const outputCost = (outputTok / 1_000_000) * pricing.output;
  const usd = inputCost + outputCost;

  const result = {
    usd: Math.round(usd * 10000) / 10000,
    source: "char-fallback",
    model: resolvedModel,
    breakdown: {
      input_usd: Math.round(inputCost * 10000) / 10000,
      output_usd: Math.round(outputCost * 10000) / 10000,
      cache_read_usd: 0,
      cache_write_usd: 0,
    },
  };

  if (fallback_model) result.fallback_model = true;
  return result;
}

function parsePositiveNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveMaxCostUsd({ explicitMaxCostUsd = null, budgetTier = null, env = process.env } = {}) {
  const explicit = parsePositiveNumber(explicitMaxCostUsd);
  if (explicit !== null) {
    return { usd: explicit, source: "cli" };
  }

  const envValue = parsePositiveNumber(env.DESIGN_MD_MAX_COST_USD);
  if (envValue !== null) {
    return { usd: envValue, source: "env:DESIGN_MD_MAX_COST_USD" };
  }

  if (budgetTier && Object.prototype.hasOwnProperty.call(BUDGET_MAX_COST_USD, budgetTier)) {
    return { usd: BUDGET_MAX_COST_USD[budgetTier], source: `budget:${budgetTier}` };
  }

  return { usd: DEFAULT_MAX_COST_USD, source: "default" };
}

function buildBudgetPreflight({ promptChars, maxTokens, model, budgetTier = null, maxCostUsd = null } = {}) {
  const outputChars = Math.max(0, Number(maxTokens) || 0) * 4;
  const estimate = estimateCostFromChars(Number(promptChars) || 0, outputChars, model);
  const cap = resolveMaxCostUsd({ explicitMaxCostUsd: maxCostUsd, budgetTier });
  const estimatedUsd = typeof estimate.usd === "number" ? estimate.usd : Infinity;
  return {
    pass: estimatedUsd <= cap.usd,
    estimated_usd: estimate.usd,
    max_cost_usd: cap.usd,
    cap_source: cap.source,
    estimate_source: estimate.source,
    model: estimate.model,
    fallback_model: estimate.fallback_model === true,
    prompt_chars: Number(promptChars) || 0,
    max_output_tokens: Number(maxTokens) || 0,
    budget_tier: budgetTier || null,
  };
}

// ── DESIGN.md section validator ──────────────────────────────────────
function validateDesignMdSections(designMdContent) {
  if (!designMdContent || typeof designMdContent !== "string") {
    return {
      valid: false,
      missing: REQUIRED_SECTION_LABELS,
    };
  }

  const missing = [];

  for (let i = 0; i < REQUIRED_SECTIONS.length; i++) {
    if (!REQUIRED_SECTIONS[i].test(designMdContent)) {
      missing.push(REQUIRED_SECTION_LABELS[i]);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

module.exports = {
  createPhaseTimer,
  parseClaudeCliStdout,
  parseClaudeStdout, // backward-compat alias
  parseOpenRouterResponse,
  estimateCost,
  estimateCostFromChars,
  resolveMaxCostUsd,
  buildBudgetPreflight,
  BUDGET_MAX_COST_USD,
  DEFAULT_MAX_COST_USD,
  validateDesignMdSections,
};
