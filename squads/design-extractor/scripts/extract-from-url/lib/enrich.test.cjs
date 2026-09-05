"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildComponents,
  buildEnrichment,
  buildPatternTokens,
  classifyAtomicLayerForComponent,
} = require("./enrich.cjs");

function makeComponent(prop, value) {
  return {
    states: {
      default: {
        [prop]: { most_common: value },
      },
    },
  };
}

test("classifyAtomicLayerForComponent applies ADR-052 component rules without fallback", () => {
  assert.deepEqual(classifyAtomicLayerForComponent("button"), {
    atomic_layer: "atom",
    atomic_layer_reasoning: "q1_indivisible: extracted button control is a primitive action surface",
  });
  assert.deepEqual(classifyAtomicLayerForComponent("card"), {
    atomic_layer: "molecule",
    atomic_layer_reasoning: "q2_one_action: card is a bounded content composite, not a page region",
  });
  assert.deepEqual(classifyAtomicLayerForComponent("nav"), {
    atomic_layer: "organism",
    atomic_layer_reasoning: "q3_reusable_section: nav is a reusable navigation region composed of links/actions",
  });
  assert.deepEqual(classifyAtomicLayerForComponent("unknown-widget"), {
    atomic_layer: null,
    atomic_layer_gap: "extraction_gap(atomic_layer_unclassified)",
  });
});

test("buildComponents emits atomic_layer per extracted component", () => {
  const components = buildComponents({
    summary: {
      button: makeComponent("border-radius", "4px"),
      card: makeComponent("padding", "24px"),
      nav: makeComponent("background-color", "#ffffff"),
      "unknown-widget": makeComponent("color", "#111111"),
    },
  });

  assert.equal(components.button.atomic_layer, "atom");
  assert.equal(components.card.atomic_layer, "molecule");
  assert.equal(components.nav.atomic_layer, "organism");
  assert.equal(components["unknown-widget"].atomic_layer, null);
  assert.equal(components["unknown-widget"].atomic_layer_gap, "extraction_gap(atomic_layer_unclassified)");
});

test("buildPatternTokens separates extracted motion, focus, elevation, and z-index patterns", () => {
  const patternTokens = buildPatternTokens({
    motionCanonical: { "duration-fast": "150ms", "ease-linear": "linear" },
    motionBuckets: { duration_fast: "150ms" },
    focusRing: { detected: true, outline: "2px solid #005fcc", outline_offset: "2px" },
    elevationLadder: { raised: "0 2px 8px rgba(0,0,0,.15)" },
    zIndex: { base: 0, modal: 1000 },
  });

  assert.deepEqual(patternTokens.motion, { "duration-fast": "150ms", "ease-linear": "linear" });
  assert.deepEqual(patternTokens.focus, { outline: "2px solid #005fcc", outline_offset: "2px" });
  assert.deepEqual(patternTokens.elevation, { raised: "0 2px 8px rgba(0,0,0,.15)" });
  assert.deepEqual(patternTokens.z_index_scale, { base: 0, modal: 1000 });
  assert.equal(patternTokens.motion_gap, undefined);
});

test("buildPatternTokens emits structured extraction gaps when evidence is absent", () => {
  const patternTokens = buildPatternTokens({});

  assert.equal(patternTokens.motion, null);
  assert.equal(patternTokens.motion_gap, "extraction_gap(no_motion_tokens)");
  assert.equal(patternTokens.focus, null);
  assert.equal(patternTokens.focus_gap, "extraction_gap(no_focus_tokens)");
  assert.equal(patternTokens.elevation, null);
  assert.equal(patternTokens.elevation_gap, "extraction_gap(no_elevation_tokens)");
  assert.equal(patternTokens.z_index_scale, null);
  assert.equal(patternTokens.z_index_scale_gap, "extraction_gap(no_z_index_tokens)");
});

test("buildEnrichment writes ADR-052 atomic and pattern contracts into tokens-extended", () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "design-md-enrich-"));
  const inputsDir = path.join(runDir, "inputs");
  fs.mkdirSync(inputsDir, { recursive: true });

  fs.writeFileSync(path.join(runDir, "tokens.json"), JSON.stringify({
    colors: { surface: "#ffffff", text: "#111111" },
    preview_tokens: { surface_bg: "#ffffff" },
  }));
  fs.writeFileSync(path.join(inputsDir, "component-properties.json"), JSON.stringify({
    summary: {
      button: makeComponent("border-radius", "9999px"),
    },
  }));
  fs.writeFileSync(path.join(inputsDir, "motion.json"), JSON.stringify({
    durations: [{ value: "150ms", count: 3 }],
    easings: [{ value: "linear", count: 3 }],
    keyframes: [],
  }));
  fs.writeFileSync(path.join(inputsDir, "focus-ring.json"), JSON.stringify({
    detected: true,
    outline: "2px solid #111111",
  }));
  fs.writeFileSync(path.join(inputsDir, "z-index.json"), JSON.stringify({
    base: 0,
    modal: 1000,
  }));
  fs.writeFileSync(path.join(inputsDir, "shadows.json"), JSON.stringify([]));
  fs.writeFileSync(path.join(inputsDir, "tokens-detected.json"), JSON.stringify({ spacing: [] }));
  fs.writeFileSync(path.join(inputsDir, "dark-mode.json"), JSON.stringify({ has_dark_mode: false }));
  fs.writeFileSync(path.join(inputsDir, "css-vars-detected.json"), JSON.stringify([]));
  fs.writeFileSync(path.join(inputsDir, "breakpoints.json"), JSON.stringify([]));
  fs.writeFileSync(path.join(inputsDir, "css-collected.css"), ".button{border-radius:9999px;transition:opacity 150ms linear}");

  const enrichment = buildEnrichment(runDir);

  assert.equal(enrichment.extended.components.button.atomic_layer, "atom");
  assert.equal(enrichment.extended.pattern_tokens.motion["duration-fast"], "150ms");
  assert.equal(enrichment.extended.pattern_tokens.focus.outline, "2px solid #111111");
  assert.deepEqual(enrichment.extended.pattern_tokens.z_index_scale, { base: 0, modal: 1000 });
});
