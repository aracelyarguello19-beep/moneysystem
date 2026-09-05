"use strict";

// html-polish.cjs
//
// Consolidated post-processing utilities for design-ops HTML output.
// Each function operates on a string (HTML or CSS) and returns the
// transformed string plus a report of what changed. NO side effects.
//
// All utilities promoted from the medium gold-standard 30-hour session
// (transform-html-tailwind-gold-standard). Per .claude/rules/extraction-no-fallbacks.md
// these belong in design-ops at the **application/render layer**, NOT in
// the extraction layer. Use them when you OWN the output and want to
// normalize it.
//
// Organized into 4 categories:
//   1. Audit + transform (validateHtmlBalance, replaceEmojisWithSvg)
//   2. A11y / motion (injectA11y, injectTransitions)
//   3. Tailwind v4 fixes (literalizeThemeAliases, applyWhereWrap,
//      fixBorderShorthand, injectPreflightRestore, syncImageWidth)

const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

// ── 1. validateHtmlBalance ──────────────────────────────────────────
// Counts paired tags. Reports per-tag mismatch + line range hints.

const PAIRED_TAGS = ["html", "head", "body", "div", "section", "article", "header", "footer", "nav", "aside", "main", "ul", "ol", "li", "table", "tr", "td", "th", "tbody", "thead", "tfoot", "form", "label", "select", "button", "a", "p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "style", "script", "blockquote"];

function validateHtmlBalance(html) {
  if (!html || typeof html !== "string") {
    return { balanced: true, mismatches: [], counts: {} };
  }
  // Strip <!-- ... --> comments and <!doctype...> first to avoid false counts
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!doctype[^>]*>/gi, "");

  const counts = {};
  const mismatches = [];
  for (const tag of PAIRED_TAGS) {
    const openRe = new RegExp(`<${tag}\\b[^>]*?(?<!/)>`, "gi");
    const closeRe = new RegExp(`</${tag}>`, "gi");
    // Self-closing handled: openRe excludes /> via lookbehind
    const opens = (cleaned.match(openRe) || []).length;
    const closes = (cleaned.match(closeRe) || []).length;
    counts[tag] = { open: opens, close: closes };
    if (opens !== closes) {
      mismatches.push({ tag, open: opens, close: closes, delta: opens - closes });
    }
  }
  return {
    balanced: mismatches.length === 0,
    mismatches,
    counts,
  };
}

// ── 2. replaceEmojisWithSvg ─────────────────────────────────────────
// Audits emojis + replaces with SVG from the emoji-svg-dict.yaml.

let _cachedEmojiDict = null;

function loadEmojiDict(dictPath) {
  if (_cachedEmojiDict && !dictPath) return _cachedEmojiDict;
  const target = dictPath || path.join(__dirname, "..", "..", "..", "data", "emoji-svg-dict.yaml");
  if (!fs.existsSync(target)) {
    return { mappings: {}, preserved_glyphs: [] };
  }
  const raw = fs.readFileSync(target, "utf8");
  const parsed = YAML.parse(raw);
  if (!dictPath) _cachedEmojiDict = parsed;
  return parsed;
}

// Match Unicode emoji ranges. Conservative — symbols, dingbats, misc symbols,
// emoticons. Excludes letter/digit characters.
const EMOJI_RE = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{2B00}-\u{2BFF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F1FF}]|[\u{1F200}-\u{1F2FF}]|[←-⇿]|[⊕]|[⌂]|[⌕]|[☰]|[⚙]/gu;

function auditEmojis(html, options) {
  const opts = options || {};
  const dict = opts.dict || loadEmojiDict();
  const counts = {};
  const matches = html.match(EMOJI_RE) || [];
  for (const e of matches) {
    counts[e] = (counts[e] || 0) + 1;
  }
  const mapped = {};
  const unmapped = {};
  for (const [emoji, count] of Object.entries(counts)) {
    if (dict.preserved_glyphs && dict.preserved_glyphs.includes(emoji)) continue;
    if (dict.mappings && dict.mappings[emoji]) {
      mapped[emoji] = { count, name: dict.mappings[emoji].name };
    } else {
      unmapped[emoji] = count;
    }
  }
  return { total_emojis: matches.length, mapped, unmapped };
}

const PROTECTED_HTML_RE = /<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<pre\b[\s\S]*?<\/pre>|<code\b[\s\S]*?<\/code>/gi;

function countLiteral(haystack, needle) {
  if (!haystack || !needle) return 0;
  return haystack.split(needle).length - 1;
}

function replaceLiteralOutsideProtected(html, needle, replacement) {
  let out = "";
  let replaced = 0;
  let lastIndex = 0;
  let match;
  PROTECTED_HTML_RE.lastIndex = 0;
  while ((match = PROTECTED_HTML_RE.exec(html)) !== null) {
    const segment = html.slice(lastIndex, match.index);
    replaced += countLiteral(segment, needle);
    out += segment.split(needle).join(replacement);
    out += match[0];
    lastIndex = match.index + match[0].length;
  }
  const tail = html.slice(lastIndex);
  replaced += countLiteral(tail, needle);
  out += tail.split(needle).join(replacement);
  return { html: out, replaced };
}

function replaceEmojisWithSvg(html, options) {
  const opts = options || {};
  const dict = opts.dict || loadEmojiDict();
  let out = html;
  const replaced = {};
  const skipped = {};
  if (!dict.mappings) return { html: out, replaced, skipped, total_replacements: 0 };
  for (const [emoji, def] of Object.entries(dict.mappings)) {
    if (!def || !def.svg) continue;
    const result = replaceLiteralOutsideProtected(out, emoji, def.svg);
    out = result.html;
    if (result.replaced > 0) {
      replaced[emoji] = (replaced[emoji] || 0) + result.replaced;
    }
  }
  // Audit remaining unmapped emojis
  const remaining = out.match(EMOJI_RE) || [];
  for (const e of remaining) {
    if (dict.preserved_glyphs && dict.preserved_glyphs.includes(e)) continue;
    skipped[e] = (skipped[e] || 0) + 1;
  }
  const total_replacements = Object.values(replaced).reduce((a, b) => a + b, 0);
  return { html: out, replaced, skipped, total_replacements };
}

// ── 3. injectA11y ───────────────────────────────────────────────────
// Adds focus rings (global), skip-to-content link, ARIA on icon-only buttons.
// Per .claude/rules/wcag-focus-policy.md (focus is GLOBAL in globals.css,
// not per-component).

const A11Y_FOCUS_CSS = `
/* WCAG 2.2 AAA focus discipline — global rule, not per-component (see .claude/rules/wcag-focus-policy.md) */
:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
*:focus:not(:focus-visible) {
  outline: none;
}
`.trim();

const A11Y_SKIP_LINK_CSS = `
/* Skip-to-content link (keyboard accessibility) */
.skip-to-content {
  position: absolute;
  left: -9999px;
  top: auto;
  width: 1px;
  height: 1px;
  overflow: hidden;
  z-index: 100;
}
.skip-to-content:focus {
  position: fixed;
  left: 1rem;
  top: 1rem;
  width: auto;
  height: auto;
  padding: 0.5rem 1rem;
  background: currentColor;
  color: white;
}
`.trim();

const A11Y_SKIP_LINK_HTML = '<a href="#main-content" class="skip-to-content">Skip to main content</a>';

function injectA11y(html, options) {
  const opts = options || {};
  let out = html;
  const changes = { focus_css: false, skip_link: false, skip_link_target: false };

  // 1. Inject focus-visible CSS into the FIRST <style> tag (or after <head>)
  if (!/:focus-visible\s*\{/.test(out)) {
    if (/<style\b[^>]*>/.test(out)) {
      out = out.replace(/(<style\b[^>]*>)/i, `$1\n${A11Y_FOCUS_CSS}\n${A11Y_SKIP_LINK_CSS}\n`);
      changes.focus_css = true;
    } else if (/<\/head>/i.test(out)) {
      out = out.replace(/<\/head>/i, `<style>\n${A11Y_FOCUS_CSS}\n${A11Y_SKIP_LINK_CSS}\n</style>\n</head>`);
      changes.focus_css = true;
    }
  }

  // 2. Inject skip-to-content link as first child of <body>
  if (!/class=["']skip-to-content["']/.test(out)) {
    if (/<body\b[^>]*>/i.test(out)) {
      out = out.replace(/(<body\b[^>]*>)/i, `$1\n  ${A11Y_SKIP_LINK_HTML}`);
      changes.skip_link = true;
    }
  }

  // 3. Ensure id="main-content" exists somewhere — try to set on <main>
  if (!/id=["']main-content["']/.test(out) && /<main\b[^>]*>/i.test(out)) {
    out = out.replace(/<main\b([^>]*)>/i, (m, attrs) => {
      if (/\bid=/.test(attrs)) return m;
      return `<main${attrs} id="main-content">`;
    });
    changes.skip_link_target = true;
  }

  // 4. Add aria-label to icon-only buttons (heuristic: button containing only <svg>)
  if (opts.injectAriaOnIconButtons !== false) {
    const iconBtnRe = /<button\b([^>]*)>(\s*<svg\b[^<]*<\/svg>\s*)<\/button>/gi;
    let ariaCount = 0;
    out = out.replace(iconBtnRe, (m, attrs, svg) => {
      if (/aria-label=/.test(attrs)) return m;
      ariaCount++;
      return `<button${attrs} aria-label="action">${svg}</button>`;
    });
    if (ariaCount > 0) changes.aria_added = ariaCount;
  }

  return { html: out, changes };
}

// ── 4. injectTransitions ────────────────────────────────────────────
// Inject brand-canonical 300ms linear transitions. Default property set
// matches the medium gold-standard signature (bg-color + color).

function injectTransitions(html, options) {
  const opts = options || {};
  const properties = opts.properties || ["background-color", "color"];
  const duration = opts.duration || "300ms";
  const timing = opts.timing || "linear";
  const selector = opts.selector || "a, button, input, textarea, select, [role=\"button\"], [role=\"link\"]";

  const transitionList = properties.map((p) => `${p} ${duration} ${timing}`).join(", ");
  const block = `
/* Brand-canonical motion (extracted) — only properties present in source */
${selector} {
  transition: ${transitionList};
}
`.trim();

  if (new RegExp(`transition:\\s*${properties[0]}\\s+${duration}`).test(html)) {
    return { html, changed: false };
  }

  let out = html;
  if (/<style\b[^>]*>/.test(out)) {
    out = out.replace(/(<style\b[^>]*>)/i, `$1\n${block}\n`);
  } else if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `<style>\n${block}\n</style>\n</head>`);
  } else {
    return { html, changed: false, message: "No <style> or <head> insertion point" };
  }
  return { html: out, changed: true };
}

// ── 5. literalizeThemeAliases ───────────────────────────────────────
// Replace `var(--token)` chains inside `@theme { ... }` block with literal
// hex values. Tailwind v4 alias-chain failure fix from medium gold-standard.

function literalizeThemeAliases(css, options) {
  const opts = options || {};
  if (!css || typeof css !== "string") return { css, changed: false };

  // Build a map of --token -> hex by walking declarations OUTSIDE @theme
  // (or inside, prioritizing literal values).
  const literals = new Map();

  // Pass 1: find every `--name: <hex>;` declaration with literal hex
  const literalRe = /(--[a-z][\w-]*)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g;
  let m;
  while ((m = literalRe.exec(css)) !== null) {
    if (!literals.has(m[1])) literals.set(m[1], m[2]);
  }

  // Pass 2: walk @theme block, replace var(--name) with literal if known
  let changed = false;
  const replacements = {};
  const themeBlockRe = /(@theme\s*\{)([\s\S]*?)(\})/g;
  const out = css.replace(themeBlockRe, (full, open, body, close) => {
    const newBody = body.replace(/var\(\s*(--[a-z][\w-]*)(?:\s*,\s*[^)]*)?\s*\)/g, (vm, name) => {
      const hex = literals.get(name);
      if (hex) {
        changed = true;
        replacements[name] = hex;
        return hex;
      }
      return vm;
    });
    return open + newBody + close;
  });

  return { css: out, changed, replacements };
}

// ── 6. applyWhereWrap ───────────────────────────────────────────────
// Wrap a CSS selector in `:where(...)` to drop its specificity to 0.
// Use case: ".md h3" (0,1,1) blocking inline utilities → ":where(.md h3)" (0).

function applyWhereWrap(css, selectors) {
  if (!css || typeof css !== "string" || !Array.isArray(selectors) || selectors.length === 0) {
    return { css, changed: false };
  }
  let out = css;
  let changed = false;
  for (const sel of selectors) {
    const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![.\\w])${escaped}(?=\\s*\\{)`, "g");
    const replacement = `:where(${sel})`;
    const next = out.replace(re, replacement);
    if (next !== out) {
      out = next;
      changed = true;
    }
  }
  return { css: out, changed };
}

// ── 7. fixBorderShorthand ───────────────────────────────────────────
// Convert `border-color: ...` (longhand) into `border: 1px solid ...`
// (shorthand) on selectors that need to override a parent shorthand.
// Medium .md-panel-do bug — full re-assert beats border-color alone.

function fixBorderShorthand(css, options) {
  const opts = options || {};
  if (!css || typeof css !== "string") return { css, changed: false };
  const selectors = opts.selectors || [];
  if (selectors.length === 0) {
    // Heuristic mode: find rules with `border-color: ...;` but no `border:`
    return { css, changed: false, message: "No selectors specified — heuristic mode TBD" };
  }
  const width = opts.width || "1px";
  const style = opts.style || "solid";
  let out = css;
  let changed = false;
  for (const sel of selectors) {
    const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(${escaped}\\s*\\{[^}]*?)border-color\\s*:\\s*([^;]+);`, "g");
    const next = out.replace(re, (full, prefix, colorVal) => {
      changed = true;
      return `${prefix}border: ${width} ${style} ${colorVal.trim()};`;
    });
    if (next !== out) out = next;
  }
  return { css: out, changed };
}

// ── 8. injectPreflightRestore ───────────────────────────────────────
// Restore Tailwind v4 preflight casualties (h1-6 font-size:inherit,
// ul/ol margin/padding/list-style:none reset, p margin:0, etc.) inside
// a scoped CSS root selector.

const PREFLIGHT_RESTORE_BLOCK = `
/* Restore Tailwind v4 preflight casualties (scoped) */
{ROOT} h1, {ROOT} h2, {ROOT} h3, {ROOT} h4, {ROOT} h5, {ROOT} h6 { font-size: revert; font-weight: revert; }
{ROOT} ul.list-disc { list-style: disc; padding-left: 1.5rem; }
{ROOT} ol.list-decimal { list-style: decimal; padding-left: 1.5rem; }
{ROOT} p { margin: revert; }
{ROOT} blockquote { margin: revert; padding-left: 1rem; border-left: 3px solid currentColor; }
{ROOT} button { cursor: pointer; }
`.trim();

function injectPreflightRestore(html, options) {
  const opts = options || {};
  const root = opts.scope || ".md";
  const block = PREFLIGHT_RESTORE_BLOCK.replace(/\{ROOT\}/g, root);

  if (html.includes(`${root} h1, ${root} h2`)) {
    return { html, changed: false, message: "Preflight restore already present" };
  }
  let out = html;
  if (/<style\b[^>]*>/.test(out)) {
    out = out.replace(/(<style\b[^>]*>)/i, `$1\n${block}\n`);
    return { html: out, changed: true };
  }
  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `<style>\n${block}\n</style>\n</head>`);
    return { html: out, changed: true };
  }
  return { html, changed: false, message: "No <style> or <head> insertion point" };
}

// ── 9. syncImageWidth ───────────────────────────────────────────────
// Ensure <img> width matches its grid container's column width. Targets
// a specific layout bug: image with `w-[220px]` placed inside `1fr 200px`
// grid column overflows.

function syncImageWidth(html, options) {
  const opts = options || {};
  if (!html || typeof html !== "string") return { html, changed: false };
  const targetWidth = opts.width;
  const selector = opts.imgSelector || "img";
  if (!targetWidth) {
    return { html, changed: false, message: "No targetWidth specified" };
  }
  // Replace explicit width attributes / Tailwind w-[<n>px] with the target
  let out = html;
  let changed = false;
  // Tailwind arbitrary width
  out = out.replace(new RegExp(`(<${selector}\\b[^>]*\\bclass=["'][^"']*?)w-\\[\\d+px\\]`, "g"), (full, prefix) => {
    changed = true;
    return `${prefix}w-[${targetWidth}]`;
  });
  // Inline width attribute
  out = out.replace(new RegExp(`(<${selector}\\b[^>]*\\b)width=["']\\d+["']`, "g"), (full, prefix) => {
    changed = true;
    return `${prefix}width="${parseInt(targetWidth)}"`;
  });
  return { html: out, changed };
}

module.exports = {
  // Audit + transform
  validateHtmlBalance,
  auditEmojis,
  replaceEmojisWithSvg,
  loadEmojiDict,
  // A11y / motion
  injectA11y,
  injectTransitions,
  // Tailwind v4 fixes
  literalizeThemeAliases,
  applyWhereWrap,
  fixBorderShorthand,
  injectPreflightRestore,
  syncImageWidth,
  // Constants
  A11Y_FOCUS_CSS,
  A11Y_SKIP_LINK_CSS,
  A11Y_SKIP_LINK_HTML,
};
