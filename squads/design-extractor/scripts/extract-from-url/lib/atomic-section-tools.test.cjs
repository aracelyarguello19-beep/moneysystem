"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  loadTaxonomy,
  locateMarkers,
  extractBlocks,
  validateAtomicOrder,
  reorderSections,
} = require("./atomic-section-tools.cjs");

test("loadTaxonomy reads and parses the YAML taxonomy", () => {
  const t = loadTaxonomy();
  assert.ok(Array.isArray(t.sections));
  assert.equal(t.sections.length, 13);
  assert.equal(t.sections[0].id, "atoms-color-palette");
  assert.equal(t.sections[12].id, "do-and-dont");
});

test("locateMarkers finds zero-padded NN markers", () => {
  const html = `
    <!-- 01 ATOMS · Color palette -->
    <section class="md-section">A</section>
    <!-- 02 ATOMS · Typography -->
    <section class="md-section">B</section>
  `;
  const markers = locateMarkers(html);
  assert.equal(markers.length, 2);
  assert.equal(markers[0].n, "01");
  assert.equal(markers[1].n, "02");
});

test("extractBlocks bounds blocks by next-marker-start (gold standard bugfix)", () => {
  // Critical: inner <section class="md-feed">...</section> inside Section 09
  // must NOT terminate the block prematurely. Bound by next-marker-start.
  const html = `
<!-- 09 PAGES · app shell -->
<section class="md-section">
  <main class="md-shell-main">
    <section class="md-feed">inner feed</section>
  </main>
  <span class="num">09</span>
</section>
<!-- 10 PAGES · Profile page -->
<section class="md-section">profile</section>
  `;
  const markers = locateMarkers(html);
  const blocks = extractBlocks(html, markers);
  assert.equal(blocks.length, 2);
  // Section 09 block MUST contain the inner feed AND the closing num span
  assert.match(blocks[0].content, /md-feed/);
  assert.match(blocks[0].content, /<span class="num">09<\/span>/);
});

test("extractBlocks respects <footer> as tail boundary", () => {
  const html = `
<!-- 13 Do & Don't -->
<section class="md-section">last</section>
<footer>site footer</footer>
  `;
  const markers = locateMarkers(html);
  const blocks = extractBlocks(html, markers);
  assert.equal(blocks.length, 1);
  // The block MUST NOT include <footer
  assert.ok(!/<footer/.test(blocks[0].content));
});

test("validateAtomicOrder reports valid for canonical-ordered HTML", () => {
  const html = `
    <!-- 01 ATOMS · Color palette -->
    <section class="md-section">Color palette content</section>
    <!-- 02 ATOMS · Typography -->
    <section class="md-section">Typography content</section>
    <!-- 03 ATOMS · Spacing · Radius · Elevation -->
    <section class="md-section">Spacing · Radius content</section>
  `;
  const out = validateAtomicOrder(html);
  assert.equal(out.valid, true);
  assert.equal(out.sequence.length, 3);
  // Warnings expected (10 missing canonical sections) — but no errors
  assert.equal(out.errors.length, 0);
});

test("validateAtomicOrder errors when order is not monotonic", () => {
  const html = `
    <!-- 02 ATOMS · Typography -->
    <section>Typography</section>
    <!-- 01 ATOMS · Color palette -->
    <section>Color palette</section>
  `;
  const out = validateAtomicOrder(html);
  assert.equal(out.valid, false);
  assert.ok(out.errors.length >= 1);
});

test("reorderSections puts sections in canonical order and renumbers markers", () => {
  // Out-of-order: profile (10), then color (01), then typography (02)
  const html = `
<!-- 10 PAGES · Profile page -->
<section class="md-section"><span class="num">10</span>Profile page content</section>
<!-- 01 ATOMS · Color palette -->
<section class="md-section"><span class="num">01</span>Color palette content</section>
<!-- 02 ATOMS · Typography -->
<section class="md-section"><span class="num">02</span>Typography content</section>
  `;
  const out = reorderSections(html);
  assert.equal(out.changed, true);
  // After reorder: 01, 02, 10 in that order in the output html
  const idxColor = out.html.indexOf("Color palette");
  const idxType = out.html.indexOf("Typography");
  const idxProfile = out.html.indexOf("Profile page content");
  assert.ok(idxColor < idxType, "color should precede typography");
  assert.ok(idxType < idxProfile, "typography should precede profile");
  // Marker numbers should match canonical
  assert.match(out.html, /<!-- 01 ATOMS · Color palette -->/);
  assert.match(out.html, /<!-- 02 ATOMS · Typography -->/);
  assert.match(out.html, /<!-- 10 PAGES · Profile page -->/);
});

test("reorderSections deduplicates by largest block when same signature appears twice", () => {
  // Two "Color palette" blocks — bigger one should win
  const html = `
<!-- 01 ATOMS · Color palette -->
<section class="md-section">small Color palette</section>
<!-- 02 ATOMS · Typography -->
<section class="md-section">Typography</section>
<!-- 03 ATOMS · Color palette duplicate -->
<section class="md-section">a much larger Color palette block with extensive swatches and tokens and provenance and verification details</section>
  `;
  const out = reorderSections(html);
  // The larger block should be retained
  assert.match(out.html, /a much larger Color palette block/);
  // The small one should NOT appear (deduped — only largest kept)
  assert.ok(!/small Color palette/.test(out.html));
});

test("reorderSections preserves unmatched custom sections", () => {
  const html = `
<!-- 10 PAGES · Profile page -->
<section class="md-section"><span class="num">10</span>Profile page content</section>
<!-- 77 CUSTOM · Experimental panel -->
<section class="md-section">custom panel content</section>
<!-- 01 ATOMS · Color palette -->
<section class="md-section"><span class="num">01</span>Color palette content</section>
  `;
  const out = reorderSections(html);
  assert.equal(out.changed, true);
  assert.match(out.html, /custom panel content/);
  assert.equal(out.orphan_count, 1);
  assert.match(out.message, /1 orphan section preserved/);
});

test("reorderSections returns no-op for HTML without markers", () => {
  const html = "<html><body><h1>plain</h1></body></html>";
  const out = reorderSections(html);
  assert.equal(out.changed, false);
});
