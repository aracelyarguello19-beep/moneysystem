"use strict";

const { spawnSync } = require("child_process");
const claudeCli = require("./providers/claude-cli.cjs");
const codexCli = require("./providers/codex-cli.cjs");
const openrouter = require("./providers/openrouter.cjs");
const openai = require("./providers/openai.cjs");
const anthropicApi = require("./providers/anthropic-api.cjs");
const genericHttp = require("./providers/generic-http.cjs");

// ── Per-provider model defaults ─────────────────────────────────────
// Universal mode (2026-05-03): allow-lists removed. Cost discipline is now
// the operator's responsibility via --model and budget telemetry, not via
// hard-coded regex denial. The previous Haiku-only restriction on OpenRouter
// was a vestige of a single-tenant policy and blocked legitimate cross-model
// comparisons (gpt-5, gemini, llama, etc.).
const PROVIDER_DEFAULTS = {
  "claude-cli":     { default_model: "claude-opus-4-7" },
  "codex-cli":      { default_model: process.env.DESIGN_MD_CODEX_MODEL || null },
  "openrouter":     { default_model: "anthropic/claude-haiku-4-5" },
  "openai":         { default_model: process.env.OPENAI_DEFAULT_MODEL || "gpt-5-mini" },
  "anthropic-api":  { default_model: process.env.ANTHROPIC_DEFAULT_MODEL || "claude-sonnet-4-6" },
  "generic-http":   { default_model: process.env.GENERIC_HTTP_DEFAULT_MODEL || "auto" },
};

// ── Detect "claude" binary on PATH ──────────────────────────────────
// Avoid auto-selecting claude-cli when the binary isn't installed (e.g. when
// the skill is invoked from Codex / Manus / a CI runner without Claude Code).
let _claudeBinaryCache = null;
function claudeBinaryAvailable() {
  if (_claudeBinaryCache !== null) return _claudeBinaryCache;
  try {
    const probe = spawnSync("claude", ["--version"], { encoding: "utf8", timeout: 3000 });
    _claudeBinaryCache = probe.status === 0;
  } catch {
    _claudeBinaryCache = false;
  }
  return _claudeBinaryCache;
}

// ── Provider auto-detection (universal) ─────────────────────────────
// Priority order:
//   1. Explicit --provider flag (highest)
//   2. Vercel deploy → openrouter (CI default)
//   3. Available API keys, in this preference order:
//      OPENROUTER_API_KEY  → openrouter (most universal — any model)
//      ANTHROPIC_API_KEY   → anthropic-api (native, lowest latency for Claude)
//      OPENAI_API_KEY      → openai (native, lowest latency for GPT)
//      GENERIC_HTTP_ENDPOINT + GENERIC_HTTP_API_KEY → generic-http
//   4. claude-cli, but ONLY if the `claude` binary is on PATH
//   5. Hard fail with actionable error message
function detectProvider(options) {
  if (options && options.provider) return options.provider;
  if (process.env.VERCEL === "1" && process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic-api";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GENERIC_HTTP_ENDPOINT && process.env.GENERIC_HTTP_API_KEY) return "generic-http";
  if (claudeBinaryAvailable() && !claudeCli.isNestedClaudeCodeSession()) return "claude-cli";
  throw new Error(
    "No LLM provider available. Set one of:\n" +
    "  OPENROUTER_API_KEY  (recommended — universal, any model: gpt-5, gemini, llama, claude…)\n" +
    "  ANTHROPIC_API_KEY   (native Anthropic API, no CLI required)\n" +
    "  OPENAI_API_KEY      (native OpenAI API, gpt-5/gpt-5-mini/o-series)\n" +
    "  GENERIC_HTTP_ENDPOINT + GENERIC_HTTP_API_KEY  (Together, Groq, Mistral, Manus, any OpenAI-compatible API)\n" +
    "Or install the Claude Code CLI and ensure `claude` is on PATH.\n" +
    "Note: claude-cli auto-detection is disabled inside active Claude Code sessions; use --provider codex-cli or an API provider."
  );
}

// ── Provider+Model policy gate ──────────────────────────────────────
// Allow-lists removed (universal mode). Kept for parity with previous API:
// returns the resolved model + source ("explicit" or "provider-default").
function validateProviderModel(provider, requestedModel) {
  const policy = PROVIDER_DEFAULTS[provider];
  if (!policy) {
    throw new Error(`Unknown provider: ${provider}. Supported: ${Object.keys(PROVIDER_DEFAULTS).join(", ")}.`);
  }
  if (!requestedModel) {
    return { ok: true, model: policy.default_model, source: "provider-default" };
  }
  return { ok: true, model: requestedModel, source: "explicit" };
}

// ── Main dispatcher ─────────────────────────────────────────────────
// options: { provider?, model?, maxTurns?, maxTokens?, cwd?, designMdPath? }
// Returns: { status, stdout, stderr, usage?, finishReason?, httpStatus? }
async function invokeLlm(promptText, options = {}) {
  const provider = detectProvider(options);
  const isOverride = options && options.provider;

  const policyResult = validateProviderModel(provider, options.model);
  const effectiveOptions = { ...options, model: policyResult.model };

  console.log(`[llm] provider=${provider} (${isOverride ? "--provider override" : "auto-detected"}) · model=${policyResult.model} (${policyResult.source})`);

  switch (provider) {
    case "openrouter":
      if (!process.env.OPENROUTER_API_KEY) {
        console.error("[!] OpenRouter selected but OPENROUTER_API_KEY not set.");
        process.exit(6);
      }
      return openrouter.invoke(promptText, effectiveOptions);

    case "openai":
      if (!process.env.OPENAI_API_KEY) {
        console.error("[!] OpenAI selected but OPENAI_API_KEY not set.");
        process.exit(6);
      }
      return openai.invoke(promptText, effectiveOptions);

    case "anthropic-api":
      if (!process.env.ANTHROPIC_API_KEY) {
        console.error("[!] Anthropic API selected but ANTHROPIC_API_KEY not set.");
        process.exit(6);
      }
      return anthropicApi.invoke(promptText, effectiveOptions);

    case "generic-http":
      if (!process.env.GENERIC_HTTP_ENDPOINT || !process.env.GENERIC_HTTP_API_KEY) {
        console.error("[!] Generic HTTP selected but GENERIC_HTTP_ENDPOINT or GENERIC_HTTP_API_KEY not set.");
        process.exit(6);
      }
      return genericHttp.invoke(promptText, effectiveOptions);

    case "codex-cli":
      return codexCli.invoke(promptText, effectiveOptions);

    case "claude-cli":
    default:
      return claudeCli.invoke(promptText, effectiveOptions);
  }
}

// ── Legacy invokeClaude shim — preserved for test compatibility ──────
function invokeClaude(promptText, cwd, { maxTurns = 30 } = {}) {
  const result = claudeCli.invoke(promptText, { maxTurns, cwd });
  return result;
}

// ── Agent prompt builder ─────────────────────────────────────────────
function buildAgentPrompt({ url, designMd, tokens, pageCopy, brandName }) {
  void designMd;
  const colors = (tokens && tokens.colors) || {};
  const typo = (tokens && tokens.typography) || {};
  const rounded = (tokens && tokens.rounded) || {};
  const previewTokens = (tokens && tokens.preview_tokens) || {};

  const primary = previewTokens.button_primary_bg || colors.primary || colors.brand || "#000000";
  const primaryText = previewTokens.button_primary_text || colors.surface || "#ffffff";
  const surface = previewTokens.surface_bg || colors.surface || colors.background || "#ffffff";
  const cardBg = previewTokens.card_bg || colors.card || surface;
  const text = previewTokens.text || colors.text || "#111111";
  const textMuted = previewTokens.text_muted || colors["text-muted"] || colors["text-secondary"] || "#666666";
  const border = previewTokens.border || colors.border || "#e5e5e5";
  const accent = previewTokens.accent || colors.accent || primary;
  const buttonRadius = previewTokens.button_radius || rounded.md || rounded.main || "8px";
  const cardRadius = previewTokens.card_radius || rounded.lg || rounded.large || "16px";
  const inputRadius = previewTokens.input_radius || rounded.sm || buttonRadius;
  const secondaryBg = previewTokens.button_secondary_bg || colors.secondary || "transparent";
  const secondaryText = previewTokens.button_secondary_text || text;
  const secondaryBorder = previewTokens.button_secondary_border || border;
  const tertiaryText = previewTokens.button_tertiary_text || accent;

  const firstFam = (s) => String(s || "").split(",")[0].trim().replace(/['"]/g, "");
  const headingFont = firstFam(typo.h1?.fontFamily || typo.display?.fontFamily) || "system-ui";
  const bodyFont = firstFam(typo["body-md"]?.fontFamily || typo.body?.fontFamily) || "system-ui";
  const monoFont = firstFam(typo.mono?.fontFamily) || "ui-monospace";

  const heading = pageCopy?.heading || `${brandName || "Brand"} component`;
  const safeBrand = brandName || (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "the brand"; } })();

  return `# Component generation brief — on-brand for ${safeBrand}

You are a senior frontend engineer building a React component for ${safeBrand}.
Your task: generate clean, accessible TSX (React + Tailwind CSS, shadcn/ui patterns)
that respects the design system below.

## Hard token rules (DO NOT deviate)

- Primary CTA fill:        ${primary}
- Primary CTA text:        ${primaryText}
- Page surface:            ${surface}
- Card / elevated surface: ${cardBg}
- Body text:               ${text}
- Muted text:              ${textMuted}
- Hairline border:         ${border}
- Brand accent:            ${accent}
- Button border-radius:    ${buttonRadius}
- Card border-radius:      ${cardRadius}
- Input border-radius:     ${inputRadius}

## Typography

- Headings (h1-h3): "${headingFont}", weight ${typo.h1?.fontWeight || 700}, letter-spacing ${typo.h1?.letterSpacing || "normal"}
- Body:             "${bodyFont}", weight ${typo["body-md"]?.fontWeight || 400}, line-height ${typo["body-md"]?.lineHeight || 1.5}
- Mono / labels:    "${monoFont}"

## Component rules

- Primary buttons use ${primary} background, ${primaryText} text, ${buttonRadius} radius.
- Secondary buttons use ${secondaryBg} background, ${secondaryText} text, ${secondaryBorder} border.
- Tertiary/link actions use ${tertiaryText} text with no filled surface.
- Cards use ${cardBg} background, ${border} border, ${cardRadius} radius.
- Inputs use ${surface} background, ${border} border, ${inputRadius} radius.
- Use ${textMuted} only for helper text, metadata, placeholders, and secondary labels.

## Voice / sample copy

Heading sample: "${heading.slice(0, 80)}"
${pageCopy?.body ? `Body sample: "${pageCopy.body.slice(0, 140)}"` : ""}

## What to build

[REPLACE THIS LINE WITH YOUR REQUEST — e.g. "a pricing card with three tiers" or "a hero section with primary CTA and secondary outline button"]

## Constraints

- Use ONLY the hex values listed above. Do not invent new colors.
- Use the listed font families. If they are not loaded, fall back to system-ui.
- Apply the listed border-radius values verbatim — buttons get \`button_radius\`, cards get \`card_radius\`.
- Component must be accessible (semantic HTML, focusable, contrast-compliant).
- Output a single TSX file. Tailwind utility classes preferred over inline styles.
- No external dependencies beyond shadcn/ui, the registered icon library (default lucide-react; per archetype.brand_driven.icons), and clsx.

---

Generate the component now.`;
}

module.exports = {
  invokeLlm,
  invokeClaude,
  buildAgentPrompt,
  detectProvider,
  validateProviderModel,
  claudeBinaryAvailable,
  PROVIDER_DEFAULTS,
};
