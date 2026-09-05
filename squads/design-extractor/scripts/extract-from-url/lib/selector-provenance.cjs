"use strict";

// selector-provenance.cjs
//
// For each extracted token value (color hex, radius, font-family, spacing),
// record the CSS selector + property pairs that produced it. This converts
// the existing `tokens-detected.json` (value-only) into a graph that points
// from value → its sources.
//
// Concrete example from the medium gold-standard:
//   #1A8917 (primary green) is produced by:
//     - .em { background: #1A8917 }
//     - .eo { border-color: #1A8917 }
//   #242424 (text-primary) is produced by:
//     - .x h2 { color: #242424 }
//     - .av { border-bottom: solid 1px #242424 }
//     - .o  { border-color: #242424 transparent #242424 #242424 }
//
// Downstream consumers (preview.html source-verified palette, render-contract
// rationale) need this provenance to label tokens with their canonical role,
// not just an extracted hex.
//
// Per .claude/rules/extraction-no-fallbacks.md: emit only sources that
// literally appear in the source CSS. No inference, no fallback.

const { tokenizeRules, parseDeclarations } = require("./component-state-extractor.cjs");
const { resolveTerminal } = require("./var-resolver.cjs");

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const RGB_RE = /rgba?\([^)]+\)/gi;
const HSL_RE = /hsla?\([^)]+\)/gi;
const RADIUS_PROPS = new Set(["border-radius", "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius", "border-start-start-radius", "border-start-end-radius", "border-end-start-radius", "border-end-end-radius"]);
const COLOR_PROPS = new Set(["color", "background", "background-color", "border", "border-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "outline", "outline-color", "fill", "stroke", "box-shadow", "text-shadow", "caret-color", "accent-color", "column-rule-color"]);
const FONT_FAMILY_PROPS = new Set(["font-family", "font"]);

// Normalize hex to lowercase 6-digit form when possible (e.g. #FFF → #ffffff,
// #1A8917 → #1a8917) so sibling references collapse to the same key.
function normalizeHex(hex) {
  const lower = hex.toLowerCase();
  if (lower.length === 4) {
    // #abc → #aabbcc
    return "#" + lower[1] + lower[1] + lower[2] + lower[2] + lower[3] + lower[3];
  }
  return lower;
}

function ensureBucket(map, key) {
  if (!map[key]) map[key] = { selectors: [], count: 0, primary_context: null };
  return map[key];
}

function pushOccurrence(bucket, selector, property) {
  bucket.selectors.push({ selector, property });
  bucket.count++;
}

function pickPrimaryContext(bucket) {
  if (bucket.selectors.length === 0) return null;
  const counts = {};
  for (const occ of bucket.selectors) {
    counts[occ.property] = (counts[occ.property] || 0) + 1;
  }
  let best = null;
  let bestCount = 0;
  for (const [prop, c] of Object.entries(counts)) {
    if (c > bestCount) {
      best = prop;
      bestCount = c;
    }
  }
  return best;
}

// Generic / system keywords that carry no brand-specific provenance value.
// Tailwind / Obsidian / many modern brands prefix font stacks with these
// (`ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Roboto, "Inter", ...`)
// — we walk PAST them to surface the first proprietary family.
const GENERIC_FONT_FAMILY_RE = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|emoji|math|fangsong|inherit|initial|unset|revert|-apple-system|blinkmacsystemfont)$/i;

function extractFontFamilies(value) {
  // font-family list: comma-separated, may have quoted strings.
  // Walk the list left-to-right; return the FIRST family that is not a
  // generic/system keyword. Returns null when every family is generic
  // (signals: "this declaration carries no brand provenance").
  if (typeof value !== "string") return null;
  const parts = value.split(",");
  for (const raw of parts) {
    if (!raw) continue;
    const cleaned = raw.trim().replace(/^['"]|['"]$/g, "").trim();
    if (!cleaned) continue;
    if (GENERIC_FONT_FAMILY_RE.test(cleaned)) continue;
    return cleaned;
  }
  return null;
}

function extractLengthsFromSpacing(value) {
  // Tokenize space-separated lengths inside padding/margin/gap declarations
  const tokens = value.split(/\s+/).filter(Boolean);
  const out = [];
  for (const t of tokens) {
    if (/^-?\d+(\.\d+)?(px|rem|em|%|vh|vw|ch|cm|mm|in|pt|pc)$/i.test(t)) out.push(t);
    else if (t === "0") out.push("0");
  }
  return out;
}

// Build a Map(--name -> raw value) from a cssVars array (output of
// detectCssVars). Used to resolve `var()` chains in declared values when
// extracting provenance — fonts in particular often come through as
// `font-family: var(--font-sans)` rather than literal stacks.
function buildVarMap(cssVars) {
  const map = new Map();
  if (!Array.isArray(cssVars)) return map;
  for (const entry of cssVars) {
    if (!entry || typeof entry !== "object") continue;
    const name = entry.name;
    const value = entry.value;
    if (typeof name !== "string" || typeof value !== "string") continue;
    // Prefer global / :root scope when the same var is declared in multiple
    // scopes. We keep first occurrence as primary; downstream callers can
    // pre-sort the array if they want a specific scope priority.
    if (!map.has(name)) map.set(name, value);
  }
  return map;
}

// Resolve a CSS declaration value by walking any leading `var(--x)` to its
// terminal value via the cssVars map. Returns the original value if no
// resolution applies. Conservative: only resolves when the WHOLE value is a
// single var() (with optional fallback). Mixed values like
// "1rem var(--space)" are left alone.
function resolveValueIfVar(value, varMap) {
  if (typeof value !== "string") return value;
  const match = value.trim().match(/^var\(\s*(--[\w-]+)(?:\s*,\s*([^)]*))?\)\s*$/);
  if (!match) return value;
  // Try map resolution first when a map is supplied
  if (varMap && varMap.size > 0) {
    const terminal = resolveTerminal(varMap, match[1]);
    if (terminal != null) return terminal;
  }
  // Fall back to the literal fallback declared in the var() expression itself
  if (match[2]) return match[2].trim();
  return value;
}

function extractProvenance(css, options) {
  const opts = options || {};
  if (!css || typeof css !== "string") {
    return {
      colors: {},
      radii: {},
      font_families: {},
      spacing: {},
      summary: { tracked_selectors: 0, tracked_declarations: 0 },
    };
  }

  const varMap = buildVarMap(opts.cssVars);
  const rules = tokenizeRules(css);
  const colors = {};
  const radii = {};
  const fontFamilies = {};
  const spacing = {};
  let tracked = 0;

  for (const rule of rules) {
    const selector = rule.selector;
    const decls = parseDeclarations(rule.declarations);
    for (const [property, value] of Object.entries(decls)) {
      tracked++;

      // Color tokens — scan for hex / rgb / hsl in any value (not just color
      // props), since they can hide in box-shadow, border shorthand, etc.
      const hexMatches = value.match(HEX_RE) || [];
      for (const hex of hexMatches) {
        const key = normalizeHex(hex);
        const bucket = ensureBucket(colors, key);
        pushOccurrence(bucket, selector, property);
      }
      const rgbMatches = value.match(RGB_RE) || [];
      for (const rgb of rgbMatches) {
        const key = rgb.replace(/\s+/g, "");
        const bucket = ensureBucket(colors, key);
        pushOccurrence(bucket, selector, property);
      }
      const hslMatches = value.match(HSL_RE) || [];
      for (const hsl of hslMatches) {
        const key = hsl.replace(/\s+/g, "");
        const bucket = ensureBucket(colors, key);
        pushOccurrence(bucket, selector, property);
      }

      // Radii — only from radius properties
      if (RADIUS_PROPS.has(property)) {
        for (const tok of value.split(/\s+/).filter(Boolean)) {
          if (/^\d+(\.\d+)?(%|px|rem|em)$/.test(tok) || /^99em$/i.test(tok) || /^9999px$/i.test(tok)) {
            const bucket = ensureBucket(radii, tok);
            pushOccurrence(bucket, selector, property);
          }
        }
      }

      // Font families — primary family in font-family or font shorthand.
      // Resolve `var(--font-foo)` to terminal value via cssVars map so
      // brands like Obsidian (which declare `font-family: var(--font-sans)`)
      // surface their actual font stack rather than zero coverage.
      if (FONT_FAMILY_PROPS.has(property)) {
        const resolved = resolveValueIfVar(value, varMap);
        const family = extractFontFamilies(resolved);
        if (family) {
          const bucket = ensureBucket(fontFamilies, family);
          pushOccurrence(bucket, selector, property);
        }
      }

      // Spacing — track values from padding/margin/gap. Single-value & shorthand.
      if (/^(padding|margin|gap|row-gap|column-gap)(-(top|right|bottom|left|inline|block|start|end))?$/.test(property)) {
        const lengths = extractLengthsFromSpacing(value);
        for (const length of lengths) {
          const bucket = ensureBucket(spacing, length);
          pushOccurrence(bucket, selector, property);
        }
      }
    }
  }

  // Compute primary_context for each bucket
  for (const bucket of Object.values(colors)) bucket.primary_context = pickPrimaryContext(bucket);
  for (const bucket of Object.values(radii)) bucket.primary_context = pickPrimaryContext(bucket);
  for (const bucket of Object.values(fontFamilies)) bucket.primary_context = pickPrimaryContext(bucket);
  for (const bucket of Object.values(spacing)) bucket.primary_context = pickPrimaryContext(bucket);

  return {
    colors,
    radii,
    font_families: fontFamilies,
    spacing,
    summary: {
      tracked_selectors: rules.length,
      tracked_declarations: tracked,
      color_values: Object.keys(colors).length,
      radii_values: Object.keys(radii).length,
      font_family_values: Object.keys(fontFamilies).length,
      spacing_values: Object.keys(spacing).length,
    },
  };
}

module.exports = {
  extractProvenance,
  // exported for tests
  normalizeHex,
  extractFontFamilies,
  buildVarMap,
  resolveValueIfVar,
};
