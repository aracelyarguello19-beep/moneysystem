"use strict";

/**
 * scaffold-edit — Phase B of the scaffold + LLM-edit-constrained pipeline.
 *
 * Takes a scaffold-built DESIGN.md (deterministic skeleton + extracted YAML)
 * and runs an LLM constrained edit pass: enhance prose, fill null slots from
 * sidecars, sanitize names. YAML structure is locked at the script level —
 * if the LLM violates it, scaffold YAML is restored verbatim.
 *
 * Default model: claude-haiku-4-5 (best $/quality per ADR-053).
 * Premium opt-in: claude-sonnet-4-6 (highest absolute quality).
 * Diagnostic: claude-opus-4-7.
 *
 * Returns:
 *   { ok, designMd, telemetry, structurePreserved, nullSlotsFilled, ... }
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const POLISH_MODELS = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
};

function selectModel(polish) {
  return POLISH_MODELS[polish || "haiku"] || POLISH_MODELS.haiku;
}

function buildEditPrompt({ scaffoldPath, sidecarPaths, brand, canonicalDesignPath }) {
  return [
    "TASK: enhance the prose body of an existing DESIGN.md scaffold.",
    "",
    "INPUT FILE (scaffold to edit IN-PLACE):",
    `  ${scaffoldPath}`,
    "",
    "EVIDENCE FILES (read for context, do NOT modify):",
    sidecarPaths.map((p) => `  - ${p}`).join("\n"),
    "",
    "STRICT CONSTRAINTS — VIOLATING ANY OF THESE INVALIDATES YOUR WORK:",
    "1. YAML structure is LOCKED. Do NOT add new keys, remove keys, rename keys, or reorder keys.",
    "2. Section headings (lines matching `^## ` exactly as they appear) are LOCKED.",
    "3. Use the Edit tool with `replace_all: false` to make precise replacements.",
    "4. Do NOT use the Write tool to overwrite the file.",
    "",
    "WHAT YOU MAY EDIT (within the locked structure):",
    "A. PROSE BODY: replace skeletal one-liner prose between section headings with brand-specific narrative.",
    "B. NULL SLOT FILLING: lines like `  primary: null  # extraction_gap(...)` MAY be replaced with extracted values when an obvious candidate exists in css-vars-detected.json. Mapping examples:",
    "   - colors.primary ← `--color-primary` / `--brand-500` / first hex in primary CSS class",
    "   - colors.background ← `--color-background` / `--surface` / `--bg-default`",
    "   - colors.foreground ← `--color-foreground` / `--text` / `--ink`",
    "   - colors.border ← `--color-border` / `--divider`",
    "   - colors.muted ← `--color-muted` / `--gray-400` / lower-saturation neutral",
    "   - colors.success/warning/error/info ← matching --color-success/warning/error/info or hex with semantic role",
    "   When replacing, output: `  primary: \"#XXXXXX\"  # from <source-css-var-name>` (drop the extraction_gap comment).",
    "   If no clear candidate exists, LEAVE THE NULL SLOT AS-IS (do not invent).",
    "C. NAME SANITIZATION: if `name:` field contains a corrupted value (HTML, error message, multi-line, > 80 chars, ellipsis-truncated), REPLACE it with the brand slug titled (e.g. `microsoft` → `Microsoft`).",
    "",
    "WHAT TO ENHANCE IN PROSE:",
    "- Color Palette section: name each color with brand context, cite source CSS class, explain semantic role",
    "- Components section: describe each atom from the components: YAML — variant set, hover/focus/active behavior, CSS class drivers",
    "- Typography section: describe each font role and its scale from typography: YAML",
    "- Layout, Depth, Responsive, Agent Prompt Guide: 3-6 sentences each grounded in extracted spacing/shadows/breakpoints/motion data",
    "",
    "EXECUTION POLICY:",
    "1. Read the scaffold file above.",
    "2. Read 2-3 most relevant sidecars (css-vars-detected, component-properties highest priority).",
    "3. Use Edit tool repeatedly to replace each skeletal prose paragraph with enhanced narrative.",
    "4. Do NOT plan extensively — start editing immediately, section by section.",
    "5. Stop when all sections have enhanced prose. Do NOT add a summary message.",
    "",
    `Brand slug: ${brand}`,
    "",
  ].join("\n");
}

function extractFrontmatter(md) {
  const m = md && md.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : null;
}

/**
 * Run the constrained-edit pass on a scaffold-built DESIGN.md.
 *
 * @param {object} opts
 * @param {string} opts.scaffoldMd       Scaffold DESIGN.md content (input)
 * @param {string} opts.brandDir         Canonical brand dir (where canonical DESIGN.md lives)
 * @param {string} opts.brand            Brand slug
 * @param {string} opts.polish           "haiku" | "sonnet" | "opus" (default haiku)
 * @param {object} [opts.yaml]           js-yaml module (caller-supplied to avoid duplicate require)
 * @returns {object}                     { ok, finalContent, telemetry, ... }
 */
function runScaffoldEdit({ scaffoldMd, brandDir, brand, polish = "haiku", yaml }) {
  if (!yaml) yaml = require("js-yaml");
  const model = selectModel(polish);

  const editStateDir = path.join(brandDir, ".scaffold-edit");
  fs.mkdirSync(editStateDir, { recursive: true });
  const scaffoldInputPath = path.join(editStateDir, "scaffold-input.md");
  fs.writeFileSync(scaffoldInputPath, scaffoldMd, "utf8");

  const originalFM = extractFrontmatter(scaffoldMd);
  let originalParsed = null;
  try { originalParsed = originalFM ? yaml.load(originalFM) : null; } catch {}

  const sidecarFiles = [
    "inputs/css-vars-detected.json",
    "inputs/component-properties.json",
    "inputs/font-faces.json",
    "inputs/token-usage-graph.json",
    "inputs/style-fingerprint.json",
  ];
  const availableSidecars = sidecarFiles
    .map((f) => path.join(brandDir, f))
    .filter((p) => fs.existsSync(p));

  const promptText = buildEditPrompt({
    scaffoldPath: scaffoldInputPath,
    sidecarPaths: availableSidecars,
    brand,
    canonicalDesignPath: path.join(brandDir, "DESIGN.md"),
  });
  fs.writeFileSync(path.join(editStateDir, "prompt.txt"), promptText, "utf8");

  // Stash canonical artifacts so any rogue Write lands in a safe place.
  const protectedFiles = ["DESIGN.md", "tokens.json", "render-contract.json"];
  const stash = path.join(editStateDir, `.stash.${process.pid}.${Date.now()}`);
  fs.mkdirSync(stash, { recursive: true });
  const stashed = [];
  for (const fname of protectedFiles) {
    const src = path.join(brandDir, fname);
    if (fs.existsSync(src)) {
      const dst = path.join(stash, fname);
      fs.renameSync(src, dst);
      stashed.push({ src, dst, fname });
    }
  }
  let restored = false;
  function restoreStashed() {
    if (restored) return;
    restored = true;
    for (const { src, dst, fname } of stashed) {
      try {
        if (fs.existsSync(src)) {
          const sideOut = path.join(editStateDir, `write-capture-${fname}`);
          fs.renameSync(src, sideOut);
        }
        fs.renameSync(dst, src);
      } catch {}
    }
    try { fs.rmdirSync(stash); } catch {}
  }
  process.once("exit", restoreStashed);

  const startedAt = Date.now();
  let result;
  try {
    result = spawnSync(
      "claude",
      [
        "-p", promptText,
        "--output-format", "json",
        "--allowedTools", "Read,Edit",
        "--dangerously-skip-permissions",
        "--max-turns", "30",
        "--model", model,
      ],
      {
        cwd: brandDir,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: polish === "opus" ? 1200000 : 600000,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, DESIGN_MD_ALLOW_NESTED_CLAUDE: "1" },
      }
    );
  } finally {
    restoreStashed();
  }
  const durationMs = Date.now() - startedAt;

  // Parse claude-cli telemetry envelope.
  let costUsd = null, numTurns = null, isError = null, stopReason = null;
  for (const line of (result.stdout || "").split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    let p;
    try { p = JSON.parse(t); } catch { continue; }
    if (p.type === "result") {
      if (typeof p.total_cost_usd === "number") costUsd = p.total_cost_usd;
      if (typeof p.num_turns === "number") numTurns = p.num_turns;
      if (typeof p.is_error === "boolean") isError = p.is_error;
      if (typeof p.stop_reason === "string") stopReason = p.stop_reason;
    }
  }

  // Validate YAML structure preservation.
  const editedContent = fs.existsSync(scaffoldInputPath) ? fs.readFileSync(scaffoldInputPath, "utf8") : scaffoldMd;
  const editedFM = extractFrontmatter(editedContent);
  let editedParsed = null;
  let structurePreserved = false;
  let nullSlotsFilled = 0;
  let nameSanitized = false;
  if (editedFM) {
    try { editedParsed = yaml.load(editedFM); } catch {}
    if (editedParsed && originalParsed) {
      const origTop = Object.keys(originalParsed).sort();
      const editTop = Object.keys(editedParsed).sort();
      const sameKeys = origTop.length === editTop.length && origTop.every((k, i) => k === editTop[i]);
      structurePreserved = sameKeys;
      function countNulls(o) {
        if (!o || typeof o !== "object") return 0;
        let n = 0;
        for (const v of Object.values(o)) {
          if (v === null) n += 1;
          else if (typeof v === "object") n += countNulls(v);
        }
        return n;
      }
      nullSlotsFilled = Math.max(0, countNulls(originalParsed) - countNulls(editedParsed));
      nameSanitized = originalParsed.name !== editedParsed.name;
    }
  }

  // If structure was violated, restore scaffold YAML, keep edited body.
  let finalContent = editedContent;
  if (!structurePreserved && originalFM && editedContent) {
    const editedBody = editedContent.replace(/^---\n[\s\S]*?\n---\n?/, "");
    finalContent = `---\n${originalFM}\n---\n${editedBody}`;
  }

  const proseChars = finalContent.replace(/^---\n[\s\S]*?\n---\n?/, "").length;
  const scaffoldProseChars = scaffoldMd.replace(/^---\n[\s\S]*?\n---\n?/, "").length;
  const expansionRatio = scaffoldProseChars > 0 ? proseChars / scaffoldProseChars : null;

  return {
    ok: result.status === 0 && !isError && structurePreserved,
    finalContent,
    telemetry: {
      model,
      polish,
      duration_ms: durationMs,
      cost_usd: costUsd,
      num_turns: numTurns,
      is_error: isError,
      stop_reason: stopReason,
      exit_status: result.status,
    },
    structure_preserved: structurePreserved,
    null_slots_filled: nullSlotsFilled,
    name_sanitized: nameSanitized,
    prose_chars: proseChars,
    scaffold_prose_chars: scaffoldProseChars,
    expansion_ratio: expansionRatio,
    yaml_recovered_from_scaffold: !structurePreserved,
  };
}

module.exports = { runScaffoldEdit, selectModel, POLISH_MODELS, buildEditPrompt };
