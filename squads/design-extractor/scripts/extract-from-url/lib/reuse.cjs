"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { scoreRun } = require("./scoring.cjs");
const { LOG_DIR_NAME, logWritePath, logReadPath } = require("./log-paths.cjs");

// A4: TTL split per-phase. Static fetch artifacts (HTML/CSS/heuristics) age
// well — the same site rarely changes more than once a week. The LLM output
// is more sensitive (prompt template evolves) and uses a tighter TTL.
//   - DEFAULT applies to fetch/collect/detect/markdown
//   - LLM_DEFAULT applies to LLM-output reuse (matched by model + prompt content)
// Both are overridable via env DESIGN_MD_CACHE_HOURS / DESIGN_MD_LLM_CACHE_HOURS
// or the --max-cache-age <hours> flag at the run.cjs level.
const FRESH_MS_DEFAULT = (() => {
  const h = parseFloat(process.env.DESIGN_MD_CACHE_HOURS);
  return (Number.isFinite(h) && h > 0 ? h : 24 * 7) * 60 * 60 * 1000; // 7d default
})();
const FRESH_LLM_MS_DEFAULT = (() => {
  const h = parseFloat(process.env.DESIGN_MD_LLM_CACHE_HOURS);
  return (Number.isFinite(h) && h > 0 ? h : 24) * 60 * 60 * 1000; // 24h default
})();

// Files (and directories) that live at the run root and should be moved when
// archiving an extraction into history. `inputs/` is intentionally excluded:
// inputs are the current reusable evidence state, while history records each
// extraction that ran against that state via .logs/inputs-manifest.json.
//
// The `.logs/` directory carries diagnostic artifacts (codex stdout/stderr/
// last-message, run.log.ndjson, telemetry.json, extraction-log.yaml,
// inputs-manifest.json) and is treated as a single moveable unit.
const ROOT_ARTIFACT_NAMES = new Set([
  "DESIGN.md", "DESIGN.md.raw",
  "tokens.json", "tokens-extended.json",
  "render-contract.json", "meta-defaults.json",
  "preview.html",
  "lint-report.json", "quality-score.json",
  "style-fingerprint.json",
  "extraction-asymmetries.md", "agent-prompt.txt", "drift-report.json",
  "showcase.html", "preview-duplicate.json", "no-fallbacks-report.json",
  "crash-context.json", "extraction-class.json",
  // `.logs/` directory — treated as a single moveable unit.
  LOG_DIR_NAME,
]);

// "Previous run" for cache lookup is the current `{company}/` root, since after
// migration that dir holds the latest "best" extraction. The currentRunDir
// (a scratch dir like {company}/.run-{ts}/) is excluded.
function findLatestRunForUrl({ outputsDir, company, currentRunDir }) {
  if (!company) return null;
  const companyDir = path.join(outputsDir, company);
  if (!fs.existsSync(companyDir)) return null;
  if (path.resolve(companyDir) === path.resolve(currentRunDir || "")) return null;
  // A useful previous run requires at minimum page.html + DESIGN.md
  if (!fs.existsSync(path.join(companyDir, "inputs", "page.html"))) return null;
  return companyDir;
}

function dirAgeMs(dir) {
  try {
    // Use page.html mtime if present (more stable than dir mtime which changes on history/ writes)
    const pageHtml = path.join(dir, "inputs", "page.html");
    if (fs.existsSync(pageHtml)) return Date.now() - fs.statSync(pageHtml).mtimeMs;
    return Date.now() - fs.statSync(dir).mtimeMs;
  } catch {
    return Infinity;
  }
}

function isFresh(dir, maxMs = FRESH_MS_DEFAULT) {
  return dirAgeMs(dir) < maxMs;
}

function copyIfExists(srcPath, destPath) {
  if (!fs.existsSync(srcPath)) return false;
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  cloneOrCopyFile(srcPath, destPath);
  return true;
}

function copyAllOrNone(srcDir, destDir, filenames) {
  const srcs = filenames.map((f) => path.join(srcDir, f));
  if (!srcs.every((p) => fs.existsSync(p))) return false;
  for (const f of filenames) {
    const src = path.join(srcDir, f);
    const dest = path.join(destDir, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    cloneOrCopyFile(src, dest);
  }
  return true;
}

function cloneOrCopyFile(src, dest) {
  try {
    fs.copyFileSync(src, dest, fs.constants.COPYFILE_FICLONE);
  } catch {
    fs.copyFileSync(src, dest);
  }
}

function listFilesRecursive(dir, base = dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath, base));
    } else if (entry.isFile()) {
      files.push(path.relative(base, fullPath).split(path.sep).join("/"));
    }
  }
  return files.sort();
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function buildInputsManifest({ inputsDir, previousInputsDir = null, url = null, runTs = null, reuseTrace = null }) {
  const files = [];
  for (const rel of listFilesRecursive(inputsDir)) {
    const filePath = path.join(inputsDir, rel);
    const stat = fs.statSync(filePath);
    const sha256 = sha256File(filePath);
    const prevPath = previousInputsDir ? path.join(previousInputsDir, rel) : null;
    let status = "new";
    let previousSha256 = null;
    if (prevPath && fs.existsSync(prevPath) && fs.statSync(prevPath).isFile()) {
      previousSha256 = sha256File(prevPath);
      status = previousSha256 === sha256 ? "reused" : "updated";
    }
    files.push({
      path: rel,
      bytes: stat.size,
      sha256,
      status,
      previous_sha256: previousSha256,
    });
  }

  return {
    schema_version: "1.0",
    url,
    run_ts: runTs,
    generated_at: new Date().toISOString(),
    inputs_dir: "inputs",
    strategy: "current-inputs-plus-extraction-history",
    summary: files.reduce((acc, file) => {
      acc.files += 1;
      acc.bytes += file.bytes;
      acc[file.status] = (acc[file.status] || 0) + 1;
      return acc;
    }, { files: 0, bytes: 0, new: 0, updated: 0, reused: 0 }),
    reuse_trace: reuseTrace || undefined,
    files,
  };
}

function writeInputsManifest({ outDir, inputsDir, previousInputsDir = null, url = null, runTs = null, reuseTrace = null }) {
  const manifest = buildInputsManifest({ inputsDir, previousInputsDir, url, runTs, reuseTrace });
  fs.writeFileSync(logWritePath(outDir, "inputs-manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

function readPrevTelemetryModel(previousRunDir) {
  if (!previousRunDir) return null;
  const telemetryPath = logReadPath(previousRunDir, "telemetry.json");
  if (!fs.existsSync(telemetryPath)) return null;
  try {
    const t = JSON.parse(fs.readFileSync(telemetryPath, "utf8"));
    return t?.llm?.model || null;
  } catch {
    return null;
  }
}

function readPrevTelemetry(previousRunDir) {
  if (!previousRunDir) return null;
  const telemetryPath = logReadPath(previousRunDir, "telemetry.json");
  if (!fs.existsSync(telemetryPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(telemetryPath, "utf8"));
  } catch {
    return null;
  }
}

function normalizePromptForComparison(prompt) {
  return prompt.replace(
    /(?:\/[^\s"']*?\/)?outputs\/design-ops\/url-extracts\/[^\s"']+/g,
    "outputs/design-ops/url-extracts/RUN"
  );
}

function promptsEqual(a, b) {
  return normalizePromptForComparison(a) === normalizePromptForComparison(b);
}

// Recursively move src to dest. Uses fs.renameSync first (cheap intra-volume),
// falls back to copy+remove on EXDEV (cross-volume) or EBUSY.
function moveDir(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if (err.code === "EXDEV" || err.code === "EBUSY") {
      fs.cpSync(src, dest, { recursive: true });
      fs.rmSync(src, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
}

// At end of pipeline: compare scratch run vs current company root.
// New best → archive root to history/{prev-ts}, promote scratch to root.
// New worse (or no prev root) → if no root exists, scratch becomes root anyway.
//                              → if prev root better, scratch goes to history/{this-ts}.
function promoteOrArchive({ companyDir, scratchDir, scratchTs }) {
  fs.mkdirSync(companyDir, { recursive: true });
  const historyDir = path.join(companyDir, "history");
  fs.mkdirSync(historyDir, { recursive: true });

  const newScore = scoreRun(scratchDir);
  const rootHasArtifacts = fs.existsSync(path.join(companyDir, "inputs", "page.html")) ||
                           fs.existsSync(path.join(companyDir, "DESIGN.md"));

  // No previous root → just promote scratch
  if (!rootHasArtifacts) {
    moveScratchToRoot(scratchDir, companyDir);
    return { promoted: true, reason: "no-previous-root", newScore, prevScore: null };
  }

  const prevScore = scoreRun(companyDir);

  // Decision rule (prioritize COMPLETENESS, then quality):
  //   1. New must have DESIGN.md (sanity gate)
  //   2. If new is complete AND prev is incomplete → new wins (more analyses present)
  //   3. If prev is complete AND new is incomplete → prev wins
  //   4. Same completeness level → higher score wins (ties go to new)
  let newWins = false;
  let reason = "";
  if (!newScore.hasDesignMd) {
    newWins = false;
    reason = "new-has-no-design-md";
  } else if (newScore.complete && !prevScore.complete) {
    newWins = true;
    reason = "new-complete-prev-incomplete";
  } else if (!newScore.complete && prevScore.complete) {
    newWins = false;
    reason = "prev-complete-new-incomplete";
  } else {
    newWins = newScore.value >= prevScore.value;
    reason = newWins ? "new-better-or-equal-score" : "previous-better-score";
  }

  if (newWins) {
    // Archive previous root → history/{prev-ts}
    const prevTs = derivePrevTs(companyDir) || "preexisting-" + Date.now();
    const archiveTarget = path.join(historyDir, prevTs);
    archiveRootToHistory(companyDir, archiveTarget);
    // Promote scratch to root
    moveScratchToRoot(scratchDir, companyDir);
    return { promoted: true, reason, newScore, prevScore, archivedAs: prevTs };
  }

  // New loses → only extraction artifacts go to history. `inputs/` is current
  // reusable evidence and must not be snapshotted per run.
  const archiveTarget = path.join(historyDir, scratchTs);
  archiveRunArtifactsToHistory(scratchDir, archiveTarget);
  fs.rmSync(scratchDir, { recursive: true, force: true });
  return { promoted: false, reason, newScore, prevScore };
}

function archiveScratchWithoutPromotion({ companyDir, scratchDir, scratchTs, reason, newScore = null }) {
  fs.mkdirSync(companyDir, { recursive: true });
  const historyDir = path.join(companyDir, "history");
  fs.mkdirSync(historyDir, { recursive: true });
  const rootHasArtifacts = fs.existsSync(path.join(companyDir, "inputs", "page.html")) ||
                           fs.existsSync(path.join(companyDir, "DESIGN.md"));
  const archiveTarget = path.join(historyDir, scratchTs);
  archiveRunArtifactsToHistory(scratchDir, archiveTarget);
  fs.rmSync(scratchDir, { recursive: true, force: true });
  return {
    promoted: false,
    blocked: true,
    reason,
    newScore: newScore || scoreRun(archiveTarget),
    prevScore: rootHasArtifacts ? scoreRun(companyDir) : null,
    archivedAs: scratchTs,
  };
}

function derivePrevTs(companyDir) {
  // Try telemetry.json schema_version was added with reuse — read URL+timestamp from there
  const telemetryPath = logReadPath(companyDir, "telemetry.json");
  if (fs.existsSync(telemetryPath)) {
    try {
      const t = JSON.parse(fs.readFileSync(telemetryPath, "utf8"));
      // Format: extract from page.html mtime as fallback
      const mtime = fs.statSync(path.join(companyDir, "inputs", "page.html")).mtime;
      return mtimeToTs(mtime);
    } catch {}
  }
  // Fallback: derive timestamp from the inputs/page.html mtime
  try {
    const mtime = fs.statSync(path.join(companyDir, "inputs", "page.html")).mtime;
    return mtimeToTs(mtime);
  } catch {
    return null;
  }
}

function mtimeToTs(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function archiveRootToHistory(companyDir, archiveDir) {
  archiveRunArtifactsToHistory(companyDir, archiveDir, { skip: new Set(["history"]) });
}

function archiveRunArtifactsToHistory(runDir, archiveDir, { skip = new Set() } = {}) {
  fs.mkdirSync(archiveDir, { recursive: true });
  for (const item of fs.readdirSync(runDir)) {
    if (skip.has(item)) continue;
    if (item === "history") continue; // never move the history dir into itself
    if (!ROOT_ARTIFACT_NAMES.has(item)) continue;
    const src = path.join(runDir, item);
    const dest = path.join(archiveDir, item);
    moveDir(src, dest);
  }
}

function moveScratchToRoot(scratchDir, companyDir) {
  for (const item of fs.readdirSync(scratchDir)) {
    const src = path.join(scratchDir, item);
    const dest = path.join(companyDir, item);
    if (fs.existsSync(dest)) {
      // Defensive: remove leftover before move (root should be cleared by archive step)
      fs.rmSync(dest, { recursive: true, force: true });
    }
    moveDir(src, dest);
  }
  // Remove now-empty scratch dir
  try { fs.rmdirSync(scratchDir); } catch {}
}

module.exports = {
  FRESH_MS_DEFAULT,
  FRESH_LLM_MS_DEFAULT,
  findLatestRunForUrl,
  dirAgeMs,
  isFresh,
  copyIfExists,
  copyAllOrNone,
  readPrevTelemetryModel,
  readPrevTelemetry,
  normalizePromptForComparison,
  promptsEqual,
  promoteOrArchive,
  archiveScratchWithoutPromotion,
  moveDir,
  buildInputsManifest,
  writeInputsManifest,
  archiveRunArtifactsToHistory,
  ROOT_ARTIFACT_NAMES,
};
