#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");
const YAML = require("yaml");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const RUNNER_PATH = path.join(__dirname, "..", "run.cjs");
const MATRIX_PATH = path.join(__dirname, "..", "data", "model-benchmark-matrix.yaml");
const RUBRIC_PATH = path.join(__dirname, "..", "data", "model-benchmark-rubric.yaml");
const OUTPUT_ROOT = path.join(REPO_ROOT, "outputs", "design-ops", "model-bench", "design-md");
const OPENROUTER_MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

function usage(exitCode = 1) {
  const msg = [
    "usage: benchmark-model-matrix.cjs [--dry-run] [--urls medium|required|hard|url] [--models cheap|all|model,...]",
    "       [--run-id id] [--budget-usd n] [--allow-premium] [--concurrency n] [--resume] [--force]",
    "",
    "examples:",
    "  node squads/design-ops/scripts/extract-from-url/scripts/benchmark-model-matrix.cjs --dry-run --urls medium --models cheap",
    "  node squads/design-ops/scripts/extract-from-url/scripts/benchmark-model-matrix.cjs --urls medium --models deepseek-v4-flash,qwen3-coder-next --budget-usd 1",
    "  node squads/design-ops/scripts/extract-from-url/scripts/benchmark-model-matrix.cjs --urls hard --models premium --allow-premium --budget-usd 10 --resume",
  ].join("\n");
  console.error(msg);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    urls: "medium",
    models: "cheap",
    runId: null,
    budgetUsd: null,
    allowPremium: false,
    concurrency: 1,
    resume: false,
    force: false,
    emitShowcase: true,
    maxTokens: 32768,
    maxCacheAge: 168,
    maxLlmCacheAge: 0,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const raw = argv[i];
    const [flag, inlineValue] = raw.includes("=") ? raw.split(/=(.*)/s, 2) : [raw, null];
    const nextValue = () => {
      if (inlineValue != null) return inlineValue;
      i += 1;
      if (i >= argv.length) usage();
      return argv[i];
    };

    if (flag === "--help" || flag === "-h") usage(0);
    else if (flag === "--dry-run") args.dryRun = true;
    else if (flag === "--allow-premium") args.allowPremium = true;
    else if (flag === "--resume") args.resume = true;
    else if (flag === "--force") args.force = true;
    else if (flag === "--emit-showcase") args.emitShowcase = true;
    else if (flag === "--no-showcase") args.emitShowcase = false;
    else if (flag === "--urls") args.urls = nextValue();
    else if (flag === "--models") args.models = nextValue();
    else if (flag === "--run-id") args.runId = nextValue();
    else if (flag === "--budget-usd") args.budgetUsd = Number(nextValue());
    else if (flag === "--concurrency") args.concurrency = Number(nextValue());
    else if (flag === "--max-tokens") args.maxTokens = Number(nextValue());
    else if (flag === "--max-cache-age") args.maxCacheAge = Number(nextValue());
    else if (flag === "--max-llm-cache-age") args.maxLlmCacheAge = Number(nextValue());
    else usage();
  }

  if (!Number.isInteger(args.concurrency) || args.concurrency < 1) {
    throw new Error("--concurrency must be a positive integer");
  }
  if (args.budgetUsd != null && (!Number.isFinite(args.budgetUsd) || args.budgetUsd < 0)) {
    throw new Error("--budget-usd must be a non-negative number");
  }
  return args;
}

function readYaml(filePath) {
  return YAML.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readRunJson(outputDir, filename) {
  return readJson(path.join(outputDir, ".logs", filename)) || readJson(path.join(outputDir, filename));
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/[/:]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function urlSlugFromUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").split(".")[0] || "url";
    const pathSlug = slugify(parsed.pathname.replace(/^\/|\/$/g, ""));
    return pathSlug && pathSlug !== "-" ? `${host}-${pathSlug}` : host;
  } catch {
    return slugify(url);
  }
}

function csvList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hashString(value) {
  return `sha256:${crypto.createHash("sha256").update(String(value)).digest("hex")}`;
}

function hashFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;
}

function hashObject(value) {
  return hashString(JSON.stringify(value));
}

function hashDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return null;
  const hash = crypto.createHash("sha256");
  const walk = (current) => {
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const rel = path.relative(dirPath, full);
      hash.update(rel);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) hash.update(fs.readFileSync(full));
    }
  };
  walk(dirPath);
  return `sha256:${hash.digest("hex")}`;
}

function loadEnvFiles() {
  const env = { ...process.env };
  const loadedKeys = [];
  for (const name of [".env", ".env.local"]) {
    const filePath = path.join(REPO_ROOT, name);
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (env[key] == null || env[key] === "") {
        env[key] = value;
        loadedKeys.push(key);
      }
    }
  }
  return { env, loadedKeys: Array.from(new Set(loadedKeys)).sort() };
}

function buildModelIndex(matrix) {
  const byToken = new Map();
  for (const model of matrix.models || []) {
    const tokens = [model.slug, model.model_id, ...(model.aliases || [])];
    for (const token of tokens) byToken.set(String(token).toLowerCase(), model);
  }
  return byToken;
}

function resolveModels(modelSpec, matrix) {
  const selected = [];
  const seen = new Set();
  const byToken = buildModelIndex(matrix);
  const addModel = (model) => {
    if (!model || seen.has(model.slug)) return;
    seen.add(model.slug);
    selected.push(model);
  };

  const expand = (token) => {
    const key = token.toLowerCase();
    const group = matrix.model_groups && matrix.model_groups[key];
    if (group) {
      for (const child of group) expand(child);
      return;
    }
    const model = byToken.get(key);
    if (!model) throw new Error(`Unknown model or model group: ${token}`);
    addModel(model);
  };

  for (const token of csvList(modelSpec)) expand(token);
  return selected;
}

function resolveUrls(urlSpec, matrix) {
  const selected = [];
  const seen = new Set();
  const addUrl = (slug, item) => {
    const key = slug || urlSlugFromUrl(item.url);
    if (seen.has(key)) return;
    seen.add(key);
    selected.push({
      slug: key,
      url: item.url,
      category: item.category || "custom",
      required: !!item.required,
    });
  };

  const expand = (token) => {
    const key = token.toLowerCase();
    const group = matrix.url_groups && matrix.url_groups[key];
    if (group) {
      for (const child of group) expand(child);
      return;
    }
    const item = matrix.urls && matrix.urls[key];
    if (item) {
      addUrl(key, item);
      return;
    }
    if (/^https?:\/\//i.test(token)) {
      addUrl(urlSlugFromUrl(token), { url: token, category: "custom", required: false });
      return;
    }
    throw new Error(`Unknown URL alias or group: ${token}`);
  };

  for (const token of csvList(urlSpec)) expand(token);
  return selected;
}

function estimateCost(model, availability, usageProfile) {
  const pricing = availability && availability.pricing;
  const promptPrice = pricing ? Number(pricing.prompt) : NaN;
  const completionPrice = pricing ? Number(pricing.completion) : NaN;
  if (Number.isFinite(promptPrice) && Number.isFinite(completionPrice)) {
    const usd = (usageProfile.average_input_tokens * promptPrice) +
      (usageProfile.average_output_tokens * completionPrice);
    if (Number.isFinite(usd)) return Math.round(usd * 10000) / 10000;
  }
  const fallback = model.estimated_cost_per_run_usd ?? usageProfile.default_estimated_cost_per_run_usd ?? 0;
  return Math.round(Number(fallback) * 10000) / 10000;
}

async function fetchOpenRouterModels(env) {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set in process env, .env, or .env.local");
  }
  const response = await fetch(OPENROUTER_MODELS_ENDPOINT, {
    headers: {
      "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://sinkra.ai",
      "X-Title": "design-md-model-benchmark",
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenRouter model availability check failed: HTTP ${response.status} ${body.slice(0, 240)}`);
  }
  const json = await response.json();
  const models = Array.isArray(json.data) ? json.data : [];
  return new Map(models.map((model) => [model.id, model]));
}

async function resolveAvailability(models, args, env, matrix) {
  let openRouterById = null;
  const needsOpenRouterCheck = !args.dryRun && models.some((model) => model.provider_path === "openrouter" && (!model.premium || args.allowPremium));
  if (needsOpenRouterCheck) {
    openRouterById = await fetchOpenRouterModels(env);
  }

  return models.map((model) => {
    const base = {
      ...model,
      requested_model: model.model_id,
      resolved_model_id: model.model_id,
      availability_checked_at: new Date().toISOString(),
      estimated_cost_usd: estimateCost(model, null, matrix.usage_profile || {}),
    };

    if (model.premium && !args.allowPremium) {
      return {
        ...base,
        status: "skipped",
        reason: "premium_requires_allow_premium",
      };
    }
    if (model.premium && args.allowPremium && !args.dryRun && args.budgetUsd == null) {
      return {
        ...base,
        status: "skipped",
        reason: "premium_requires_budget_usd",
      };
    }
    if (model.provider_path === "direct-required") {
      return {
        ...base,
        status: "unavailable",
        reason: "direct_provider_adapter_required",
      };
    }
    if (model.provider_path === "codex-cli" || model.provider_path === "claude-cli") {
      const command = model.provider_path === "codex-cli" ? "codex" : "claude";
      const which = spawnSync("command", ["-v", command], {
        shell: true,
        encoding: "utf8",
      });
      if (which.status !== 0 || !which.stdout.trim()) {
        return {
          ...base,
          status: "unavailable",
          reason: `${command}_cli_not_found_on_path`,
        };
      }
      return {
        ...base,
        status: args.dryRun ? "planned" : "available",
        reason: args.dryRun ? "dry_run_local_cli_present" : "local_cli_present",
        cli_path: which.stdout.trim(),
      };
    }
    if (args.dryRun) {
      return {
        ...base,
        status: "planned",
        reason: "dry_run_no_availability_request",
      };
    }
    if (model.provider_path !== "openrouter") {
      return {
        ...base,
        status: "available",
        reason: "local_provider_unverified",
      };
    }

    const providerModel = openRouterById.get(model.model_id);
    if (!providerModel) {
      return {
        ...base,
        status: "unavailable",
        reason: "model_id_not_returned_by_openrouter_models_api",
      };
    }

    return {
      ...base,
      status: "available",
      reason: "openrouter_models_api",
      resolved_model_id: providerModel.id || model.model_id,
      provider_response_model: providerModel.id || null,
      context_window: providerModel.context_length ?? model.context_window ?? null,
      pricing: providerModel.pricing || null,
      estimated_cost_usd: estimateCost(model, providerModel, matrix.usage_profile || {}),
    };
  });
}

function pairAlreadySuccessful(outputDir) {
  const telemetry = readRunJson(outputDir, "telemetry.json");
  const extractionClass = readJson(path.join(outputDir, "extraction-class.json"));
  return !!(
    fs.existsSync(path.join(outputDir, "DESIGN.md")) &&
    telemetry &&
    extractionClass &&
    extractionClass.status === "complete" &&
    extractionClass.coverage_real === true
  );
}

function buildPairs(urls, manifestModels, args) {
  const runnable = [];
  const skipped = [];
  let estimatedCommitted = 0;

  for (const model of manifestModels) {
    if (!["planned", "available"].includes(model.status)) {
      for (const url of urls) {
        skipped.push({
          model,
          url,
          status: model.status,
          reason: model.reason,
          estimated_cost_usd: model.estimated_cost_usd,
        });
      }
      continue;
    }
    for (const url of urls) {
      const outputDir = path.join(OUTPUT_ROOT, args.runId, url.slug, model.slug);
      const estimate = model.estimated_cost_usd || 0;
      if (!args.dryRun && args.budgetUsd != null && estimatedCommitted + estimate > args.budgetUsd) {
        skipped.push({
          model,
          url,
          status: "skipped",
          reason: "budget_would_be_exceeded_before_start",
          estimated_cost_usd: estimate,
        });
        continue;
      }
      estimatedCommitted += args.dryRun ? 0 : estimate;
      runnable.push({
        model,
        url,
        outputDir,
        estimated_cost_usd: estimate,
      });
    }
  }
  return { runnable, skipped, estimatedCommitted };
}

function countFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  let count = 0;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) count += 1;
    }
  };
  walk(dirPath);
  return count;
}

function outputBytes(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  let bytes = 0;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) bytes += fs.statSync(full).size;
    }
  };
  walk(dirPath);
  return bytes;
}

function detectDataUriBase64Bytes(text) {
  const matches = String(text || "").match(/data:[^"'\s)]+;base64,[A-Za-z0-9+/=]+/g) || [];
  return matches.reduce((sum, item) => sum + item.length, 0);
}

function detectDuplicateInputBytes(outputDir, designMd, probeChars) {
  const inputsDir = path.join(outputDir, "inputs");
  if (!fs.existsSync(inputsDir) || !designMd) return 0;
  const candidates = ["page.md", "page.html", "css-collected.css"]
    .map((name) => path.join(inputsDir, name))
    .filter((filePath) => fs.existsSync(filePath));
  let duplicated = 0;
  for (const filePath of candidates) {
    const source = fs.readFileSync(filePath, "utf8").replace(/\s+/g, " ").trim();
    if (source.length < probeChars) continue;
    const probe = source.slice(0, probeChars);
    if (designMd.replace(/\s+/g, " ").includes(probe)) duplicated += probe.length;
  }
  return duplicated;
}

function classifyScore(score, blockers, bands) {
  if (blockers.length > 0) return "reject";
  if (score >= bands.gold.min_score) return "gold";
  if (score >= bands.acceptable.min_score) return "acceptable";
  if (score >= bands["cheap-triage"].min_score) return "cheap-triage";
  return "reject";
}

function lintBlockers(qualityScore, environmentFailures) {
  const blockers = [];
  const warnings = [];
  const gateBlockers = qualityScore?.gates?.blockers || [];
  const lintKind = qualityScore?.categories?.lint_compliance?.failure_kind || null;
  for (const blocker of gateBlockers) {
    if (blocker === "lint_execution_failed" && environmentFailures.includes(lintKind)) {
      warnings.push(`env:${lintKind}`);
    } else {
      blockers.push(blocker);
    }
  }
  return { blockers, warnings };
}

function scorePair(pair, execution, rubric, hashes) {
  const outputDir = pair.outputDir;
  const designPath = path.join(outputDir, "DESIGN.md");
  const telemetry = readRunJson(outputDir, "telemetry.json");
  const extractionClass = readJson(path.join(outputDir, "extraction-class.json"));
  const qualityScore = readJson(path.join(outputDir, "quality-score.json"));
  const designMd = fs.existsSync(designPath) ? fs.readFileSync(designPath, "utf8") : "";
  const thresholds = rubric.thresholds || {};
  const blockers = [];
  const warnings = [];

  if (execution.exitCode !== 0) blockers.push("runner_exit_nonzero");
  if (!designMd) blockers.push("missing_design_md");
  if (designMd && (!designMd.trimStart().startsWith("---") || !/^##\s+1\./m.test(designMd))) {
    blockers.push("invalid_design_md");
  }

  const base64Bytes = detectDataUriBase64Bytes(designMd);
  if (base64Bytes > 0) blockers.push("base64_or_data_uri");

  const duplicateInputBytes = detectDuplicateInputBytes(outputDir, designMd, thresholds.input_duplication_probe_chars || 1200);
  if (duplicateInputBytes > 0) blockers.push("input_duplication");

  const designBytes = designMd ? Buffer.byteLength(designMd, "utf8") : 0;
  if (designBytes > (thresholds.max_design_md_bytes || 250000)) blockers.push("oversized_design_md");

  if (extractionClass) {
    if (extractionClass.status !== "complete" || extractionClass.coverage_real !== true) blockers.push("incomplete_extraction");
    if ((extractionClass.artifacts?.scratch_runs_present || 0) > 0) blockers.push("canonical_pollution");
    const fallbackSuspects = extractionClass.evidence?.fallback_suspects || [];
    const unbacked = fallbackSuspects.filter((item) => !item.source_backed);
    if (unbacked.length > 0 && (extractionClass.evidence?.extraction_gap_count || 0) === 0) {
      blockers.push("unbacked_fallback_without_extraction_gap");
    }
  } else if (execution.exitCode === 0) {
    blockers.push("incomplete_extraction");
  }

  const lint = lintBlockers(qualityScore, rubric.non_blocking_environment_failures || []);
  blockers.push(...lint.blockers);
  warnings.push(...lint.warnings);

  const uniqueBlockers = Array.from(new Set(blockers));
  const score = Number(qualityScore?.overall ?? qualityScore?.average ?? (uniqueBlockers.length ? 0 : 50));
  const band = classifyScore(score, uniqueBlockers, rubric.classification_bands);
  const costUsd = Number(telemetry?.llm?.cost_estimate?.usd ?? pair.estimated_cost_usd ?? 0);

  return {
    model: pair.model.slug,
    requested_model: pair.model.requested_model,
    resolved_model_id: pair.model.resolved_model_id,
    provider_response_model: pair.model.provider_response_model || telemetry?.llm?.model || null,
    provider: pair.model.provider_path,
    model_family: pair.model.model_family,
    url_slug: pair.url.slug,
    url: pair.url.url,
    category: pair.url.category,
    status: uniqueBlockers.length > 0 ? "fail" : "pass",
    band,
    score,
    blockers: uniqueBlockers,
    warnings,
    estimated_cost_usd: pair.estimated_cost_usd,
    cost_usd: Math.round(costUsd * 10000) / 10000,
    wall_clock_ms: telemetry?.wall_clock_ms ?? execution.wallClockMs ?? null,
    finish_reason: telemetry?.llm?.finish_reason ?? null,
    retry_count: telemetry?.llm?.retries ?? null,
    input_tokens: telemetry?.llm?.input_tokens ?? null,
    output_tokens: telemetry?.llm?.output_tokens ?? null,
    cache_read_tokens: telemetry?.llm?.cache_read_tokens ?? null,
    output_bytes_total: outputBytes(outputDir),
    output_files_count: countFiles(outputDir),
    design_md_bytes: designBytes,
    base64_embedded_bytes: base64Bytes,
    duplicate_input_bytes: duplicateInputBytes,
    schema_valid: designMd.trimStart().startsWith("---"),
    required_files_present: extractionClass?.artifacts?.required_missing?.length === 0,
    coverage_real: extractionClass?.coverage_real ?? null,
    operational_mode: extractionClass?.operational_mode ?? null,
    quality_grade: qualityScore?.grade ?? null,
    lint_failure_kind: qualityScore?.categories?.lint_compliance?.failure_kind ?? null,
    input_snapshot_hash: hashDirectory(path.join(outputDir, "inputs")),
    prompt_hash: hashFile(path.join(outputDir, "agent-prompt.txt")),
    rubric_hash: hashes.rubricHash,
    oracle_hash: hashes.oracleHash,
    output_dir: path.relative(REPO_ROOT, outputDir),
    stdout_log: path.relative(REPO_ROOT, path.join(outputDir, "benchmark-run.stdout.log")),
    stderr_log: path.relative(REPO_ROOT, path.join(outputDir, "benchmark-run.stderr.log")),
  };
}

function plannedResult(pair, hashes) {
  return {
    model: pair.model.slug,
    requested_model: pair.model.requested_model,
    resolved_model_id: pair.model.resolved_model_id,
    provider: pair.model.provider_path,
    model_family: pair.model.model_family,
    url_slug: pair.url.slug,
    url: pair.url.url,
    category: pair.url.category,
    status: "planned",
    band: "planned",
    score: null,
    blockers: [],
    warnings: [pair.model.reason].filter(Boolean),
    estimated_cost_usd: pair.estimated_cost_usd,
    cost_usd: null,
    wall_clock_ms: null,
    rubric_hash: hashes.rubricHash,
    oracle_hash: hashes.oracleHash,
    output_dir: path.relative(REPO_ROOT, pair.outputDir),
  };
}

function skippedResult(item, hashes) {
  const outputDir = path.join(OUTPUT_ROOT, globalRunId(), item.url.slug, item.model.slug);
  return {
    model: item.model.slug,
    requested_model: item.model.requested_model || item.model.model_id,
    resolved_model_id: item.model.resolved_model_id || item.model.model_id,
    provider: item.model.provider_path,
    model_family: item.model.model_family,
    url_slug: item.url.slug,
    url: item.url.url,
    category: item.url.category,
    status: "skipped",
    band: "skipped",
    score: null,
    blockers: [],
    warnings: [item.reason].filter(Boolean),
    estimated_cost_usd: item.estimated_cost_usd,
    cost_usd: null,
    wall_clock_ms: null,
    rubric_hash: hashes.rubricHash,
    oracle_hash: hashes.oracleHash,
    output_dir: path.relative(REPO_ROOT, outputDir),
  };
}

let CURRENT_RUN_ID = null;
function globalRunId() {
  return CURRENT_RUN_ID;
}

async function runExtraction(pair, args, env) {
  fs.mkdirSync(pair.outputDir, { recursive: true });
  if (!args.force && pairAlreadySuccessful(pair.outputDir)) {
    return { exitCode: 0, wallClockMs: 0, skippedExisting: true };
  }

  const childArgs = [
    RUNNER_PATH,
    "--url", pair.url.url,
    "--out", pair.outputDir,
    "--provider", pair.model.provider_path,
    "--max-cache-age", String(args.maxCacheAge),
    "--max-llm-cache-age", String(args.maxLlmCacheAge),
    "--max-tokens", String(args.maxTokens),
    "--no-bundle",
    "--no-learning",
  ];
  if (pair.model.provider_path === "openrouter") {
    childArgs.push("--model", pair.model.requested_model);
  } else if (
    pair.model.requested_model &&
    !/^(codex-config-default|claude-cli-default)$/i.test(pair.model.requested_model)
  ) {
    childArgs.push("--model", pair.model.requested_model);
  }
  if (pair.model.budget_tier) childArgs.push("--budget", pair.model.budget_tier);
  if (args.emitShowcase) childArgs.push("--emit-showcase");

  const childEnv = {
    ...env,
    DESIGN_MD_SKIP_BUNDLE: "1",
  };
  const stdoutPath = path.join(pair.outputDir, "benchmark-run.stdout.log");
  const stderrPath = path.join(pair.outputDir, "benchmark-run.stderr.log");
  const started = Date.now();

  const exitCode = await new Promise((resolve) => {
    const stdout = fs.createWriteStream(stdoutPath);
    const stderr = fs.createWriteStream(stderrPath);
    const child = spawn(process.execPath, childArgs, {
      cwd: REPO_ROOT,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);
    child.on("error", (err) => {
      stderr.write(`\n[benchmark] spawn error: ${err.message}\n`);
      resolve(127);
    });
    child.on("close", (code) => {
      stdout.end();
      stderr.end();
      resolve(code == null ? 1 : code);
    });
  });

  const result = {
    exitCode,
    wallClockMs: Date.now() - started,
    command: ["node", ...childArgs.map((item) => item === pair.model.requested_model ? "<model>" : item)],
    started_at: new Date(started).toISOString(),
    finished_at: new Date().toISOString(),
  };
  writeJson(path.join(pair.outputDir, "benchmark-run.json"), result);
  return result;
}

async function runPool(items, concurrency, worker) {
  let index = 0;
  const results = [];
  const workers = Array.from({ length: concurrency }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      results.push(await worker(current));
    }
  });
  await Promise.all(workers);
  return results;
}

function writeGoldenOracles(runDir, rubric) {
  const oracles = {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    source: path.relative(REPO_ROOT, RUBRIC_PATH),
    url_oracles: rubric.url_oracles || {},
  };
  writeJson(path.join(runDir, "golden-oracles.json"), oracles);
  return oracles;
}

function writeTelemetryManifest(runDir) {
  const manifest = {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    fields: {
      run_id: "benchmark harness",
      run_started_at: "benchmark harness",
      pipeline_version: "git rev-parse HEAD",
      git_commit: "git rev-parse HEAD",
      url: "benchmark matrix",
      input_snapshot_hash: "hash of extractor inputs/ directory",
      prompt_hash: "hash of agent-prompt.txt",
      rubric_hash: "hash of model-benchmark-rubric.yaml",
      oracle_hash: "hash of generated golden-oracles.json",
      provider: "model manifest",
      requested_model: "model manifest",
      resolved_model_id: "OpenRouter models API or manifest fallback",
      provider_response_model: "provider telemetry when available",
      output_bytes_total: "benchmark harness file walker",
      base64_embedded_bytes: "benchmark deterministic hygiene gate",
      duplicate_input_bytes: "benchmark deterministic hygiene gate",
      schema_valid: "benchmark deterministic hygiene gate",
      required_files_present: "extraction-class.json",
      cost_usd: ".logs/telemetry.json llm.cost_estimate with root fallback",
      wall_clock_ms: ".logs/telemetry.json with root fallback",
      retry_count: ".logs/telemetry.json llm.retries with root fallback",
    },
  };
  writeJson(path.join(runDir, "telemetry-manifest.json"), manifest);
}

function csvEscape(value) {
  if (value == null) return "";
  const text = Array.isArray(value) ? value.join("|") : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
  return text;
}

function writeSummaryCsv(runDir, results) {
  const columns = [
    "model",
    "requested_model",
    "provider",
    "url_slug",
    "status",
    "band",
    "score",
    "blockers",
    "warnings",
    "estimated_cost_usd",
    "cost_usd",
    "wall_clock_ms",
    "design_md_bytes",
    "output_bytes_total",
    "output_dir",
  ];
  const lines = [columns.join(",")];
  for (const result of results) {
    lines.push(columns.map((column) => csvEscape(result[column])).join(","));
  }
  fs.writeFileSync(path.join(runDir, "summary.csv"), `${lines.join("\n")}\n`, "utf8");
}

function aggregateByModel(results) {
  const byModel = new Map();
  for (const result of results) {
    if (!byModel.has(result.model)) {
      byModel.set(result.model, []);
    }
    byModel.get(result.model).push(result);
  }
  return Array.from(byModel.entries()).map(([model, rows]) => {
    const scored = rows.filter((row) => typeof row.score === "number");
    const costs = rows.map((row) => row.cost_usd ?? row.estimated_cost_usd).filter((value) => typeof value === "number");
    const walls = rows.map((row) => row.wall_clock_ms).filter((value) => typeof value === "number" && value > 0);
    const blockers = Array.from(new Set(rows.flatMap((row) => row.blockers || [])));
    const avg = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    return {
      model,
      provider: rows[0].provider,
      runs: rows.length,
      pass: rows.filter((row) => row.status === "pass").length,
      planned: rows.filter((row) => row.status === "planned").length,
      skipped: rows.filter((row) => row.status === "skipped").length,
      avg_score: avg(scored.map((row) => row.score)),
      avg_cost_usd: avg(costs),
      avg_wall_ms: avg(walls),
      blockers,
      bands: Array.from(new Set(rows.map((row) => row.band))).join(", "),
    };
  });
}

function writeWinnerMatrix(runDir, results, args) {
  const rows = aggregateByModel(results)
    .sort((a, b) => (b.avg_score ?? -1) - (a.avg_score ?? -1));
  const lines = [
    "# design-md Model Benchmark Winner Matrix",
    "",
    `Run ID: \`${args.runId}\``,
    `Mode: \`${args.dryRun ? "dry-run" : "paid"}\``,
    "",
    "| Model | Provider | Runs | Pass | Planned | Skipped | Avg Score | Bands | Avg Cost | Avg Wall | Blockers |",
    "|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---|",
  ];
  for (const row of rows) {
    const cells = [
      `\`${row.model}\``,
      row.provider,
      row.runs,
      row.pass,
      row.planned,
      row.skipped,
      row.avg_score == null ? "" : row.avg_score.toFixed(1),
      row.bands,
      row.avg_cost_usd == null ? "" : `$${row.avg_cost_usd.toFixed(4)}`,
      row.avg_wall_ms == null ? "" : `${Math.round(row.avg_wall_ms / 1000)}s`,
      row.blockers.length ? row.blockers.join(", ") : "",
    ];
    lines.push(`| ${cells.join(" | ")} |`);
  }
  fs.writeFileSync(path.join(runDir, "winner-matrix.md"), `${lines.join("\n")}\n`, "utf8");
}

function writePromotionDecision(runDir, results, args) {
  const lines = [
    "# Promotion Decision",
    "",
    `Run ID: \`${args.runId}\``,
    "",
    "Status: draft.",
    "",
    "This run is an execution artifact, not a final model policy. Promotion still requires required-corpus coverage, holdout validation, finalist repeatability, blind human review, and the AC-8 baseline comparison.",
    "",
    "## Current Evidence",
    "",
    `- Mode: \`${args.dryRun ? "dry-run" : "paid"}\``,
    `- Results: ${results.length}`,
    `- Passing runs: ${results.filter((row) => row.status === "pass").length}`,
    `- Blocked runs: ${results.filter((row) => (row.blockers || []).length > 0).length}`,
    "",
    "## Rollback",
    "",
    "Keep the current /design-md provider policy until a reviewed run explicitly supersedes it.",
  ];
  fs.writeFileSync(path.join(runDir, "promotion-decision.md"), `${lines.join("\n")}\n`, "utf8");
}

function writeScorecard(runDir, results, manifest, urls, args, hashes) {
  const scorecard = {
    schema_version: "1.0",
    run_id: args.runId,
    generated_at: new Date().toISOString(),
    mode: args.dryRun ? "dry-run" : "paid",
    models: manifest.models.map((model) => ({
      slug: model.slug,
      requested_model: model.requested_model,
      status: model.status,
      reason: model.reason,
    })),
    urls,
    decision_controls: {
      frozen_inputs: false,
      prompt_hash: null,
      rubric_hash: hashes.rubricHash,
      oracle_hash: hashes.oracleHash,
      holdout_locked_before_scoring: false,
      pairwise_order_swapping: false,
      human_review_blinded: false,
    },
    results,
  };
  writeJson(path.join(runDir, "scorecard.json"), scorecard);
}

function gitCommit() {
  try {
    const result = require("child_process").spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return result.status === 0 ? result.stdout.trim() : null;
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  args.runId = args.runId || `${timestamp()}-model-matrix`;
  CURRENT_RUN_ID = args.runId;

  const matrix = readYaml(MATRIX_PATH);
  const rubric = readYaml(RUBRIC_PATH);
  const runDir = path.join(OUTPUT_ROOT, args.runId);
  fs.mkdirSync(runDir, { recursive: true });

  const { env, loadedKeys } = loadEnvFiles();
  const selectedModels = resolveModels(args.models, matrix);
  const selectedUrls = resolveUrls(args.urls, matrix);
  const manifestModels = await resolveAvailability(selectedModels, args, env, matrix);
  const manifest = {
    schema_version: "1.0",
    run_id: args.runId,
    generated_at: new Date().toISOString(),
    dry_run: args.dryRun,
    git_commit: gitCommit(),
    env_loaded_key_count: loadedKeys.length,
    secret_env_present: {
      OPENROUTER_API_KEY: !!env.OPENROUTER_API_KEY,
    },
    source_files: {
      matrix: path.relative(REPO_ROOT, MATRIX_PATH),
      rubric: path.relative(REPO_ROOT, RUBRIC_PATH),
      runner: path.relative(REPO_ROOT, RUNNER_PATH),
    },
    models: manifestModels,
  };
  writeJson(path.join(runDir, "model-manifest.json"), manifest);

  const oracles = writeGoldenOracles(runDir, rubric);
  writeTelemetryManifest(runDir);
  const hashes = {
    rubricHash: hashFile(RUBRIC_PATH),
    oracleHash: hashObject(oracles),
  };
  const { runnable, skipped, estimatedCommitted } = buildPairs(selectedUrls, manifestModels, args);
  const results = skipped.map((item) => skippedResult(item, hashes));

  if (args.dryRun) {
    results.push(...runnable.map((pair) => plannedResult(pair, hashes)));
  } else {
    console.log(`[benchmark] run=${args.runId} urls=${selectedUrls.length} runnable=${runnable.length} skipped=${skipped.length} budget_estimate=$${estimatedCommitted.toFixed(4)}`);
    const executed = await runPool(runnable, args.concurrency, async (pair) => {
      console.log(`[benchmark] ${pair.url.slug} x ${pair.model.slug}`);
      const execution = await runExtraction(pair, args, env);
      return scorePair(pair, execution, rubric, hashes);
    });
    results.push(...executed);
  }

  writeScorecard(runDir, results, manifest, selectedUrls, args, hashes);
  writeSummaryCsv(runDir, results);
  writeWinnerMatrix(runDir, results, args);
  writePromotionDecision(runDir, results, args);

  const plannedCost = results
    .map((row) => row.cost_usd ?? row.estimated_cost_usd ?? 0)
    .reduce((a, b) => a + b, 0);
  console.log(`[benchmark] wrote ${path.relative(REPO_ROOT, runDir)}`);
  console.log(`[benchmark] rows=${results.length} estimated_or_actual_cost=$${plannedCost.toFixed(4)}`);
}

main().catch((err) => {
  console.error(`[benchmark] ${err.message}`);
  process.exit(1);
});
