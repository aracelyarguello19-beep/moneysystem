"use strict";

const fs = require("fs");

// Default model — override via ANTHROPIC_DEFAULT_MODEL env or --model flag.
const ANTHROPIC_DEFAULT_MODEL = process.env.ANTHROPIC_DEFAULT_MODEL || "claude-sonnet-4-6";
const ANTHROPIC_ENDPOINT = process.env.ANTHROPIC_ENDPOINT || "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 32768;

// ── Extract DESIGN.md from raw LLM response ──────────────────────────
function extractDesignMd(rawContent) {
  if (!rawContent) return "";
  const fmStart = rawContent.search(/^---\s*$/m);
  if (fmStart !== -1) return rawContent.slice(fmStart);
  return rawContent;
}

// ── Invoke Anthropic Messages API directly ──────────────────────────
// Native endpoint — no Claude CLI required. Lowest latency for Claude family.
// Useful when the skill runs from Codex / Manus / CI without `claude` on PATH.
async function invoke(promptText, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[!] Anthropic API selected but ANTHROPIC_API_KEY not set.");
    process.exit(6);
  }

  const model = options.model || ANTHROPIC_DEFAULT_MODEL;
  const envMaxTokens = parseInt(process.env.DESIGN_MD_MAX_TOKENS || "", 10);
  const maxTokens = options.maxTokens || (Number.isFinite(envMaxTokens) && envMaxTokens > 0 ? envMaxTokens : DEFAULT_MAX_TOKENS);

  console.log(`[anthropic-api] calling ${model} (max_tokens=${maxTokens})…`);

  const body = JSON.stringify({
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: promptText }],
  });

  let response;
  try {
    response = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body,
    });
  } catch (err) {
    return {
      status: 1,
      stdout: "",
      stderr: `[anthropic-api] network error: ${err.message}`,
      httpStatus: null,
      finishReason: null,
      usage: null,
    };
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    const trimmed = bodyText.slice(0, 500);
    return {
      status: 1,
      stdout: "",
      stderr: `[anthropic-api] HTTP ${response.status}: ${trimmed}`,
      httpStatus: response.status,
      finishReason: null,
      usage: null,
    };
  }

  let json;
  try {
    json = await response.json();
  } catch (err) {
    return {
      status: 1,
      stdout: "",
      stderr: `[anthropic-api] failed to parse JSON response: ${err.message}`,
      httpStatus: response.status,
      finishReason: null,
      usage: null,
    };
  }

  // Anthropic Messages API: content is an array of content blocks.
  // For a text-only response we concatenate the `text` fields.
  const blocks = Array.isArray(json.content) ? json.content : [];
  const rawContent = blocks
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
  const stopReason = json.stop_reason || null;
  // Normalize Anthropic's stop_reason vocabulary to OpenAI-style finish_reason
  // so retry logic in run.cjs (which checks for "length") works uniformly.
  const finishReason =
    stopReason === "max_tokens" ? "length" :
    stopReason === "end_turn"   ? "stop"   :
    stopReason;

  // Anthropic usage: input_tokens / output_tokens.
  // Normalize to OpenAI-style {prompt_tokens, completion_tokens, total_tokens}
  // so downstream telemetry treats all providers the same.
  const usage = json.usage
    ? {
        prompt_tokens: json.usage.input_tokens ?? null,
        completion_tokens: json.usage.output_tokens ?? null,
        total_tokens:
          (json.usage.input_tokens ?? 0) + (json.usage.output_tokens ?? 0),
        cache_read_tokens: json.usage.cache_read_input_tokens ?? null,
        cache_creation_tokens: json.usage.cache_creation_input_tokens ?? null,
      }
    : null;

  const content = extractDesignMd(rawContent);

  if (options.designMdPath && content) {
    fs.writeFileSync(options.designMdPath, content, "utf8");
  }

  return {
    status: 0,
    stdout: content,
    stderr: "",
    httpStatus: response.status,
    finishReason,
    usage,
  };
}

module.exports = { invoke, extractDesignMd, ANTHROPIC_DEFAULT_MODEL };
