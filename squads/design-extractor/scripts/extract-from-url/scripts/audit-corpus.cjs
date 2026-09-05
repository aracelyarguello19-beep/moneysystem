#!/usr/bin/env node
/**
 * Audit and optionally backfill extraction-class metadata for all historical
 * design-md extractions. This is deterministic: it never calls a network or LLM.
 *
 * Usage:
 *   node squads/design-ops/scripts/extract-from-url/scripts/audit-corpus.cjs
 *   node squads/design-ops/scripts/extract-from-url/scripts/audit-corpus.cjs --write --history --annotate-telemetry
 *   node squads/design-ops/scripts/extract-from-url/scripts/audit-corpus.cjs --write --history --archive-scratch
 *   node squads/design-ops/scripts/extract-from-url/scripts/audit-corpus.cjs --only=youtube,itau --verbose
 */
"use strict";

const fs = require("fs");
const path = require("path");

const {
  classifyRunDir,
  annotateTelemetry,
  writeExtractionClass,
} = require("../lib/extraction-classifier.cjs");
const { logReadPath } = require("../lib/log-paths.cjs");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const DEFAULT_EXTRACTS_ROOT = path.join(REPO_ROOT, "outputs", "design-ops", "url-extracts");

function parseArgs(argv) {
  const args = {
    root: DEFAULT_EXTRACTS_ROOT,
    write: false,
    history: false,
    annotateTelemetry: false,
    archiveScratch: false,
    verbose: false,
    only: null,
    report: true,
  };
  for (const arg of argv) {
    if (arg === "--write") args.write = true;
    else if (arg === "--history") args.history = true;
    else if (arg === "--annotate-telemetry") args.annotateTelemetry = true;
    else if (arg === "--archive-scratch") args.archiveScratch = true;
    else if (arg === "--verbose") args.verbose = true;
    else if (arg === "--no-report") args.report = false;
    else if (arg.startsWith("--root=")) args.root = path.resolve(arg.slice(7));
    else if (arg.startsWith("--only=")) {
      args.only = new Set(arg.slice(7).split(",").map((item) => item.trim()).filter(Boolean));
    }
  }
  return args;
}

function readJson(filePath) {
  try {
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function listBrandDirs(root, only) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith(".") && !name.startsWith("_"))
    .filter((name) => !only || only.has(name))
    .sort((a, b) => a.localeCompare(b));
}

function listHistoryRunDirs(brandDir) {
  const historyDir = path.join(brandDir, "history");
  if (!fs.existsSync(historyDir)) return [];
  const entries = [];
  for (const entry of fs.readdirSync(historyDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "_incomplete") {
      const incompleteDir = path.join(historyDir, entry.name);
      for (const nested of fs.readdirSync(incompleteDir, { withFileTypes: true })) {
        if (nested.isDirectory()) entries.push({ name: `_incomplete/${nested.name}`, dir: path.join(incompleteDir, nested.name) });
      }
    } else {
      entries.push({ name: entry.name, dir: path.join(historyDir, entry.name) });
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function listScratchRunDirs(brandDir) {
  return fs.readdirSync(brandDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(".run-"))
    .map((entry) => ({ name: entry.name, dir: path.join(brandDir, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

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

function uniqueArchiveDir(incompleteDir, baseName) {
  let candidate = path.join(incompleteDir, baseName);
  if (!fs.existsSync(candidate)) return candidate;
  let index = 2;
  while (true) {
    candidate = path.join(incompleteDir, `${baseName}-${index}`);
    if (!fs.existsSync(candidate)) return candidate;
    index++;
  }
}

function archiveScratchRuns(brandDir, args) {
  if (!args.archiveScratch) return [];
  if (!args.write) return [];
  const archived = [];
  const scratchRuns = listScratchRunDirs(brandDir);
  if (scratchRuns.length === 0) return archived;
  const incompleteDir = path.join(brandDir, "history", "_incomplete");
  fs.mkdirSync(incompleteDir, { recursive: true });
  for (const scratch of scratchRuns) {
    const ts = scratch.name.replace(/^\.run-/, "");
    const target = uniqueArchiveDir(incompleteDir, ts);
    moveDir(scratch.dir, target);
    archived.push({
      from: scratch.name,
      to: path.relative(REPO_ROOT, target),
    });
  }
  return archived;
}

function hasHistoryInputs(brandDir) {
  const historyDir = path.join(brandDir, "history");
  if (!fs.existsSync(historyDir)) return false;
  const stack = [historyDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "inputs") return true;
        stack.push(full);
      }
    }
  }
  return false;
}

function maybeWriteClassification(runDir, classification, args) {
  if (!args.write) return { wroteClass: false, wroteTelemetry: false };
  writeExtractionClass(runDir, classification);
  let wroteTelemetry = false;
  if (args.annotateTelemetry) {
    const telemetryPath = logReadPath(runDir, "telemetry.json");
    const telemetry = readJson(telemetryPath);
    if (telemetry) {
      writeJson(telemetryPath, annotateTelemetry(telemetry, classification));
      wroteTelemetry = true;
    }
  }
  return { wroteClass: true, wroteTelemetry };
}

function countBy(items, selector) {
  const counts = {};
  for (const item of items) {
    const key = selector(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function inspectCorpus(args) {
  const brands = listBrandDirs(args.root, args.only);
  const items = [];
  let wroteClass = 0;
  let wroteTelemetry = 0;
  const archivedScratchRuns = [];

  for (const slug of brands) {
    const brandDir = path.join(args.root, slug);
    const archivedForBrand = archiveScratchRuns(brandDir, args);
    for (const archived of archivedForBrand) archivedScratchRuns.push({ slug, ...archived });
    const rootClass = classifyRunDir(brandDir, { slug });
    rootClass.scope = "root";
    rootClass.relative_dir = path.relative(REPO_ROOT, brandDir);
    rootClass.history_inputs_present = hasHistoryInputs(brandDir);
    const writeResult = maybeWriteClassification(brandDir, rootClass, args);
    if (writeResult.wroteClass) wroteClass++;
    if (writeResult.wroteTelemetry) wroteTelemetry++;
    items.push(rootClass);
    if (args.verbose) {
      console.log(`[audit-corpus] ${slug}: ${rootClass.operational_mode}/${rootClass.status} rec=${rootClass.recommendations.join(",")}`);
    }

    if (!args.history) continue;
    for (const scratch of listScratchRunDirs(brandDir)) {
      const scratchClass = classifyRunDir(scratch.dir, { slug, runTs: scratch.name.replace(/^\.run-/, "") });
      scratchClass.scope = "scratch";
      scratchClass.history_entry = scratch.name;
      scratchClass.relative_dir = path.relative(REPO_ROOT, scratch.dir);
      const scratchWrite = maybeWriteClassification(scratch.dir, scratchClass, args);
      if (scratchWrite.wroteClass) wroteClass++;
      if (scratchWrite.wroteTelemetry) wroteTelemetry++;
      items.push(scratchClass);
    }
    for (const history of listHistoryRunDirs(brandDir)) {
      const historyClass = classifyRunDir(history.dir, { slug, runTs: history.name });
      historyClass.scope = "history";
      historyClass.history_entry = history.name;
      historyClass.relative_dir = path.relative(REPO_ROOT, history.dir);
      const historyWrite = maybeWriteClassification(history.dir, historyClass, args);
      if (historyWrite.wroteClass) wroteClass++;
      if (historyWrite.wroteTelemetry) wroteTelemetry++;
      items.push(historyClass);
    }
  }

  const roots = items.filter((item) => item.scope === "root");
  const history = items.filter((item) => item.scope === "history");
  const scratch = items.filter((item) => item.scope === "scratch");
  const fallbackSuspects = roots.filter((item) => item.evidence.fallback_suspects.length > 0);
  const noGapLive = roots.filter((item) =>
    item.operational_mode === "live_extraction" &&
    item.evidence.extraction_gap_count === 0
  );

  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    source_root: path.relative(REPO_ROOT, args.root),
    write_mode: args.write,
    history_included: args.history,
    annotate_telemetry: args.annotateTelemetry,
    wrote: {
      extraction_class_files: wroteClass,
      telemetry_files: wroteTelemetry,
    },
    totals: {
      roots: roots.length,
      history_runs: history.length,
      scratch_runs: scratch.length,
      all_runs: items.length,
      scratch_runs_archived: archivedScratchRuns.length,
      incomplete_roots: roots.filter((item) => item.status !== "complete").length,
      roots_with_scratch_runs: roots.filter((item) => item.artifacts.scratch_runs_present > 0).length,
      roots_with_history_inputs: roots.filter((item) => item.history_inputs_present).length,
      roots_with_base64_preview: roots.filter((item) => item.evidence.base64_occurrences > 0).length,
      live_roots_without_extraction_gaps: noGapLive.length,
      roots_with_fallback_suspects: fallbackSuspects.length,
    },
    root_modes: countBy(roots, (item) => item.operational_mode),
    root_statuses: countBy(roots, (item) => item.status),
    run_modes: countBy(items, (item) => item.operational_mode),
    archived_scratch_runs: archivedScratchRuns,
    recommendations: countBy(roots.flatMap((item) => item.recommendations.map((rec) => ({ rec }))), (item) => item.rec),
    priority_review: roots
      .filter((item) => item.status !== "complete" || item.evidence.fallback_suspects.length > 0 || item.history_inputs_present)
      .map((item) => ({
        slug: item.slug,
        mode: item.operational_mode,
        status: item.status,
        fallback_suspects: item.evidence.fallback_suspects.map((suspect) => `${suspect.id}:${suspect.count}`),
        extraction_gap_count: item.evidence.extraction_gap_count,
        core_missing: item.artifacts.required_missing,
        history_inputs_present: item.history_inputs_present,
        recommendations: item.recommendations,
      })),
    items,
  };
}

function table(headers, rows) {
  const header = `| ${headers.join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map((cell) => String(cell ?? "").replace(/\n/g, " ")).join(" | ")} |`).join("\n");
  return [header, divider, body].filter(Boolean).join("\n");
}

function renderMarkdown(audit) {
  const modeRows = Object.entries(audit.root_modes).sort((a, b) => b[1] - a[1]);
  const statusRows = Object.entries(audit.root_statuses).sort((a, b) => b[1] - a[1]);
  const recommendationRows = Object.entries(audit.recommendations).sort((a, b) => b[1] - a[1]);
  const reviewRows = audit.priority_review.slice(0, 80).map((item) => [
    item.slug,
    item.mode,
    item.status,
    item.extraction_gap_count,
    item.fallback_suspects.join(", "),
    item.core_missing.join(", "),
    item.history_inputs_present ? "yes" : "no",
    item.recommendations.join(", "),
  ]);

  return `# design-md Corpus Audit

Generated: ${audit.generated_at}

Source: \`${audit.source_root}\`

## Summary

${table(
  ["Metric", "Value"],
  [
    ["Root brand dirs", audit.totals.roots],
    ["History runs included", audit.totals.history_runs],
    ["Scratch runs included", audit.totals.scratch_runs],
    ["Scratch runs archived", audit.totals.scratch_runs_archived],
    ["Incomplete roots", audit.totals.incomplete_roots],
    ["Roots with scratch runs still present", audit.totals.roots_with_scratch_runs],
    ["Roots with history inputs still present", audit.totals.roots_with_history_inputs],
    ["Roots with base64 in preview/showcase", audit.totals.roots_with_base64_preview],
    ["Live roots without extraction_gap markers", audit.totals.live_roots_without_extraction_gaps],
    ["Roots with fallback suspects", audit.totals.roots_with_fallback_suspects],
    ["extraction-class.json files written", audit.wrote.extraction_class_files],
    ["telemetry.json files annotated", audit.wrote.telemetry_files],
  ],
)}

## Root Modes

${table(["Mode", "Count"], modeRows)}

## Root Statuses

${table(["Status", "Count"], statusRows)}

## Recommendations

${table(["Recommendation", "Count"], recommendationRows)}

## Priority Review

${reviewRows.length === 0 ? "No priority review items." : table(
  ["Slug", "Mode", "Status", "Gaps", "Fallback suspects", "Core missing", "History inputs", "Recommendations"],
  reviewRows,
)}

## Script Improvements Implied

1. Keep \`extraction-class.json\` as the first file to inspect in every output directory.
2. Exclude \`imported_curated_md\` and \`curated_orphan\` from live extraction coverage.
3. Treat fallback suspects as review signals unless paired with explicit \`extraction_gap(...)\` evidence.
4. Keep \`inputs/\` only at the current root and store history as extraction artifacts plus \`inputs-manifest.json\`.
5. Use this report before rerunning LLM; only incomplete, failed, or fallback-suspect live roots need reextraction.
`;
}

function writeReport(audit, root) {
  const reportDir = path.join(root, "_reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, "corpus-audit-latest.json");
  const mdPath = path.join(reportDir, "corpus-audit-latest.md");
  writeJson(jsonPath, audit);
  fs.writeFileSync(mdPath, renderMarkdown(audit));
  return { jsonPath, mdPath };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.archiveScratch && !args.write) {
    console.warn("[audit-corpus] --archive-scratch is dry-run only without --write; no directories will be moved");
  }
  if (!fs.existsSync(args.root)) {
    console.error(`[audit-corpus] extracts root not found: ${args.root}`);
    process.exit(2);
  }
  const audit = inspectCorpus(args);
  let reportPaths = null;
  if (args.report) reportPaths = writeReport(audit, args.root);

  console.log(`[audit-corpus] roots=${audit.totals.roots} history=${audit.totals.history_runs} incomplete=${audit.totals.incomplete_roots}`);
  console.log(`[audit-corpus] modes=${JSON.stringify(audit.root_modes)}`);
  console.log(`[audit-corpus] wrote class=${audit.wrote.extraction_class_files} telemetry=${audit.wrote.telemetry_files}`);
  if (reportPaths) {
    console.log(`[audit-corpus] report=${path.relative(REPO_ROOT, reportPaths.mdPath)}`);
    console.log(`[audit-corpus] json=${path.relative(REPO_ROOT, reportPaths.jsonPath)}`);
  }
}

if (require.main === module) main();

module.exports = {
  inspectCorpus,
  renderMarkdown,
};
