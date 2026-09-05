"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { test } = require("node:test");

const {
  buildInputsManifest,
  copyAllOrNone,
  promoteOrArchive,
  ROOT_ARTIFACT_NAMES,
} = require("./reuse.cjs");

test("copyAllOrNone copies only when every required artifact exists", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "design-md-reuse-"));
  const src = path.join(tmp, "src");
  const dest = path.join(tmp, "dest");
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, "page.html"), "<html></html>");

  assert.equal(copyAllOrNone(src, dest, ["page.html", "meta-assets.json"]), false);
  assert.equal(fs.existsSync(path.join(dest, "page.html")), false);

  fs.writeFileSync(path.join(src, "meta-assets.json"), "{}");
  assert.equal(copyAllOrNone(src, dest, ["page.html", "meta-assets.json"]), true);
  assert.equal(fs.existsSync(path.join(dest, "page.html")), true);
  assert.equal(fs.existsSync(path.join(dest, "meta-assets.json")), true);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("ROOT_ARTIFACT_NAMES carries .logs/ directory (logs + diagnostics live there)", () => {
  // Since 2026-05-07 logs and run-level diagnostics live under <runDir>/.logs/.
  // ROOT_ARTIFACT_NAMES therefore lists `.logs` as a single moveable unit.
  assert.equal(ROOT_ARTIFACT_NAMES.has(".logs"), true);
  // Individual log filenames are NOT at the root anymore.
  assert.equal(ROOT_ARTIFACT_NAMES.has("DESIGN.md.codex.last-message.txt"), false);
  assert.equal(ROOT_ARTIFACT_NAMES.has("DESIGN.md.codex.stdout.log"), false);
  assert.equal(ROOT_ARTIFACT_NAMES.has("DESIGN.md.codex.stderr.log"), false);
  assert.equal(ROOT_ARTIFACT_NAMES.has("inputs-manifest.json"), false);
  assert.equal(ROOT_ARTIFACT_NAMES.has("telemetry.json"), false);
  assert.equal(ROOT_ARTIFACT_NAMES.has("extraction-log.yaml"), false);
  assert.equal(ROOT_ARTIFACT_NAMES.has("run.log.ndjson"), false);
});

test("ROOT_ARTIFACT_NAMES does not snapshot the inputs/ tree", () => {
  assert.equal(ROOT_ARTIFACT_NAMES.has("inputs"), false);
});

test("ROOT_ARTIFACT_NAMES includes modern generated sidecars", () => {
  assert.equal(ROOT_ARTIFACT_NAMES.has("render-contract.json"), true);
  assert.equal(ROOT_ARTIFACT_NAMES.has("meta-defaults.json"), true);
  assert.equal(ROOT_ARTIFACT_NAMES.has("extraction-asymmetries.md"), true);
  assert.equal(ROOT_ARTIFACT_NAMES.has("showcase.html"), true);
  assert.equal(ROOT_ARTIFACT_NAMES.has("tailwind-bundle.html"), false);
});

test("buildInputsManifest marks reused and updated input files", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "design-md-manifest-"));
  const prev = path.join(tmp, "prev");
  const next = path.join(tmp, "next");
  fs.mkdirSync(prev, { recursive: true });
  fs.mkdirSync(next, { recursive: true });
  fs.writeFileSync(path.join(prev, "page.html"), "<html>old</html>");
  fs.writeFileSync(path.join(prev, "same.json"), "{}");
  fs.writeFileSync(path.join(next, "page.html"), "<html>new</html>");
  fs.writeFileSync(path.join(next, "same.json"), "{}");
  fs.writeFileSync(path.join(next, "fresh.json"), "{\"ok\":true}");

  const manifest = buildInputsManifest({
    inputsDir: next,
    previousInputsDir: prev,
    url: "https://example.com",
    runTs: "20260507-120000",
  });

  assert.equal(manifest.summary.files, 3);
  assert.equal(manifest.summary.reused, 1);
  assert.equal(manifest.summary.updated, 1);
  assert.equal(manifest.summary.new, 1);
  assert.equal(manifest.files.find((f) => f.path === "page.html").status, "updated");
  assert.equal(manifest.files.find((f) => f.path === "same.json").status, "reused");
  assert.equal(manifest.files.find((f) => f.path === "fresh.json").status, "new");

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("promoteOrArchive archives extraction history without inputs", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "design-md-promote-"));
  const companyDir = path.join(tmp, "brand");
  const scratchDir = path.join(companyDir, ".run-20260507-120000");
  writeRun(companyDir, { quality: 80, confidence: 2, inputText: "old" });
  writeRun(scratchDir, { quality: 90, confidence: 2, inputText: "new" });

  const result = promoteOrArchive({ companyDir, scratchDir, scratchTs: "20260507-120000" });

  assert.equal(result.promoted, true);
  const historyEntries = fs.readdirSync(path.join(companyDir, "history"))
    .filter((name) => name !== "_incomplete");
  assert.equal(historyEntries.length, 1);
  const archived = path.join(companyDir, "history", historyEntries[0]);
  assert.equal(fs.existsSync(path.join(archived, "DESIGN.md")), true);
  assert.equal(fs.existsSync(path.join(archived, ".logs", "inputs-manifest.json")), true);
  assert.equal(fs.existsSync(path.join(archived, ".logs", "telemetry.json")), true);
  assert.equal(fs.existsSync(path.join(archived, ".logs", "extraction-log.yaml")), true);
  assert.equal(fs.existsSync(path.join(archived, "render-contract.json")), true);
  assert.equal(fs.existsSync(path.join(archived, "meta-defaults.json")), true);
  assert.equal(fs.existsSync(path.join(archived, "extraction-asymmetries.md")), true);
  assert.equal(fs.existsSync(path.join(archived, "inputs")), false);
  assert.equal(fs.readFileSync(path.join(companyDir, "inputs", "page.html"), "utf8"), "new");

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("promoteOrArchive archives losing extraction without inputs", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "design-md-archive-"));
  const companyDir = path.join(tmp, "brand");
  const scratchDir = path.join(companyDir, ".run-20260507-120000");
  writeRun(companyDir, { quality: 90, confidence: 2, inputText: "root" });
  writeRun(scratchDir, { quality: 70, confidence: 2, inputText: "scratch" });

  const result = promoteOrArchive({ companyDir, scratchDir, scratchTs: "20260507-120000" });

  assert.equal(result.promoted, false);
  const archived = path.join(companyDir, "history", "20260507-120000");
  assert.equal(fs.existsSync(path.join(archived, "DESIGN.md")), true);
  assert.equal(fs.existsSync(path.join(archived, ".logs", "inputs-manifest.json")), true);
  assert.equal(fs.existsSync(path.join(archived, ".logs", "telemetry.json")), true);
  assert.equal(fs.existsSync(path.join(archived, "render-contract.json")), true);
  assert.equal(fs.existsSync(path.join(archived, "meta-defaults.json")), true);
  assert.equal(fs.existsSync(path.join(archived, "extraction-asymmetries.md")), true);
  assert.equal(fs.existsSync(path.join(archived, "inputs")), false);
  assert.equal(fs.existsSync(scratchDir), false);
  assert.equal(fs.readFileSync(path.join(companyDir, "inputs", "page.html"), "utf8"), "root");

  fs.rmSync(tmp, { recursive: true, force: true });
});

function writeRun(dir, { quality, confidence, inputText }) {
  fs.mkdirSync(path.join(dir, "inputs"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".logs"), { recursive: true });
  fs.writeFileSync(path.join(dir, "inputs", "page.html"), inputText);
  fs.writeFileSync(path.join(dir, "DESIGN.md"), "---\nname: Test\n---\n");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}");
  fs.writeFileSync(path.join(dir, "tokens-extended.json"), "{}");
  fs.writeFileSync(path.join(dir, "render-contract.json"), "{}");
  fs.writeFileSync(path.join(dir, ".logs", "telemetry.json"), "{}");
  fs.writeFileSync(path.join(dir, "preview.html"), "<html></html>");
  fs.writeFileSync(path.join(dir, "lint-report.json"), JSON.stringify({ ran: true, exit_code: 0, errors_count: 0, warnings_count: 0 }));
  fs.writeFileSync(path.join(dir, "quality-score.json"), JSON.stringify({ overall: quality }));
  fs.writeFileSync(path.join(dir, ".logs", "extraction-log.yaml"), `confidence_summary:\n  high: ${confidence}\n`);
  fs.writeFileSync(path.join(dir, "style-fingerprint.json"), "{}");
  fs.writeFileSync(path.join(dir, "meta-defaults.json"), "{}");
  fs.writeFileSync(path.join(dir, ".logs", "run.log.ndjson"), "");
  fs.writeFileSync(path.join(dir, "extraction-asymmetries.md"), "# Extraction Asymmetries\n");
  fs.writeFileSync(path.join(dir, "agent-prompt.txt"), "prompt");
  fs.writeFileSync(path.join(dir, ".logs", "inputs-manifest.json"), "{}");
}
