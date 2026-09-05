"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { detectAsymmetries, renderAsymmetriesMarkdown } = require("./asymmetry-detector.cjs");

test("detectAsymmetries flags radii flatness when only 2 radii", () => {
  const ctx = {
    tokensDetected: { radii: ["50%", "99em"], colors: { hex: ["#1a8917", "#fff", "#000"] } },
    shadows: [],
    motion: {},
    componentStates: { summary: { states_present: [], states_absent: [] }, state_value_palette: {} },
  };
  const out = detectAsymmetries(ctx);
  const flat = out.asymmetries.find((a) => a.id === "radii-flatness");
  assert.ok(flat, "expected radii-flatness asymmetry");
  assert.equal(flat.severity, "high");
  assert.deepEqual(flat.evidence.values, ["50%", "99em"]);
});

test("detectAsymmetries does not flag radii when many present", () => {
  const ctx = {
    tokensDetected: { radii: ["2px", "4px", "8px", "12px", "16px", "9999px"], colors: {} },
  };
  const out = detectAsymmetries(ctx);
  assert.ok(!out.asymmetries.find((a) => a.id === "radii-flatness"));
});

test("detectAsymmetries flags shadow-absence on empty shadows", () => {
  const ctx = { shadows: [], tokensDetected: { colors: {} } };
  const out = detectAsymmetries(ctx);
  const ab = out.asymmetries.find((a) => a.id === "shadow-absence");
  assert.ok(ab);
  assert.equal(ab.evidence.shadow_count, 0);
});

test("detectAsymmetries flags shadow-monolith on single shadow", () => {
  const ctx = { shadows: [{ value: "0 1px 2px rgba(0,0,0,0.1)", count: 4 }], tokensDetected: { colors: {} } };
  const out = detectAsymmetries(ctx);
  const mono = out.asymmetries.find((a) => a.id === "shadow-monolith");
  assert.ok(mono);
  assert.equal(mono.severity, "medium");
});

test("detectAsymmetries flags transition-uniformity on single curve", () => {
  const ctx = {
    motion: {
      durations: [{ value: "300ms", count: 12 }],
      easings: [],
      transitions: [
        { property: "background-color", duration: "300ms", timing: "linear", count: 6 },
        { property: "color", duration: "300ms", timing: "linear", count: 4 },
      ],
    },
    tokensDetected: { colors: {} },
  };
  const out = detectAsymmetries(ctx);
  const uni = out.asymmetries.find((a) => a.id === "transition-uniformity");
  assert.ok(uni);
  assert.equal(uni.evidence.dominant_duration, "300ms");
  assert.equal(uni.evidence.dominant_timing, "linear");
});

test("detectAsymmetries flags transition-property-narrow when ≤4 distinct props", () => {
  const ctx = {
    motion: {
      transitions: [
        { property: "background-color", duration: "300ms", timing: "linear", count: 6 },
        { property: "color", duration: "300ms", timing: "linear", count: 4 },
      ],
    },
    tokensDetected: { colors: {} },
  };
  const out = detectAsymmetries(ctx);
  const narrow = out.asymmetries.find((a) => a.id === "transition-property-narrow");
  assert.ok(narrow);
  assert.deepEqual(narrow.evidence.properties.sort(), ["background-color", "color"]);
});

test("detectAsymmetries flags easing-linear-only when all transitions linear", () => {
  const ctx = {
    motion: {
      durations: [{ value: "300ms", count: 3 }],
      easings: [],
      transitions: [
        { property: "background-color", duration: "300ms", timing: "linear", count: 2 },
        { property: "color", duration: "300ms", timing: "linear", count: 1 },
      ],
    },
    tokensDetected: { colors: {} },
  };
  const out = detectAsymmetries(ctx);
  const linOnly = out.asymmetries.find((a) => a.id === "easing-linear-only");
  assert.ok(linOnly);
});

test("detectAsymmetries flags focus-state-absence", () => {
  const ctx = {
    componentStates: {
      summary: {
        states_present: ["hover", "disabled"],
        states_absent: ["focus", "focus-visible", "active", "checked", "visited", "focus-within"],
      },
      state_value_palette: {},
    },
    tokensDetected: { colors: {} },
  };
  const out = detectAsymmetries(ctx);
  const focusAbs = out.asymmetries.find((a) => a.id === "focus-state-absence");
  assert.ok(focusAbs);
  assert.equal(focusAbs.severity, "high");
});

test("detectAsymmetries flags disabled-opacity-pattern with 2 opacities", () => {
  const ctx = {
    componentStates: {
      summary: { states_present: ["disabled"], states_absent: [] },
      state_value_palette: { disabled_opacities: ["0.1", "0.3"] },
    },
    tokensDetected: { colors: {} },
  };
  const out = detectAsymmetries(ctx);
  const pat = out.asymmetries.find((a) => a.id === "disabled-opacity-pattern");
  assert.ok(pat);
  assert.deepEqual(pat.evidence.values, ["0.1", "0.3"]);
});

test("detectAsymmetries flags color-palette-narrow on 8-or-fewer colors", () => {
  const ctx = {
    tokensDetected: { colors: { hex: ["#1a8917", "#fff", "#000", "#242424", "#6b6b6b"] } },
  };
  const out = detectAsymmetries(ctx);
  const narrow = out.asymmetries.find((a) => a.id === "color-palette-narrow");
  assert.ok(narrow);
});

test("detectAsymmetries returns no asymmetries for a maximalist brand", () => {
  // 6 radii, 4 shadows, 5 durations + cubic-bezier easings, full state coverage,
  // 30+ colors → no flatness signals
  const colors = Array.from({ length: 35 }, (_, i) => `#${(i * 0xfff111).toString(16).padStart(6, "0").slice(0, 6)}`);
  const ctx = {
    tokensDetected: { radii: ["2px", "4px", "8px", "12px", "16px", "9999px"], colors: { hex: colors }, spacing: [] },
    shadows: [{ value: "0 1px 2px" }, { value: "0 4px 8px" }, { value: "0 8px 16px" }, { value: "0 16px 32px" }],
    motion: {
      durations: [{ value: "150ms" }, { value: "200ms" }, { value: "300ms" }],
      easings: [{ value: "ease-out" }, { value: "cubic-bezier(0.4,0,0.2,1)" }],
      transitions: [
        { property: "transform", duration: "150ms", timing: "ease-out" },
        { property: "opacity", duration: "200ms", timing: "ease-out" },
        { property: "background-color", duration: "200ms", timing: "ease-out" },
        { property: "color", duration: "200ms", timing: "ease-out" },
        { property: "border-color", duration: "200ms", timing: "ease-out" },
      ],
    },
    componentStates: {
      summary: {
        states_present: ["hover", "focus", "focus-visible", "active", "disabled"],
        states_absent: [],
      },
      state_value_palette: { disabled_opacities: ["0.5"] },
    },
  };
  const out = detectAsymmetries(ctx);
  // We only expect color-palette-extended (informational, severity low)
  const ids = out.asymmetries.map((a) => a.id);
  assert.ok(!ids.includes("radii-flatness"));
  assert.ok(!ids.includes("shadow-absence"));
  assert.ok(!ids.includes("transition-uniformity"));
  assert.ok(!ids.includes("focus-state-absence"));
});

test("renderAsymmetriesMarkdown produces structured report", () => {
  const report = {
    asymmetries: [
      {
        id: "shadow-absence",
        category: "absence",
        severity: "high",
        title: "Zero box-shadows detected",
        description: "Flat aesthetic.",
        evidence: { shadow_count: 0 },
        design_implication: "Do not generate shadows.",
      },
    ],
    summary: { total_asymmetries: 1, by_severity: { high: 1, medium: 0, low: 0 }, by_category: { absence: 1 } },
  };
  const md = renderAsymmetriesMarkdown(report, { brand: "medium", url: "https://medium.com/", extracted_at: "2026-05-06T00:00:00Z" });
  assert.match(md, /# Extraction Asymmetries — medium/);
  assert.match(md, /## Summary/);
  assert.match(md, /## Zero box-shadows detected/);
  assert.match(md, /shadow-absence/);
  assert.match(md, /Design implication/);
});

test("renderAsymmetriesMarkdown handles empty result", () => {
  const report = { asymmetries: [], summary: { total_asymmetries: 0, by_severity: { high: 0, medium: 0, low: 0 }, by_category: {} } };
  const md = renderAsymmetriesMarkdown(report, {});
  assert.match(md, /No asymmetries detected/);
});

// ── Bug #1 fix — transition-property-narrow contradiction ─────────
test("transition-property-narrow description does NOT contradict the extracted property list", () => {
  // Obsidian-style: properties INCLUDE transform + opacity
  const ctx = {
    motion: {
      transitions: [
        { property: "transform", duration: "0.2s", timing: "ease-in-out", count: 2 },
        { property: "opacity", duration: "500ms", timing: null, count: 1 },
        { property: "all", duration: "3000ms", timing: "ease-in-out", count: 1 },
        { property: "box-shadow", duration: "750ms", timing: "ease-in-out", count: 1 },
      ],
    },
    tokensDetected: { colors: { hex: ["#1a1a1a", "#fff"] } },
  };
  const out = detectAsymmetries(ctx);
  const narrow = out.asymmetries.find((a) => a.id === "transition-property-narrow");
  assert.ok(narrow, "expected transition-property-narrow asymmetry");
  // Description must NOT claim transform/opacity are not animated when they are
  assert.ok(!/transform.*are NOT animated/.test(narrow.description), "description self-contradicts on transform");
  assert.ok(!/opacity.*are NOT animated/.test(narrow.description), "description self-contradicts on opacity");
  // properties_not_animated evidence must NOT include any of the present props
  const notAnimated = narrow.evidence.properties_not_animated || [];
  assert.ok(!notAnimated.includes("transform"), "transform must not appear in properties_not_animated");
  assert.ok(!notAnimated.includes("opacity"), "opacity must not appear in properties_not_animated");
  assert.ok(!notAnimated.includes("box-shadow"), "box-shadow must not appear in properties_not_animated");
});

test("transition-property-narrow with 'all' present skips the missing-list (since all = everything)", () => {
  const ctx = {
    motion: {
      transitions: [
        { property: "all", duration: "200ms", timing: "ease", count: 5 },
        { property: "color", duration: "200ms", timing: "ease", count: 1 },
      ],
    },
    tokensDetected: { colors: {} },
  };
  const out = detectAsymmetries(ctx);
  const narrow = out.asymmetries.find((a) => a.id === "transition-property-narrow");
  assert.ok(narrow);
  assert.deepEqual(narrow.evidence.properties_not_animated, []);
});

// ── Bug #3 fix — new asymmetries ───────────────────────────────────

test("radius-density-rich fires when radii.length >= 15", () => {
  const radii = ["0.125rem", "0.25rem", "0.375rem", "0.5rem", "0.75rem", "1rem", "1.5rem", "2px", "3px", "4px", "9px", "11px", "20%", "28px", "30px", "50%", "999px"];
  const out = detectAsymmetries({ tokensDetected: { radii, colors: {} } });
  const rich = out.asymmetries.find((a) => a.id === "radius-density-rich");
  assert.ok(rich);
  assert.equal(rich.severity, "low");
  assert.equal(rich.evidence.radii_count, 17);
});

test("radius-density-rich does NOT fire on flat radius brands (mutual exclusion)", () => {
  const out = detectAsymmetries({ tokensDetected: { radii: ["50%", "99em"], colors: {} } });
  assert.ok(!out.asymmetries.find((a) => a.id === "radius-density-rich"));
  // And radii-flatness IS present
  assert.ok(out.asymmetries.find((a) => a.id === "radii-flatness"));
});

test("motion-rich fires when 4+ durations and at least 1 easing-or-keyframe", () => {
  const out = detectAsymmetries({
    motion: {
      durations: [{ value: "150ms", count: 18 }, { value: "1s" }, { value: "0.2s" }, { value: "100ms" }, { value: "15s" }],
      easings: [{ value: "cubic-bezier(0.4,0,0.2,1)", count: 17 }],
      keyframes: ["dual-ring", "loading-spinner"],
      transitions: [],
    },
    tokensDetected: { colors: {} },
  });
  const rich = out.asymmetries.find((a) => a.id === "motion-rich");
  assert.ok(rich);
  assert.equal(rich.evidence.duration_count, 5);
  assert.equal(rich.evidence.keyframe_count, 2);
});

test("motion-rich does NOT fire when motion is uniform (single duration)", () => {
  const out = detectAsymmetries({
    motion: { durations: [{ value: "300ms", count: 3 }], easings: [], keyframes: [], transitions: [{ property: "color", duration: "300ms", timing: "linear" }] },
    tokensDetected: { colors: {} },
  });
  assert.ok(!out.asymmetries.find((a) => a.id === "motion-rich"));
});

test("focus-transparent-outline-pattern fires when focus_outlines contains transparent", () => {
  const out = detectAsymmetries({
    componentStates: {
      summary: { states_present: ["focus", "focus-visible"], states_absent: [] },
      state_value_palette: {
        focus_outlines: ["2px solid transparent", "none !important"],
        focus_box_shadows: ["var(--tw-ring-offset-shadow), var(--tw-ring-shadow)"],
      },
    },
    tokensDetected: { colors: {} },
  });
  const tw = out.asymmetries.find((a) => a.id === "focus-transparent-outline-pattern");
  assert.ok(tw);
  assert.equal(tw.evidence.transparent_outline_count, 1);
});

test("focus-transparent-outline-pattern does NOT fire when no transparent in outlines", () => {
  const out = detectAsymmetries({
    componentStates: {
      summary: { states_present: ["focus"], states_absent: [] },
      state_value_palette: { focus_outlines: ["2px solid #1a8917"] },
    },
    tokensDetected: { colors: {} },
  });
  assert.ok(!out.asymmetries.find((a) => a.id === "focus-transparent-outline-pattern"));
});

test("state-coverage-comprehensive fires when 5+ states present (Obsidian)", () => {
  const out = detectAsymmetries({
    componentStates: {
      summary: { states_present: ["active", "checked", "disabled", "focus", "focus-visible", "hover"], states_absent: ["focus-within", "visited"], total_state_rules: 113 },
      state_value_palette: {},
    },
    tokensDetected: { colors: {} },
  });
  const comp = out.asymmetries.find((a) => a.id === "state-coverage-comprehensive");
  assert.ok(comp);
  assert.equal(comp.evidence.states_present.length, 6);
  assert.equal(comp.evidence.total_state_rules, 113);
});

test("state-coverage-comprehensive does NOT fire on minimal-state brands (medium)", () => {
  const out = detectAsymmetries({
    componentStates: {
      summary: { states_present: ["disabled", "hover"], states_absent: ["focus", "focus-visible", "active"] },
      state_value_palette: {},
    },
    tokensDetected: { colors: {} },
  });
  assert.ok(!out.asymmetries.find((a) => a.id === "state-coverage-comprehensive"));
});
