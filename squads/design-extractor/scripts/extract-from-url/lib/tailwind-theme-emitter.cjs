"use strict";

// tailwind-theme-emitter.cjs
//
// Emits a Tailwind v4 `<style type="text/tailwindcss">@theme { ... }</style>`
// block from a tokens.json frontmatter object. Output is a string, ready for
// inline embedding in a standalone HTML preview.
//
// Per squads/design-ops/rules/tailwind-v4.md (Tailwind v4 quirks captured from the
// transform-html-tailwind-gold-standard 30h session):
//   - HEX LITERAL VALUES ONLY in @theme. NO var() alias chains. Tailwind v4
//     does not reliably resolve `var(--a, var(--b, x))` during token parsing.
//   - PRESERVE COMMAS in font-family lists, gradients, rgba(). Do not split
//     naively or replace with underscores.
//   - DO NOT use @apply for component classes — those go in plain CSS via
//     the companion component-class-emitter.
//
// Per .claude/rules/extraction-no-fallbacks.md:
//   - ONLY emit values present in the input tokens. Skip empty/null.
//   - DO NOT inject placeholder hex (#ffffff fallback, #000000 default, etc).
//   - When a slot is missing, the line is omitted entirely. Downstream
//     consumers decide whether to fill it.

// Slugify a font-family declaration into a CSS custom property suffix.
// "gt-super, Georgia, Cambria, ..." → "serif" (first family, lowercased,
// hyphenated, generic-keyword filtered)
function familyToSlug(family, fallbackIndex) {
  if (typeof family !== "string") return null;
  const first = family.split(",")[0];
  if (!first) return null;
  const cleaned = first.trim().replace(/^['"]|['"]$/g, "");
  if (/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|inherit|initial|unset|revert)$/i.test(cleaned)) {
    return null;
  }
  // Normalize: lowercase, replace whitespace with hyphens, strip non [a-z0-9-]
  const slug = cleaned.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return slug || `font-${fallbackIndex}`;
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value);
}

function isCssLength(value) {
  return typeof value === "string" && /^(\d+(\.\d+)?(px|rem|em|%|vh|vw|ch)|0)$/.test(value);
}

// Take typography object → { font_families, text_sizes }
function extractFontFamilies(typography) {
  if (!typography || typeof typography !== "object") return new Map();
  const map = new Map();
  let i = 0;
  for (const style of Object.values(typography)) {
    if (!style || !style.fontFamily) continue;
    const slug = familyToSlug(style.fontFamily, i++);
    if (!slug) continue;
    if (!map.has(slug)) {
      map.set(slug, style.fontFamily);
    }
  }
  return map;
}

// Build text-{size} entries from typography styles. Each named style emits a
// --text-{name} pair (the size). Tailwind v4 also accepts --text-{name}--lh
// for line-height and --text-{name}--ls for letter-spacing.
function extractTextScale(typography) {
  if (!typography || typeof typography !== "object") return [];
  const out = [];
  for (const [styleName, style] of Object.entries(typography)) {
    if (!style || typeof style !== "object") continue;
    const entry = { name: styleName };
    if (typeof style.fontSize === "string") entry.size = style.fontSize;
    if (typeof style.lineHeight === "string") entry.lineHeight = style.lineHeight;
    if (typeof style.letterSpacing === "string") entry.letterSpacing = style.letterSpacing;
    if (typeof style.fontWeight === "number" || typeof style.fontWeight === "string") {
      entry.weight = String(style.fontWeight);
    }
    if (entry.size || entry.lineHeight) out.push(entry);
  }
  return out;
}

// Public: emit the @theme string. Options:
//   indent — string used for indentation inside @theme (default "    ")
//   selector — wrapping selector for the <style>; defaults to inline tailwindcss block.
function emitTailwindTheme(tokens, options) {
  const opts = options || {};
  const indent = opts.indent || "    ";
  const lines = [];
  if (!opts.bareTheme) {
    lines.push('<style type="text/tailwindcss">');
    lines.push("  @theme {");
  } else {
    lines.push("@theme {");
  }

  const colors = (tokens && tokens.colors) || {};
  const colorEntries = Object.entries(colors)
    .filter(([, v]) => isHexColor(v))
    .map(([k, v]) => [k.toLowerCase().replace(/[^a-z0-9-]/g, "-"), v.toLowerCase()]);
  if (colorEntries.length > 0) {
    for (const [name, hex] of colorEntries) {
      lines.push(`${indent}--color-${name}: ${hex};`);
    }
  }

  const families = extractFontFamilies(tokens && tokens.typography);
  if (families.size > 0) {
    if (colorEntries.length > 0) lines.push("");
    for (const [slug, family] of families) {
      // Preserve comma + spaces — Tailwind v4 accepts the full font stack
      lines.push(`${indent}--font-${slug}: ${family};`);
    }
  }

  const textScale = extractTextScale(tokens && tokens.typography);
  if (textScale.length > 0) {
    lines.push("");
    for (const entry of textScale) {
      const safeName = entry.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      if (entry.size) lines.push(`${indent}--text-${safeName}: ${entry.size};`);
      if (entry.lineHeight) lines.push(`${indent}--text-${safeName}--line-height: ${entry.lineHeight};`);
      if (entry.letterSpacing) lines.push(`${indent}--text-${safeName}--letter-spacing: ${entry.letterSpacing};`);
      if (entry.weight) lines.push(`${indent}--text-${safeName}--font-weight: ${entry.weight};`);
    }
  }

  const rounded = (tokens && tokens.rounded) || {};
  const radiusEntries = Object.entries(rounded).filter(([, v]) => isCssLength(v));
  if (radiusEntries.length > 0) {
    lines.push("");
    for (const [name, value] of radiusEntries) {
      const safe = String(name).toLowerCase().replace(/[^a-z0-9-]/g, "-");
      lines.push(`${indent}--radius-${safe}: ${value};`);
    }
  }

  const spacing = (tokens && tokens.spacing) || {};
  const spacingEntries = Object.entries(spacing).filter(([, v]) => isCssLength(v));
  if (spacingEntries.length > 0) {
    lines.push("");
    for (const [name, value] of spacingEntries) {
      const safe = String(name).toLowerCase().replace(/[^a-z0-9-]/g, "-");
      lines.push(`${indent}--spacing-${safe}: ${value};`);
    }
  }

  // Close
  if (!opts.bareTheme) {
    lines.push("  }");
    lines.push("</style>");
  } else {
    lines.push("}");
  }

  return lines.join("\n");
}

// Generate companion `:root` CSS variable block — sometimes consumers prefer
// CSS-vars over Tailwind @theme (e.g., when not using Tailwind at all). Same
// "no fallback" rule applies.
function emitCssVariableRoot(tokens, options) {
  const opts = options || {};
  const selector = opts.selector || ":root";
  const indent = opts.indent || "  ";
  const lines = [];
  lines.push(`${selector} {`);

  const colors = (tokens && tokens.colors) || {};
  for (const [k, v] of Object.entries(colors)) {
    if (isHexColor(v)) {
      const name = k.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      lines.push(`${indent}--color-${name}: ${v.toLowerCase()};`);
    }
  }
  const rounded = (tokens && tokens.rounded) || {};
  for (const [k, v] of Object.entries(rounded)) {
    if (isCssLength(v)) {
      const name = String(k).toLowerCase().replace(/[^a-z0-9-]/g, "-");
      lines.push(`${indent}--radius-${name}: ${v};`);
    }
  }
  const spacing = (tokens && tokens.spacing) || {};
  for (const [k, v] of Object.entries(spacing)) {
    if (isCssLength(v)) {
      const name = String(k).toLowerCase().replace(/[^a-z0-9-]/g, "-");
      lines.push(`${indent}--spacing-${name}: ${v};`);
    }
  }
  lines.push("}");
  return lines.join("\n");
}

module.exports = {
  emitTailwindTheme,
  emitCssVariableRoot,
  // exported for tests
  familyToSlug,
  isHexColor,
  isCssLength,
  extractFontFamilies,
  extractTextScale,
};
