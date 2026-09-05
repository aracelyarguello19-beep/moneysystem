"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { test } = require("node:test");

const { isLlmTransientError, fillPromptTemplate, recoverFromDesignMdOnDisk } = require("./run.cjs");

test("isLlmTransientError catches stream-idle partial responses", () => {
  assert.equal(isLlmTransientError({
    status: 1,
    stdout: "API Error: Stream idle timeout - partial response received",
    stderr: "",
  }), true);
});

test("isLlmTransientError catches Codex CLI timeout stderr", () => {
  assert.equal(isLlmTransientError({
    status: 1,
    stdout: "",
    stderr: "[codex-cli] request timed out while waiting for model response",
  }), true);
});

test("isLlmTransientError catches Codex CLI ENOBUFS stderr", () => {
  assert.equal(isLlmTransientError({
    status: 1,
    stdout: "",
    stderr: "[codex-cli] spawnSync codex ENOBUFS",
  }), true);
});

test("isLlmTransientError does not swallow max-turns failures", () => {
  assert.equal(isLlmTransientError({
    status: 1,
    stdout: '{"type":"result","subtype":"error_max_turns"}',
    stderr: "",
  }), false);
});

test("fillPromptTemplate wires brand identity and hero evidence paths", () => {
  const template = [
    "{{PROCESS_CONTRACT_PATH}}",
    "{{PROCESS_CONTRACT}}",
    "{{URL}}",
    "{{HTML_MD_PATH}}",
    "{{CSS_PATH}}",
    "{{CSS_FULL_PATH}}",
    "{{TOKENS_PATH}}",
    "{{CSS_VARS_PATH}}",
    "{{FONT_FACES_PATH}}",
    "{{USAGE_GRAPH_PATH}}",
    "{{COMPONENT_PROPS_PATH}}",
    "{{COMPONENT_STATES_PATH}}",
    "{{MOTION_PATH}}",
    "{{ASYMMETRIES_PATH}}",
    "{{SELECTOR_PROVENANCE_PATH}}",
    "{{ATOMIC_CLASSIFICATION_PATH}}",
    "{{STACK_PATH}}",
    "{{META_ASSETS_PATH}}",
    "{{LOGO_PATH}}",
    "{{FAVICON_PATH}}",
    "{{HERO_BLOCK_PATH}}",
    "{{CTA_VARIANTS_PATH}}",
    "{{STYLE_FINGERPRINT_PATH}}",
    "{{ARCHETYPE}}",
    "{{DEFAULT_THEME}}",
    "{{THEME_CONFIDENCE}}",
    "{{OUTPUT_PATH}}",
  ].join("\n");

  const filled = fillPromptTemplate(template, {
    url: "https://example.com",
    inputsDir: "/tmp/example/inputs",
    outDir: "/tmp/example",
    designMdPath: "/tmp/example/DESIGN.md",
    styleFingerprint: { classification: { primary_archetype: "shadcn-neutral" } },
    defaultTheme: "dark",
    themeConfidence: "high",
    processContract: "NO FALLBACKS CONTRACT",
    processContractPath: "/tmp/example/inputs/process-contract.json",
  });

  assert.doesNotMatch(filled, /\{\{[A-Z_]+\}\}/);
  assert.match(filled, /process-contract\.json/);
  assert.match(filled, /NO FALLBACKS CONTRACT/);
  assert.match(filled, /meta-assets\.json/);
  assert.match(filled, /component-states\.json/);
  assert.match(filled, /motion\.json/);
  assert.match(filled, /extraction-asymmetries\.json/);
  assert.match(filled, /selector-provenance\.json/);
  assert.match(filled, /atomic-classification\.json/);
  assert.match(filled, /hero-block\.json/);
  assert.match(filled, /cta-variants\.json/);
  assert.match(filled, /style-fingerprint\.json/);
  assert.match(filled, /shadcn-neutral/);
  assert.match(filled, /dark/);
  assert.match(filled, /high/);
});

test("fillPromptTemplate retry mode drops bulky token inputs only", () => {
  const template = "{{TOKENS_PATH}}\n{{USAGE_GRAPH_PATH}}\n{{META_ASSETS_PATH}}\n{{HERO_BLOCK_PATH}}\n{{CTA_VARIANTS_PATH}}\n{{STYLE_FINGERPRINT_PATH}}\n{{DEFAULT_THEME}}\n{{THEME_CONFIDENCE}}";
  const filled = fillPromptTemplate(template, {
    url: "https://example.com",
    inputsDir: "/tmp/example/inputs",
    outDir: "/tmp/example",
    designMdPath: "/tmp/example/DESIGN.md",
    styleFingerprint: { classification: { primary_archetype: "marketing-gradient" } },
    defaultTheme: "light",
    themeConfidence: "medium",
    includeTokens: false,
    includeUsageGraph: false,
  });

  assert.doesNotMatch(filled, /tokens-detected\.json/);
  assert.doesNotMatch(filled, /token-usage-graph\.json/);
  assert.match(filled, /meta-assets\.json/);
  assert.match(filled, /hero-block\.json/);
  assert.match(filled, /cta-variants\.json/);
  assert.match(filled, /style-fingerprint\.json/);
  assert.doesNotMatch(filled, /\{\{[A-Z_]+\}\}/);
});

test("fillPromptTemplate prepends process contract for custom prompts without placeholder", () => {
  const filled = fillPromptTemplate("Write {{OUTPUT_PATH}} for {{URL}}", {
    url: "https://example.com",
    inputsDir: "/tmp/example/inputs",
    outDir: "/tmp/example",
    designMdPath: "/tmp/example/DESIGN.md",
    processContract: "CONTRACT BODY",
    processContractPath: "/tmp/example/inputs/process-contract.json",
  });

  assert.match(filled, /^Process contract path: \/tmp\/example\/inputs\/process-contract\.json/);
  assert.match(filled, /CONTRACT BODY/);
  assert.match(filled, /Write \/tmp\/example\/DESIGN\.md for https:\/\/example\.com/);
  assert.doesNotMatch(filled, /\{\{[A-Z_]+\}\}/);
});

// ── recoverFromDesignMdOnDisk ─────────────────────────────────────────
// Codex-cli sometimes writes a complete DESIGN.md via tool calls but hangs
// before returning to stdout. This recovery path lets the pipeline succeed
// without retrying when the file is already valid on disk.

function writeFakeDesignMd(dir, { sections = 9, padBytes = 12000, withFrontmatter = true } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const designMdPath = path.join(dir, "DESIGN.md");
  const fm = withFrontmatter ? "---\nname: Test\nversion: 1.0\n---\n\n" : "";
  let body = "";
  for (let i = 1; i <= sections; i++) body += `## ${i}. Section ${i}\n\n${"x".repeat(80)}\n\n`;
  while ((fm + body).length < padBytes) body += "x".repeat(200) + "\n";
  fs.writeFileSync(designMdPath, fm + body);
  return designMdPath;
}

test("recoverFromDesignMdOnDisk returns null when no path", () => {
  assert.equal(recoverFromDesignMdOnDisk({}), null);
  assert.equal(recoverFromDesignMdOnDisk({ designMdPath: null }), null);
});

test("recoverFromDesignMdOnDisk returns null when file missing", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "recover-missing-"));
  const r = recoverFromDesignMdOnDisk({ designMdPath: path.join(tmp, "DESIGN.md") });
  assert.equal(r, null);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("recoverFromDesignMdOnDisk returns null when file too small", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "recover-tiny-"));
  const designMdPath = path.join(tmp, "DESIGN.md");
  fs.writeFileSync(designMdPath, "---\nname: T\n---\n## 1. Tiny");
  assert.equal(recoverFromDesignMdOnDisk({ designMdPath }), null);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("recoverFromDesignMdOnDisk returns null when frontmatter absent", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "recover-nofm-"));
  const designMdPath = writeFakeDesignMd(tmp, { withFrontmatter: false });
  assert.equal(recoverFromDesignMdOnDisk({ designMdPath }), null);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("recoverFromDesignMdOnDisk returns null when fewer than 8 sections", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "recover-fewsec-"));
  const designMdPath = writeFakeDesignMd(tmp, { sections: 5 });
  assert.equal(recoverFromDesignMdOnDisk({ designMdPath }), null);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("recoverFromDesignMdOnDisk succeeds on full DESIGN.md (≥8 sections, ≥10KB, frontmatter)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "recover-ok-"));
  const designMdPath = writeFakeDesignMd(tmp, { sections: 9, padBytes: 15000 });
  const r = recoverFromDesignMdOnDisk({ designMdPath });
  assert.ok(r, "expected truthy recovery result");
  assert.equal(r.status, 0);
  assert.equal(r.recovered, true);
  assert.equal(r.recovery.source, "design_md_on_disk");
  assert.ok(r.recovery.bytes >= 10000);
  assert.equal(r.recovery.sections, 9);
  assert.ok(r.stdout.startsWith("---\n"));
  fs.rmSync(tmp, { recursive: true, force: true });
});
