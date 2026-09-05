"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  classifyAtomic,
  classifySelector,
  selectorHead,
} = require("./atomic-classifier.cjs");

test("selectorHead extracts head atom of a compound selector", () => {
  assert.equal(selectorHead(".btn:hover"), ".btn:hover");
  assert.equal(selectorHead(".card .body"), ".card");
  assert.equal(selectorHead(".grid > .item"), ".grid");
  assert.equal(selectorHead(".nav, .navbar"), ".nav");
  assert.equal(selectorHead("button[type='submit']"), "button[type='submit']");
});

test("classifySelector buckets canonical atoms", () => {
  assert.deepEqual(classifySelector(".btn"), { layer: "atoms", id: "button" });
  assert.deepEqual(classifySelector("button"), { layer: "atoms", id: "button" });
  assert.deepEqual(classifySelector(".cta-primary"), { layer: "atoms", id: "button" });
  assert.deepEqual(classifySelector("input"), { layer: "atoms", id: "input" });
  assert.deepEqual(classifySelector(".card"), { layer: "atoms", id: "card" });
  assert.deepEqual(classifySelector(".badge"), { layer: "atoms", id: "badge" });
  assert.deepEqual(classifySelector(".avatar"), { layer: "atoms", id: "avatar" });
  assert.deepEqual(classifySelector(".icon-search"), { layer: "atoms", id: "icon" });
});

test("classifySelector buckets canonical organisms", () => {
  assert.deepEqual(classifySelector("nav"), { layer: "organisms", id: "nav" });
  assert.deepEqual(classifySelector(".navbar"), { layer: "organisms", id: "nav" });
  assert.deepEqual(classifySelector("footer"), { layer: "organisms", id: "footer" });
  assert.deepEqual(classifySelector(".sidebar"), { layer: "organisms", id: "sidebar" });
  assert.deepEqual(classifySelector(".hero-section"), { layer: "organisms", id: "hero" });
  assert.deepEqual(classifySelector(".paywall"), { layer: "organisms", id: "paywall" });
});

test("classifySelector buckets templates", () => {
  assert.deepEqual(classifySelector("body"), { layer: "templates", id: "app-shell" });
  assert.deepEqual(classifySelector(".layout"), { layer: "templates", id: "layout" });
  assert.deepEqual(classifySelector(".grid"), { layer: "templates", id: "grid" });
});

test("classifySelector returns null for hashed CSS Modules classes", () => {
  // Medium hashed classes shouldn't match any pattern — honest reporting
  assert.equal(classifySelector(".em"), null);
  assert.equal(classifySelector(".ep:hover"), null);
  assert.equal(classifySelector(".cl"), null);
});

test("classifyAtomic surfaces component-properties.json keys as atoms", () => {
  const componentProperties = {
    summary: {
      button: { "font-size": { most_common: "20px" } },
      card: {},
      input: { color: { most_common: "transparent" } },
      badge: {},
    },
  };
  const out = classifyAtomic({ css: "", componentProperties });
  // button + input have non-empty entries → flagged from_component_properties
  const button = out.atoms.find((a) => a.id === "button");
  assert.ok(button);
  assert.equal(button.evidence.from_component_properties, true);
  const input = out.atoms.find((a) => a.id === "input");
  assert.ok(input);
  // card / badge have empty {} → NOT flagged (per the conservative rule)
  const card = out.atoms.find((a) => a.id === "card");
  assert.ok(!card, "empty {} entries should not be classified");
});

test("classifyAtomic counts selector matches per layer", () => {
  const css = `.btn{}.btn-primary{}.btn-ghost{}nav{}footer{}.sidebar{}`;
  const out = classifyAtomic({ css, componentProperties: null });
  const btn = out.atoms.find((a) => a.id === "button");
  assert.ok(btn);
  assert.equal(btn.selector_count, 3);
  const nav = out.organisms.find((o) => o.id === "nav");
  assert.equal(nav.selector_count, 1);
  assert.equal(out.summary.atom_count, 1);
  assert.equal(out.summary.organism_count, 3); // nav + footer + sidebar
});

test("classifyAtomic reports honest unclassified count for hashed brands", () => {
  // Medium-style hashed CSS Modules — most selectors must not match
  const css = `.em{}.ep:hover{}.cl{}.dw{}.x h2{}.av{}.dc{}`;
  const out = classifyAtomic({ css, componentProperties: null });
  // The atomic-pattern regexes do NOT match hashed classes — all should be unclassified
  assert.equal(out.summary.atom_count, 0);
  assert.equal(out.summary.organism_count, 0);
  assert.ok(out.summary.unclassified_count >= 5);
  assert.ok(out.summary.classification_coverage_pct < 30);
});

test("classifyAtomic combines CSS + component-properties evidence", () => {
  const css = `.btn{}button{}`;
  const componentProperties = {
    summary: {
      button: { "font-size": { most_common: "20px" } },
    },
  };
  const out = classifyAtomic({ css, componentProperties });
  const btn = out.atoms.find((a) => a.id === "button");
  assert.ok(btn);
  assert.equal(btn.evidence.from_component_properties, true);
  assert.ok(btn.evidence.selector_matches.includes(".btn"));
  assert.ok(btn.evidence.selector_matches.includes("button"));
});

test("classifyAtomic returns empty structure for empty input", () => {
  const out = classifyAtomic({ css: "", componentProperties: null });
  assert.deepEqual(out.atoms, []);
  assert.deepEqual(out.organisms, []);
  assert.equal(out.summary.unclassified_count, 0);
});
