"use strict";

const fs = require("fs");
const { spawnSync } = require("child_process");

// ── Invoke Claude Code as subprocess (CLI mode) ─────────────────────
// Headless flags per .claude/rules/claude-code-framework.md §3 Headless Pipeline:
//   R1 — --dangerously-skip-permissions (without it, all tools auto-denied)
//   R3/R4 — --allowedTools "Read,Write"
//   R5 — --max-turns 90 (cap budget; large sites with 1000+ css-vars +
//   the post-Phase-2 prompt (450 lines, 30KB demanding 8-atom components:,
//   12-18 typography roles, 9 numbered sections + Agent Prompt Guide) need
//   substantial turn headroom. Mercado Livre stalled at 12 turns under
//   stream timeout; bumping to 90 + bumping process timeout to 15min.)
//   Retry path in run.cjs still bumps further when needed.
//
// Override at the per-call level via options.maxTurns or globally via
// the env vars DESIGN_MD_MAX_TURNS / DESIGN_MD_TIMEOUT_MS.
//
// Returns { status, stdout, stderr } — callers parse claudeMetadata from stdout
// per headless-pipeline.md R8.
function buildClaudeCliArgs(promptText, { maxTurns, model } = {}) {
  const args = [
    "-p",
    promptText,
    "--output-format", "json",
    "--allowedTools", "Read,Write",
    "--dangerously-skip-permissions",
    "--max-turns", String(maxTurns),
  ];

  if (model) {
    args.push("--model", String(model));
  }

  return args;
}

function isNestedClaudeCodeSession(env = process.env) {
  if (env.DESIGN_MD_ALLOW_NESTED_CLAUDE === "1") return false;
  return Object.keys(env).some((key) =>
    key === "CLAUDECODE" ||
    key === "CLAUDE_CODE_SESSION_ID" ||
    key === "CLAUDE_CODE_ENTRYPOINT" ||
    key.startsWith("CLAUDE_CODE_")
  );
}

// ── Extract DESIGN.md content from claude -p JSON stdout ────────────
// `claude -p --output-format json` emits one (or more) JSON lines. The
// terminal {"type":"result", ...} object carries a `result` field with the
// LLM's final text response. Pull that out, strip any pre-frontmatter prose
// and return clean DESIGN.md content. Returns "" when no result is present
// (max-turns failure, error, etc.) — callers must handle that.
function extractDesignMdFromCliStdout(rawStdout) {
  if (!rawStdout) return "";
  const lines = rawStdout.split("\n");
  let text = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    let parsed;
    try { parsed = JSON.parse(trimmed); } catch { continue; }
    if (parsed && parsed.type === "result" && typeof parsed.result === "string") {
      text = parsed.result;
    }
  }
  if (!text) return "";
  const fmStart = text.search(/^---\s*$/m);
  return fmStart !== -1 ? text.slice(fmStart) : "";
}

function invoke(promptText, options = {}) {
  const envTurns = parseInt(process.env.DESIGN_MD_MAX_TURNS || "", 10);
  const maxTurnsDefault = Number.isFinite(envTurns) && envTurns > 0 ? envTurns : 90;
  const envTimeout = parseInt(process.env.DESIGN_MD_TIMEOUT_MS || "", 10);
  const timeoutDefault = Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : 900000;
  const { maxTurns = maxTurnsDefault, timeoutMs = timeoutDefault, cwd, model, designMdPath } = options;

  if (isNestedClaudeCodeSession()) {
    return {
      status: 7,
      stdout: "",
      stderr: [
        "[claude-cli] refused nested Claude Code invocation.",
        "Run with --provider codex-cli, use an API provider, or set DESIGN_MD_ALLOW_NESTED_CLAUDE=1 to override.",
      ].join(" "),
    };
  }

  console.log("[claude-cli] spawning headless session…");
  const result = spawnSync(
    "claude",
    buildClaudeCliArgs(promptText, { maxTurns, model }),
    {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs, // 15min default — post-Phase-2 prompt heavier; ML stalled at 8.6min
      encoding: "utf8",
    }
  );

  // Parity with HTTP providers: when designMdPath is provided, write the
  // extracted DESIGN.md to disk. The Claude CLI may also have used its
  // Write tool to do this in-session; we treat the inline content as the
  // canonical source of truth and overwrite if both exist. This makes the
  // pipeline portable across LLM hosts that don't have Write tool access.
  if (designMdPath && result.stdout) {
    const content = extractDesignMdFromCliStdout(result.stdout);
    if (content) {
      try {
        fs.writeFileSync(designMdPath, content, "utf8");
      } catch (err) {
        // Non-fatal — the in-session Write tool may have already created
        // the file. Surface the failure on stderr for diagnostics.
        console.warn(`[claude-cli] inline write failed: ${err.message}`);
      }
    }
  }

  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

module.exports = { invoke, buildClaudeCliArgs, extractDesignMdFromCliStdout, isNestedClaudeCodeSession };
