#!/usr/bin/env node
/**
 * Backfill render-contract.json for existing extracts.
 *
 * Walks outputs/design-ops/url-extracts/{slug}/ and rebuilds
 * render-contract.json from existing inputs (tokens.json,
 * tokens-extended.json, css-collected.css). ZERO LLM cost — it
 * derives mechanically from already-extracted data.
 *
 * Use cases:
 * - Phase 2 of the design pipeline refactor: existing extracts have
 *   render-contract.json from the pre-Phase-3 contract emitter; backfill
 *   regenerates them with current scoring + warnings.
 * - Cold-cache rebuild after schema changes.
 *
 * Usage:
 *   node squads/design-ops/scripts/extract-from-url/scripts/backfill-render-contract.cjs [--dry-run] [--only=slug1,slug2]
 *
 * Exit codes: 0 ok · 1 error · 2 no-op (no extracts found)
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const EXTRACTS_ROOT = path.join(REPO_ROOT, "outputs", "design-ops", "url-extracts");

const { buildRenderContractFromRunDir } = require("../lib/render-contract.cjs");

function parseArgs(argv) {
  const args = { dryRun: false, only: null };
  for (const a of argv) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--only=")) args.only = new Set(a.slice(7).split(",").map((s) => s.trim()).filter(Boolean));
  }
  return args;
}

function listExtracts(filterSet) {
  if (!fs.existsSync(EXTRACTS_ROOT)) return [];
  return fs.readdirSync(EXTRACTS_ROOT)
    .filter((name) => {
      const p = path.join(EXTRACTS_ROOT, name);
      if (!fs.statSync(p).isDirectory()) return false;
      if (name.startsWith(".") || name.startsWith("_")) return false;
      if (filterSet && !filterSet.has(name)) return false;
      return fs.existsSync(path.join(p, "DESIGN.md"))
        && fs.existsSync(path.join(p, "tokens.json"))
        && fs.existsSync(path.join(p, "inputs", "css-collected.css"));
    });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const slugs = listExtracts(args.only);

  if (slugs.length === 0) {
    console.error("[backfill-render-contract] no eligible extracts found");
    process.exit(2);
  }

  console.log(`[backfill-render-contract] ${slugs.length} extracts ${args.dryRun ? "(dry-run)" : ""}`);
  let ok = 0, fail = 0, skipped = 0;

  for (const slug of slugs) {
    const runDir = path.join(EXTRACTS_ROOT, slug);
    const target = path.join(runDir, "render-contract.json");
    try {
      const contract = buildRenderContractFromRunDir(runDir);
      if (!contract || typeof contract !== "object") {
        skipped++;
        console.log(`  skip ${slug}: contract empty`);
        continue;
      }
      if (args.dryRun) {
        const fields = Object.keys(contract).join(",");
        console.log(`  dry  ${slug}: would write ${target.replace(REPO_ROOT + "/", "")} (fields: ${fields})`);
      } else {
        fs.writeFileSync(target, JSON.stringify(contract, null, 2) + "\n");
        const sizeKb = (fs.statSync(target).size / 1024).toFixed(1);
        console.log(`  ok   ${slug}: ${sizeKb}KB`);
      }
      ok++;
    } catch (err) {
      fail++;
      console.error(`  fail ${slug}: ${err.message}`);
    }
  }

  console.log(`[backfill-render-contract] done — ${ok} ok, ${fail} fail, ${skipped} skipped`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
