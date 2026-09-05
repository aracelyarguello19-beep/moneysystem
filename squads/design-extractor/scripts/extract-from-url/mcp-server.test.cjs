"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { buildCliArgv, handlers } = require("./mcp-server.cjs");

test("MCP CLI argv builder preserves extraction CLI parity flags", () => {
  const argv = buildCliArgv({
    url: "https://example.com",
    provider: "codex-cli",
    budget: "cheap",
    maxTokens: 12345,
    maxCostUsd: 0.75,
    maxCacheAge: 168,
    maxLlmCacheAge: 24,
    noLlmRetry: true,
    noContentGate: true,
    noReuse: true,
    noLearning: true,
    noBundle: true,
    bundleForce: true,
    manualRecovery: true,
    gallery: true,
    emitShowcase: false,
    emitTailwind: true,
    scaffold: true,
    scaffoldOut: "out.md",
    scaffoldForce: true,
  });

  assert.deepEqual(argv.slice(0, 2), ["--url", "https://example.com"]);
  assert.ok(argv.includes("codex-cli"));
  assert.ok(argv.includes("--budget"));
  assert.ok(argv.includes("--max-cost-usd"));
  assert.ok(argv.includes("--max-cache-age"));
  assert.ok(argv.includes("--max-llm-cache-age"));
  assert.ok(argv.includes("--no-bundle"));
  assert.ok(argv.includes("--bundle-force"));
  assert.ok(argv.includes("--manual-recovery"));
  assert.ok(argv.includes("--gallery"));
  assert.ok(argv.includes("--no-emit-showcase"));
  assert.ok(argv.includes("--emit-tailwind"));
});

test("MCP tool schema exposes codex-cli and budget controls", () => {
  const result = handlers["tools/list"]();
  const tool = result.tools.find((item) => item.name === "extract_design_md");
  const props = tool.inputSchema.properties;

  assert.ok(props.provider.enum.includes("codex-cli"));
  assert.deepEqual(props.budget.enum, ["cheap", "standard", "premium"]);
  assert.equal(props.maxCostUsd.type, "number");
  assert.equal(props.maxCacheAge.type, "number");
  assert.equal(props.maxLlmCacheAge.type, "number");
  assert.equal(props.manualRecovery.type, "boolean");
  assert.equal(props.bundleForce.type, "boolean");
  assert.equal(props.noBundle.type, "boolean");
});
