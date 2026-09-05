#!/usr/bin/env node
/**
 * extract-from-url — squad design-ops pipeline orchestrator
 *
 * Refactored 2026-04-27 from a 3591-line monolith into 8 focused modules
 * under `lib/`. Pattern follows Dembrandt's `lib/` structure (8 files) +
 * Project Wallace's test-vizinho convention.
 *
 * lib/telemetry.cjs is the 9th module — justified exception to 8-file cap
 * because it is a new purpose-built module (not a fragment of an existing one).
 *
 * Pipeline:
 *   1. fetch HTML + preserve HTTP response-headers.json (S6 — whitelist of diagnostic headers)
 *   2. collect CSS (external + preload + @import resolved + inline + style="" attrs)
 *      + favicon + logo
 *   2.5 content-validation gate (R1) — aborts if content is insubstantial
 *   3. static-CSS detection (tokens, vars, fonts, shadows, motion, breakpoints,
 *      dark mode, component properties, stack fingerprint with confidence ladder + suppression)
 *      → inputs/stack.json (full with suppressed_by)
 *      → inputs/stack-summary.json (filtered top-8, no suppressed_by, < 2KB for LLM)
 *   4. HTML → markdown (turndown) + page copy specimens
 *   5. prepare prompt + invoke LLM (provider-agnostic via invokeLlm)
 *      prompt input #8 = STACK_PATH (stack-summary.json)
 *   6. normalize DESIGN.md (spec-clean) + lint via @google/design.md
 *      + LLM retry (R2) if max-turns hit or sections incomplete
 *   7. extraction-log + quality score + drift report (if --compare) +
 *      font URL manifest + agent prompt
 *   8. render lightweight preview.html
 *   8.5 (opt-in via --emit-showcase) render showcase.html
 *   9.5 (opt-in via --gallery / --bundle-force / DESIGN_MD_WRITE_APPS=1)
 *      materialize design-gallery bundle at apps/design/src/data/designs/{slug}/
 *      (meta + assets + fonts + preview + audit + diagnostics + DESIGN.md).
 *      Skip with --no-bundle or DESIGN_MD_SKIP_BUNDLE=1.
 *
 * Exit codes:
 *   1 — usage error (missing --url)
 *   2 — DESIGN.md not produced by LLM
 *   4 — content-validation gate: content too thin (bot detection, paywall, SPA)
 *       override with --no-content-gate
 *   5 — LLM exhausted budget (max-turns hit) and retry also failed
 *       or DESIGN.md missing required sections after retry
 *       override retry with --no-llm-retry (CI mode — fail hard on first error)
 *   6 — OpenRouter selected but OPENROUTER_API_KEY not set
 *   7 — OpenRouter HTTP error (4xx/5xx) after retry exhausted
 *
 * Flags:
 *   --url <url>           Target URL to extract design from
 *   --out <dir>           Output directory (default: outputs/design-ops/url-extracts/<slug>)
 *   --prompt <file>       Custom prompt template file
 *   --compare <file>      Compare extracted tokens against local DESIGN.md
 *   --no-content-gate     Skip content-validation gate
 *   --no-llm-retry        Fail hard on first LLM error (CI mode)
 *   --no-learning         Skip .aiox/learning execution-log emission
 *   --provider <id>       Force provider: claude-cli | codex-cli | openrouter | openai |
 *                         anthropic-api | generic-http (auto-detected by default).
 *                         Auto-detection priority: OPENROUTER_API_KEY >
 *                         ANTHROPIC_API_KEY > OPENAI_API_KEY >
 *                         GENERIC_HTTP_ENDPOINT+KEY > claude-cli (if on PATH).
 *   --model <id>          Model ID for the chosen provider (e.g.
 *                         anthropic/claude-haiku-4-5, gpt-5-mini, claude-sonnet-4-6)
 *   --budget <tier>       cheap | standard | premium model/cost profile
 *   --max-cache-age <h>   Static fetch/collect/detect/markdown reuse TTL (default 168h)
 *   --max-llm-cache-age <h> LLM reuse TTL (default 24h)
 *   --max-tokens <n>      Max tokens for HTTP-provider response (default: 32768)
 *   --manual-recovery     Mark output as manually authored from extracted evidence
 *   --gallery             Opt in to writing derived gallery artifacts under
 *                         apps/design after extraction.
 *   --scaffold            After extract+enrich, emit design.md scaffold to
 *                         outputs/design-ops/scaffolds/<slug>/DESIGN.md.
 *                         Refuses to overwrite existing files (use --scaffold-force).
 *   --scaffold-out <path> Override scaffold output path.
 *   --scaffold-force      Overwrite existing scaffold file.
 *   --no-bundle           Skip the apps/design bundle step even when gallery
 *                         writes are explicitly enabled. Also disabled via
 *                         DESIGN_MD_SKIP_BUNDLE=1.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const { parseArgs, slugifyHost, companyFromUrl, slugFromUrl, timestamp, parseFrontmatter } = require("./lib/utils.cjs");
const {
  fetchHtml,
  collectCss,
  fetchFavicon,
  fetchLogo,
} = require("./lib/fetch.cjs");
const {
  detectTokens,
  detectCssVars,
  detectFontFaces,
  detectStack,
  classifyStyle,
  truncateCssForLlm,
  summarizeStackForPrompt,
  detectShadows,
  detectMotion,
  detectBreakpoints,
  detectDarkMode,
  detectComponentProperties,
  buildUsageGraph,
  htmlToMarkdown,
  extractPageCopy,
  // L3/L4 extras (B1)
  detectGradients,
  detectBackdropBlur,
  detectZIndex,
  detectContainerMaxWidth,
  detectOpacityScale,
  detectFocusRing,
  // Theme default detection
  detectDefaultTheme,
  // v2.2 canonical-feeders (2026-05-02)
  extractMetaAssets,
  extractHeroBlock,
  detectVoiceHeuristic,
  detectHeroVariant,
  detectCtaVariants,
  generateMetaDefaults,
} = require("./lib/extractors.cjs");
const { invokeLlm, buildAgentPrompt, detectProvider, validateProviderModel } = require("./lib/llm.cjs");
const {
  normalizeDesignMd,
  runLint,
  buildExtractionLog,
  computeQualityScore,
  computeDrift,
  formatLintSummary,
} = require("./lib/design-md.cjs");
const { renderPreview } = require("./lib/preview.cjs");
const { extractComponentStates } = require("./lib/component-state-extractor.cjs");
const { detectAsymmetries, renderAsymmetriesMarkdown } = require("./lib/asymmetry-detector.cjs");
const { extractProvenance } = require("./lib/selector-provenance.cjs");
const { classifyAtomic } = require("./lib/atomic-classifier.cjs");
const { buildShowcaseHtml } = require("./lib/tailwind-bundle-builder.cjs");
const {
  classifyRunDir,
  annotateTelemetry,
  writeExtractionClass,
} = require("./lib/extraction-classifier.cjs");
const {
  DEFAULT_PROCESS_CONTRACT_PATH,
  loadProcessContract,
  renderProcessContractForPrompt,
} = require("./lib/process-contract.cjs");
const {
  createPhaseTimer,
  parseClaudeCliStdout,
  parseOpenRouterResponse,
  estimateCost,
  estimateCostFromChars,
  buildBudgetPreflight,
  validateDesignMdSections,
} = require("./lib/telemetry.cjs");
const {
  learningEnabled,
  buildExtractUrlLearningLog,
  buildFailureLearningLog,
  writeExtractUrlLearningLog,
} = require("./lib/learning-log.cjs");
const {
  FRESH_MS_DEFAULT,
  FRESH_LLM_MS_DEFAULT,
  findLatestRunForUrl,
  isFresh,
  copyAllOrNone,
  copyIfExists,
  readPrevTelemetryModel,
  readPrevTelemetry,
  promptsEqual,
  promoteOrArchive,
  archiveScratchWithoutPromotion,
  moveDir,
  writeInputsManifest,
} = require("./lib/reuse.cjs");
const { logWritePath, logReadPath } = require("./lib/log-paths.cjs");
const { runCapture } = require("./lib/capture.cjs");
const { validateNoFallbacksForRunDir } = require("./lib/no-fallbacks-gate.cjs");

function serializeRenderableAsset(asset, extra = {}) {
  if (!asset) return null;
  const out = {
    sourceUrl: asset.sourceUrl,
    mime: asset.mime,
    size: asset.size,
    ...extra,
  };
  if (!asset.sourceUrl && asset.dataUrl) out.dataUrl = asset.dataUrl;
  return out;
}

function attachNdjsonConsoleLogger(logPath) {
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  const write = (level, args) => {
    try {
      const message = args.map((arg) => {
        if (typeof arg === "string") return arg;
        if (arg instanceof Error) return arg.stack || arg.message;
        try { return JSON.stringify(arg); } catch { return String(arg); }
      }).join(" ");
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, JSON.stringify({
        ts: new Date().toISOString(),
        level,
        message,
      }) + "\n");
    } catch {
      // Structured logs are diagnostic only; never break the extraction path.
    }
  };

  console.log = (...args) => { write("info", args); original.log(...args); };
  console.warn = (...args) => { write("warn", args); original.warn(...args); };
  console.error = (...args) => { write("error", args); original.error(...args); };

  return () => {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  };
}

function telemetryMarksManualRecovery(telemetry) {
  if (!telemetry || typeof telemetry !== "object") return false;
  return (
    telemetry.manual_recovery === true ||
    telemetry.operational_mode === "manual_recovery" ||
    telemetry.provider === "manual" ||
    telemetry.llm?.provenance === "manual_recovery"
  );
}

function promptPathIfExists(filePath) {
  return fs.existsSync(filePath) ? filePath : "(not found)";
}

function fillPromptTemplate(promptTemplate, {
  url,
  inputsDir,
  outDir,
  designMdPath,
  styleFingerprint = null,
  defaultTheme = "light",
  themeConfidence = "low",
  includeTokens = true,
  includeUsageGraph = true,
  processContract = "",
  processContractPath = "",
  capturesManifest = null,
}) {
  const inputPath = (filename) => path.join(inputsDir, filename);

  // Build the captures evidence block. When captures unavailable (--no-captures
  // or pipeline error), emit an honest extraction_gap marker.
  const capturesDir = path.join(inputsDir, "captures");
  let capturesList;
  if (!capturesManifest || !Array.isArray(capturesManifest.viewports) || capturesManifest.viewports.length === 0) {
    capturesList = "(no visual captures available — extraction_gap)";
  } else {
    capturesList = capturesManifest.viewports
      .filter((v) => v.file && !v.error)
      .map((v) => `- ${path.join(inputsDir, v.file)} — ${v.label} (${v.viewport}${v.fullPage ? ", full-page" : ""}, ${v.format}${v.retried ? ", PNG-fallback" : ""})`)
      .join("\n   ");
    if (!capturesList) capturesList = "(captures attempted but all failed — extraction_gap)";
  }

  const filled = promptTemplate
    .replace(/\{\{PROCESS_CONTRACT\}\}/g, processContract)
    .replace(/\{\{PROCESS_CONTRACT_PATH\}\}/g, processContractPath)
    .replace(/\{\{URL\}\}/g, url)
    .replace(/\{\{HTML_MD_PATH\}\}/g, inputPath("page.md"))
    .replace(/\{\{CSS_PATH\}\}/g, inputPath("css-for-llm.css"))
    .replace(/\{\{CSS_FULL_PATH\}\}/g, inputPath("css-collected.css"))
    .replace(/\{\{TOKENS_PATH\}\}/g, includeTokens ? inputPath("tokens-detected.json") : "")
    .replace(/\{\{CSS_VARS_PATH\}\}/g, inputPath("css-vars-detected.json"))
    .replace(/\{\{FONT_FACES_PATH\}\}/g, inputPath("font-faces.json"))
    .replace(/\{\{USAGE_GRAPH_PATH\}\}/g, includeUsageGraph ? inputPath("token-usage-graph.json") : "")
    .replace(/\{\{COMPONENT_PROPS_PATH\}\}/g, inputPath("component-properties.json"))
    .replace(/\{\{COMPONENT_STATES_PATH\}\}/g, inputPath("component-states.json"))
    .replace(/\{\{MOTION_PATH\}\}/g, inputPath("motion.json"))
    .replace(/\{\{ASYMMETRIES_PATH\}\}/g, inputPath("extraction-asymmetries.json"))
    .replace(/\{\{SELECTOR_PROVENANCE_PATH\}\}/g, inputPath("selector-provenance.json"))
    .replace(/\{\{ATOMIC_CLASSIFICATION_PATH\}\}/g, inputPath("atomic-classification.json"))
    .replace(/\{\{STACK_PATH\}\}/g, inputPath("stack-summary.json"))
    .replace(/\{\{META_ASSETS_PATH\}\}/g, inputPath("meta-assets.json"))
    .replace(/\{\{LOGO_PATH\}\}/g, promptPathIfExists(inputPath("logo.json")))
    .replace(/\{\{FAVICON_PATH\}\}/g, promptPathIfExists(inputPath("favicon.json")))
    .replace(/\{\{HERO_BLOCK_PATH\}\}/g, inputPath("hero-block.json"))
    .replace(/\{\{CTA_VARIANTS_PATH\}\}/g, inputPath("cta-variants.json"))
    .replace(/\{\{STYLE_FINGERPRINT_PATH\}\}/g, path.join(outDir, "style-fingerprint.json"))
    .replace(/\{\{CAPTURES_DIR\}\}/g, capturesDir)
    .replace(/\{\{CAPTURES_LIST\}\}/g, capturesList)
    .replace(/\{\{ARCHETYPE\}\}/g, styleFingerprint?.classification?.primary_archetype || "unclassified")
    .replace(/\{\{DEFAULT_THEME\}\}/g, defaultTheme)
    .replace(/\{\{THEME_CONFIDENCE\}\}/g, themeConfidence)
    .replace(/\{\{OUTPUT_PATH\}\}/g, designMdPath);

  if (processContract && !promptTemplate.includes("{{PROCESS_CONTRACT}}")) {
    const contractBlock = processContractPath
      ? `Process contract path: ${processContractPath}\n\n${processContract}`
      : processContract;
    return `${contractBlock}\n\n---\n\n${filled}`;
  }
  return filled;
}

// ── Content-validation gate thresholds (R1) — adjustable ────────────
const CONTENT_GATE_CSS_MIN_BYTES = 1000;
const CONTENT_GATE_HTML_MIN_BYTES = 500;
const CONTENT_GATE_COLORS_MIN = 3;

// ── Pipeline error class — preserves exit code while letting catch handler save crash-context ──
class PipelineError extends Error {
  constructor(message, exitCode = 1, details = {}) {
    super(message);
    this.name = "PipelineError";
    this.exitCode = exitCode;
    this.details = details;
  }
}

// ── Transient error detection for LLM CLI/API providers (A1) ─────────
// Stream-idle timeouts, partial-response API errors, 5xx/429s and CLI network
// blips are recoverable in a fresh subprocess. This must cover both Claude CLI
// and Codex CLI because the Codex skill forces --provider codex-cli.
function isLlmTransientError(result) {
  if (!result || result.status === 0) return false;
  const body = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (!body.trim()) return false;
  if (/error_max_turns|max[_ -]?turns/i.test(body)) return false;
  // Stream-idle timeout (most common): "API Error: Stream idle timeout - partial response received"
  if (/stream idle timeout|partial response received/i.test(body)) return true;
  // Generic API errors that are typically transient (5xx-style on Anthropic side)
  if (/"is_error":\s*true.*api error|"api_error_status":\s*5\d\d/i.test(body)) return true;
  // Connection reset / network blip surfaced as is_error true with no api_error_status
  if (/"is_error":\s*true.*"api_error_status":\s*null.*connection|network/i.test(body)) return true;
  if (/\b(ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up)\b/i.test(body)) return true;
  if (/\bENOBUFS\b|maxBuffer|stdout maxBuffer|stderr maxBuffer/i.test(body)) return true;
  if (/\b(?:429|rate limit|too many requests|5\d\d|bad gateway|service unavailable|gateway timeout)\b/i.test(body)) return true;
  if (/timed?\s*out|timeout.*(?:api|request|stream|model|codex)/i.test(body)) return true;
  return false;
}

// ── HTTP retry with 2s delay (AC4.3) — openrouter + claude-cli stream-idle ──
// CLI providers do NOT return httpStatus (subprocess), so they fall through to
// the generic non-zero exit branch below. Use `!= null` to catch undefined.
// Recovery path — when an LLM call returns non-zero status (timeout, transient
// crash, partial write) BUT the model wrote a complete DESIGN.md to disk via
// its tool calls during the session. Codex-cli especially hits 15min timeouts
// after writing a complete file but before returning to stdout. Without this
// check, the pipeline retries (burning $$ + hours) when the work is already
// done. Validates: file exists, ≥10KB, YAML frontmatter present, ≥8 numbered
// sections (## 1. through ## 9.). Returns synthesized success result or null.
function recoverFromDesignMdOnDisk(llmOptions) {
  const designMdPath = llmOptions && llmOptions.designMdPath;
  if (!designMdPath || !fs.existsSync(designMdPath)) return null;
  let content;
  try { content = fs.readFileSync(designMdPath, "utf8"); } catch { return null; }
  if (!content || content.length < 10000) return null;
  if (!content.startsWith("---\n") && !content.includes("\n---\n")) return null;
  const sections = (content.match(/^## \d+\./gm) || []).length;
  if (sections < 8) return null;
  return {
    status: 0,
    stdout: content,
    stderr: "",
    httpStatus: null,
    recovered: true,
    recovery: { source: "design_md_on_disk", bytes: content.length, sections },
  };
}

async function invokeWithHttpRetry(promptText, llmOptions, noRetry) {
  const result = await invokeLlm(promptText, llmOptions);

  // openrouter HTTP error path (httpStatus is set when provider is openrouter)
  if (result.status !== 0 && result.httpStatus != null && !noRetry) {
    const code = result.httpStatus;
    if (code === 429 || (code >= 500 && code < 600)) {
      console.log(`     [openrouter] HTTP ${code} — waiting 2s then retrying…`);
      await new Promise((res) => setTimeout(res, 2000));
      const retry = await invokeLlm(promptText, llmOptions);
      if (retry.status !== 0) {
        const retryBody = retry.stderr || "";
        console.error(`[!] OpenRouter HTTP error after retry: ${retryBody.slice(0, 500)}`);
        throw new PipelineError(`OpenRouter HTTP error after retry`, 7, { httpStatus: retry.httpStatus, body: retryBody.slice(0, 500) });
      }
      return { result: retry, httpRetried: true, retryReason: code === 429 ? "http_429" : "http_5xx" };
    }
    // Non-retryable openrouter HTTP error
    const errBody = result.stderr || "";
    console.error(`[!] OpenRouter HTTP error: ${errBody.slice(0, 500)}`);
    throw new PipelineError(`OpenRouter HTTP error`, 7, { httpStatus: code, body: errBody.slice(0, 500) });
  }

  // CLI/API transient error path (A1) — stream-idle, partial-response, etc.
  // These are NOT prompt problems; a fresh subprocess usually succeeds.
  if (result.status !== 0 && !noRetry && isLlmTransientError(result)) {
    const provider = llmOptions.provider || "auto";

    // Recovery path: codex-cli (and similar) often hangs/timeouts AFTER writing
    // a complete DESIGN.md via tool calls. Before burning $$ on retry, check
    // if the file is already on disk and valid.
    const recovered = recoverFromDesignMdOnDisk(llmOptions);
    if (recovered) {
      console.log(`     [${provider}] transient LLM error BUT DESIGN.md already on disk (${recovered.recovery.sections} sections, ${(recovered.recovery.bytes / 1024).toFixed(1)}KB) — recovered without retry`);
      return { result: recovered, httpRetried: false, retryReason: "recovered_from_disk" };
    }

    console.log(`     [${provider}] transient LLM error — waiting 5s then retrying…`);
    await new Promise((res) => setTimeout(res, 5000));
    const retry = await invokeLlm(promptText, llmOptions);
    if (retry.status === 0) {
      return { result: retry, httpRetried: true, retryReason: "llm_transient" };
    }
    if (isLlmTransientError(retry)) {
      console.error(`[!] ${provider} transient error persisted across retry — giving up`);
      const body = (retry.stdout || retry.stderr || "").slice(0, 500);
      throw new PipelineError(`${provider} transient error after retry`, 7, { provider, body });
    }
    // Retry surfaced a different (non-transient) failure — surface it through
    // the same handler used for first-pass non-zero results. Returning early
    // with the retry shape lets the unified branch below process max-turns
    // soft-fails and generic errors without re-invoking the LLM.
    return handleNonZeroResult(retry, llmOptions);
  }

  // Generic non-zero exit (CLI subprocess failure, network error, etc.)
  if (result.status !== 0) {
    return handleNonZeroResult(result, llmOptions);
  }

  return { result, httpRetried: false };
}

// Shared handler for non-zero LLM results — used both on first-pass failures
// and when an A1 transient retry surfaces a different (non-transient) error.
// Returns the same shape as invokeWithHttpRetry; throws on hard failures.
function handleNonZeroResult(result, llmOptions) {
  const errBody = result.stderr || result.stdout || "";
  const provider = llmOptions.provider || "claude-cli";

  // SOFT FAILURE — claude-cli exits 1 specifically when max-turns hits.
  // The stdout contains a JSON result with subtype "error_max_turns".
  // We must NOT throw here — let the main pipeline detect via parseClaudeCliStdout
  // and trigger the retry path (which uses maxTurns 60 + reduced prompt).
  const isMaxTurnsSoftFail =
    provider === "claude-cli" &&
    result.status === 1 &&
    typeof result.stdout === "string" &&
    result.stdout.includes("error_max_turns");
  if (isMaxTurnsSoftFail) {
    console.log(`     [claude-cli] hit max-turns (soft failure) — main pipeline will retry with reduced context`);
    return { result, httpRetried: false };
  }

  console.error(`[!] LLM invocation failed (provider=${provider}, exit=${result.status}): ${errBody.slice(0, 500)}`);
  throw new PipelineError(
    `LLM invocation failed (provider=${provider}, exit=${result.status})`,
    7,
    { provider, exit: result.status, body: errBody.slice(0, 800) }
  );
}

// ── Main pipeline ───────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);
  if (!args.url) {
    console.error("usage: extract-from-url.cjs --url <url> [--out <dir>] [--mode scaffold|scaffold-edit|llm-from-scratch] [--polish haiku|sonnet|opus] [--prompt <prompt-file>] [--compare <local-DESIGN.md>] [--no-content-gate] [--no-llm-retry] [--no-learning] [--provider <claude-cli|codex-cli|openrouter|openai|anthropic-api|generic-http>] [--model <model-id>] [--budget <cheap|standard|premium>] [--max-cost-usd <n>] [--max-cache-age <hours>] [--max-llm-cache-age <hours>] [--max-tokens <n>] [--manual-recovery] [--gallery] [--scaffold] [--scaffold-out <path>] [--scaffold-force]");
    process.exit(1);
  }

  const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
  // Variant-aware slug — different subpaths/subdomains under the same company
  // get their own folder so multiple distinct DSes don't collide.
  // Backwards compatible: root URLs still slug to bare company name.
  const company = slugFromUrl(args.url);
  const baseCompany = companyFromUrl(args.url);
  const runTs = timestamp();
  const extractsRoot = path.join(repoRoot, "outputs", "design-extractor", "url-extracts");
  const companyDir = path.join(extractsRoot, company);
  // Write to scratch dir during the run; promote/archive at the end.
  const outDir = args.out || path.join(companyDir, `.run-${runTs}`);
  const inputsDir = path.join(outDir, "inputs");
  const promptFile =
    args.prompt || path.join(repoRoot, "squads", "design-extractor", "data", "url-extract-prompt.txt");

  fs.mkdirSync(inputsDir, { recursive: true });
  attachNdjsonConsoleLogger(logWritePath(outDir, "run.log.ndjson"));

  // ── Reuse setup ───────────────────────────────────────────────────
  // Cache source = current `{company}/` root (latest "best" extraction).
  // If fresh, each static phase may copy its outputs from there instead of
  // recomputing. Disable with --no-reuse.
  const reuseEnabled = !args["no-reuse"];
  // A4: TTL is now configurable per run via --max-cache-age <hours>, falling
  // back to env DESIGN_MD_CACHE_HOURS, then to 7d default. Static fetch/CSS
  // artifacts age slowly — a week is more realistic than 24h.
  const cacheTtlMs = args["max-cache-age"] != null
    ? args["max-cache-age"] * 60 * 60 * 1000
    : FRESH_MS_DEFAULT;
  const llmCacheTtlMs = args["max-llm-cache-age"] != null
    ? args["max-llm-cache-age"] * 60 * 60 * 1000
    : FRESH_LLM_MS_DEFAULT;
  const cacheTtlHours = (cacheTtlMs / 36e5).toFixed(0);
  const llmCacheTtlHours = (llmCacheTtlMs / 36e5).toFixed(0);
  const previousRun = reuseEnabled
    ? findLatestRunForUrl({
        outputsDir: extractsRoot,
        company,
        currentRunDir: outDir,
      })
    : null;
  const previousFresh = previousRun ? isFresh(previousRun, cacheTtlMs) : false;
  const previousLlmFresh = previousRun ? isFresh(previousRun, llmCacheTtlMs) : false;
  const previousInputs = previousRun ? path.join(previousRun, "inputs") : null;
  const previousTelemetry = previousRun ? readPrevTelemetry(previousRun) : null;
  const previousManualRecovery = telemetryMarksManualRecovery(previousTelemetry);
  const reuseTrace = { fetch: "MISS", collect: "MISS", detect: "MISS", markdown: "MISS", llm: "MISS" };
  console.log(`[layout] company=${company}  scratch=${path.basename(outDir)}`);
  if (previousRun) {
    const ageH = (require("./lib/reuse.cjs").dirAgeMs(previousRun) / 36e5).toFixed(1);
    const stamp = previousFresh ? `${ageH}h old, static fresh (TTL ${cacheTtlHours}h)` : `${ageH}h old, static stale (>${cacheTtlHours}h)`;
    console.log(`[reuse] previous run found: ${company}/ (${stamp})`);
    console.log(`[reuse] llm-cache ${previousLlmFresh ? "fresh" : "stale"} (TTL ${llmCacheTtlHours}h)`);
  } else if (reuseEnabled) {
    console.log(`[reuse] no previous run for this URL — running cold`);
  } else {
    console.log(`[reuse] disabled via --no-reuse`);
  }

  const timer = createPhaseTimer();
  const wallStart = Date.now();

  // Expose timer + paths to the crash handler at module scope so a failure
  // anywhere in the pipeline produces a debuggable crash-context.json.
  if (process.__extractCrashCtx) {
    process.__extractCrashCtx.timer = timer;
    process.__extractCrashCtx.outDir = outDir;
    process.__extractCrashCtx.inputsDir = inputsDir;
    process.__extractCrashCtx.url = args.url;
  }

  // ── Phase 1: Fetch HTML ───────────────────────────────────────────
  let html, responseHeaders, responseStatus = null;
  if (
    previousFresh &&
    copyAllOrNone(previousInputs, inputsDir, ["page.html", "response-headers.json"])
  ) {
    html = fs.readFileSync(path.join(inputsDir, "page.html"), "utf8");
    responseHeaders = JSON.parse(fs.readFileSync(path.join(inputsDir, "response-headers.json"), "utf8"));
    responseStatus = Number(responseHeaders["x-sinkra-status"] || 0) || null;
    reuseTrace.fetch = "HIT";
    console.log(`[1/8] fetch — reused from ${path.basename(previousRun)}`);
  } else {
    console.log(`[1/8] fetching ${args.url}`);
    timer.start("phase_1_fetch");
    ({ html, headers: responseHeaders, status: responseStatus } = await fetchHtml(args.url));
    timer.end("phase_1_fetch");
    fs.writeFileSync(path.join(inputsDir, "page.html"), html);
    // Save whitelisted response headers as provenance artifact
    fs.writeFileSync(path.join(inputsDir, "response-headers.json"), JSON.stringify(responseHeaders, null, 2));
  }

  // ── Phase 1.5: Visual captures (Playwright/Puppeteer headless) ───
  // Capture screenshots of the live URL for visual evidence — vision LLMs
  // and downstream HTML/Tailwind builders consume these to recover what
  // CSS extraction can't see (handdrawn doodles, SVG illustrations,
  // typography-in-context, layout proportions). Default tier WebP@1x q85
  // (~85% smaller than PNG@2x). Quality gate triggers PNG@2x retry on
  // failure (page didn't render, bot block, etc).
  //
  // Cache reuse: if Phase 1 hit AND prior run has captures-manifest.json,
  // copy captures over wholesale — same source HTML => same captures.
  let capturesManifest = null;
  if (args["no-captures"]) {
    console.log(`[1.5/8] captures — skipped (--no-captures)`);
  } else if (
    reuseTrace.fetch === "HIT" &&
    fs.existsSync(path.join(previousInputs, "captures-manifest.json")) &&
    fs.existsSync(path.join(previousInputs, "captures"))
  ) {
    fs.cpSync(path.join(previousInputs, "captures"), path.join(inputsDir, "captures"), { recursive: true });
    fs.copyFileSync(path.join(previousInputs, "captures-manifest.json"), path.join(inputsDir, "captures-manifest.json"));
    capturesManifest = JSON.parse(fs.readFileSync(path.join(inputsDir, "captures-manifest.json"), "utf8"));
    reuseTrace.captures = "HIT";
    const ok = capturesManifest.summary?.ok ?? capturesManifest.viewports?.length ?? "?";
    console.log(`[1.5/8] captures — reused from ${path.basename(previousRun)} (${ok} viewports)`);
  } else {
    console.log(`[1.5/8] captures (visual evidence)`);
    timer.start("phase_1_5_captures");
    try {
      capturesManifest = await runCapture({ url: args.url, inputsDir });
      reuseTrace.captures = "MISS";
    } catch (err) {
      console.warn(`     captures: failed (${err.message}) — continuing without visual evidence`);
      reuseTrace.captures = "ERROR";
    }
    timer.end("phase_1_5_captures");
  }

  // ── Phase 2: Collect CSS + favicon + logo ─────────────────────────
  // Reuse if Phase 1 hit AND prior run has the required collect artifacts.
  // favicon.json / logo.json are optional (some sites lack them).
  let css, cssMeta, favicon = null, logo = null;
  const collectRequired = ["css-collected.css", "css-meta.json"];
  const canReuseCollect =
    reuseTrace.fetch === "HIT" &&
    copyAllOrNone(previousInputs, inputsDir, collectRequired);
  if (canReuseCollect) {
    css = fs.readFileSync(path.join(inputsDir, "css-collected.css"), "utf8");
    cssMeta = JSON.parse(fs.readFileSync(path.join(inputsDir, "css-meta.json"), "utf8"));
    if (copyIfExists(path.join(previousInputs, "favicon.json"), path.join(inputsDir, "favicon.json"))) {
      favicon = JSON.parse(fs.readFileSync(path.join(inputsDir, "favicon.json"), "utf8"));
    }
    if (copyIfExists(path.join(previousInputs, "logo.json"), path.join(inputsDir, "logo.json"))) {
      logo = JSON.parse(fs.readFileSync(path.join(inputsDir, "logo.json"), "utf8"));
    }
    reuseTrace.collect = "HIT";
    console.log(`[2/8] collect — reused from ${path.basename(previousRun)}`);
  } else {
    console.log(`[2/8] collecting CSS + favicon + logo`);
    timer.start("phase_2_collect");
    ({ css, meta: cssMeta } = await collectCss(html, args.url, {
      preferredFetchStrategy: responseHeaders?.["x-sinkra-fetch-strategy"] === "browser" ? "browser" : "auto",
    }));
    timer.end("phase_2_collect");
    fs.writeFileSync(path.join(inputsDir, "css-collected.css"), css);
    fs.writeFileSync(path.join(inputsDir, "css-meta.json"), JSON.stringify(cssMeta, null, 2));

    favicon = await fetchFavicon(html, args.url);
    if (favicon) {
      fs.writeFileSync(path.join(inputsDir, "favicon.json"), JSON.stringify(serializeRenderableAsset(favicon), null, 2));
      console.log(`     favicon: ${favicon.sourceUrl} (${favicon.mime}, ${favicon.size}b)`);
    } else {
      console.log(`     favicon: not found`);
    }

    logo = await fetchLogo(html, args.url);
    if (!logo && favicon) {
      logo = { ...favicon, source: "favicon (fallback)", kind: favicon.mime.includes("svg") ? "svg" : "img" };
      console.log(`     logo: using favicon as fallback`);
    }
    if (logo) {
      fs.writeFileSync(path.join(inputsDir, "logo.json"), JSON.stringify(serializeRenderableAsset(logo, { source: logo.source, kind: logo.kind }), null, 2));
      if (logo.source !== "favicon (fallback)") console.log(`     logo: ${logo.source} (${logo.mime}, ${logo.size}b)`);
    } else {
      console.log(`     logo: not found`);
    }
  }

  // ── Phase 2.5: Content-validation gate + SPA-shell rescue (R1, B1, B3) ─
  let preLiminaryColors = (css.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
  let cssBytes = css.length;
  let htmlBytes = html.length;
  let colorsFound = preLiminaryColors;

  const wouldFailGate =
    cssBytes < CONTENT_GATE_CSS_MIN_BYTES ||
    htmlBytes < CONTENT_GATE_HTML_MIN_BYTES ||
    colorsFound < CONTENT_GATE_COLORS_MIN;

  if (wouldFailGate) {
    // Always emit structured diagnostic so operators understand WHY the gate
    // would fire (B1). Written even when --no-content-gate lets us continue.
    const { classifyResponse, extractSpaPayloads } = require("./lib/bot-diagnostic.cjs");
    const diagnostic = classifyResponse({ html, headers: responseHeaders, status: responseStatus || Number(responseHeaders?.["x-sinkra-status"] || 0) || null });

    // B3: try SPA-shell payload extraction before hard-failing. Many "thin"
    // responses are real React/Vue apps shipping all design data inline.
    const spaPayload = extractSpaPayloads(html);
    if (spaPayload.found) {
      console.log(`[2.5/8] SPA-shell rescue: recovered ${spaPayload.colorsRecovered} colors, ${spaPayload.fontFamiliesRecovered} fonts, ${spaPayload.cssVarsRecovered} vars from ${spaPayload.sources.map(s => s.source).join(", ")}`);
      // Append synthesized CSS to css-collected.css and re-evaluate gate metrics.
      css = (css || "") + "\n\n/* ── SPA-shell-recovered signal (B3) ── */\n" + spaPayload.synthCss + "\n";
      fs.writeFileSync(path.join(inputsDir, "css-collected.css"), css);
      fs.writeFileSync(path.join(inputsDir, "spa-rescue.json"), JSON.stringify({
        sources: spaPayload.sources,
        colorsRecovered: spaPayload.colorsRecovered,
        fontFamiliesRecovered: spaPayload.fontFamiliesRecovered,
        cssVarsRecovered: spaPayload.cssVarsRecovered,
      }, null, 2));
      // Recompute gate metrics with the rescued signal.
      preLiminaryColors = (css.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
      cssBytes = css.length;
      colorsFound = preLiminaryColors;
    }

    diagnostic.spa_rescue = spaPayload.found ? {
      attempted: true,
      colors_recovered: spaPayload.colorsRecovered,
      font_families_recovered: spaPayload.fontFamiliesRecovered,
      css_vars_recovered: spaPayload.cssVarsRecovered,
      sources: spaPayload.sources.map(s => s.source),
    } : { attempted: true, recovered: false };

    fs.writeFileSync(path.join(inputsDir, "bot-detection-diagnostic.json"), JSON.stringify(diagnostic, null, 2));
    console.log(`[2.5/8] bot-detection diagnostic: verdict=${diagnostic.verdict}`);

    // Re-evaluate gate with possibly-rescued signal.
    const stillFails =
      cssBytes < CONTENT_GATE_CSS_MIN_BYTES ||
      htmlBytes < CONTENT_GATE_HTML_MIN_BYTES ||
      colorsFound < CONTENT_GATE_COLORS_MIN;

    if (stillFails && !args["no-content-gate"]) {
      console.error(`[!] Content-validation gate FAILED — content too thin to produce a meaningful DESIGN.md`);
      console.error(`    Observed: html=${htmlBytes}b  css=${cssBytes}b  colors=${colorsFound}`);
      console.error(`    Thresholds: html>=${CONTENT_GATE_HTML_MIN_BYTES}b  css>=${CONTENT_GATE_CSS_MIN_BYTES}b  colors>=${CONTENT_GATE_COLORS_MIN}`);
      console.error(`    Diagnostic: ${diagnostic.verdict}`);
      console.error(`    Recommendation: ${diagnostic.recommendation}`);
      console.error(`    See: inputs/bot-detection-diagnostic.json`);
      console.error(`    Override with --no-content-gate (rarely productive when verdict is a bot challenge).`);
      throw new PipelineError("Content-validation gate failed", 4, {
        verdict: diagnostic.verdict,
        recommendation: diagnostic.recommendation,
        observed: { html_bytes: htmlBytes, css_bytes: cssBytes, colors: colorsFound },
      });
    }
  }

  // ── Phase 3: Token detection ──────────────────────────────────────
  // Reuse if Phase 2 hit AND prior run has all 13 detection artifacts (12 in inputs/, 1 at outDir root).
  const detectInputsFiles = [
    "tokens-detected.json", "css-vars-detected.json", "font-faces.json",
    "token-usage-graph.json", "component-properties.json", "breakpoints.json",
    "dark-mode.json", "shadows.json", "motion.json", "stack.json",
    "stack-summary.json", "css-for-llm.css", "css-truncation-stats.json",
    // L3/L4 extras (B1)
    "gradients.json", "backdrop-blur.json", "z-index.json",
    "container.json", "opacity-scale.json", "focus-ring.json",
    // Theme default
    "theme-default.json",
    // A5 fix (2026-05-03): meta-assets.json was generated in Phase 3 but missing
    // from the reuse list, causing ENOENT on second runs that hit detect-cache.
    "meta-assets.json",
    // Wave 1 (2026-05-06): deep extraction primitives reborn from the
    // transform-html-tailwind-gold-standard 30h session. Sidecars now part
    // of the canonical detect-cache reuse contract.
    "component-states.json",
    "extraction-asymmetries.json",
    // Wave 2 (2026-05-06): selector→token provenance + atomic-design
    // classification. Source-verified palette + atomic taxonomy for
    // downstream atomic-design preview rendering.
    "selector-provenance.json",
    "atomic-classification.json",
  ];
  let detected, cssVars, fontFaces, usageGraph, componentProps, breakpoints, darkMode, shadows, motion, stack, styleFingerprint;
  // Wave 1+2 hoisted state — visible to Phase 8.5 (--emit-showcase) in both
  // fresh-detect and reuse branches.
  let componentStates = null;
  const prevStyleFingerprint = previousRun ? path.join(previousRun, "style-fingerprint.json") : null;
  const canReuseDetect =
    reuseTrace.collect === "HIT" &&
    fs.existsSync(prevStyleFingerprint) &&
    copyAllOrNone(previousInputs, inputsDir, detectInputsFiles);
  if (canReuseDetect) {
    fs.copyFileSync(prevStyleFingerprint, path.join(outDir, "style-fingerprint.json"));
    detected = JSON.parse(fs.readFileSync(path.join(inputsDir, "tokens-detected.json"), "utf8"));
    cssVars = JSON.parse(fs.readFileSync(path.join(inputsDir, "css-vars-detected.json"), "utf8"));
    fontFaces = JSON.parse(fs.readFileSync(path.join(inputsDir, "font-faces.json"), "utf8"));
    usageGraph = JSON.parse(fs.readFileSync(path.join(inputsDir, "token-usage-graph.json"), "utf8"));
    componentProps = JSON.parse(fs.readFileSync(path.join(inputsDir, "component-properties.json"), "utf8"));
    breakpoints = JSON.parse(fs.readFileSync(path.join(inputsDir, "breakpoints.json"), "utf8"));
    darkMode = JSON.parse(fs.readFileSync(path.join(inputsDir, "dark-mode.json"), "utf8"));
    shadows = JSON.parse(fs.readFileSync(path.join(inputsDir, "shadows.json"), "utf8"));
    motion = JSON.parse(fs.readFileSync(path.join(inputsDir, "motion.json"), "utf8"));
    stack = JSON.parse(fs.readFileSync(path.join(inputsDir, "stack.json"), "utf8"));
    styleFingerprint = JSON.parse(fs.readFileSync(path.join(outDir, "style-fingerprint.json"), "utf8"));
    // Wave 1: load component-states from prior run for downstream Phase 8.5
    const cachedStatesPath = path.join(inputsDir, "component-states.json");
    if (fs.existsSync(cachedStatesPath)) {
      try {
        componentStates = JSON.parse(fs.readFileSync(cachedStatesPath, "utf8"));
      } catch {
        componentStates = null;
      }
    }
    // Wave 1: copy extraction-asymmetries.md from previous run if present
    // (component-states.json + extraction-asymmetries.json are already covered
    // by the detectInputsFiles copy contract above).
    const prevAsymmetriesMd = path.join(previousRun, "extraction-asymmetries.md");
    if (fs.existsSync(prevAsymmetriesMd)) {
      fs.copyFileSync(prevAsymmetriesMd, path.join(outDir, "extraction-asymmetries.md"));
    }
    reuseTrace.detect = "HIT";
    console.log(`[3/8] detect — reused from ${path.basename(previousRun)}`);
  } else {
    console.log(`[3/8] token detection (regex + CSS vars + @font-face + usage graph)`);
    timer.start("phase_3_detect");
    detected = detectTokens(css);
    detected.colors.hex_usage = {};
    for (const hex of detected.colors.hex) {
      const re = new RegExp(hex.replace(/[#]/g, "\\#"), "gi");
      const matches = css.match(re);
      detected.colors.hex_usage[hex.toLowerCase()] = matches ? matches.length : 0;
    }
    fs.writeFileSync(path.join(inputsDir, "tokens-detected.json"), JSON.stringify(detected, null, 2));

    cssVars = detectCssVars(css);
    fs.writeFileSync(path.join(inputsDir, "css-vars-detected.json"), JSON.stringify(cssVars, null, 2));

    fontFaces = detectFontFaces(css);
    fs.writeFileSync(path.join(inputsDir, "font-faces.json"), JSON.stringify(fontFaces, null, 2));

    usageGraph = buildUsageGraph(css, cssVars);
    fs.writeFileSync(path.join(inputsDir, "token-usage-graph.json"), JSON.stringify(usageGraph, null, 2));

    componentProps = detectComponentProperties(css);
    fs.writeFileSync(path.join(inputsDir, "component-properties.json"), JSON.stringify(componentProps, null, 2));

    breakpoints = detectBreakpoints(css);
    fs.writeFileSync(path.join(inputsDir, "breakpoints.json"), JSON.stringify(breakpoints, null, 2));

    darkMode = detectDarkMode(css, cssVars);
    fs.writeFileSync(path.join(inputsDir, "dark-mode.json"), JSON.stringify(darkMode, null, 2));

    shadows = detectShadows(css);
    fs.writeFileSync(path.join(inputsDir, "shadows.json"), JSON.stringify(shadows, null, 2));

    motion = detectMotion(css);
    fs.writeFileSync(path.join(inputsDir, "motion.json"), JSON.stringify(motion, null, 2));

    // ── Phase 3.5: Wave 1 deep extraction primitives ──────────────────
    // Component interaction states (:hover, :disabled, :focus, ...) +
    // brand-identity flatness signals (zero shadows, single curve, narrow
    // palette, etc.). Promoted from the transform-html-tailwind-gold-standard
    // 30h session — see squads/design-ops/rules/tailwind-v4.md for downstream
    // consumption guidance.
    componentStates = extractComponentStates(css);
    fs.writeFileSync(path.join(inputsDir, "component-states.json"), JSON.stringify(componentStates, null, 2));
    const asymmetryReport = detectAsymmetries({
      tokensDetected: detected,
      shadows,
      motion,
      componentStates,
    });
    fs.writeFileSync(path.join(inputsDir, "extraction-asymmetries.json"), JSON.stringify(asymmetryReport, null, 2));
    fs.writeFileSync(
      path.join(outDir, "extraction-asymmetries.md"),
      renderAsymmetriesMarkdown(asymmetryReport, {
        brand: companyFromUrl(args.url),
        url: args.url,
        extracted_at: new Date().toISOString(),
      })
    );

    // ── Phase 3.6: Wave 2 provenance + atomic classification ─────────
    // selector-provenance.json: per-token-value list of selectors+properties
    // that produced it (powers source-verified palette in preview.html).
    // atomic-classification.json: atoms / molecules / organisms / templates /
    // pages buckets. Per .claude/rules/extraction-no-fallbacks.md the
    // classifier only assigns when evidence supports it; high unclassified
    // count for hashed-class brands is honest reporting, not a defect.
    // Pass cssVars so the provenance extractor can resolve `var(--font-x)`
    // chains in font-family declarations (Obsidian / Tailwind brands).
    const provenance = extractProvenance(css, { cssVars });
    fs.writeFileSync(path.join(inputsDir, "selector-provenance.json"), JSON.stringify(provenance, null, 2));
    const atomic = classifyAtomic({ css, componentProperties: componentProps });
    fs.writeFileSync(path.join(inputsDir, "atomic-classification.json"), JSON.stringify(atomic, null, 2));

    stack = detectStack(html, css, cssMeta, responseHeaders);
    fs.writeFileSync(path.join(inputsDir, "stack.json"), JSON.stringify(stack, null, 2));
    const stackSummary = summarizeStackForPrompt(stack);
    fs.writeFileSync(path.join(inputsDir, "stack-summary.json"), JSON.stringify(stackSummary, null, 2));

    // ── Phase 3f: Style fingerprint (visual archetype classification) ──
    // Complementary to detectStack (technical). Maps to canonical archetypes
    // defined in squads/design-ops/data/style-fingerprints.yaml.
    styleFingerprint = classifyStyle(detected, cssVars, shadows, fontFaces, css);
    fs.writeFileSync(path.join(outDir, "style-fingerprint.json"), JSON.stringify(styleFingerprint, null, 2));

    // ── Phase 3g: CSS truncation for LLM cost discipline (Gap #15) ──────
    // Apple css-collected.css = 668KB → $5.50/run with Opus. Truncate to ~100KB
    // prioritizing :root, dark mode, @theme inline, font-face, component selectors.
    const cssTruncated = truncateCssForLlm(css);
    fs.writeFileSync(path.join(inputsDir, "css-for-llm.css"), cssTruncated.truncated);
    fs.writeFileSync(path.join(inputsDir, "css-truncation-stats.json"), JSON.stringify({
      original_bytes: cssTruncated.original_bytes,
      kept_bytes: cssTruncated.kept_bytes,
      blocks_total: cssTruncated.blocks_total || null,
      blocks_kept: cssTruncated.blocks_kept || null,
      dropped: cssTruncated.dropped,
      reduction_pct: cssTruncated.dropped
        ? Math.round((1 - cssTruncated.kept_bytes / cssTruncated.original_bytes) * 100)
        : 0,
    }, null, 2));

    // ── Phase 3h: L3/L4 extra detectors (B1) ──────────────────────────
    // Gradients, backdrop blur, z-index ladder, container max-width,
    // opacity scale, focus ring — all from raw CSS, no LLM.
    fs.writeFileSync(path.join(inputsDir, "gradients.json"), JSON.stringify(detectGradients(css), null, 2));
    fs.writeFileSync(path.join(inputsDir, "backdrop-blur.json"), JSON.stringify(detectBackdropBlur(css), null, 2));
    fs.writeFileSync(path.join(inputsDir, "z-index.json"), JSON.stringify(detectZIndex(css), null, 2));
    fs.writeFileSync(path.join(inputsDir, "container.json"), JSON.stringify(detectContainerMaxWidth(css), null, 2));
    fs.writeFileSync(path.join(inputsDir, "opacity-scale.json"), JSON.stringify(detectOpacityScale(css) || { all: [] }, null, 2));
    fs.writeFileSync(path.join(inputsDir, "focus-ring.json"), JSON.stringify(detectFocusRing(css), null, 2));

    // ── Phase 3i: Default theme detection (dark vs light) ─────────────
    // Used by the LLM prompt to disambiguate when CSS has both theme variants.
    fs.writeFileSync(path.join(inputsDir, "theme-default.json"), JSON.stringify(detectDefaultTheme(html, css), null, 2));

    // ── Phase 3j: v2.2 canonical-feeder — meta assets ────────────────
    // OG tags, apple-touch-icon, manifest, theme-color. Feeds the translator
    // when assembling apps/design/src/data/designs/{slug}/assets.json + meta.json.
    fs.writeFileSync(path.join(inputsDir, "meta-assets.json"), JSON.stringify(extractMetaAssets(html), null, 2));

    timer.end("phase_3_detect");
  }

  console.log(`     css-vars=${cssVars.length}  @font-face=${fontFaces.length}  unique-tokens=${usageGraph.length}`);
  console.log(`     shadows=${shadows.length}  motion: ${motion.durations.length} durations · ${motion.easings.length} easings · ${motion.keyframes.length} keyframes`);
  if (stack.length > 0) {
    const summary = stack.slice(0, 6).map(s => s.name).join(" · ");
    console.log(`     stack: ${stack.length} signals — ${summary}${stack.length > 6 ? " · …" : ""}`);
  }
  if (styleFingerprint.classification.primary_archetype) {
    const c = styleFingerprint.classification;
    const sec = c.secondary_archetype ? ` (also: ${c.secondary_archetype})` : "";
    console.log(`     archetype: ${c.primary_archetype} (${c.confidence_score}% confidence)${sec}`);
  } else {
    console.log(`     archetype: unclassified (no archetype reached 50% confidence threshold)`);
  }
  const btnRadius = componentProps.summary.button?.["border-radius"];
  if (btnRadius) console.log(`     button radius (most common in source): ${btnRadius.most_common} (${btnRadius.most_common_count}/${btnRadius.total_declarations} decls)`);

  // ── Phase 4: HTML → markdown ──────────────────────────────────────
  // Reuse if Phase 1 hit (markdown is purely a function of HTML).
  let md, pageCopy;
  const v22Files = [
    "page.md", "page-copy.json",
    "hero-block.json", "voice-heuristic.json",
    "hero-variant.json", "cta-variants.json",
  ];
  const canReuseMarkdown =
    reuseTrace.fetch === "HIT" &&
    copyAllOrNone(previousInputs, inputsDir, v22Files);
  if (canReuseMarkdown) {
    md = fs.readFileSync(path.join(inputsDir, "page.md"), "utf8");
    pageCopy = JSON.parse(fs.readFileSync(path.join(inputsDir, "page-copy.json"), "utf8"));
    reuseTrace.markdown = "HIT";
    console.log(`[4/8] markdown — reused from ${path.basename(previousRun)}`);
  } else {
    console.log(`[4/8] HTML → markdown + hero block + voice heuristic + hero variant + CTA variants`);
    timer.start("phase_4_markdown");
    md = htmlToMarkdown(html);
    fs.writeFileSync(path.join(inputsDir, "page.md"), md);
    pageCopy = extractPageCopy(md);
    fs.writeFileSync(path.join(inputsDir, "page-copy.json"), JSON.stringify(pageCopy, null, 2));
    // v2.2 canonical-feeders (2026-05-02): structured hero + voice signals + layout + CTA classification.
    // - hero-block.json feeds showcase{} in apps/design/src/data/designs/{slug}/design.md.
    // - voice-heuristic.json feeds preview.json#voice (translator may use LLM as fallback).
    // - hero-variant.json feeds showcase.layout (split / centered / stacked).
    // - cta-variants.json feeds components{button-primary,secondary,ghost} recipes.
    const heroBlock = extractHeroBlock(html);
    fs.writeFileSync(path.join(inputsDir, "hero-block.json"), JSON.stringify(heroBlock, null, 2));
    const voice = detectVoiceHeuristic(md);
    fs.writeFileSync(path.join(inputsDir, "voice-heuristic.json"), JSON.stringify(voice, null, 2));
    const heroVariant = detectHeroVariant(html, css);
    fs.writeFileSync(path.join(inputsDir, "hero-variant.json"), JSON.stringify(heroVariant, null, 2));
    // Primary brand color from tokens hint (extracted earlier in Phase 3) — used for CTA scoring.
    const primaryHint =
      detected.colors?.primary?.value ||
      detected.colors?.primary ||
      null;
    const ctaVariants = detectCtaVariants(css, componentProps, primaryHint);
    fs.writeFileSync(path.join(inputsDir, "cta-variants.json"), JSON.stringify(ctaVariants, null, 2));
    timer.end("phase_4_markdown");
  }

  // ── Phase 5: Prepare prompt OR scaffold-edit (mode-aware) ────────
  // ADR-053: default pipeline is `scaffold` (deterministic) or `scaffold-edit`
  // (deterministic + LLM-edit-constrained). Legacy `llm-from-scratch` opt-in via
  // `--mode llm-from-scratch`.
  const validModes = new Set(["scaffold", "scaffold-edit", "llm-from-scratch"]);
  const requestedMode = args.mode || "llm-from-scratch"; // keep legacy default until production validation
  if (!validModes.has(requestedMode)) {
    throw new Error(`[!] unknown --mode '${requestedMode}'. Valid: scaffold | scaffold-edit | llm-from-scratch.`);
  }
  const isScaffoldMode = requestedMode === "scaffold" || requestedMode === "scaffold-edit";
  console.log(`[mode] ${requestedMode}${requestedMode === "scaffold-edit" ? ` (polish=${args.polish || "haiku"})` : ""}`);

  console.log(`[5/8] preparing prompt`);
  timer.start("phase_5_prompt");
  const promptTemplate = fs.readFileSync(promptFile, "utf8");
  const designMdPath = path.join(outDir, "DESIGN.md");
  const processContract = loadProcessContract(DEFAULT_PROCESS_CONTRACT_PATH);
  const processContractPath = path.join(inputsDir, "process-contract.json");
  fs.writeFileSync(processContractPath, JSON.stringify(processContract, null, 2));
  const processContractPrompt = renderProcessContractForPrompt(processContract);
  // Read theme-default detection result for prompt substitution
  let defaultTheme = "light";
  let themeConfidence = "low";
  try {
    const td = JSON.parse(fs.readFileSync(path.join(inputsDir, "theme-default.json"), "utf8"));
    defaultTheme = td.default || "light";
    themeConfidence = td.confidence || "low";
  } catch {}
  const filled = fillPromptTemplate(promptTemplate, {
    url: args.url,
    inputsDir,
    outDir,
    designMdPath,
    styleFingerprint,
    defaultTheme,
    themeConfidence,
    processContract: processContractPrompt,
    processContractPath,
    capturesManifest,
  });
  fs.writeFileSync(path.join(inputsDir, "prompt.txt"), filled);
  timer.end("phase_5_prompt");

  // ── Phase 6: Invoke LLM (legacy) OR build scaffold (scaffold modes) ──
  let designMd;
  let rawDesignMdForEvidence = null;
  let llmProvenance = "model_generated";
  let llmResult = null;
  let resolvedProvider = null;
  let claudeMetadata = null;
  let openrouterUsage = null;
  let manualRecoverySaved = null;
  let manualRecoveryEnabled = null;
  let canReuseLlm = false;
  let scaffoldEditTelemetry = null;
  let retries = 0;
  let retryReasons = [];
  let maxTurnsHit = false;
  const budgetPreflights = [];
  // HTTP-style providers share response shape ({usage, finishReason, httpStatus})
  // while claude-cli returns {stdout containing JSON metadata}. Hoisted to outer
  // scope so scaffold-mode (which skips legacy phase 6) can still reach it from
  // phase 7+.
  const isHttpProvider = (p) =>
    p === "openrouter" || p === "openai" || p === "anthropic-api" || p === "generic-http";

  if (isScaffoldMode) {
    console.log(`[6/8] building scaffold (mode=${requestedMode})`);
    timer.start("phase_6_llm");
    const { buildDesignMdScaffold } = require("./lib/design-md-builder.cjs");
    const yaml = require("js-yaml");
    function tryReadJson(p) {
      if (!fs.existsSync(p)) return null;
      try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
    }
    const sidecarsForScaffold = {
      tokens: detected,
      metaDefaults: tryReadJson(path.join(inputsDir, "meta-defaults.json")),
      heroBlock: tryReadJson(path.join(inputsDir, "hero-block.json")),
      ctaVariants: tryReadJson(path.join(inputsDir, "cta-variants.json")),
      componentProperties: tryReadJson(path.join(inputsDir, "component-properties.json")),
      shadows: tryReadJson(path.join(inputsDir, "shadows.json")),
      motion: tryReadJson(path.join(inputsDir, "motion.json")),
      fontFaces: tryReadJson(path.join(inputsDir, "font-faces.json")),
      themeDefault: tryReadJson(path.join(inputsDir, "theme-default.json")),
      darkMode: tryReadJson(path.join(inputsDir, "dark-mode.json")),
      metaAssets: tryReadJson(path.join(inputsDir, "meta-assets.json")),
      slug: company,
    };
    const scaffoldMd = buildDesignMdScaffold(sidecarsForScaffold);
    designMd = scaffoldMd;
    fs.writeFileSync(designMdPath, designMd, "utf8");
    llmProvenance = "scaffold_deterministic";

    if (requestedMode === "scaffold-edit") {
      const polish = args.polish || "haiku";
      console.log(`     scaffold built (${designMd.length} bytes), running scaffold-edit polish=${polish}`);
      const { runScaffoldEdit } = require("./lib/scaffold-edit.cjs");
      const editResult = runScaffoldEdit({
        scaffoldMd,
        brandDir: outDir,
        brand: company,
        polish,
        yaml,
      });
      scaffoldEditTelemetry = editResult.telemetry;
      if (editResult.ok) {
        designMd = editResult.finalContent;
        fs.writeFileSync(designMdPath, designMd, "utf8");
        llmProvenance = "scaffold_then_llm_edit";
        console.log(
          `     scaffold-edit ok · expansion=${editResult.expansion_ratio?.toFixed(2)}x · ` +
          `null_filled=${editResult.null_slots_filled} · structure=${editResult.structure_preserved ? "preserved" : "RECOVERED"}`
        );
      } else {
        console.log(
          `     scaffold-edit FAILED — keeping scaffold puro · exit=${editResult.telemetry.exit_status} · ` +
          `is_error=${editResult.telemetry.is_error}`
        );
      }
    }

    // Stub llmResult so downstream phase 7+8 can read it.
    llmResult = {
      status: 0,
      stdout: "",
      stderr: "",
      usage: scaffoldEditTelemetry?.cost_usd != null ? {
        cost_usd: scaffoldEditTelemetry.cost_usd,
      } : null,
      finishReason: scaffoldEditTelemetry ? "scaffold_edit_complete" : "scaffold_only",
    };
    timer.end("phase_6_llm");
  } else {
  // ── Legacy LLM-from-scratch flow ───────────────────────────────────
  console.log(`[6/8] invoking LLM (this may take 30-120s)`);
  timer.start("phase_6_llm");

  const noLlmRetry = !!args["no-llm-retry"];
  const manualRecoveryRequested = !!args["manual-recovery"];
  // B2: --budget tier maps to (provider, model, maxTurns) when those args
  // weren't set explicitly. If the operator explicitly chose codex-cli, keep
  // the Codex provider and map only model/turn budget; do not silently jump to
  // Claude/OpenRouter from the Codex skill.
  const buildBudgetProfiles = (providerOverride) => {
    if (providerOverride === "codex-cli") {
      return {
        // 1.1 fix: cheap maxTurns 12→18 — turns are cheap on Codex; failing because
        // of a 12-turn ceiling on a 33KB prompt costs an entire run.
        cheap:    { provider: "codex-cli", model: process.env.DESIGN_MD_CODEX_CHEAP_MODEL || "gpt-5.4-mini", maxTurns: 18 },
        standard: { provider: "codex-cli", model: process.env.DESIGN_MD_CODEX_MODEL || null, maxTurns: 50 },
        premium:  { provider: "codex-cli", model: process.env.DESIGN_MD_CODEX_PREMIUM_MODEL || "gpt-5.5", maxTurns: 90 },
      };
    }
    if (providerOverride === "claude-cli") {
      return {
        cheap:    { provider: "claude-cli", model: "claude-haiku-4-5", maxTurns: 12 },
        standard: { provider: "claude-cli", model: null, maxTurns: 50 },
        premium:  { provider: "claude-cli", model: "claude-opus-4-7", maxTurns: 90 },
      };
    }
    return {
      cheap:    { provider: "openrouter", model: "anthropic/claude-haiku-4-5", maxTurns: 12 },
      standard: { provider: null,         model: null,                          maxTurns: 50 },
      premium:  { provider: "claude-cli", model: "claude-opus-4-7",             maxTurns: 90 },
    };
  };
  const budgetProfiles = buildBudgetProfiles(args.provider || null);
  let budgetProfile = null;
  if (args.budget) {
    budgetProfile = budgetProfiles[args.budget];
    if (!budgetProfile) {
      console.error(`[!] unknown --budget '${args.budget}'. Valid: cheap | standard | premium.`);
      process.exit(1);
    }
    console.log(`[budget] tier=${args.budget} → provider=${budgetProfile.provider || "auto"} model=${budgetProfile.model || "default"} maxTurns=${budgetProfile.maxTurns}`);
  }
  const provider = args.provider || (budgetProfile && budgetProfile.provider) || null;
  const model = args.model || (budgetProfile && budgetProfile.model) || null;
  const maxTurns = (budgetProfile && budgetProfile.maxTurns) || 50;
  const maxTokens = args["max-tokens"] || 32768;
  const retryMaxTokensDefault = parseInt(process.env.DESIGN_MD_RETRY_MAX_TOKENS || "", 10);
  const retryMaxTokensCeiling = Number.isFinite(retryMaxTokensDefault) && retryMaxTokensDefault > 0
    ? retryMaxTokensDefault
    : 65536;

  const llmOptions = {
    provider,
    model,
    maxTurns,
    maxTokens,
    budget: args.budget || null,
    maxCostUsd: args["max-cost-usd"],
    cwd: repoRoot,
    designMdPath,
  };

  llmResult = null;
  claudeMetadata = null;
  openrouterUsage = null;
  // retries, retryReasons, maxTurnsHit, budgetPreflights declared at outer scope
  // Universal mode (2026-05-03): delegate auto-detection to lib/llm.cjs so the
  // priority order (OPENROUTER > ANTHROPIC_API > OPENAI > GENERIC_HTTP > CLI)
  // is centralized.
  resolvedProvider = manualRecoveryRequested ? "manual" : null;
  if (!resolvedProvider) {
    try {
      resolvedProvider = detectProvider({ provider });
    } catch (err) {
      throw new PipelineError(err.message, 7, {
        provider: provider || "auto",
      });
    }
  }
  // (isHttpProvider declared at outer scope above for scaffold-mode phase 7+ access)
  const enforceBudgetPreflight = (promptText, options, attempt) => {
    const attemptProvider = options.provider || resolvedProvider;
    const policy = validateProviderModel(attemptProvider, options.model);
    const report = {
      attempt,
      provider: attemptProvider,
      ...buildBudgetPreflight({
        promptChars: promptText.length,
        maxTokens: options.maxTokens,
        model: policy.model,
        budgetTier: options.budget || null,
        maxCostUsd: options.maxCostUsd,
      }),
    };
    budgetPreflights.push(report);
    const estimate = report.estimated_usd == null ? "unknown" : `$${report.estimated_usd.toFixed(4)}`;
    console.log(`[budget] preflight ${attempt}: estimate=${estimate} cap=$${report.max_cost_usd.toFixed(2)} source=${report.cap_source}`);
    if (!report.pass) {
      throw new PipelineError(
        `LLM cost preflight exceeded cap (${estimate} > $${report.max_cost_usd.toFixed(2)})`,
        5,
        { budget_preflight: report },
      );
    }
    return report;
  };
  // designMd, rawDesignMdForEvidence, llmProvenance, canReuseLlm declared at
  // the mode branch top so scaffold-mode can populate them too.

  // ── LLM reuse check ────────────────────────────────────────────────
  // Skip the LLM call entirely if a previous run produced an identical prompt
  // with the same model. The reused DESIGN.md is copied verbatim.
  canReuseLlm = false;
  const prevModel = readPrevTelemetryModel(previousRun);
  if (
    previousLlmFresh && prevModel &&
    (!manualRecoveryRequested || previousManualRecovery) &&
    fs.existsSync(path.join(previousInputs, "prompt.txt")) &&
    fs.existsSync(path.join(previousRun, "DESIGN.md"))
  ) {
    const sameModel = !model || model === prevModel;
    if (sameModel) {
      const prevPrompt = fs.readFileSync(path.join(previousInputs, "prompt.txt"), "utf8");
      if (promptsEqual(prevPrompt, filled)) {
        fs.copyFileSync(path.join(previousRun, "DESIGN.md"), designMdPath);
        llmResult = { status: 0, stdout: "", stderr: "", usage: null };
        claudeMetadata = {
          input_tokens: null,
          output_tokens: null,
          cache_read_tokens: null,
          cache_creation_tokens: null,
          model: prevModel,
          turns_used: 0,
          error_max_turns: false,
        };
        designMd = fs.readFileSync(designMdPath, "utf8");
        canReuseLlm = true;
        reuseTrace.llm = "HIT";
        if (previousManualRecovery) llmProvenance = "manual_recovery";
        console.log(`     LLM — reused from ${path.basename(previousRun)} (model=${prevModel}, prompt unchanged)`);
      }
    }
  }

  if (manualRecoveryRequested && !canReuseLlm) {
    throw new PipelineError("--manual-recovery requires a reusable previous DESIGN.md already marked manual_recovery; rerun without --manual-recovery for model generation.", 2, {
      previousRun: previousRun ? path.relative(repoRoot, previousRun) : null,
      previousLlmFresh,
      previousManualRecovery,
    });
  }

  if (!canReuseLlm) {
  // Attempt 1
  enforceBudgetPreflight(filled, llmOptions, "attempt1");
  const { result: attempt1, httpRetried: httpRetried1, retryReason: retryReason1 } = await invokeWithHttpRetry(filled, llmOptions, noLlmRetry);
  llmResult = attempt1;
  fs.writeFileSync(path.join(inputsDir, "llm-attempt1.stdout.txt"), llmResult.stdout || "", "utf8");
  fs.writeFileSync(path.join(inputsDir, "llm-attempt1.stderr.txt"), llmResult.stderr || "", "utf8");
  if (httpRetried1) {
    retries = 1;
    retryReasons.push(retryReason1 || "llm_retry");
  }

  if (isHttpProvider(resolvedProvider)) {
    openrouterUsage = llmResult.usage || null;
    claudeMetadata = {
      input_tokens: openrouterUsage?.prompt_tokens ?? null,
      output_tokens: openrouterUsage?.completion_tokens ?? null,
      cache_read_tokens: openrouterUsage?.cache_read_tokens ?? null,
      cache_creation_tokens: openrouterUsage?.cache_creation_tokens ?? null,
      model: null, // HTTP providers return model in json — captured via usage
      turns_used: null,
      error_max_turns: false,
    };
  } else {
    claudeMetadata = parseClaudeCliStdout(llmResult.stdout);

    // Soft failure: claude-cli exits 1 specifically on max-turns. Do NOT throw
    // here — the failSignal check below will route to the retry path with
    // maxTurns 60 + reduced prompt. Hard-fail only on truly unexpected exits.
    if (llmResult.status !== 0 && !claudeMetadata.error_max_turns) {
      throw new Error(`${resolvedProvider} exited with status ${llmResult.status}`);
    }
  }

  // DESIGN.md may not exist yet on max-turns failure — that's expected and the
  // retry path handles it. Only hard-fail if no max-turns soft failure either.
  if (!fs.existsSync(designMdPath)) {
    if (claudeMetadata.error_max_turns) {
      // Synthesize a placeholder so the failSignal check has something to read.
      // The retry will overwrite it.
      fs.writeFileSync(designMdPath, "---\nname: placeholder\n---\n");
    } else if (
      // 1.1 fix: codex-cli + budget=cheap silent failure (empty stdout / extract
      // failed). Promote to budget=standard with a fresh attempt before giving up.
      resolvedProvider === "codex-cli" &&
      args.budget === "cheap" &&
      !noLlmRetry &&
      llmResult &&
      llmResult.designMdWritten === false &&
      llmResult.extractionReason !== "ok"
    ) {
      const stdProfile = budgetProfiles.standard;
      console.log(`     [!] codex-cli/cheap produced no DESIGN.md (reason=${llmResult.extractionReason}). Falling back to budget=standard (model=${stdProfile.model || "default"} maxTurns=${stdProfile.maxTurns}).`);
      retryReasons.push(`codex_cheap_empty:${llmResult.extractionReason}`);
      retries = Math.max(retries, 1);
      const fallbackOptions = {
        ...llmOptions,
        provider: stdProfile.provider,
        model: stdProfile.model ?? null,
        maxTurns: stdProfile.maxTurns,
        budget: "standard",
      };
      enforceBudgetPreflight(filled, fallbackOptions, "codex-cheap-to-standard");
      const { result: fallbackAttempt } = await invokeWithHttpRetry(filled, fallbackOptions, true);
      llmResult = fallbackAttempt;
      fs.writeFileSync(path.join(inputsDir, "llm-attempt-fallback.stdout.txt"), llmResult.stdout || "", "utf8");
      fs.writeFileSync(path.join(inputsDir, "llm-attempt-fallback.stderr.txt"), llmResult.stderr || "", "utf8");
      claudeMetadata = parseClaudeCliStdout(llmResult.stdout);
      if (!fs.existsSync(designMdPath)) {
        console.error(`[!] DESIGN.md not produced after cheap→standard fallback at ${designMdPath}`);
        throw new PipelineError("DESIGN.md not produced after cheap-to-standard fallback", 2, {
          designMdPath,
          provider: resolvedProvider,
        });
      }
    } else {
      console.error(`[!] DESIGN.md not produced at ${designMdPath}`);
      if (llmResult && llmResult.extractionReason && llmResult.extractionReason !== "ok") {
        console.error(`    extraction_reason=${llmResult.extractionReason} provider=${resolvedProvider}`);
        const tail = (llmResult.stdout || "").slice(-200).replace(/\s+/g, " ").trim();
        if (tail) console.error(`    stdout_tail: ${tail}`);
      }
      throw new PipelineError("DESIGN.md not produced", 2, {
        designMdPath,
        provider: resolvedProvider,
        extractionReason: llmResult?.extractionReason || null,
      });
    }
  }

  designMd = fs.readFileSync(designMdPath, "utf8");

  // AC4.1 — provider-agnostic fail signal
  const sectionsCheck = validateDesignMdSections(designMd);
  maxTurnsHit = claudeMetadata.error_max_turns;
  const httpLengthHit = isHttpProvider(resolvedProvider) && llmResult.finishReason === "length";

  const failSignal =
    (resolvedProvider === "claude-cli" && claudeMetadata.error_max_turns) ||
    (isHttpProvider(resolvedProvider) && httpLengthHit) ||
    !sectionsCheck.valid;

  if (failSignal) {
    if (maxTurnsHit) {
      console.log(`     [!] LLM hit max-turns (30). ${noLlmRetry ? "Failing hard (--no-llm-retry)." : "Retrying with max-turns 60…"}`);
      retryReasons.push("error_max_turns");
    }
    if (httpLengthHit) {
      console.log(`     [!] ${resolvedProvider} finish_reason=length. ${noLlmRetry ? "Failing hard (--no-llm-retry)." : `Retrying with max_tokens ${retryMaxTokensCeiling}…`}`);
      retryReasons.push("length");
    }
    if (!sectionsCheck.valid) {
      console.log(`     [!] DESIGN.md missing sections: ${sectionsCheck.missing.join(", ")}. ${noLlmRetry ? "Failing hard (--no-llm-retry)." : "Retrying…"}`);
      retryReasons.push("sections_invalid");
    }

    if (noLlmRetry) {
      console.error(`[!] LLM validation failed. Missing sections: ${sectionsCheck.missing.join(", ")}`);
      console.error(`    Turns used: ${claudeMetadata.turns_used ?? "unknown"}`);
      console.error(`    CI mode (--no-llm-retry active): failing hard without retry.`);
      throw new PipelineError("LLM validation failed", 5, {
        missingSections: sectionsCheck.missing,
        turnsUsed: claudeMetadata.turns_used ?? null,
      });
    }

    // Attempt 2 — AC4.2: reduced prompt for claude-cli, expanded max_tokens for HTTP providers.
    retries = Math.max(retries, 1);
    const retryMaxTokens = isHttpProvider(resolvedProvider) ? Math.max(maxTokens, retryMaxTokensCeiling) : maxTokens;
    const reducedFilled = fillPromptTemplate(promptTemplate, {
      url: args.url,
      inputsDir,
      outDir,
      designMdPath,
      styleFingerprint,
      defaultTheme,
      themeConfidence,
      includeTokens: false,
      includeUsageGraph: false,
      processContract: processContractPrompt,
      processContractPath,
      capturesManifest,
    });

    const retryOptions = {
      ...llmOptions,
      maxTurns: 60,
      maxTokens: retryMaxTokens,
    };

    console.log(`     [retry] invoking LLM with reduced context…`);
    fs.writeFileSync(path.join(inputsDir, "prompt-retry.txt"), reducedFilled);

    enforceBudgetPreflight(reducedFilled, retryOptions, "retry");
    const { result: attempt2 } = await invokeWithHttpRetry(reducedFilled, retryOptions, true);
    llmResult = attempt2;
    fs.writeFileSync(path.join(inputsDir, "llm-attempt2.stdout.txt"), llmResult.stdout || "", "utf8");
    fs.writeFileSync(path.join(inputsDir, "llm-attempt2.stderr.txt"), llmResult.stderr || "", "utf8");

    if (isHttpProvider(resolvedProvider)) {
      openrouterUsage = llmResult.usage || openrouterUsage;
      claudeMetadata = {
        ...claudeMetadata,
        input_tokens: openrouterUsage?.prompt_tokens ?? claudeMetadata.input_tokens,
        output_tokens: openrouterUsage?.completion_tokens ?? claudeMetadata.output_tokens,
      };
    } else {
      claudeMetadata = parseClaudeCliStdout(llmResult.stdout);

      if (llmResult.status !== 0) {
        throw new Error(`${resolvedProvider} retry exited with status ${llmResult.status}`);
      }
    }

    if (!fs.existsSync(designMdPath)) {
      console.error(`[!] DESIGN.md not produced after retry at ${designMdPath}`);
      throw new PipelineError("DESIGN.md not produced after retry", 2, {
        designMdPath,
        provider: resolvedProvider,
      });
    }

    designMd = fs.readFileSync(designMdPath, "utf8");
    const sectionsCheck2 = validateDesignMdSections(designMd);
    const maxTurnsHit2 = claudeMetadata.error_max_turns;
    const httpLengthHit2 = isHttpProvider(resolvedProvider) && llmResult.finishReason === "length";

    if (!sectionsCheck2.valid || maxTurnsHit2 || httpLengthHit2) {
      console.error(`[!] LLM exhausted budget on second attempt. Site may be too large.`);
      console.error(`    Missing sections: ${sectionsCheck2.missing.join(", ")}`);
      console.error(`    Turns used: ${claudeMetadata.turns_used ?? "unknown"}`);
      console.error(`    Suggestions: Try --max-tokens ${retryMaxTokensCeiling} manually, or split the URL into sections.`);
      throw new PipelineError("LLM exhausted budget on second attempt", 5, {
        missingSections: sectionsCheck2.missing,
        turnsUsed: claudeMetadata.turns_used ?? null,
        finishReason: llmResult.finishReason || null,
      });
    }

    console.log(`     [retry] success — all required sections present`);
    maxTurnsHit = false;
  }
  } // close if (!canReuseLlm)

  timer.end("phase_6_llm");
  } // close else { (legacy LLM-from-scratch flow)

  // Defensive normalization
  rawDesignMdForEvidence = designMd;
  const { md: normalized, changes: normChanges } = normalizeDesignMd(designMd);
  if (normChanges.length > 0) {
    fs.writeFileSync(path.join(inputsDir, "DESIGN.md.raw"), designMd);
    fs.writeFileSync(designMdPath, normalized);
    designMd = normalized;
    console.log(`     normalized: ${normChanges.length} change(s) applied (raw saved to inputs/DESIGN.md.raw)`);
    for (const c of normChanges.slice(0, 8)) console.log(`        · ${c}`);
    if (normChanges.length > 8) console.log(`        · …and ${normChanges.length - 8} more`);
  }

  const tokens = parseFrontmatter(designMd);
  if (tokens.__parseError) {
    console.warn(`[!] frontmatter parse degraded: ${tokens.__parseError}. Pipeline continues with empty tokens — quality score will reflect this.`);
  }

  // ── Enrichment (A) ───────────────────────────────────────────────
  // Promote detected data into tokens.components + emit tokens-extended.json.
  // This is purely deterministic — runs after every extraction with $0 LLM cost.
  const { buildEnrichment, applyEnrichmentToTokens } = require("./lib/enrich.cjs");
  const enrichment = buildEnrichment(outDir);
  applyEnrichmentToTokens(
    tokens,
    enrichment.componentsPatch,
    enrichment.motionCanonical,
    enrichment.darkSlots,
    enrichment.primarySwap,
    enrichment.spacingScale,
    enrichment.elevationLadder,
    enrichment.insetShadows,
    enrichment.namedShadows,
  );
  fs.writeFileSync(path.join(outDir, "tokens.json"), JSON.stringify(tokens, null, 2));
  fs.writeFileSync(path.join(outDir, "tokens-extended.json"), JSON.stringify(enrichment.extended, null, 2));
  const { buildRenderContractFromRunDir } = require("./lib/render-contract.cjs");
  const renderContract = buildRenderContractFromRunDir(outDir, { url: args.url });
  fs.writeFileSync(path.join(outDir, "render-contract.json"), JSON.stringify(renderContract, null, 2));
  const enrichSummary = [];
  if (enrichment.componentsPatch) enrichSummary.push(`components=${Object.keys(enrichment.componentsPatch).length}`);
  if (enrichment.extended.shadow) enrichSummary.push(`shadow=${Object.keys(enrichment.extended.shadow).length}`);
  if (enrichment.extended.motion) enrichSummary.push(`motion=${Object.keys(enrichment.extended.motion).filter(k => k.startsWith("duration") || k === "easing").length}`);
  if (enrichment.extended.meta?.style_archetype) enrichSummary.push(`archetype=${enrichment.extended.meta.style_archetype}`);
  if (renderContract.theme?.default_mode) enrichSummary.push(`render=${renderContract.theme.default_mode}${renderContract.theme.supports_dark ? "+toggle" : ""}`);
  if (enrichment.primarySwap?.applied) enrichSummary.push(`primary_swap=${enrichment.primarySwap.resolved}@${enrichment.primarySwap.selector}`);
  if (enrichment.spacingScale?.scale) enrichSummary.push(`spacing=${Object.keys(enrichment.spacingScale.scale).length}`);
  if (enrichment.elevationLadder) enrichSummary.push(`elevation=${Object.keys(enrichment.elevationLadder).length}`);
  if (enrichment.insetShadows) enrichSummary.push(`inset=${Object.keys(enrichment.insetShadows).length}`);
  console.log(`     enriched: ${enrichSummary.join(" · ")}`);

  // Keep preview.html light: record candidate source URLs, do not embed font
  // binaries as base64. The preview references absolute URLs with system
  // fallbacks, while history keeps only this small manifest.
  const requestedFamilies = Object.values(tokens?.typography || {})
    .map(t => String(t.fontFamily || "").split(",")[0].trim().replace(/['"]/g, ""))
    .filter(Boolean);
  const embeddedFonts = {};
  const requestedSet = new Set(requestedFamilies.map((family) => family.toLowerCase()));
  const fontUrlManifest = {
    schema_version: "2.0",
    strategy: "external-font-urls-no-base64",
    embedded_count: 0,
    urls: [],
  };
  for (const face of Array.isArray(fontFaces) ? fontFaces : []) {
    const family = String(face.family || "").trim();
    if (!family || !Array.isArray(face.src_urls)) continue;
    const familyLower = family.toLowerCase().replace(/^"|"$/g, "");
    if (requestedSet.size > 0 && !requestedSet.has(familyLower)) continue;
    for (let i = 0; i < face.src_urls.length; i++) {
      try {
        fontUrlManifest.urls.push({
          family,
          weight: face.weight || "400",
          style: face.style || "normal",
          format: (face.src_formats && face.src_formats[i]) || null,
          url: new URL(face.src_urls[i], face.source_css_url || args.url).toString(),
        });
      } catch {}
    }
  }
  fs.writeFileSync(path.join(inputsDir, "embedded-fonts.json"), JSON.stringify(fontUrlManifest, null, 2));
  console.log(`     font URLs recorded=${fontUrlManifest.urls.length}; embedded=0`);

  // Lint via @google/design.md
  const lintResult = runLint(designMdPath, repoRoot);
  fs.writeFileSync(path.join(outDir, "lint-report.json"), JSON.stringify(lintResult, null, 2));
  console.log(`     lint: ${formatLintSummary(lintResult)}`);

  // ── Phase 7: Extraction log + quality score + drift + agent prompt ─
  timer.start("phase_7_log");
  const extractionLog = buildExtractionLog({
    url: args.url,
    designMd: rawDesignMdForEvidence || designMd,
    tokens,
    cssVars,
    fontFaces,
    usageGraph,
    cssMeta,
    lintResult,
    artifactType: renderContract.extracted_artifact_type,
    pageRole: renderContract.page_role,
  });
  fs.writeFileSync(logWritePath(outDir, "extraction-log.yaml"), YAML.stringify(extractionLog));
  console.log(`     confidence: high=${extractionLog.confidence_summary.high} medium=${extractionLog.confidence_summary.medium} low=${extractionLog.confidence_summary.low}`);

  const qualityScore = computeQualityScore(tokens, extractionLog, lintResult, cssVars, fontFaces);
  fs.writeFileSync(path.join(outDir, "quality-score.json"), JSON.stringify(qualityScore, null, 2));
  console.log(`     quality: ${qualityScore.grade} (${qualityScore.overall}/100) — ${Object.entries(qualityScore.categories).map(([k,v]) => `${k.split("_")[0]}=${v.grade}`).join(" ")}`);

  const agentPrompt = buildAgentPrompt({ url: args.url, designMd, tokens, pageCopy, brandName: tokens?.name });
  fs.writeFileSync(path.join(outDir, "agent-prompt.txt"), agentPrompt);
  console.log(`     agent-prompt: ${(agentPrompt.length / 1024).toFixed(1)}KB`);

  // ── v2.2 canonical-feeder: meta-defaults.json ──────────────────────
  // Aggregator that synthesises meta.json seeds (name, glyph, heroColor,
  // canvasColor, suggestedBlurb, suggestedTags, suggestedCat, archetype)
  // from everything else extracted. Read by the translator (squads/design-ops/
  // scripts/translate/) when assembling apps/design/src/data/designs/{slug}/meta.json.
  // No LLM cost, no extra HTTP — pure aggregation.
  try {
    const metaAssetsForDefaults = JSON.parse(fs.readFileSync(path.join(inputsDir, "meta-assets.json"), "utf8"));
    const heroBlockForDefaults = JSON.parse(fs.readFileSync(path.join(inputsDir, "hero-block.json"), "utf8"));
    const voiceForDefaults = JSON.parse(fs.readFileSync(path.join(inputsDir, "voice-heuristic.json"), "utf8"));
    const styleFingerprintForDefaults = JSON.parse(fs.readFileSync(path.join(outDir, "style-fingerprint.json"), "utf8"));
    const metaDefaults = generateMetaDefaults({
      tokens,
      metaAssets: metaAssetsForDefaults,
      heroBlock: heroBlockForDefaults,
      styleFingerprint: styleFingerprintForDefaults,
      voiceHeuristic: voiceForDefaults,
      url: args.url,
      slug: company,
    });
    fs.writeFileSync(path.join(outDir, "meta-defaults.json"), JSON.stringify(metaDefaults, null, 2));
    console.log(`     meta-defaults: name=${metaDefaults.name || "?"} glyph=${metaDefaults.glyph || "?"} hero=${metaDefaults.heroColor || "?"} archetype=${metaDefaults.archetype || "?"}`);
  } catch (e) {
    console.warn(`     meta-defaults: skipped (${e.message})`);
  }

  let driftReport = null;
  if (args.compare) {
    try {
      const localDesignMdPath = path.resolve(args.compare);
      if (!fs.existsSync(localDesignMdPath)) {
        console.log(`     drift: skipped (compare path not found: ${args.compare})`);
      } else {
        const localDesignMd = fs.readFileSync(localDesignMdPath, "utf8");
        const localTokens = parseFrontmatter(localDesignMd);
        if (localTokens.__parseError) {
          console.log(`     drift: skipped (could not parse YAML frontmatter from ${args.compare}: ${localTokens.__parseError})`);
        } else {
          driftReport = computeDrift(localTokens, tokens);
          driftReport.compared_against = localDesignMdPath;
          driftReport.live_url = args.url;
          fs.writeFileSync(path.join(outDir, "drift-report.json"), JSON.stringify(driftReport, null, 2));
          const s = driftReport.summary;
          console.log(`     drift: ${s.verdict.toUpperCase()} — ${s.total_drifted} drifted, ${s.total_added} added, ${s.total_removed} removed, ${s.total_matched} matched (score ${s.drift_score})`);
        }
      }
    } catch (err) {
      console.log(`     drift: error (${err.message})`);
    }
  }
  timer.end("phase_7_log");

  // ── Phase 8: Render preview.html ──────────────────────────────────
  console.log(`[7/8] rendering preview.html`);
  timer.start("phase_8_preview");
  const previewHtml = renderPreview({
    url: args.url,
    designMd,
    tokens,
    pageCopy,
    cssMeta,
    detected,
    cssVars,
    fontFaces,
    usageGraph,
    extractionLog,
    lintResult,
    favicon,
    qualityScore,
    driftReport,
    breakpoints,
    darkMode,
    logo,
    shadows,
    motion,
    embeddedFonts,
    agentPrompt,
    stack,
    styleFingerprint,
  });
  fs.writeFileSync(path.join(outDir, "preview.html"), previewHtml);
  timer.end("phase_8_preview");

  // ── Phase 8.5 (opt-in): Atomic showcase artifact ─────────────────
  // When --emit-showcase is set, produce a self-contained showcase.html
  // alongside preview.html. It uses Tailwind v4 Browser CDN + literal
  // @theme values + plain-CSS component classes generated from extracted
  // state palettes and component-properties. preview.html remains the
  // stable diagnostic artifact for existing consumers. --emit-tailwind is
  // kept as a deprecated alias by parseArgs.
  if (args["emit-showcase"]) {
    const tokensJsonPath = path.join(outDir, "tokens.json");
    let tokensForBundle = null;
    if (fs.existsSync(tokensJsonPath)) {
      try {
        tokensForBundle = JSON.parse(fs.readFileSync(tokensJsonPath, "utf8"));
      } catch {
        tokensForBundle = null;
      }
    }
    if (tokensForBundle) {
      // Load Wave 2 sidecars from disk so the bundle has them even after a
      // detect-cache HIT (when the in-memory `provenance` / `atomic` /
      // `asymmetryReport` may be undefined in the reuse branch).
      const safeReadJson = (p) => {
        if (!fs.existsSync(p)) return null;
        try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
      };
      const provenance = safeReadJson(path.join(inputsDir, "selector-provenance.json"));
      const asymmetryReportFromDisk = safeReadJson(path.join(inputsDir, "extraction-asymmetries.json"));

      const showcaseHtml = buildShowcaseHtml({
        brand: tokensForBundle.name || companyFromUrl(args.url),
        url: args.url,
        tokens: tokensForBundle,
        provenance,
        componentProperties: componentProps,
        componentStates,
        motion,
        asymmetryReport: asymmetryReportFromDisk,
      });
      fs.writeFileSync(path.join(outDir, "showcase.html"), showcaseHtml);
      console.log(`[7.5/8] showcase.html emitted (${showcaseHtml.length} bytes)`);
    }
  }

  const inputsManifest = writeInputsManifest({
    outDir,
    inputsDir,
    previousInputsDir: previousInputs,
    url: args.url,
    runTs,
    reuseTrace,
  });
  console.log(`     inputs-manifest: files=${inputsManifest.summary.files} reused=${inputsManifest.summary.reused} updated=${inputsManifest.summary.updated} new=${inputsManifest.summary.new}`);

  // ── R3: Telemetry output ──────────────────────────────────────────
  const wallClockMs = Date.now() - wallStart;
  const phaseReport = timer.report();

  // Cost estimation — prefer SDK usage, fallback to char-based
  let costEstimate;
  const httpProviderActive = isHttpProvider(resolvedProvider);
  let llmModel;
  if (isScaffoldMode) {
    llmModel = scaffoldEditTelemetry?.model || "scaffold-deterministic";
  } else if (httpProviderActive && llmResult.usage) {
    llmModel = model || (resolvedProvider === "openrouter" && process.env.OPENROUTER_DEFAULT_MODEL) || "anthropic/claude-haiku-4-5";
  } else {
    llmModel = (claudeMetadata && claudeMetadata.model) || model || (resolvedProvider === "codex-cli" ? (process.env.DESIGN_MD_CODEX_MODEL || "codex-config-default") : "claude-opus-4-7");
  }

  if (isScaffoldMode) {
    costEstimate = {
      usd: scaffoldEditTelemetry?.cost_usd != null ? Math.round(scaffoldEditTelemetry.cost_usd * 10000) / 10000 : 0,
      source: scaffoldEditTelemetry ? "sdk-total" : "scaffold-deterministic",
      model: llmModel,
      breakdown: null,
    };
  } else if (reuseTrace.llm === "HIT" || llmProvenance === "manual_recovery") {
    costEstimate = {
      usd: 0,
      source: llmProvenance === "manual_recovery" ? "manual-recovery" : "llm-cache-hit",
      model: llmModel,
      breakdown: {
        input_usd: 0,
        output_usd: 0,
        cache_read_usd: 0,
        cache_write_usd: 0,
      },
    };
  } else if (httpProviderActive && openrouterUsage) {
    const orUsage = {
      input_tokens: openrouterUsage.prompt_tokens,
      output_tokens: openrouterUsage.completion_tokens,
    };
    costEstimate = estimateCost(orUsage, llmModel);
  } else if (resolvedProvider === "claude-cli" && typeof claudeMetadata.total_cost_usd === "number") {
    costEstimate = {
      usd: Math.round(claudeMetadata.total_cost_usd * 10000) / 10000,
      source: "sdk-total",
      model: llmModel,
      breakdown: null,
    };
  } else if (claudeMetadata.input_tokens != null) {
    costEstimate = estimateCost(claudeMetadata, llmModel);
  } else {
    const promptChars = filled.length;
    const outputChars = designMd.length;
    costEstimate = estimateCostFromChars(promptChars, outputChars, llmModel);
  }

  const reusedFromSlug = previousRun ? path.basename(previousRun) : null;
  const reuseHits = Object.values(reuseTrace).filter((v) => v === "HIT").length;
  const usageMetadata = (() => {
    if (reuseTrace.llm === "HIT") {
      return {
        supported: false,
        source: "llm-cache-hit",
        reason: "DESIGN.md reused from a previous run; no provider usage was incurred.",
      };
    }
    if (llmProvenance === "manual_recovery") {
      return {
        supported: false,
        source: "manual-recovery",
        reason: "Manual recovery reused an existing DESIGN.md; no provider usage was incurred.",
      };
    }
    if (httpProviderActive) {
      return {
        supported: !!openrouterUsage,
        source: openrouterUsage ? "provider-usage" : "provider-usage-missing",
        reason: openrouterUsage ? null : `${resolvedProvider} did not return usage metadata.`,
      };
    }
    if (resolvedProvider === "codex-cli") {
      return {
        supported: false,
        source: "unsupported",
        reason: "codex-cli does not emit token/cost metadata in the current adapter; cost_estimate is char-fallback.",
      };
    }
    if (isScaffoldMode) {
      return {
        supported: scaffoldEditTelemetry?.cost_usd != null,
        source: scaffoldEditTelemetry ? "scaffold-edit-cli" : "scaffold-deterministic",
        reason: scaffoldEditTelemetry ? null : "scaffold-only mode incurs no LLM cost.",
      };
    }
    return {
      supported: claudeMetadata && (claudeMetadata.input_tokens != null || claudeMetadata.output_tokens != null || typeof claudeMetadata.total_cost_usd === "number"),
      source: "cli-result-metadata",
      reason: null,
    };
  })();

  // B6: capture which fetch strategy worked (honest vs browser) so we can
  // query "which sites needed the bot-coherent header fallback?" across runs.
  const fetchStrategy = (responseHeaders && responseHeaders["x-sinkra-fetch-strategy"]) || null;

  let telemetry = {
    schema_version: "1.0",
    run_ts: runTs,
    generated_at: new Date().toISOString(),
    url: args.url,
    provider: llmProvenance === "manual_recovery" ? "manual" : resolvedProvider,
    manual_recovery: llmProvenance === "manual_recovery",
    phases: phaseReport,
    wall_clock_ms: wallClockMs,
    fetch: {
      strategy: fetchStrategy,             // "honest" | "browser" | null (when reused)
      response_server: (responseHeaders && responseHeaders.server) || null,
      response_cdn: (responseHeaders && (responseHeaders["cf-ray"] ? "cloudflare" : (responseHeaders["x-amz-cf-id"] ? "amazon-cloudfront" : null))) || null,
    },
    reuse: {
      enabled: reuseEnabled,
      previous_run: reusedFromSlug,
      hits: reuseHits,
      trace: reuseTrace,
      cache_ttl_hours: parseFloat(cacheTtlHours),
      llm_cache_ttl_hours: parseFloat(llmCacheTtlHours),
    },
    llm: {
      model: llmModel,
      provider: isScaffoldMode ? (scaffoldEditTelemetry ? "claude-cli" : "scaffold") : (llmProvenance === "manual_recovery" ? "manual" : resolvedProvider),
      actual_provider: isScaffoldMode ? (scaffoldEditTelemetry ? "claude-cli" : "scaffold") : resolvedProvider,
      provenance: llmProvenance,
      reused: reuseTrace.llm === "HIT",
      input_tokens: isScaffoldMode
        ? null
        : (httpProviderActive
          ? (openrouterUsage?.prompt_tokens ?? null)
          : (claudeMetadata?.input_tokens ?? null)),
      output_tokens: isScaffoldMode
        ? null
        : (httpProviderActive
          ? (openrouterUsage?.completion_tokens ?? null)
          : (claudeMetadata?.output_tokens ?? null)),
      // cache_*_tokens are only emitted by claude-cli + anthropic-api
      // (Anthropic-native prompt caching). HTTP providers without native
      // caching report null.
      cache_read_tokens: isScaffoldMode ? null : (resolvedProvider === "claude-cli"
        ? (claudeMetadata?.cache_read_tokens ?? null)
        : (resolvedProvider === "anthropic-api" ? (openrouterUsage?.cache_read_tokens ?? null) : null)),
      cache_creation_tokens: isScaffoldMode ? null : (resolvedProvider === "claude-cli"
        ? (claudeMetadata?.cache_creation_tokens ?? null)
        : (resolvedProvider === "anthropic-api" ? (openrouterUsage?.cache_creation_tokens ?? null) : null)),
      turns_used: isScaffoldMode ? (scaffoldEditTelemetry?.num_turns ?? null) : (claudeMetadata?.turns_used ?? null),
      usage_metadata: usageMetadata,
      retries,
      retry_reasons: retryReasons.length > 0 ? retryReasons : undefined,
      max_turns_hit: maxTurnsHit,
      budget_preflight: budgetPreflights,
      cost_estimate: costEstimate,
    },
  };

  fs.writeFileSync(logWritePath(outDir, "telemetry.json"), JSON.stringify(telemetry, null, 2));
  const extractionClass = classifyRunDir(outDir, { slug: company, url: args.url, runTs });
  writeExtractionClass(outDir, extractionClass);
  telemetry = annotateTelemetry(telemetry, extractionClass);
  fs.writeFileSync(logWritePath(outDir, "telemetry.json"), JSON.stringify(telemetry, null, 2));
  console.log(`     extraction-class: ${extractionClass.operational_mode}/${extractionClass.status} coverage_real=${extractionClass.coverage_real}`);
  const noFallbacksReport = validateNoFallbacksForRunDir(outDir, {
    slug: company,
    url: args.url,
    runTs,
    contract: processContract,
  });
  fs.writeFileSync(path.join(outDir, "no-fallbacks-report.json"), JSON.stringify(noFallbacksReport, null, 2));
  const noFallbacksBlocked = !noFallbacksReport.pass;
  console.log(`     ${noFallbacksReport.gate_id}: ${noFallbacksReport.pass ? "pass" : "fail"} failures=${noFallbacksReport.totals.failures} warnings=${noFallbacksReport.totals.warnings}`);

  // ── Promote-or-archive ───────────────────────────────────────────
  // If --out was specified, the user wants raw output exactly there — skip
  // the company-layout promotion step and leave files where they are.
  let finalDir = outDir;
  let promotion = null;
  if (!args.out) {
    promotion = noFallbacksBlocked
      ? archiveScratchWithoutPromotion({
          companyDir,
          scratchDir: outDir,
          scratchTs: runTs,
          reason: "no-fallbacks-gate-failed",
        })
      : promoteOrArchive({ companyDir, scratchDir: outDir, scratchTs: runTs });
    finalDir = promotion.promoted ? companyDir : path.join(companyDir, "history", runTs);
  }

  const finalDesignMd = path.join(finalDir, "DESIGN.md");
  const finalPreview = path.join(finalDir, "preview.html");
  const finalTelemetry = logReadPath(finalDir, "telemetry.json");

  console.log(`[8/8] done`);
  console.log(`     DESIGN.md  → ${finalDesignMd}`);
  console.log(`     preview    → ${finalPreview}`);
  console.log(`     telemetry  → ${finalTelemetry}`);

  const wallSec = (wallClockMs / 1000).toFixed(1);
  const costUsd = (costEstimate.usd ?? 0).toFixed(2);
  const modelShort = llmModel.replace("anthropic/", "").replace("claude-", "").replace(/-\d+$/, "");
  console.log(`[telemetry] wall=${wallSec}s · provider=${resolvedProvider} · llm=${modelShort} · ~$${costUsd} · ${retries} retries`);
  if (reuseHits > 0) {
    const trace = `fetch=${reuseTrace.fetch} collect=${reuseTrace.collect} detect=${reuseTrace.detect} markdown=${reuseTrace.markdown} llm=${reuseTrace.llm}`;
    console.log(`[reuse] ${reuseHits}/5 phases reused from ${reusedFromSlug} — ${trace}`);
  }
  if (promotion) {
    if (promotion.promoted) {
      const archived = promotion.archivedAs ? ` (previous best archived as history/${promotion.archivedAs})` : "";
      console.log(`[layout] promoted to ${company}/  score=${promotion.newScore.value.toFixed(1)}${archived}`);
    } else if (promotion.blocked) {
      const previous = promotion.prevScore ? `; previous score=${promotion.prevScore.value.toFixed(1)}` : "; no previous root";
      console.log(`[layout] promotion blocked: ${promotion.reason}; archived to ${company}/history/${runTs}${previous}`);
    } else {
      console.log(`[layout] archived to ${company}/history/${runTs}  (score ${promotion.newScore.value.toFixed(1)} < previous ${promotion.prevScore.value.toFixed(1)})`);
    }
  }

  if (learningEnabled(args)) {
    try {
      const learningPayload = buildExtractUrlLearningLog({
        repoRoot,
        runTs,
        url: args.url,
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
        outcome: "completed",
      });
      const learningResult = writeExtractUrlLearningLog({ repoRoot, payload: learningPayload });
      console.log(`[learning] execution log → ${learningResult.learningLog}`);
    } catch (e) {
      console.warn(`[learning] skipped: ${e.message}`);
    }
  }

  // ── Phase 9: design.md scaffold (opt-in via --scaffold) ──────────────
  // Extract → enrich → scaffold in one command. Refuse-overwrite is the
  // default. The default output stays under outputs/ so the process never
  // writes into apps/design unless the operator explicitly passes
  // --scaffold-out apps/design/...
  if (args.scaffold) {
    try {
      const { buildDesignMdScaffold } = require("./lib/design-md-builder.cjs");
      const tryRead = (p) => {
        try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null; }
        catch { return null; }
      };
      const scaffoldOut = args["scaffold-out"]
        || path.join(repoRoot, "outputs", "design-extractor", "scaffolds", company, "DESIGN.md");
      if (fs.existsSync(scaffoldOut) && !args["scaffold-force"]) {
        console.log(`[scaffold] refused: ${path.relative(repoRoot, scaffoldOut)} exists (use --scaffold-force)`);
      } else {
        const sidecars = {
          tokens,
          metaAssets: tryRead(path.join(inputsDir, "meta-assets.json")),
          metaDefaults: tryRead(path.join(outDir, "meta-defaults.json")),
          heroBlock: tryRead(path.join(inputsDir, "hero-block.json")),
          heroVariant: tryRead(path.join(inputsDir, "hero-variant.json")),
          ctaVariants: tryRead(path.join(inputsDir, "cta-variants.json")),
          voiceHeuristic: tryRead(path.join(inputsDir, "voice-heuristic.json")),
          styleFingerprint: tryRead(path.join(outDir, "style-fingerprint.json")),
          componentProperties: tryRead(path.join(inputsDir, "component-properties.json")),
          shadows: tryRead(path.join(inputsDir, "shadows.json")),
          motion: tryRead(path.join(inputsDir, "motion.json")),
          fontFaces: tryRead(path.join(inputsDir, "font-faces.json")),
          darkMode: tryRead(path.join(inputsDir, "dark-mode.json")),
          themeDefault: tryRead(path.join(inputsDir, "theme-default.json")),
          cssVars: tryRead(path.join(inputsDir, "css-vars-detected.json")),
          logo: tryRead(path.join(inputsDir, "logo.json")),
          favicon: tryRead(path.join(inputsDir, "favicon.json")),
          slug: company,
        };
        const scaffold = buildDesignMdScaffold(sidecars);
        fs.mkdirSync(path.dirname(scaffoldOut), { recursive: true });
        fs.writeFileSync(scaffoldOut, scaffold, "utf8");
        const gaps = (scaffold.match(/extraction_gap\(/g) || []).length;
        console.log(`[scaffold] wrote ${path.relative(repoRoot, scaffoldOut)} (${gaps} extraction gaps)`);
      }
    } catch (e) {
      console.error(`[scaffold] failed: ${e.message}`);
    }
  }

  // ── Phase 9.5: materialize design-gallery bundle ─────────────────────
  // Gallery/app writes are opt-in. A normal extraction must only update the
  // canonical outputs/ tree; apps/design is a consumer and should not be mutated
  // unless the operator asks for gallery materialization.
  // Failures are non-fatal: extract is the canonical artifact, the bundle is
  // a derived view that can always be regenerated.
  const galleryDir = path.join(repoRoot, "apps", "design", "src", "data", "designs");
  const promoted = !!(promotion && promotion.promoted);
  const bundleForced = !!args["bundle-force"];
  const appsWriteEnabled = !!args.gallery || bundleForced || process.env.DESIGN_MD_WRITE_APPS === "1";
  // B5: bundle materializes when run is promoted OR when --bundle-force is
  // passed (override for "I want to see this in apps/design even though score
  // regressed"). Always silenced if --no-bundle, env-skip, or app absent.
  const bundleEnabled = appsWriteEnabled
    && !args["no-bundle"]
    && process.env.DESIGN_MD_SKIP_BUNDLE !== "1"
    && fs.existsSync(galleryDir)
    && (promoted || bundleForced);
  if (bundleEnabled) {
    try {
      // Hub-only opt-in gallery feature: this require is reached ONLY when
      // fs.existsSync(galleryDir) (apps/design/...) is true AND inside this try/catch — a
      // no-op in a generic standalone where apps/design is absent. Safe to ship. export-ignore
      const { materialize } = require("../../../design-ops/scripts/materialize-design-gallery-bundle.cjs");
      // When forcing without promotion, the scratch dir was already moved to
      // history/{runTs}/ by promoteOrArchive — use finalDir which always points
      // to where the artifacts actually live (companyDir/ when promoted,
      // companyDir/history/{runTs}/ when archived).
      const bundleSourceDir = (bundleForced && !promoted) ? finalDir : undefined;
      const result = materialize({ slug: company, force: true, from: bundleSourceDir });
      const filesWritten = (result.files || []).length;
      const tag = (bundleForced && !promoted) ? " [forced from archived run]" : "";
      console.log(`[bundle] materialized apps/design/src/data/designs/${company}/${tag}  files=${filesWritten}  archetype=${result.archetype || "?"}`);
    } catch (e) {
      console.warn(`[bundle] skipped: ${e.message}`);
    }
  } else if (appsWriteEnabled && !args["no-bundle"] && process.env.DESIGN_MD_SKIP_BUNDLE !== "1" && fs.existsSync(galleryDir) && !promoted) {
    console.log("[bundle] skipped: run was not promoted (lower score than previous best). Re-run with --bundle-force to materialize anyway.");
  }

  // Phase 10 (silent) — refresh apps/design public data if the consumer app is
  // present in the repo. Fire-and-forget: a missing app or a non-zero exit
  // does NOT fail the extract — extract is the canonical artifact, gallery
  // is a derived view. Skip via --no-bundle or DESIGN_MD_SKIP_GALLERY=1.
  if (appsWriteEnabled && !args["no-bundle"] && process.env.DESIGN_MD_SKIP_GALLERY !== "1") {
    try {
      const { spawnSync } = require("child_process");
      const galleryScript = path.join(repoRoot, "apps", "design", "scripts", "build-public-data.mjs");
      if (fs.existsSync(galleryScript)) {
        const r = spawnSync("node", [galleryScript], { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 30000 });
        if (r.status === 0) {
          const tail = (r.stdout || "").trim().split("\n").slice(-1)[0];
          if (tail) console.log(`[gallery] ${tail}`);
        }
      }
      const legacyGalleryScript = path.join(repoRoot, "apps", "aiox-squad-design", "scripts", "build-ds-gallery-index.cjs");
      if (process.env.DESIGN_MD_LEGACY_GALLERY === "1" && fs.existsSync(legacyGalleryScript)) {
        spawnSync("node", [legacyGalleryScript], { cwd: repoRoot, stdio: "ignore", timeout: 30000 });
      }
    } catch { /* fire-and-forget */ }
  }

  // ── Phase 11: Cleanup orphan scratch dirs (C2) ───────────────────────
  // Move .run-* dirs older than 7 days into history/_incomplete/. These are
  // failed runs (crashed before promote/archive) cluttering the company root.
  // Fire-and-forget: cleanup failure should never abort a successful extract.
  if (process.env.DESIGN_MD_SKIP_CLEANUP !== "1") {
    try {
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      const incompleteDir = path.join(companyDir, "history", "_incomplete");
      if (fs.existsSync(companyDir)) {
        for (const item of fs.readdirSync(companyDir)) {
          if (!item.startsWith(".run-")) continue;
          const itemPath = path.join(companyDir, item);
          let stat;
          try { stat = fs.statSync(itemPath); } catch { continue; }
          if (!stat.isDirectory()) continue;
          if (Date.now() - stat.mtimeMs < SEVEN_DAYS_MS) continue;
          fs.mkdirSync(incompleteDir, { recursive: true });
          const target = path.join(incompleteDir, item);
          try {
            fs.renameSync(itemPath, target);
            console.log(`[cleanup] moved orphan ${item} → history/_incomplete/`);
          } catch { /* skip */ }
        }
      }
    } catch { /* fire-and-forget */ }
  }
}

// Re-exports for external consumers (web playground, tests, governance scripts)
module.exports = {
  // High-level
  main,
  isLlmTransientError,
  fillPromptTemplate,
  recoverFromDesignMdOnDisk,
  // Utils
  ...require("./lib/utils.cjs"),
  // Fetchers
  ...require("./lib/fetch.cjs"),
  // Extractors
  ...require("./lib/extractors.cjs"),
  // LLM
  ...require("./lib/llm.cjs"),
  // DESIGN.md pipeline
  ...require("./lib/design-md.cjs"),
  // Process contract
  ...require("./lib/process-contract.cjs"),
  // Tokens prep for render
  ...require("./lib/tokens.cjs"),
  // Preview
  renderPreview: require("./lib/preview.cjs").renderPreview,
  // Render contract
  ...require("./lib/render-contract.cjs"),
  // Telemetry
  ...require("./lib/telemetry.cjs"),
};

// ── Crash context handler — saves debugging info on any failure ──────
// Without this, a crash post-Phase-2 leaves inputs/ populated but no
// top-level explanation. 4/25 historical runs had this exact symptom.
function saveCrashContext(err, ctx) {
  const crashFile = ctx.outDir
    ? path.join(ctx.outDir, "crash-context.json")
    : path.join(process.cwd(), `crash-context-${Date.now()}.json`);
  const payload = {
    schema_version: "1.0",
    crashed_at: new Date().toISOString(),
    last_phase: ctx.lastPhase || "unknown",
    completed_phases: ctx.completedPhases || {},
    error: {
      message: err.message,
      name: err.name,
      stack: err.stack ? err.stack.split("\n").slice(0, 10).join("\n") : null,
      code: err.code || null,
      exit_code: err.exitCode || null,
      details: err.details || null,
    },
    inputs: {
      url: ctx.url || null,
      out_dir: ctx.outDir || null,
      inputs_dir: ctx.inputsDir || null,
    },
    partial_outputs: ctx.outDir
      ? (() => { try { return require("fs").readdirSync(ctx.outDir); } catch { return []; } })()
      : [],
    debug_hint: getDebugHint(err, ctx.lastPhase),
  };
  try {
    require("fs").mkdirSync(path.dirname(crashFile), { recursive: true });
    require("fs").writeFileSync(crashFile, JSON.stringify(payload, null, 2));
    console.error(`[crash-context] saved to ${crashFile}`);
    return { crashFile, payload };
  } catch (writeErr) {
    console.error(`[crash-context] could not save (${writeErr.message}) — payload:`);
    console.error(JSON.stringify(payload, null, 2));
    return { crashFile, payload, error: writeErr.message };
  }
}

function getDebugHint(err, lastPhase) {
  if (err.message?.includes("ECONNREFUSED") || err.message?.includes("ENOTFOUND")) {
    return "Network error reaching the URL. Check connectivity / DNS.";
  }
  if (err.message?.includes("max-turns") || err.message?.includes("budget")) {
    return "LLM hit max-turns budget. Increase --max-tokens or use --no-llm-retry to fail fast.";
  }
  if (err.code === "ENOENT" && err.message?.includes("prompt")) {
    return "Prompt template missing. Verify --prompt path or that data/url-extract-prompt.txt exists.";
  }
  if (lastPhase === "phase_6_llm") {
    return "LLM phase failed. Check ~/.claude/logs/ or claude-cli output. Often retryable.";
  }
  if (lastPhase === "phase_2_collect") {
    return "CSS collection failed. Site may block scrapers (403/cloudflare) or have huge CSS.";
  }
  if (lastPhase === "phase_1_fetch") {
    return "Initial HTTP fetch failed. Check URL accessibility and rate limits.";
  }
  return "Inspect inputs/ directory for partial state. Re-run with --no-llm-retry to fail fast.";
}

// Exposed for test consumers
module.exports.saveCrashContext = saveCrashContext;
module.exports.getDebugHint = getDebugHint;

if (require.main === module) {
  // Module-scoped crash context — main() populates it via process.__extractCrashCtx
  // so the catch handler always has access to last phase + outDir even on early failure.
  process.__extractCrashCtx = { timer: null, outDir: null, inputsDir: null, url: null };

  main().catch((err) => {
    console.error("[fatal]", err.message);
    if (err.stack) console.error(err.stack);
    const ctx = process.__extractCrashCtx || {};
    const lastPhase = ctx.timer?.currentPhase?.() || null;
    const completedPhases = ctx.timer?.report?.() || {};
    saveCrashContext(err, {
      url: ctx.url,
      outDir: ctx.outDir,
      inputsDir: ctx.inputsDir,
      lastPhase,
      completedPhases,
    });
    try {
      const parsedArgs = parseArgs(process.argv);
      if (ctx.url && ctx.outDir && learningEnabled(parsedArgs)) {
        const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
        const payload = buildFailureLearningLog({
          repoRoot,
          url: ctx.url,
          outDir: ctx.outDir,
          inputsDir: ctx.inputsDir,
          error: err,
          lastPhase,
          completedPhases,
        });
        const learningResult = writeExtractUrlLearningLog({ repoRoot, payload });
        console.error(`[learning] failure log → ${learningResult.learningLog}`);
      }
    } catch (learningErr) {
      console.error(`[learning] failure log skipped: ${learningErr.message}`);
    }
    // PipelineError carries explicit exit code; generic errors → exit 1
    process.exit(err.exitCode || 1);
  });
}
