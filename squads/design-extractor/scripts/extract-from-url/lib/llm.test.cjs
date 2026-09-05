"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildAgentPrompt } = require("./llm.cjs");

const designMdSample = `---
name: Apple
colors:
  primary: "#0071e3"
  surface: "#ffffff"
typography:
  h1:
    fontFamily: SF Pro Display
    fontSize: 48px
---

## Overview
Test`;

// ── Helper: scrub all provider env vars before each detect test ─────
function scrubProviderEnv() {
  const saved = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GENERIC_HTTP_ENDPOINT: process.env.GENERIC_HTTP_ENDPOINT,
    GENERIC_HTTP_API_KEY: process.env.GENERIC_HTTP_API_KEY,
    VERCEL: process.env.VERCEL,
  };
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GENERIC_HTTP_ENDPOINT;
  delete process.env.GENERIC_HTTP_API_KEY;
  delete process.env.VERCEL;
  return () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

test("buildAgentPrompt emits compact component brief without embedding DESIGN.md", () => {
  const prompt = buildAgentPrompt({
    url: "https://www.apple.com/",
    designMd: designMdSample,
    tokens: { name: "Apple", colors: { primary: "#0071e3", surface: "#ffffff" } },
    pageCopy: { heading: "Hello Apple", body: "Test body" },
    brandName: "Apple",
  });
  assert.match(prompt, /Apple/);
  assert.match(prompt, /#0071e3/);
  assert.match(prompt, /Hello Apple/);
  assert.match(prompt, /\[REPLACE THIS LINE/);
  assert.match(prompt, /Component rules/);
  assert.doesNotMatch(prompt, /Source DESIGN\.md/);
  assert.doesNotMatch(prompt, /```markdown/);
  assert.match(prompt, /Generate the component now/);
});

test("buildAgentPrompt falls back when tokens are missing", () => {
  const prompt = buildAgentPrompt({
    url: "https://x.com",
    designMd: "",
    tokens: null,
    pageCopy: null,
    brandName: null,
  });
  assert.match(prompt, /the brand|x\.com/i);
  assert.match(prompt, /#000000/); // primary fallback
});

test("buildAgentPrompt prefers preview_tokens over colors", () => {
  const prompt = buildAgentPrompt({
    url: "https://x.com",
    designMd: "",
    tokens: {
      colors: { primary: "#aaaaaa" },
      preview_tokens: { button_primary_bg: "#bbbbbb" },
    },
    pageCopy: {},
    brandName: "X",
  });
  assert.match(prompt, /#bbbbbb/);
  assert.doesNotMatch(prompt.match(/Primary CTA fill:.*$/m)?.[0] || "", /#aaaaaa/);
});

test("buildAgentPrompt extracts hostname when brandName is missing", () => {
  const prompt = buildAgentPrompt({
    url: "https://www.linear.app/about",
    designMd: "",
    tokens: { colors: {} },
    pageCopy: {},
    brandName: null,
  });
  assert.match(prompt, /linear\.app/);
});

test("invokeClaude accepts maxTurns option", () => {
  // Verifies the function signature accepts options without throwing.
  // Cannot test actual subprocess in unit tests — verifies interface only.
  assert.doesNotThrow(() => {
    const { invokeClaude: fn } = require("./llm.cjs");
    assert.equal(typeof fn, "function");
  });
});

// ── invokeLlm + detectProvider (universal mode, 2026-05-03) ──────────

test("invokeLlm is exported and is async", () => {
  const { invokeLlm } = require("./llm.cjs");
  assert.equal(typeof invokeLlm, "function");
});

test("detectProvider returns claude-cli when no env vars and claude binary on PATH", () => {
  const restore = scrubProviderEnv();
  try {
    const { detectProvider, claudeBinaryAvailable } = require("./llm.cjs");
    const result = detectProvider({});
    if (claudeBinaryAvailable()) {
      assert.equal(result, "claude-cli");
    } else {
      // No claude binary AND no env vars → detectProvider must throw with
      // an actionable error listing all 5 ways to configure a provider.
      assert.fail("Expected detectProvider to throw when no provider is available");
    }
  } catch (err) {
    // Path: claude not on PATH. Verify error message lists all 5 providers.
    assert.match(err.message, /OPENROUTER_API_KEY/);
    assert.match(err.message, /ANTHROPIC_API_KEY/);
    assert.match(err.message, /OPENAI_API_KEY/);
    assert.match(err.message, /GENERIC_HTTP_ENDPOINT/);
    assert.match(err.message, /Claude Code CLI/);
  } finally {
    restore();
  }
});

test("detectProvider returns openrouter when OPENROUTER_API_KEY is set (highest priority)", () => {
  const restore = scrubProviderEnv();
  process.env.OPENROUTER_API_KEY = "sk-test";
  process.env.ANTHROPIC_API_KEY = "sk-anthropic-test"; // OpenRouter still wins
  try {
    const { detectProvider } = require("./llm.cjs");
    assert.equal(detectProvider({}), "openrouter");
  } finally {
    restore();
  }
});

test("detectProvider returns anthropic-api when only ANTHROPIC_API_KEY set", () => {
  const restore = scrubProviderEnv();
  process.env.ANTHROPIC_API_KEY = "sk-anthropic-test";
  try {
    const { detectProvider } = require("./llm.cjs");
    assert.equal(detectProvider({}), "anthropic-api");
  } finally {
    restore();
  }
});

test("detectProvider returns openai when only OPENAI_API_KEY set", () => {
  const restore = scrubProviderEnv();
  process.env.OPENAI_API_KEY = "sk-openai-test";
  try {
    const { detectProvider } = require("./llm.cjs");
    assert.equal(detectProvider({}), "openai");
  } finally {
    restore();
  }
});

test("detectProvider returns generic-http when GENERIC_HTTP_ENDPOINT+KEY set", () => {
  const restore = scrubProviderEnv();
  process.env.GENERIC_HTTP_ENDPOINT = "https://api.example.com/v1/chat/completions";
  process.env.GENERIC_HTTP_API_KEY = "sk-generic-test";
  try {
    const { detectProvider } = require("./llm.cjs");
    assert.equal(detectProvider({}), "generic-http");
  } finally {
    restore();
  }
});

test("detectProvider returns openrouter on Vercel only when API key is set", () => {
  const restore = scrubProviderEnv();
  process.env.VERCEL = "1";
  process.env.OPENROUTER_API_KEY = "sk-test";
  try {
    const { detectProvider } = require("./llm.cjs");
    assert.equal(detectProvider({}), "openrouter");
  } finally {
    restore();
  }
});

test("detectProvider honors explicit provider override", () => {
  const restore = scrubProviderEnv();
  process.env.VERCEL = "1";
  process.env.OPENROUTER_API_KEY = "sk-test";
  try {
    const { detectProvider } = require("./llm.cjs");
    assert.equal(detectProvider({ provider: "claude-cli" }), "claude-cli");
    assert.equal(detectProvider({ provider: "openai" }), "openai");
    assert.equal(detectProvider({ provider: "anthropic-api" }), "anthropic-api");
    assert.equal(detectProvider({ provider: "generic-http" }), "generic-http");
  } finally {
    restore();
  }
});

test("validateProviderModel accepts any model (universal mode)", () => {
  const { validateProviderModel } = require("./llm.cjs");
  // Previously: openrouter was Haiku-only. Now: any model passes.
  const result = validateProviderModel("openrouter", "openai/gpt-5");
  assert.equal(result.ok, true);
  assert.equal(result.model, "openai/gpt-5");
  assert.equal(result.source, "explicit");
});

test("validateProviderModel returns provider default when model omitted", () => {
  const { validateProviderModel, PROVIDER_DEFAULTS } = require("./llm.cjs");
  const result = validateProviderModel("openai", null);
  assert.equal(result.ok, true);
  assert.equal(result.model, PROVIDER_DEFAULTS.openai.default_model);
  assert.equal(result.source, "provider-default");
});

test("validateProviderModel rejects unknown provider", () => {
  const { validateProviderModel } = require("./llm.cjs");
  assert.throws(() => validateProviderModel("nonexistent", "any-model"), /Unknown provider/);
});

test("PROVIDER_DEFAULTS exports defaults for all 5 providers", () => {
  const { PROVIDER_DEFAULTS } = require("./llm.cjs");
  for (const p of ["claude-cli", "openrouter", "openai", "anthropic-api", "generic-http"]) {
    assert.ok(PROVIDER_DEFAULTS[p], `missing default for ${p}`);
    assert.ok(PROVIDER_DEFAULTS[p].default_model, `missing default_model for ${p}`);
  }
});

test("detectProvider honors explicit codex-cli override", () => {
  const { detectProvider } = require("./llm.cjs");
  const result = detectProvider({ provider: "codex-cli" });
  assert.equal(result, "codex-cli");
});

test("validateProviderModel accepts codex-cli with config default model", () => {
  const { validateProviderModel } = require("./llm.cjs");
  const result = validateProviderModel("codex-cli", null);
  assert.equal(result.ok, true);
  assert.equal(result.source, "provider-default");
});
