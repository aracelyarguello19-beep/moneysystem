"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  createPhaseTimer,
  parseClaudeStdout,
  parseClaudeCliStdout,
  parseOpenRouterResponse,
  estimateCost,
  estimateCostFromChars,
  buildBudgetPreflight,
  resolveMaxCostUsd,
  validateDesignMdSections,
} = require("./telemetry.cjs");

// ── createPhaseTimer ─────────────────────────────────────────────────

test("createPhaseTimer: start/end/report captures elapsed ms", (t, done) => {
  const timer = createPhaseTimer();
  timer.start("phase_1");
  setTimeout(() => {
    timer.end("phase_1");
    const report = timer.report();
    assert.ok(typeof report.phase_1 === "number", "phase_1 should be a number");
    assert.ok(report.phase_1 >= 0, "elapsed should be >= 0");
    done();
  }, 5);
});

test("createPhaseTimer: multiple phases tracked independently", () => {
  const timer = createPhaseTimer();
  timer.start("phase_a");
  timer.end("phase_a");
  timer.start("phase_b");
  timer.end("phase_b");
  const report = timer.report();
  assert.ok("phase_a" in report, "phase_a should be in report");
  assert.ok("phase_b" in report, "phase_b should be in report");
});

test("createPhaseTimer: end without start produces no entry", () => {
  const timer = createPhaseTimer();
  timer.end("ghost_phase");
  const report = timer.report();
  assert.ok(!("ghost_phase" in report), "ghost_phase should not appear without start");
});

// ── parseClaudeStdout ────────────────────────────────────────────────

test("parseClaudeStdout: parses usage from result metadata line", () => {
  const metadata = JSON.stringify({
    type: "result",
    subtype: "success",
    model: "claude-opus-4-7",
    turns_used: 12,
    usage: {
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_input_tokens: 200,
      cache_creation_input_tokens: 0,
    },
  });
  const raw = `Some LLM text\n${metadata}\nMore text`;
  const result = parseClaudeStdout(raw);
  assert.equal(result.input_tokens, 1000);
  assert.equal(result.output_tokens, 500);
  assert.equal(result.cache_read_tokens, 200);
  assert.equal(result.model, "claude-opus-4-7");
  assert.equal(result.turns_used, 12);
  assert.equal(result.error_max_turns, false);
});

test("parseClaudeStdout: detects error_max_turns", () => {
  const metadata = JSON.stringify({
    type: "result",
    subtype: "error_max_turns",
  });
  const raw = `${metadata}`;
  const result = parseClaudeStdout(raw);
  assert.equal(result.error_max_turns, true);
});

test("parseClaudeStdout: returns nulls when no metadata present", () => {
  const raw = "Just plain LLM text with no JSON lines";
  const result = parseClaudeStdout(raw);
  assert.equal(result.input_tokens, null);
  assert.equal(result.output_tokens, null);
  assert.equal(result.model, null);
  assert.equal(result.turns_used, null);
  assert.equal(result.error_max_turns, false);
});

test("parseClaudeStdout: handles null/undefined gracefully", () => {
  const result = parseClaudeStdout(null);
  assert.equal(result.input_tokens, null);
  assert.equal(result.error_max_turns, false);
});

test("parseClaudeStdout: mixed text and metadata lines", () => {
  const raw = [
    "Here is your DESIGN.md content",
    '{"type":"result","subtype":"success","model":"claude-sonnet-4-6","num_turns":5,"usage":{"input_tokens":800,"output_tokens":300}}',
    "Some trailing text",
  ].join("\n");
  const result = parseClaudeStdout(raw);
  assert.equal(result.input_tokens, 800);
  assert.equal(result.output_tokens, 300);
  assert.equal(result.model, "claude-sonnet-4-6");
  assert.equal(result.turns_used, 5);
});

test("parseClaudeStdout: derives model from Claude CLI modelUsage", () => {
  const raw = JSON.stringify({
    type: "result",
    subtype: "success",
    total_cost_usd: 0.017845,
    num_turns: 1,
    usage: {
      input_tokens: 10,
      output_tokens: 44,
      cache_read_input_tokens: 30650,
      cache_creation_input_tokens: 11640,
    },
    modelUsage: {
      "claude-haiku-4-5": {
        inputTokens: 10,
        outputTokens: 44,
        cacheReadInputTokens: 30650,
        cacheCreationInputTokens: 11640,
        costUSD: 0.017845,
      },
    },
  });
  const result = parseClaudeStdout(raw);
  assert.equal(result.model, "claude-haiku-4-5");
  assert.equal(result.total_cost_usd, 0.017845);
  assert.equal(result.input_tokens, 10);
  assert.equal(result.output_tokens, 44);
  assert.equal(result.turns_used, 1);
});

// ── estimateCost ─────────────────────────────────────────────────────

test("estimateCost: opus pricing", () => {
  const usage = { input_tokens: 10000, output_tokens: 5000, cache_read_tokens: 0, cache_creation_tokens: 0 };
  const result = estimateCost(usage, "claude-opus-4-7");
  assert.equal(result.source, "sdk-usage");
  assert.equal(result.model, "claude-opus-4-7");
  // input: 10000/1M * $15 = $0.00015; output: 5000/1M * $75 = $0.000375 → total $0.000525
  assert.ok(result.usd > 0, "cost should be positive");
  assert.ok(result.usd < 1, "cost should be < $1 for small usage");
});

test("estimateCost: sonnet pricing", () => {
  const usage = { input_tokens: 10000, output_tokens: 5000, cache_read_tokens: 0, cache_creation_tokens: 0 };
  const sonnet = estimateCost(usage, "claude-sonnet-4-6");
  const opus = estimateCost(usage, "claude-opus-4-7");
  assert.ok(sonnet.usd < opus.usd, "sonnet should be cheaper than opus");
});

test("estimateCost: haiku pricing", () => {
  const usage = { input_tokens: 10000, output_tokens: 5000, cache_read_tokens: 0, cache_creation_tokens: 0 };
  const haiku = estimateCost(usage, "claude-haiku-4-5");
  const sonnet = estimateCost(usage, "claude-sonnet-4-6");
  assert.ok(haiku.usd < sonnet.usd, "haiku should be cheaper than sonnet");
});

test("estimateCost: unknown model returns null usd and unknown-model source", () => {
  const usage = { input_tokens: 1000, output_tokens: 100, cache_read_tokens: 0, cache_creation_tokens: 0 };
  const result = estimateCost(usage, "claude-unknown-model");
  assert.equal(result.usd, null);
  assert.equal(result.source, "unknown-model");
  assert.equal(result.model, "claude-unknown-model");
});

test("estimateCost: includes breakdown with all fields", () => {
  const usage = { input_tokens: 1000, output_tokens: 500, cache_read_tokens: 100, cache_creation_tokens: 50 };
  const result = estimateCost(usage, "claude-opus-4-7");
  assert.ok("input_usd" in result.breakdown);
  assert.ok("output_usd" in result.breakdown);
  assert.ok("cache_read_usd" in result.breakdown);
  assert.ok("cache_write_usd" in result.breakdown);
});

// ── estimateCostFromChars ────────────────────────────────────────────

test("estimateCostFromChars: produces char-fallback source", () => {
  const result = estimateCostFromChars(4000, 2000, "claude-opus-4-7");
  assert.equal(result.source, "char-fallback");
  assert.ok(result.usd >= 0);
});

// ── budget preflight ────────────────────────────────────────────────

test("resolveMaxCostUsd prefers explicit CLI cap over env and tier defaults", () => {
  const cap = resolveMaxCostUsd({
    explicitMaxCostUsd: 1.23,
    budgetTier: "cheap",
    env: { DESIGN_MD_MAX_COST_USD: "9" },
  });
  assert.equal(cap.usd, 1.23);
  assert.equal(cap.source, "cli");
});

test("buildBudgetPreflight blocks estimates above the resolved cap", () => {
  const report = buildBudgetPreflight({
    promptChars: 400000,
    maxTokens: 65536,
    model: "claude-opus-4-7",
    maxCostUsd: 0.01,
  });

  assert.equal(report.pass, false);
  assert.equal(report.max_cost_usd, 0.01);
  assert.ok(report.estimated_usd > report.max_cost_usd);
});

test("buildBudgetPreflight uses Codex budget proxy instead of Opus fallback for known Codex models", () => {
  const report = buildBudgetPreflight({
    promptChars: 33000,
    maxTokens: 32768,
    model: "gpt-5.4-mini",
    budgetTier: "cheap",
  });

  assert.equal(report.pass, true);
  assert.equal(report.fallback_model, false);
  assert.equal(report.cap_source, "budget:cheap");
});

// ── validateDesignMdSections ─────────────────────────────────────────

test("validateDesignMdSections: valid DESIGN.md with all sections", () => {
  const designMd = `---
name: Test
---

## 1. Visual Theme
Content here.

## 2. Color Palette
Color info.

## 3. Typography Rules
Font info.

## 4. Components
Component info.

## 5. Layout Principles
Layout info.
`;
  const result = validateDesignMdSections(designMd);
  assert.equal(result.valid, true);
  assert.deepEqual(result.missing, []);
});

test("validateDesignMdSections: missing one section", () => {
  const designMd = `## 1. Visual Theme
## 2. Color Palette
## 3. Typography Rules
## 5. Layout Principles
`;
  const result = validateDesignMdSections(designMd);
  assert.equal(result.valid, false);
  assert.ok(result.missing.includes("## 4. Components"));
  assert.equal(result.missing.length, 1);
});

test("validateDesignMdSections: missing three sections", () => {
  const designMd = `## 1. Visual Theme
## 2. Color Palette
`;
  const result = validateDesignMdSections(designMd);
  assert.equal(result.valid, false);
  assert.equal(result.missing.length, 3);
  assert.ok(result.missing.includes("## 3. Typography Rules"));
  assert.ok(result.missing.includes("## 4. Components"));
  assert.ok(result.missing.includes("## 5. Layout Principles"));
});

test("validateDesignMdSections: frontmatter-only returns invalid", () => {
  const designMd = `---
name: Test
colors:
  primary: "#000"
---
`;
  const result = validateDesignMdSections(designMd);
  assert.equal(result.valid, false);
  assert.equal(result.missing.length, 5);
});

test("validateDesignMdSections: null input returns all sections missing", () => {
  const result = validateDesignMdSections(null);
  assert.equal(result.valid, false);
  assert.equal(result.missing.length, 5);
});

// ── parseClaudeCliStdout (renamed, AC3.1) ────────────────────────────

test("parseClaudeCliStdout is the same as parseClaudeStdout (backward compat)", () => {
  const raw = JSON.stringify({
    type: "result",
    model: "claude-opus-4-7",
    turns_used: 3,
    usage: { input_tokens: 500, output_tokens: 100 },
  });
  const via_old = parseClaudeStdout(raw);
  const via_new = parseClaudeCliStdout(raw);
  assert.deepEqual(via_old, via_new);
});

// ── parseOpenRouterResponse (AC3.1, AC3.3) ───────────────────────────

test("parseOpenRouterResponse: normal response", () => {
  const json = {
    model: "anthropic/claude-haiku-4-5",
    choices: [{ message: { role: "assistant", content: "hello" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
  };
  const result = parseOpenRouterResponse(json);
  assert.equal(result.input_tokens, 120);
  assert.equal(result.output_tokens, 80);
  assert.equal(result.model, "anthropic/claude-haiku-4-5");
  assert.equal(result.finish_reason, "stop");
});

test("parseOpenRouterResponse: missing usage returns nulls", () => {
  const json = {
    model: "anthropic/claude-haiku-4-5",
    choices: [{ message: { content: "hello" }, finish_reason: "stop" }],
  };
  const result = parseOpenRouterResponse(json);
  assert.equal(result.input_tokens, null);
  assert.equal(result.output_tokens, null);
  assert.equal(result.finish_reason, "stop");
});

test("parseOpenRouterResponse: malformed JSON object returns all nulls", () => {
  const result = parseOpenRouterResponse(null);
  assert.equal(result.input_tokens, null);
  assert.equal(result.output_tokens, null);
  assert.equal(result.model, null);
  assert.equal(result.finish_reason, null);
});

// ── estimateCost with OpenRouter model IDs (AC3.2) ────────────────────

test("estimateCost: anthropic/claude-haiku-4-5 (OpenRouter format)", () => {
  const usage = { input_tokens: 1000, output_tokens: 500 };
  const result = estimateCost(usage, "anthropic/claude-haiku-4-5");
  assert.equal(result.source, "sdk-usage");
  assert.equal(result.model, "anthropic/claude-haiku-4-5");
  assert.ok(result.usd > 0);
  assert.ok(result.usd < 0.01);
});

test("estimateCost: anthropic/claude-sonnet-4-6 (OpenRouter format)", () => {
  const usage = { input_tokens: 1000, output_tokens: 500 };
  const haiku = estimateCost(usage, "anthropic/claude-haiku-4-5");
  const sonnet = estimateCost(usage, "anthropic/claude-sonnet-4-6");
  assert.ok(sonnet.usd > haiku.usd, "sonnet should cost more than haiku");
});

test("estimateCost: openai/gpt-5 unknown model returns null usd", () => {
  const usage = { input_tokens: 1000, output_tokens: 500 };
  const result = estimateCost(usage, "openai/gpt-5");
  assert.equal(result.usd, null);
  assert.equal(result.source, "unknown-model");
  assert.equal(result.model, "openai/gpt-5");
});
