"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  emitComponentClasses,
  pickColor,
  emitButton,
  emitMotionTokens,
  emitKeyframes,
} = require("./component-class-emitter.cjs");

test("pickColor skips transparent and inherit when picking", () => {
  const entry = {
    most_common: "transparent",
    most_common_count: 4,
    all_values: [
      { value: "transparent", count: 4 },
      { value: "#1a8917", count: 2 },
    ],
  };
  // Most common is "transparent" — pickColor must skip it
  assert.equal(pickColor(entry), "#1a8917");
});

test("pickColor returns most_common when it is meaningful", () => {
  assert.equal(pickColor({ most_common: "#1a8917", all_values: [] }), "#1a8917");
});

test("emitButton produces .brand-cta-primary with extracted properties", () => {
  const componentSummary = {
    button: {
      "background-color": { most_common: "#1a8917", all_values: [{ value: "#1a8917", count: 3 }] },
      "color": { most_common: "#ffffff", all_values: [{ value: "#ffffff", count: 3 }] },
      "border-radius": { most_common: "99em", all_values: [{ value: "99em", count: 1 }] },
      "padding": { most_common: "8px 16px", all_values: [{ value: "8px 16px", count: 1 }] },
    },
  };
  const out = emitButton(componentSummary, null, "brand").join("\n");
  assert.match(out, /\.brand-cta-primary \{/);
  assert.match(out, /background-color: #1a8917;/);
  assert.match(out, /color: #ffffff;/);
  assert.match(out, /border-radius: 99em;/);
  assert.match(out, /padding: 8px 16px;/);
});

test("emitButton adds :hover when state palette has hover_backgrounds", () => {
  const componentSummary = {
    button: {
      "background-color": { most_common: "#1a8917", all_values: [{ value: "#1a8917", count: 1 }] },
    },
  };
  const statePalette = {
    hover_backgrounds: ["#156d12"],
  };
  const out = emitButton(componentSummary, statePalette, "brand").join("\n");
  assert.match(out, /\.brand-cta-primary:hover \{/);
  assert.match(out, /background-color: #156d12;/);
});

test("emitButton adds :disabled when state palette has disabled_opacities", () => {
  const componentSummary = {
    button: {
      "background-color": { most_common: "#1a8917", all_values: [{ value: "#1a8917", count: 1 }] },
    },
  };
  const statePalette = {
    disabled_opacities: ["0.3"],
    disabled_cursors: ["not-allowed"],
  };
  const out = emitButton(componentSummary, statePalette, "brand").join("\n");
  assert.match(out, /\.brand-cta-primary:disabled \{/);
  assert.match(out, /opacity: 0\.3;/);
  assert.match(out, /cursor: not-allowed;/);
});

test("emitMotionTokens emits .preview-transition with extracted properties", () => {
  const motion = {
    transitions: [
      { property: "background-color", duration: "300ms", timing: "linear", count: 2 },
      { property: "color", duration: "300ms", timing: "linear", count: 1 },
    ],
  };
  const out = emitMotionTokens(motion).join("\n");
  assert.match(out, /\.preview-transition \{/);
  assert.match(out, /transition: background-color 300ms linear, color 300ms linear;/);
});

test("emitMotionTokens emits nothing when transitions empty", () => {
  assert.deepEqual(emitMotionTokens({ transitions: [] }), []);
  assert.deepEqual(emitMotionTokens(null), []);
});

test("emitKeyframes emits @keyframes blocks from keyframe_bodies", () => {
  const motion = {
    keyframe_bodies: {
      k1: "from{transform:rotate(0deg)}to{transform:rotate(360deg)}",
    },
  };
  const out = emitKeyframes(motion).join("\n");
  assert.match(out, /@keyframes k1 \{/);
  assert.match(out, /rotate\(0deg\)/);
  assert.match(out, /rotate\(360deg\)/);
});

test("emitComponentClasses returns no-emit comment for empty input", () => {
  const out = emitComponentClasses({ componentProperties: { summary: {} }, componentStates: null, motion: null });
  assert.match(out, /No component classes emitted/);
});

test("emitComponentClasses combines all sections with header", () => {
  const componentProperties = {
    summary: {
      button: {
        "background-color": { most_common: "#1a8917", all_values: [{ value: "#1a8917", count: 1 }] },
      },
    },
  };
  const componentStates = {
    state_value_palette: {
      hover_backgrounds: ["#156d12"],
      disabled_opacities: ["0.3"],
    },
  };
  const motion = {
    transitions: [{ property: "background-color", duration: "300ms", timing: "linear", count: 1 }],
    keyframe_bodies: {},
  };
  const out = emitComponentClasses({ componentProperties, componentStates, motion });
  assert.match(out, /Component classes emitted from extracted data only/);
  assert.match(out, /\.preview-cta-primary/);
  assert.match(out, /\.preview-cta-primary:hover/);
  assert.match(out, /\.preview-cta-primary:disabled/);
  assert.match(out, /\.preview-transition/);
  assert.ok(!/var\(/.test(out), "no var() in component classes by default");
});
