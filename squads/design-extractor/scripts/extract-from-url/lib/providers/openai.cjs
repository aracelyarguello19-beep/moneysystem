"use strict";

const fs = require("fs");

// Default model — override via OPENAI_DEFAULT_MODEL env or --model flag.
// gpt-5-mini is the cost-efficient default; gpt-5 / o-series for higher quality.
const OPENAI_DEFAULT_MODEL = process.env.OPENAI_DEFAULT_MODEL || "gpt-5-mini";
const OPENAI_ENDPOINT = process.env.OPENAI_ENDPOINT || "https://api.openai.com/v1/chat/completions";
const DEFAULT_MAX_TOKENS = 32768;

// ── Extract DESIGN.md from raw LLM response ──────────────────────────
// Some models prepend explanatory prose before the YAML frontmatter; strip it.
function extractDesignMd(rawContent) {
  if (!rawContent) return "";
  const fmStart = rawContent.search(/^---\s*$/m);
  if (fmStart !== -1) return rawContent.slice(fmStart);
  return rawContent;
}

// ── Invoke OpenAI Chat Completions API ──────────────────────────────
// Native endpoint, no proxy — lowest latency for GPT family.
async function invoke(promptText, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[!] OpenAI selected but OPENAI_API_KEY not set.");
    process.exit(6);
  }

  const model = options.model || OPENAI_DEFAULT_MODEL;
  const envMaxTokens = parseInt(process.env.DESIGN_MD_MAX_TOKENS || "", 10);
  const maxTokens = options.maxTokens || (Number.isFinite(envMaxTokens) && envMaxTokens > 0 ? envMaxTokens : DEFAULT_MAX_TOKENS);

  console.log(`[openai] calling ${model} (max_tokens=${maxTokens})…`);

  const body = JSON.stringify({
    model,
    messages: [{ role: "user", content: promptText }],
    max_tokens: maxTokens,
  });

  let response;
  try {
    response = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body,
    });
  } catch (err) {
    return {
      status: 1,
      stdout: "",
      stderr: `[openai] network error: ${err.message}`,
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
      stderr: `[openai] HTTP ${response.status}: ${trimmed}`,
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
      stderr: `[openai] failed to parse JSON response: ${err.message}`,
      httpStatus: response.status,
      finishReason: null,
      usage: null,
    };
  }

  const choice = json.choices && json.choices[0];
  const rawContent = choice?.message?.content || "";
  const finishReason = choice?.finish_reason || null;
  const usage = json.usage || null;

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

module.exports = { invoke, extractDesignMd, OPENAI_DEFAULT_MODEL };
