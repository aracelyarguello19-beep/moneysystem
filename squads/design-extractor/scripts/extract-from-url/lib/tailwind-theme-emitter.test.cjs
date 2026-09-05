"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  emitTailwindTheme,
  emitCssVariableRoot,
  familyToSlug,
  isHexColor,
  isCssLength,
} = require("./tailwind-theme-emitter.cjs");

test("isHexColor accepts valid hex forms", () => {
  assert.equal(isHexColor("#1A8917"), true);
  assert.equal(isHexColor("#fff"), true);
  assert.equal(isHexColor("#1a8917ff"), true);
  assert.equal(isHexColor("rgb(0,0,0)"), false);
  assert.equal(isHexColor("var(--x)"), false);
  assert.equal(isHexColor(null), false);
});

test("isCssLength accepts px/rem/em/0", () => {
  assert.equal(isCssLength("16px"), true);
  assert.equal(isCssLength("1.5rem"), true);
  assert.equal(isCssLength("0"), true);
  assert.equal(isCssLength("0px"), true);
  assert.equal(isCssLength("auto"), false);
  assert.equal(isCssLength("var(--x)"), false);
});

test("familyToSlug extracts and normalizes first family", () => {
  assert.equal(familyToSlug("gt-super, Georgia, serif"), "gt-super");
  assert.equal(familyToSlug('"Helvetica Neue", Helvetica, sans-serif'), "helvetica-neue");
  assert.equal(familyToSlug("sans-serif"), null);
  assert.equal(familyToSlug("inherit"), null);
});

test("emitTailwindTheme emits @theme with literal hex (no var chains)", () => {
  const tokens = {
    colors: {
      primary: "#1a8917",
      secondary: "#191919",
      cream: "#f7f4ed",
    },
  };
  const out = emitTailwindTheme(tokens);
  assert.match(out, /<style type="text\/tailwindcss">/);
  assert.match(out, /@theme \{/);
  assert.match(out, /--color-primary: #1a8917;/);
  assert.match(out, /--color-secondary: #191919;/);
  assert.match(out, /--color-cream: #f7f4ed;/);
  // Critical assertion: NO var() inside @theme
  assert.ok(!/var\(/.test(out), "expected no var() chains in @theme block");
});

test("emitTailwindTheme skips non-hex color values silently (no fallback)", () => {
  const tokens = {
    colors: {
      primary: "#1a8917",
      secondary: "rgb(25,25,25)",  // not hex — must be skipped
      muted: "var(--gray)",         // not hex — must be skipped
      tertiary: "transparent",      // not hex — must be skipped
    },
  };
  const out = emitTailwindTheme(tokens);
  assert.match(out, /--color-primary: #1a8917;/);
  assert.ok(!/--color-secondary/.test(out));
  assert.ok(!/--color-muted/.test(out));
  assert.ok(!/--color-tertiary/.test(out));
});

test("emitTailwindTheme emits font-family stacks preserving commas", () => {
  const tokens = {
    typography: {
      h1: { fontFamily: "gt-super, Georgia, Cambria, serif", fontSize: "70px" },
      body: { fontFamily: "sohne, Helvetica Neue, Helvetica, sans-serif", fontSize: "14px" },
    },
  };
  const out = emitTailwindTheme(tokens);
  // Commas preserved
  assert.match(out, /--font-gt-super: gt-super, Georgia, Cambria, serif;/);
  assert.match(out, /--font-sohne: sohne, Helvetica Neue, Helvetica, sans-serif;/);
});

test("emitTailwindTheme emits text scale with line-height + letter-spacing", () => {
  const tokens = {
    typography: {
      h1: {
        fontFamily: "gt-super, serif",
        fontSize: "70px",
        lineHeight: "74px",
        letterSpacing: "-0.05em",
        fontWeight: 400,
      },
    },
  };
  const out = emitTailwindTheme(tokens);
  assert.match(out, /--text-h1: 70px;/);
  assert.match(out, /--text-h1--line-height: 74px;/);
  assert.match(out, /--text-h1--letter-spacing: -0\.05em;/);
  assert.match(out, /--text-h1--font-weight: 400;/);
});

test("emitTailwindTheme emits radius scale", () => {
  const tokens = {
    rounded: {
      none: "0px",
      pill: "9999px",
      full: "50%",  // % not px — let's see if accepted
    },
  };
  const out = emitTailwindTheme(tokens);
  assert.match(out, /--radius-none: 0px;/);
  assert.match(out, /--radius-pill: 9999px;/);
  // 50% IS valid CSS length per isCssLength
  assert.match(out, /--radius-full: 50%;/);
});

test("emitTailwindTheme handles empty tokens without crashing", () => {
  const out = emitTailwindTheme({});
  assert.match(out, /<style type="text\/tailwindcss">/);
  assert.match(out, /@theme \{/);
  assert.match(out, /<\/style>/);
});

test("emitTailwindTheme bareTheme option emits without <style> wrap", () => {
  const tokens = { colors: { primary: "#1a8917" } };
  const out = emitTailwindTheme(tokens, { bareTheme: true });
  assert.ok(!/<style/.test(out));
  assert.match(out, /^@theme \{/);
  assert.match(out, /\}$/);
});

test("emitCssVariableRoot writes :root vars without var chains", () => {
  const tokens = {
    colors: { primary: "#1a8917", text: "#242424" },
    rounded: { sm: "0px", lg: "8px" },
  };
  const out = emitCssVariableRoot(tokens);
  assert.match(out, /:root \{/);
  assert.match(out, /--color-primary: #1a8917;/);
  assert.match(out, /--radius-lg: 8px;/);
  assert.ok(!/var\(/.test(out));
});
