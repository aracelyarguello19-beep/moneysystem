"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  extractComponentStates,
  classifySelector,
  stripStates,
  parseDeclarations,
  STATE_PSEUDOS,
} = require("./component-state-extractor.cjs");

test("classifySelector identifies single state pseudo", () => {
  assert.deepEqual(classifySelector(".btn:hover"), ["hover"]);
  assert.deepEqual(classifySelector(".btn:disabled"), ["disabled"]);
  assert.deepEqual(classifySelector(".btn:focus-visible"), ["focus-visible"]);
});

test("classifySelector identifies compound states (medium :disabled:hover)", () => {
  const states = classifySelector(".da:disabled:hover");
  assert.ok(states.includes("disabled"));
  assert.ok(states.includes("hover"));
});

test("classifySelector ignores pseudos inside :not()", () => {
  // Medium uses .ca:hover:not(:disabled) — :disabled inside :not() is a guard,
  // not a state assertion. Only :hover should be classified.
  const states = classifySelector(".ca:hover:not(:disabled)");
  assert.deepEqual(states, ["hover"]);
});

test("classifySelector identifies attribute states", () => {
  assert.deepEqual(classifySelector("button[disabled]"), ["disabled"]);
  assert.deepEqual(classifySelector('button[aria-disabled="true"]'), ["disabled"]);
});

test("classifySelector returns empty for stateless selector", () => {
  assert.deepEqual(classifySelector(".btn"), []);
  assert.deepEqual(classifySelector("h1, h2, h3"), []);
});

test("classifySelector skips pseudo-elements", () => {
  // ::before, ::after are pseudo-elements, not interaction states
  assert.deepEqual(classifySelector(".btn::before"), []);
});

test("stripStates removes top-level state pseudos but preserves guards in :not()", () => {
  assert.equal(stripStates(".btn:hover"), ".btn");
  assert.equal(stripStates(".btn:disabled:hover"), ".btn");
  // Pseudos inside :not() are guards, not states — they stay
  assert.equal(stripStates(".btn:hover:not(:disabled)"), ".btn:not(:disabled)");
  assert.equal(stripStates("button[disabled]"), "button");
  // Non-state attribute selectors are preserved
  assert.equal(stripStates('a[href="/x"]:hover'), 'a[href="/x"]');
});

test("parseDeclarations splits CSS declarations correctly", () => {
  const decls = parseDeclarations("background: #1A8917; color: #FFF; opacity: 0.3");
  assert.equal(decls["background"], "#1A8917");
  assert.equal(decls["color"], "#FFF");
  assert.equal(decls["opacity"], "0.3");
});

test("extractComponentStates surfaces medium-style hover + disabled", () => {
  // Medium-realistic mini-fixture: hashed CSS Modules, single line, multi-class
  const css = `.em{background:#1A8917}.ep:hover{background:#156D12}.eq:hover{border-color:#156D12}.cz:disabled{opacity:0.1}.er:disabled{opacity:0.3}.cy:disabled{cursor:not-allowed}.da:disabled:hover{background:rgba(25, 25, 25, 1)}`;
  const out = extractComponentStates(css);

  // hover backgrounds palette captures medium's tertiary green
  assert.ok(out.state_value_palette.hover_backgrounds.includes("#156D12"));
  // hover border-colors palette captures the same
  assert.ok(out.state_value_palette.hover_border_colors.includes("#156D12"));
  // disabled opacities palette captures BOTH 0.1 AND 0.3 — the medium signature
  assert.ok(out.state_value_palette.disabled_opacities.includes("0.1"));
  assert.ok(out.state_value_palette.disabled_opacities.includes("0.3"));
  // disabled cursors captures not-allowed
  assert.ok(out.state_value_palette.disabled_cursors.includes("not-allowed"));

  // Summary shows hover and disabled present, focus and active absent
  assert.ok(out.summary.states_present.includes("hover"));
  assert.ok(out.summary.states_present.includes("disabled"));
  assert.ok(out.summary.states_absent.includes("focus"));
  assert.ok(out.summary.states_absent.includes("focus-visible"));
  assert.ok(out.summary.states_absent.includes("active"));

  // Compound state surfaces under combined key
  const da = out.states_by_selector[".da"];
  assert.ok(da, "expected .da base entry");
  assert.ok(da.states["disabled:hover"], "expected disabled:hover compound state");
});

test("extractComponentStates handles @media wrapped rules", () => {
  const css = `
    @media (min-width: 768px) {
      .btn:hover { background: #ff0000; }
    }
    .btn:disabled { opacity: 0.5; }
  `;
  const out = extractComponentStates(css);
  assert.ok(out.state_value_palette.hover_backgrounds.includes("#ff0000"));
  assert.ok(out.state_value_palette.disabled_opacities.includes("0.5"));
});

test("extractComponentStates returns empty structure for empty css", () => {
  const out = extractComponentStates("");
  assert.equal(out.summary.total_state_rules, 0);
  assert.deepEqual(out.summary.states_present, []);
  // Absent list contains every known state
  for (const s of STATE_PSEUDOS) {
    assert.ok(out.summary.states_absent.includes(s));
  }
});

test("extractComponentStates skips @keyframes", () => {
  // @keyframes 0% / 50% / 100% percentage selectors should not be misinterpreted
  // as state rules; they have no interaction pseudos.
  const css = `
    @keyframes spin { 0% { opacity: 0 } 100% { opacity: 1 } }
    .btn:hover { background: #ff0000; }
  `;
  const out = extractComponentStates(css);
  assert.equal(out.summary.total_state_rules, 1);
  assert.ok(out.state_value_palette.hover_backgrounds.includes("#ff0000"));
});
