"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { test } = require("node:test");

const { validate } = require("./validate-no-fallbacks.cjs");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function makeLive(root, slug, designMd, tokens = {}, evidenceHtml = "<html></html>") {
  const dir = path.join(root, slug);
  fs.mkdirSync(path.join(dir, "inputs"), { recursive: true });
  fs.writeFileSync(path.join(dir, "DESIGN.md"), designMd);
  writeJson(path.join(dir, "tokens.json"), tokens);
  writeJson(path.join(dir, "telemetry.json"), { provider: "codex-cli" });
  fs.writeFileSync(path.join(dir, "inputs", "page.html"), evidenceHtml);
  fs.writeFileSync(path.join(dir, "inputs", "css-collected.css"), "body{}");
  writeJson(path.join(dir, "inputs", "css-vars-detected.json"), {});
  writeJson(path.join(dir, "inputs", "component-properties.json"), {});
}

test("validate reports live fallback suspects without extraction_gap markers", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "design-md-fallbacks-"));
  makeLive(root, "bad", "---\nname: Bad\n---\nUse #6a9bcc and Get started.");
  makeLive(root, "ok", "---\nname: Ok\n---\nnull # extraction_gap(no_cta_in_source)\nGet started");
  makeLive(root, "source-backed", "---\nname: Source Backed\n---\nGet started", {}, "<html>Get started</html>");
  const report = validate({ root, only: null, advisory: false, json: false });
  assert.equal(report.totals.live_extractions, 3);
  assert.deepEqual(report.failures.map((item) => item.slug), ["bad"]);
  assert.deepEqual(report.warnings.map((item) => item.slug), ["ok", "source-backed"]);
});
