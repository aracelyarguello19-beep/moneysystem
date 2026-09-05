"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  validateHtmlBalance,
  auditEmojis,
  replaceEmojisWithSvg,
  injectA11y,
  injectTransitions,
  literalizeThemeAliases,
  applyWhereWrap,
  fixBorderShorthand,
  injectPreflightRestore,
  syncImageWidth,
} = require("./html-polish.cjs");

// ── validateHtmlBalance ─────────────────────────────────────────────

test("validateHtmlBalance reports balanced for well-formed HTML", () => {
  const html = `<html><body><div><p>x</p></div></body></html>`;
  const out = validateHtmlBalance(html);
  assert.equal(out.balanced, true);
  assert.deepEqual(out.mismatches, []);
});

test("validateHtmlBalance flags missing close tag", () => {
  const html = `<div><p>x</p>`;
  const out = validateHtmlBalance(html);
  assert.equal(out.balanced, false);
  const div = out.mismatches.find((m) => m.tag === "div");
  assert.ok(div);
  assert.equal(div.delta, 1);
});

test("validateHtmlBalance ignores comments + doctype", () => {
  const html = `<!doctype html><!-- <div> not real --><html><body></body></html>`;
  const out = validateHtmlBalance(html);
  assert.equal(out.balanced, true);
});

// ── auditEmojis + replaceEmojisWithSvg ─────────────────────────────

test("auditEmojis distinguishes mapped, unmapped, preserved", () => {
  const html = `<p>Rate: ★★★ — and we say "hello" 🦄 yet ✓ checks pass.</p>`;
  const out = auditEmojis(html);
  assert.ok(out.mapped["★"]);
  assert.ok(out.mapped["✓"]);
  // 🦄 (unicorn) is not in our dict — should be unmapped
  assert.ok(out.unmapped["🦄"]);
});

test("replaceEmojisWithSvg substitutes mapped emojis with SVG", () => {
  const html = `<p>★ rated</p>`;
  const out = replaceEmojisWithSvg(html);
  // ★ replaced with SVG
  assert.match(out.html, /<svg[\s\S]*?<\/svg>/);
  assert.ok(!/★/.test(out.html));
  assert.ok(out.replaced["★"] >= 1);
});

test("replaceEmojisWithSvg preserves typographic glyphs (em-dash, ellipsis)", () => {
  const html = `<p>Hello — world…</p>`;
  const out = replaceEmojisWithSvg(html);
  assert.match(out.html, /Hello — world…/);
});

test("replaceEmojisWithSvg skips comments, code, pre, style, and script blocks", () => {
  const html = [
    `<!-- keep ★ in comments -->`,
    `<style>.x::before{content:"★"}</style>`,
    `<script>const rating = "★";</script>`,
    `<pre>★ pre</pre>`,
    `<code>★ code</code>`,
    `<p>★ visible</p>`,
  ].join("");
  const out = replaceEmojisWithSvg(html);
  assert.match(out.html, /<!-- keep ★ in comments -->/);
  assert.match(out.html, /content:"★"/);
  assert.match(out.html, /rating = "★"/);
  assert.match(out.html, /<pre>★ pre<\/pre>/);
  assert.match(out.html, /<code>★ code<\/code>/);
  assert.match(out.html, /<p><svg[\s\S]*?visible<\/p>/);
  assert.equal(out.replaced["★"], 1);
});

// ── injectA11y ──────────────────────────────────────────────────────

test("injectA11y adds focus-visible CSS and skip-to-content link", () => {
  const html = `<html><head><style>.x{}</style></head><body><main>content</main></body></html>`;
  const out = injectA11y(html);
  assert.match(out.html, /:focus-visible \{/);
  assert.match(out.html, /class="skip-to-content"/);
  assert.equal(out.changes.focus_css, true);
  assert.equal(out.changes.skip_link, true);
  // <main> should get id="main-content"
  assert.match(out.html, /<main id="main-content">/);
});

test("injectA11y adds aria-label to icon-only buttons", () => {
  const html = `<html><head><style></style></head><body><button><svg viewBox="0 0 16 16"></svg></button></body></html>`;
  const out = injectA11y(html);
  assert.match(out.html, /<button aria-label="action">/);
});

test("injectA11y is idempotent — no double injection", () => {
  const html = `<html><head><style>:focus-visible { outline: 2px solid currentColor; }</style></head><body><a href="#main-content" class="skip-to-content">Skip</a></body></html>`;
  const out = injectA11y(html);
  assert.equal(out.changes.focus_css, false);
  assert.equal(out.changes.skip_link, false);
});

// ── injectTransitions ───────────────────────────────────────────────

test("injectTransitions adds 300ms linear transition for default props", () => {
  const html = `<html><head><style>.x{}</style></head><body></body></html>`;
  const out = injectTransitions(html);
  assert.equal(out.changed, true);
  assert.match(out.html, /transition: background-color 300ms linear, color 300ms linear/);
});

test("injectTransitions accepts custom properties + duration", () => {
  const html = `<html><head><style></style></head><body></body></html>`;
  const out = injectTransitions(html, { properties: ["opacity", "transform"], duration: "200ms", timing: "ease-out" });
  assert.match(out.html, /transition: opacity 200ms ease-out, transform 200ms ease-out/);
});

// ── literalizeThemeAliases ──────────────────────────────────────────

test("literalizeThemeAliases replaces var() chains in @theme with hex", () => {
  const css = `
    :root { --primary: #1a8917; }
    @theme {
      --color-primary: var(--primary);
      --color-foo: var(--unknown, #ffffff);
    }
  `;
  const out = literalizeThemeAliases(css);
  assert.equal(out.changed, true);
  assert.match(out.css, /--color-primary: #1a8917/);
});

test("literalizeThemeAliases leaves unknown var() chains intact", () => {
  const css = `@theme { --color-x: var(--missing); }`;
  const out = literalizeThemeAliases(css);
  assert.equal(out.changed, false);
  assert.match(out.css, /var\(--missing\)/);
});

// ── applyWhereWrap ──────────────────────────────────────────────────

test("applyWhereWrap reduces specificity by wrapping selector in :where()", () => {
  const css = `.md h3 { color: red; } .md h3 { font-family: serif; }`;
  const out = applyWhereWrap(css, [".md h3"]);
  assert.equal(out.changed, true);
  assert.match(out.css, /:where\(\.md h3\) \{ color: red; \}/);
});

// ── fixBorderShorthand ──────────────────────────────────────────────

test("fixBorderShorthand converts border-color longhand into shorthand on target", () => {
  const css = `.md-panel-do { border-color: rgba(0, 200, 0, 0.4); padding: 1rem; }`;
  const out = fixBorderShorthand(css, { selectors: [".md-panel-do"] });
  assert.equal(out.changed, true);
  assert.match(out.css, /border:\s*1px solid rgba\(0, 200, 0, 0\.4\)/);
});

// ── injectPreflightRestore ──────────────────────────────────────────

test("injectPreflightRestore inserts scoped restore rules", () => {
  const html = `<html><head><style>.brand{}</style></head><body></body></html>`;
  const out = injectPreflightRestore(html, { scope: ".brand" });
  assert.equal(out.changed, true);
  assert.match(out.html, /\.brand h1, \.brand h2/);
  assert.match(out.html, /\.brand ul\.list-disc \{ list-style: disc/);
});

test("injectPreflightRestore is idempotent", () => {
  const html = `<style>.md h1, .md h2, .md h3, .md h4, .md h5, .md h6 { font-size: revert; }</style>`;
  const out = injectPreflightRestore(html);
  assert.equal(out.changed, false);
});

// ── syncImageWidth ──────────────────────────────────────────────────

test("syncImageWidth updates Tailwind w-[Npx] arbitrary width", () => {
  const html = `<img class="w-[220px] object-cover" src="x.jpg">`;
  const out = syncImageWidth(html, { width: "200px" });
  assert.equal(out.changed, true);
  assert.match(out.html, /w-\[200px\]/);
});

test("syncImageWidth updates inline width attribute", () => {
  const html = `<img width="220" src="x.jpg">`;
  const out = syncImageWidth(html, { width: "200px" });
  assert.equal(out.changed, true);
  assert.match(out.html, /width="200"/);
});
