"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  extractProvenance,
  normalizeHex,
  extractFontFamilies,
  buildVarMap,
  resolveValueIfVar,
} = require("./selector-provenance.cjs");

test("normalizeHex collapses 3-digit and uppercase forms", () => {
  assert.equal(normalizeHex("#fff"), "#ffffff");
  assert.equal(normalizeHex("#FFF"), "#ffffff");
  assert.equal(normalizeHex("#1A8917"), "#1a8917");
  assert.equal(normalizeHex("#abc"), "#aabbcc");
});

test("extractFontFamilies returns first family, drops generic-only", () => {
  assert.equal(extractFontFamilies('"Inter", sans-serif'), "Inter");
  assert.equal(extractFontFamilies("'GT Super', Georgia, serif"), "GT Super");
  assert.equal(extractFontFamilies("sans-serif"), null);
  assert.equal(extractFontFamilies("inherit"), null);
});

test("extractFontFamilies walks past generic keywords to find first proprietary family (Obsidian/Tailwind fix)", () => {
  // Tailwind default font stack — must skip ui-sans-serif, system-ui,
  // -apple-system, BlinkMacSystemFont, Roboto and surface "Inter"
  const obsidianStack = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Roboto, "Inter", "Helvetica Neue", Arial, "Noto Sans", sans-serif';
  assert.equal(extractFontFamilies(obsidianStack), "Roboto");
  // ui-monospace stack should surface SFMono-Regular
  const monoStack = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  assert.equal(extractFontFamilies(monoStack), "SFMono-Regular");
  // All-generic stack returns null
  assert.equal(extractFontFamilies("ui-sans-serif, system-ui, sans-serif"), null);
});

test("extractProvenance traces hex back to selector + property", () => {
  // Medium-style: #1A8917 produced by .em (background) and .eo (border-color)
  const css = `.em{background:#1A8917}.eo{border-color:#1A8917}.x h2{color:#242424}`;
  const out = extractProvenance(css);
  const green = out.colors["#1a8917"];
  assert.ok(green, "expected #1a8917 entry");
  assert.equal(green.count, 2);
  assert.ok(green.selectors.find((s) => s.selector === ".em" && s.property === "background"));
  assert.ok(green.selectors.find((s) => s.selector === ".eo" && s.property === "border-color"));
  // primary_context: when split between background and border-color, we expect one of them as winner
  assert.ok(["background", "border-color"].includes(green.primary_context));
});

test("extractProvenance picks dominant context when one prop wins", () => {
  // #242424 used 3 times as color, 1 time as border-bottom — primary should be color
  const css = `.x h2{color:#242424}.y{color:#242424}.z{color:#242424}.av{border-bottom:solid 1px #242424}`;
  const out = extractProvenance(css);
  const ink = out.colors["#242424"];
  assert.equal(ink.count, 4);
  assert.equal(ink.primary_context, "color");
});

test("extractProvenance traces radii to border-radius declarations", () => {
  const css = `.l{border-radius:50%}.dc{border-radius:99em}.btn{border-radius:50%}`;
  const out = extractProvenance(css);
  assert.ok(out.radii["50%"]);
  assert.equal(out.radii["50%"].count, 2);
  assert.ok(out.radii["99em"]);
  assert.equal(out.radii["99em"].count, 1);
});

test("extractProvenance traces font-family declarations", () => {
  const css = `.cl{font-family:sohne, "Helvetica Neue", sans-serif}.dw{font-family:gt-super, Georgia, serif}`;
  const out = extractProvenance(css);
  assert.ok(out.font_families["sohne"]);
  assert.ok(out.font_families["gt-super"]);
});

test("extractProvenance ignores generic-only font-family", () => {
  const css = `.x{font-family:sans-serif}`;
  const out = extractProvenance(css);
  assert.equal(Object.keys(out.font_families).length, 0);
});

test("extractProvenance traces spacing values from padding/margin/gap", () => {
  const css = `.cr{padding:8px 16px}.fd{margin-right:20px}.gap{gap:24px}`;
  const out = extractProvenance(css);
  assert.ok(out.spacing["8px"]);
  assert.ok(out.spacing["16px"]);
  assert.ok(out.spacing["20px"]);
  assert.ok(out.spacing["24px"]);
});

test("extractProvenance picks up rgba and hsl forms", () => {
  const css = `.bg1{background:rgba(0,0,0,0.8)}.bg2{background:hsl(120 100% 50%)}`;
  const out = extractProvenance(css);
  assert.ok(out.colors["rgba(0,0,0,0.8)"]);
  assert.ok(out.colors["hsl(120100%50%)"]);
});

test("extractProvenance returns empty buckets for empty input", () => {
  const out = extractProvenance("");
  assert.deepEqual(Object.keys(out.colors), []);
  assert.equal(out.summary.tracked_declarations, 0);
});

test("extractProvenance summary counts match unique value buckets", () => {
  const css = `.a{color:#fff}.b{color:#000}.c{border-radius:8px}`;
  const out = extractProvenance(css);
  assert.equal(out.summary.color_values, 2); // #ffffff + #000000
  assert.equal(out.summary.radii_values, 1); // 8px
});

// ── Bug #2 fix — font-family var() resolution ─────────────────────

test("buildVarMap collapses cssVars array into Map", () => {
  const cssVars = [
    { selector: ":root", name: "--font-sans", value: "Inter, sans-serif", is_alias: false },
    { selector: ":root", name: "--font-serif", value: "Source Serif 4, serif", is_alias: false },
  ];
  const map = buildVarMap(cssVars);
  assert.equal(map.get("--font-sans"), "Inter, sans-serif");
  assert.equal(map.get("--font-serif"), "Source Serif 4, serif");
});

test("resolveValueIfVar follows var() chain to terminal value", () => {
  const cssVars = [
    { name: "--font-sans", value: "Inter, sans-serif" },
    { name: "--font-display", value: "var(--font-sans)" },
  ];
  const map = buildVarMap(cssVars);
  assert.equal(resolveValueIfVar("var(--font-display)", map), "Inter, sans-serif");
  assert.equal(resolveValueIfVar("var(--font-sans)", map), "Inter, sans-serif");
});

test("resolveValueIfVar falls back to declared fallback when chain unresolvable", () => {
  const map = new Map();
  assert.equal(resolveValueIfVar("var(--missing, Helvetica)", map), "Helvetica");
});

test("resolveValueIfVar leaves mixed values alone (only resolves whole-value var)", () => {
  const cssVars = [{ name: "--space", value: "1rem" }];
  const map = buildVarMap(cssVars);
  // Mixed value (space + var) is not resolved — too risky for general font-family case
  assert.equal(resolveValueIfVar("0 var(--space)", map), "0 var(--space)");
});

test("extractProvenance resolves font-family var() chains via cssVars (Obsidian fix)", () => {
  // Obsidian-style: declarations use var(--font-sans), font lives in :root
  const css = `:root { --font-sans: Inter, system-ui; } .body { font-family: var(--font-sans); } h1 { font-family: var(--font-display, "GT Super"); }`;
  const cssVars = [
    { name: "--font-sans", value: "Inter, system-ui" },
  ];
  const out = extractProvenance(css, { cssVars });
  // Inter (resolved from var) should now appear
  assert.ok(out.font_families["Inter"], "expected Inter resolved from --font-sans");
  // GT Super (from declared fallback when var is missing) should also appear
  assert.ok(out.font_families["GT Super"], "expected GT Super from declared fallback");
});

test("extractProvenance still works without cssVars (back-compat)", () => {
  const css = `body { font-family: "Inter", sans-serif; }`;
  const out = extractProvenance(css);
  assert.ok(out.font_families["Inter"]);
});
