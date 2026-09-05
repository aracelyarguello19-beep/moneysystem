"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const { ensureLogsDir, LOG_DIR_NAME } = require("../log-paths.cjs");

function extractDesignMd(rawContent) {
  if (!rawContent) return "";
  // Primary: front-matter at line start. Codex-cli sometimes emits DESIGN.md
  // verbatim including the leading "---" marker.
  const fmStart = rawContent.search(/^---\s*$/m);
  if (fmStart !== -1) return rawContent.slice(fmStart);
  // Fallback A: codex wraps DESIGN.md in a fenced code block (```markdown ... ```).
  const fenceMatch = rawContent.match(/```(?:markdown|md|yaml)?\s*\n(---[\s\S]*?)\n```/);
  if (fenceMatch && fenceMatch[1]) return fenceMatch[1];
  // Fallback B: prose preamble + later "## 1." section. Recover from first
  // canonical heading downward and synthesize minimal front-matter so the
  // section validator still passes. Better than 0-byte exit.
  const sectionStart = rawContent.search(/^## 1\.\s/m);
  if (sectionStart !== -1) {
    return `---\nname: codex-recovered\n---\n\n${rawContent.slice(sectionStart)}`;
  }
  return "";
}

function buildCodexCliArgs({ cwd, model, outputLastMessage, reasoningEffort } = {}) {
  const args = [
    "--sandbox", "workspace-write",
    "--ask-for-approval", "never",
  ];

  if (reasoningEffort) {
    args.push("-c", `model_reasoning_effort="${reasoningEffort}"`);
  }

  args.push(
    "exec",
    "-C", cwd || process.cwd(),
    "--ephemeral",
    "--color", "never",
  );

  if (model) {
    args.push("-m", String(model));
  }

  if (outputLastMessage) {
    args.push("--output-last-message", outputLastMessage);
  }

  args.push("-");
  return args;
}

function readTail(filePath, maxBytes = 262144) {
  if (!filePath || !fs.existsSync(filePath)) return "";
  const stat = fs.statSync(filePath);
  const start = Math.max(0, stat.size - maxBytes);
  const length = stat.size - start;
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, start);
    return buffer.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

function invoke(promptText, options = {}) {
  const envTimeout = parseInt(process.env.DESIGN_MD_TIMEOUT_MS || "", 10);
  // 1800000 ms = 30 min. Bumped from 15 min on 2026-05-08 because heavy brands
  // (Linear: 1440 CSS vars + 4 captures + ~200K-token prompt) regularly write
  // a complete DESIGN.md but don't return stdout within 15 min. The recovery
  // path in run.cjs#recoverFromDesignMdOnDisk catches the file-on-disk case
  // even if this timeout fires; this bump just reduces the frequency of the
  // recovery path being hit.
  const timeoutDefault = Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : 1800000;
  const envMaxBuffer = parseInt(process.env.DESIGN_MD_CODEX_MAX_BUFFER || "", 10);
  const maxBuffer = Number.isFinite(envMaxBuffer) && envMaxBuffer > 0
    ? envMaxBuffer
    : 64 * 1024 * 1024;
  const { cwd, model, timeoutMs = timeoutDefault } = options;
  const budgetReasoning = {
    cheap: "low",
    standard: "medium",
    premium: "high",
  };
  const reasoningEffort = options.reasoningEffort || budgetReasoning[options.budget] || null;
  const logBase = options.designMdPath
    ? (() => {
        const runDir = path.dirname(options.designMdPath);
        ensureLogsDir(runDir);
        return path.join(runDir, LOG_DIR_NAME, `${path.basename(options.designMdPath)}.codex`);
      })()
    : null;
  const lastMessagePath = logBase ? `${logBase}.last-message.txt` : null;
  const stdoutLogPath = logBase ? `${logBase}.stdout.log` : null;
  const stderrLogPath = logBase ? `${logBase}.stderr.log` : null;

  console.log("[codex-cli] spawning headless session...");
  let result;
  let stdout = "";
  let stderr = "";

  if (logBase) {
    const stdoutFd = fs.openSync(stdoutLogPath, "w");
    const stderrFd = fs.openSync(stderrLogPath, "w");
    try {
      result = spawnSync("codex", buildCodexCliArgs({ cwd, model, outputLastMessage: lastMessagePath, reasoningEffort }), {
        cwd,
        input: promptText,
        stdio: ["pipe", stdoutFd, stderrFd],
        timeout: timeoutMs,
        encoding: "utf8",
      });
    } finally {
      fs.closeSync(stdoutFd);
      fs.closeSync(stderrFd);
    }

    stdout = fs.existsSync(lastMessagePath)
      ? fs.readFileSync(lastMessagePath, "utf8")
      : readTail(stdoutLogPath, 1024 * 1024);
    stderr = [
      readTail(stderrLogPath),
      result.error ? `[codex-cli] ${result.error.message}` : "",
    ].filter(Boolean).join("\n");
  } else {
    result = spawnSync("codex", buildCodexCliArgs({ cwd, model, reasoningEffort }), {
      cwd,
      input: promptText,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: timeoutMs,
      encoding: "utf8",
      maxBuffer,
    });

    stdout = result.stdout || "";
    stderr = [
      result.stderr || "",
      result.error ? `[codex-cli] ${result.error.message}` : "",
    ].filter(Boolean).join("\n");
  }

  const content = extractDesignMd(stdout);
  const exitStatus = result.error ? 1 : (result.status ?? 0);
  const wrote = !!(options.designMdPath && content);

  if (wrote) {
    fs.writeFileSync(options.designMdPath, content, "utf8");
  }

  // Diagnostic: if exit was clean but no content was extracted, surface a
  // structured signal so run.cjs can route to the cheap→standard fallback
  // instead of hard-failing with a generic "DESIGN.md not produced".
  if (exitStatus === 0 && !wrote) {
    const stdoutPreview = stdout.slice(0, 240).replace(/\s+/g, " ").trim();
    const reason = stdout.length === 0
      ? "empty_stdout"
      : (/^## 1\.\s/m.test(stdout) ? "section_present_but_extract_failed" : "no_frontmatter_no_section");
    console.log(`[codex-cli] empty extraction (reason=${reason}, stdout=${stdout.length}b): "${stdoutPreview}${stdout.length > 240 ? "…" : ""}"`);
  }

  return {
    status: exitStatus,
    stdout,
    stderr,
    stdoutLogPath,
    stderrLogPath,
    lastMessagePath,
    designMdWritten: wrote,
    extractionReason: wrote
      ? "ok"
      : (exitStatus !== 0 ? "nonzero_exit" : (stdout.length === 0 ? "empty_stdout" : "extract_failed")),
  };
}

module.exports = { invoke, buildCodexCliArgs, extractDesignMd };
