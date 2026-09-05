"use strict";

const fs = require("fs");
const DEFAULT_MAX_TOKENS = 32768;

// Generic OpenAI-compatible HTTP provider.
// Covers Together, Groq, Mistral, Manus, Fireworks, Anyscale, and any
// self-hosted vLLM / Ollama endpoint speaking the OpenAI Chat Completions
// schema.
//
// Configure via env:
//   GENERIC_HTTP_ENDPOINT          required — full URL to /v1/chat/completions
//   GENERIC_HTTP_API_KEY           required — bearer token
//   GENERIC_HTTP_DEFAULT_MODEL     default model id (override via --model)
//   GENERIC_HTTP_HEADERS           optional JSON of extra headers
//                                  (e.g. '{"X-Custom":"value"}')
//   GENERIC_HTTP_AUTH_HEADER       optional override for the auth header
//                                  name (default: "Authorization")
//   GENERIC_HTTP_AUTH_PREFIX       optional override for the auth prefix
//                                  (default: "Bearer ")

const GENERIC_HTTP_DEFAULT_MODEL = process.env.GENERIC_HTTP_DEFAULT_MODEL || "auto";

function extractDesignMd(rawContent) {
  if (!rawContent) return "";
  const fmStart = rawContent.search(/^---\s*$/m);
  if (fmStart !== -1) return rawContent.slice(fmStart);
  return rawContent;
}

function parseExtraHeaders() {
  const raw = process.env.GENERIC_HTTP_HEADERS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    console.warn("[generic-http] GENERIC_HTTP_HEADERS is not valid JSON — ignoring.");
  }
  return {};
}

async function invoke(promptText, options = {}) {
  const endpoint = process.env.GENERIC_HTTP_ENDPOINT;
  const apiKey = process.env.GENERIC_HTTP_API_KEY;
  if (!endpoint || !apiKey) {
    console.error("[!] generic-http requires GENERIC_HTTP_ENDPOINT + GENERIC_HTTP_API_KEY.");
    process.exit(6);
  }

  const model = options.model || GENERIC_HTTP_DEFAULT_MODEL;
  const envMaxTokens = parseInt(process.env.DESIGN_MD_MAX_TOKENS || "", 10);
  const maxTokens = options.maxTokens || (Number.isFinite(envMaxTokens) && envMaxTokens > 0 ? envMaxTokens : DEFAULT_MAX_TOKENS);

  console.log(`[generic-http] calling ${endpoint} model=${model} (max_tokens=${maxTokens})…`);

  const body = JSON.stringify({
    model,
    messages: [{ role: "user", content: promptText }],
    max_tokens: maxTokens,
  });

  const authHeader = process.env.GENERIC_HTTP_AUTH_HEADER || "Authorization";
  const authPrefix = process.env.GENERIC_HTTP_AUTH_PREFIX !== undefined
    ? process.env.GENERIC_HTTP_AUTH_PREFIX
    : "Bearer ";
  const headers = {
    [authHeader]: `${authPrefix}${apiKey}`,
    "Content-Type": "application/json",
    ...parseExtraHeaders(),
  };

  let response;
  try {
    response = await fetch(endpoint, { method: "POST", headers, body });
  } catch (err) {
    return {
      status: 1,
      stdout: "",
      stderr: `[generic-http] network error: ${err.message}`,
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
      stderr: `[generic-http] HTTP ${response.status}: ${trimmed}`,
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
      stderr: `[generic-http] failed to parse JSON response: ${err.message}`,
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

module.exports = { invoke, extractDesignMd, GENERIC_HTTP_DEFAULT_MODEL };
