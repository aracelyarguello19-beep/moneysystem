#!/usr/bin/env node
/**
 * design-md MCP server — universal access for Codex / Cursor / Manus / any
 * Model Context Protocol-compatible host.
 *
 * Exposes the URL→DESIGN.md pipeline as an MCP tool over stdio. The MCP host
 * connects to this process via JSON-RPC 2.0 on stdin/stdout, calls
 * `tools/list` to discover capabilities, then calls `tools/call` to run the
 * pipeline.
 *
 * Tools:
 *   extract_design_md   — run the full extraction pipeline against a URL
 *
 * Usage from an MCP client config (e.g. Codex / Cursor):
 *   {
 *     "mcpServers": {
 *       "design-md": {
 *         "command": "node",
 *         "args": ["/abs/path/to/squads/design-ops/scripts/extract-from-url/mcp-server.cjs"],
 *         "env": { "OPENROUTER_API_KEY": "sk-..." }
 *       }
 *     }
 *   }
 *
 * Protocol: speaks the line-delimited JSON-RPC 2.0 dialect that Anthropic's
 * MCP reference implementation uses. Each request/response is one JSON object
 * per line on stdin/stdout. Notifications (no id) get no response.
 *
 * No external dependencies — implements the small subset of MCP needed
 * (initialize, tools/list, tools/call) directly so the skill stays
 * drop-in portable.
 */

"use strict";

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const readline = require("readline");

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_NAME = "design-md";
const SERVER_VERSION = "2.0.0";

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function logErr(...args) {
  // MCP forbids stdout for non-protocol output — use stderr for diagnostics.
  process.stderr.write("[design-md-mcp] " + args.map(String).join(" ") + "\n");
}

function ok(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function fail(id, code, message, data) {
  send({ jsonrpc: "2.0", id, error: { code, message, data } });
}

// ── Tool: extract_design_md ─────────────────────────────────────────
// Spawns the existing CLI as a subprocess. We don't import run.cjs
// in-process because it calls process.exit on errors and writes to console.
function buildCliArgv(args) {
  const argv = ["--url", args.url];
  if (args.out) argv.push("--out", args.out);
  if (args.compare) argv.push("--compare", args.compare);
  if (args.provider) argv.push("--provider", args.provider);
  if (args.model) argv.push("--model", args.model);
  if (args.budget) argv.push("--budget", args.budget);
  if (args.maxTokens) argv.push("--max-tokens", String(args.maxTokens));
  if (args.maxCostUsd) argv.push("--max-cost-usd", String(args.maxCostUsd));
  if (args.maxCacheAge != null) argv.push("--max-cache-age", String(args.maxCacheAge));
  if (args.maxLlmCacheAge != null) argv.push("--max-llm-cache-age", String(args.maxLlmCacheAge));
  if (args.noLlmRetry) argv.push("--no-llm-retry");
  if (args.noContentGate) argv.push("--no-content-gate");
  if (args.noReuse) argv.push("--no-reuse");
  if (args.noLearning) argv.push("--no-learning");
  if (args.noBundle) argv.push("--no-bundle");
  if (args.bundleForce) argv.push("--bundle-force");
  if (args.manualRecovery) argv.push("--manual-recovery");
  if (args.gallery) argv.push("--gallery");
  if (args.emitShowcase === false) argv.push("--no-emit-showcase");
  if (args.emitTailwind) argv.push("--emit-tailwind");
  if (args.scaffold) argv.push("--scaffold");
  if (args.scaffoldOut) argv.push("--scaffold-out", args.scaffoldOut);
  if (args.scaffoldForce) argv.push("--scaffold-force");
  return argv;
}

function runExtractFromUrl(args) {
  return new Promise((resolve) => {
    const cliPath = path.join(__dirname, "run.cjs");
    if (!fs.existsSync(cliPath)) {
      resolve({ ok: false, error: `run.cjs not found at ${cliPath}` });
      return;
    }

    const argv = buildCliArgv(args);

    const child = spawn("node", [cliPath, ...argv], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (b) => stdout.push(b));
    child.stderr.on("data", (b) => stderr.push(b));
    child.on("error", (err) => resolve({ ok: false, error: err.message }));
    child.on("close", (code) => {
      const stdoutText = Buffer.concat(stdout).toString("utf8");
      const stderrText = Buffer.concat(stderr).toString("utf8");
      resolve({
        ok: code === 0,
        exit_code: code,
        stdout: stdoutText,
        stderr: stderrText,
      });
    });
  });
}

// ── MCP method handlers ─────────────────────────────────────────────
const handlers = {
  initialize: (params) => ({
    protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
    capabilities: {
      tools: {},
    },
    serverInfo: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
  }),

  "notifications/initialized": () => null,

  "tools/list": () => ({
    tools: [
      {
        name: "extract_design_md",
        description:
          "Extract a Google-spec DESIGN.md from any public URL via static HTML/CSS analysis. " +
          "Universal — runs against any LLM provider (OpenRouter/OpenAI/Anthropic API/generic " +
          "OpenAI-compatible HTTP/Claude CLI). Outputs DESIGN.md, tokens.json, preview.html, " +
          "lint-report.json, quality-score.json, telemetry.json under outputs/design-ops/url-extracts/<slug>/.",
        inputSchema: {
          type: "object",
          required: ["url"],
          properties: {
            url: { type: "string", description: "Public http(s) URL to extract" },
            out: { type: "string", description: "Override output directory" },
            compare: { type: "string", description: "Local DESIGN.md path for drift check" },
            provider: {
              type: "string",
              enum: ["claude-cli", "codex-cli", "openrouter", "openai", "anthropic-api", "generic-http"],
              description: "Force provider; auto-detected from env vars otherwise",
            },
            model: { type: "string", description: "Model id for the chosen provider" },
            budget: {
              type: "string",
              enum: ["cheap", "standard", "premium"],
              description: "Budget tier; maps to provider/model/turn profile and cost cap",
            },
            maxTokens: { type: "integer", description: "Max output tokens (HTTP providers)" },
            maxCostUsd: { type: "number", description: "Hard cost preflight cap before LLM invocation" },
            maxCacheAge: { type: "number", description: "Static fetch/collect/detect/markdown reuse TTL in hours" },
            maxLlmCacheAge: { type: "number", description: "LLM reuse TTL in hours" },
            noLlmRetry: { type: "boolean", description: "Fail hard on first LLM error (CI mode)" },
            noContentGate: { type: "boolean", description: "Skip content-validation gate" },
            noReuse: { type: "boolean", description: "Force cold run, no phase reuse" },
            noLearning: { type: "boolean", description: "Disable learning-log writes" },
            noBundle: { type: "boolean", description: "Skip derived apps/design bundle writes" },
            bundleForce: { type: "boolean", description: "Materialize gallery bundle even when run was archived" },
            manualRecovery: { type: "boolean", description: "Mark output as manually recovered from extracted evidence" },
            gallery: { type: "boolean", description: "Opt in to derived gallery materialization" },
            emitShowcase: { type: "boolean", description: "Emit showcase.html; false maps to --no-emit-showcase" },
            emitTailwind: { type: "boolean", description: "Emit Tailwind/showcase artifacts" },
            scaffold: { type: "boolean", description: "Emit design.md scaffold after extract" },
            scaffoldOut: { type: "string", description: "Override scaffold output path" },
            scaffoldForce: { type: "boolean", description: "Overwrite existing scaffold" },
          },
        },
      },
    ],
  }),

  "tools/call": async (params) => {
    if (params?.name !== "extract_design_md") {
      throw { code: -32601, message: `Unknown tool: ${params?.name}` };
    }
    const args = params.arguments || {};
    if (!args.url) {
      throw { code: -32602, message: "Missing required argument: url" };
    }

    const result = await runExtractFromUrl(args);

    // MCP tool result format: { content: [{type:"text", text:"..."}], isError? }
    const summary = result.ok
      ? `Extraction succeeded (exit=${result.exit_code}).\n\n--- stdout ---\n${result.stdout.slice(-4000)}`
      : `Extraction failed (exit=${result.exit_code}).\n\n--- stderr ---\n${result.stderr.slice(-4000)}\n\n--- stdout ---\n${result.stdout.slice(-2000)}`;

    return {
      content: [{ type: "text", text: summary }],
      isError: !result.ok,
    };
  },
};

function startServer() {
  // ── stdin reader (line-delimited JSON-RPC 2.0) ──────────────────────
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
    terminal: false,
  });

  // ── JSON-RPC dispatch loop ──────────────────────────────────────────
  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req;
    try {
      req = JSON.parse(trimmed);
    } catch (err) {
      logErr("invalid JSON on stdin:", err.message);
      return;
    }

    const { id, method, params } = req;
    const handler = handlers[method];

    if (!handler) {
      if (id !== undefined) fail(id, -32601, `Method not found: ${method}`);
      return;
    }

    try {
      const result = await handler(params);
      // Notifications (no id) get no response, even on success.
      if (id === undefined || id === null) return;
      if (result === null || result === undefined) {
        ok(id, {});
      } else {
        ok(id, result);
      }
    } catch (err) {
      if (id === undefined || id === null) {
        logErr("notification handler threw:", err?.message || err);
        return;
      }
      if (err && typeof err.code === "number") {
        fail(id, err.code, err.message || "Error", err.data);
      } else {
        fail(id, -32603, err?.message || String(err));
      }
    }
  });

  rl.on("close", () => {
    process.exit(0);
  });

  logErr(`design-md MCP server v${SERVER_VERSION} listening on stdio`);
  return rl;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  buildCliArgv,
  handlers,
  runExtractFromUrl,
  startServer,
};
