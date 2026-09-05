"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  buildShowcaseHtml,
  buildTailwindBundle,
  renderPaletteSection,
  renderTypographySection,
  renderButtonMatrixSection,
  renderMotionSection,
  renderAsymmetriesSection,
  escapeHtml,
} = require("./tailwind-bundle-builder.cjs");

test("escapeHtml escapes html special chars", () => {
  assert.equal(escapeHtml("<a href=\"x\">&"), "&lt;a href=&quot;x&quot;&gt;&amp;");
  assert.equal(escapeHtml(null), "");
});

test("renderPaletteSection emits swatches with provenance hints", () => {
  const tokens = { colors: { primary: "#1a8917", text: "#242424" } };
  const provenance = {
    colors: {
      "#1a8917": { selectors: [{ selector: ".em", property: "background" }], primary_context: "background" },
      "#242424": { selectors: [{ selector: ".x h2", property: "color" }], primary_context: "color" },
    },
  };
  const html = renderPaletteSection(tokens, provenance);
  assert.match(html, /Source-verified palette/);
  assert.match(html, /#1a8917/);
  assert.match(html, /\.em.*?\(background\)/);
});

test("renderPaletteSection returns empty string when no colors", () => {
  assert.equal(renderPaletteSection({}, {}), "");
});

test("renderTypographySection emits one specimen per style", () => {
  const tokens = {
    typography: {
      h1: { fontFamily: "GT Super, serif", fontSize: "70px", fontWeight: 600, lineHeight: "74px", letterSpacing: "-0.05em" },
      body: { fontFamily: "sohne, sans-serif", fontSize: "14px" },
    },
  };
  const html = renderTypographySection(tokens);
  assert.match(html, /Typography/);
  assert.match(html, /h1/);
  assert.match(html, /70px/);
  assert.match(html, /body/);
});

test("renderButtonMatrixSection renders matrix when states_present non-empty", () => {
  const componentStates = {
    summary: { states_present: ["hover", "disabled"], states_absent: ["focus", "active"] },
    state_value_palette: {
      hover_backgrounds: ["#156d12"],
      disabled_opacities: ["0.1", "0.3"],
      disabled_cursors: ["not-allowed"],
    },
  };
  const html = renderButtonMatrixSection(componentStates);
  assert.match(html, /Interaction state palette/);
  assert.match(html, /#156d12/);
  assert.match(html, /states absent: focus, active/);
});

test("renderButtonMatrixSection returns empty when no states present", () => {
  assert.equal(renderButtonMatrixSection({ summary: { states_present: [] } }), "");
});

test("renderMotionSection renders transition table + keyframe blocks", () => {
  const motion = {
    transitions: [{ property: "background-color", duration: "300ms", timing: "linear", count: 2 }],
    keyframe_bodies: { k1: "from{transform:rotate(0deg)}to{transform:rotate(360deg)}" },
  };
  const html = renderMotionSection(motion);
  assert.match(html, /Motion language/);
  assert.match(html, /background-color/);
  assert.match(html, /300ms/);
  assert.match(html, /@keyframes k1/);
  assert.match(html, /rotate\(0deg\)/);
});

test("renderAsymmetriesSection lists each asymmetry with category + severity", () => {
  const report = {
    asymmetries: [
      { id: "shadow-absence", category: "absence", severity: "high", title: "Zero shadows", description: "Flat aesthetic", design_implication: "No shadows in render", evidence: {} },
    ],
  };
  const html = renderAsymmetriesSection(report);
  assert.match(html, /Asymmetries/);
  assert.match(html, /Zero shadows/);
  assert.match(html, /high/);
  assert.match(html, /No shadows in render/);
});

test("buildShowcaseHtml composes header + sections + footer", () => {
  const ctx = {
    brand: "medium",
    url: "https://medium.com",
    tokens: { name: "Medium", colors: { primary: "#1a8917" } },
    componentStates: {
      summary: { states_present: ["hover"], states_absent: ["focus"] },
      state_value_palette: { hover_backgrounds: ["#156d12"] },
    },
    motion: { transitions: [{ property: "color", duration: "300ms", timing: "linear", count: 1 }] },
    asymmetryReport: {
      asymmetries: [{ id: "x", category: "absence", severity: "high", title: "T", description: "D", design_implication: "I", evidence: {} }],
    },
  };
  const html = buildShowcaseHtml(ctx);
  assert.match(html, /<!doctype html>/);
  assert.match(html, /Atomic Design Showcase/);
  assert.match(html, /Visualization of DESIGN\.md tokens\. SOT is DESIGN\.md\./);
  assert.match(html, /https:\/\/medium\.com/);
  assert.match(html, /tailwindcss\/browser@4/);
  assert.match(html, /@theme \{/);
  assert.match(html, /--color-primary: #1a8917/);
  // No var() chains in @theme
  const themeMatch = html.match(/@theme \{([\s\S]*?)\}/);
  assert.ok(themeMatch);
  assert.ok(!/var\(/.test(themeMatch[1]), "no var() in @theme");
  // Sections present
  assert.match(html, /Source-verified palette/);
  assert.match(html, /Motion language/);
  assert.match(html, /Asymmetries/);
  assert.match(html, /href="#section-01-color"/);
  assert.match(html, /id="section-01-color"/);
  assert.match(html, /\.preview-transition/);
  assert.doesNotMatch(html, /var\([^)]*,/);
  assert.doesNotMatch(html, /\.brand-/);
  // Footer
  assert.match(html, /Generated by \/design-md/);
});

test("buildShowcaseHtml is robust to missing context fields", () => {
  const html = buildShowcaseHtml({});
  assert.match(html, /<!doctype html>/);
  assert.match(html, /data-extraction-gap="no_extracted_sections"/);
  assert.match(html, /extraction_gap\(no_extracted_sections\)/);
  assert.match(html, /<\/html>/);
});

test("buildTailwindBundle remains a compatibility alias", () => {
  assert.equal(buildTailwindBundle, buildShowcaseHtml);
});
