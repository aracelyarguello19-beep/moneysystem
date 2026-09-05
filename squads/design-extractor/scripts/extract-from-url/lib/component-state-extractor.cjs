"use strict";

// component-state-extractor.cjs
//
// Extracts interaction-state rules from raw CSS: :hover, :focus, :focus-visible,
// :active, :disabled, [disabled], [aria-disabled], plus compound states like
// :disabled:hover that the gold-standard medium extraction surfaced.
//
// CSS Modules / hashed-class patterns (medium uses .em for base bg + .ep:hover
// for hover bg on the same button, composed at HTML render time) cannot be
// paired by selector alone. This extractor therefore emits BOTH:
//   1. per-selector state rules (mechanical, exhaustive)
//   2. state-value palettes (aggregate signals: "disabled opacities used = [0.1, 0.3]")
//   3. summary with states_present + states_absent (asymmetry signal — medium
//      has ZERO :focus rules; that absence is a brand signature)
//
// Per .claude/rules/extraction-no-fallbacks.md: emit only extracted values.
// No invented hover-darken or disabled-opacity defaults. Empty arrays mean
// "not extracted" — downstream decides how to render.

const STATE_PSEUDOS = [
  "focus-visible",
  "focus-within",
  "disabled",
  "checked",
  "hover",
  "focus",
  "active",
  "visited",
];

const STATE_ATTRS = [
  { match: /\[disabled\]/, name: "disabled" },
  { match: /\[aria-disabled=["']?true["']?\]/, name: "disabled" },
  { match: /\[data-state=["']?open["']?\]/, name: "open" },
  { match: /\[data-state=["']?active["']?\]/, name: "active" },
  { match: /\[aria-expanded=["']?true["']?\]/, name: "expanded" },
];

// Tokenize CSS into top-level rule blocks. Recurses into @media / @supports /
// @container / @layer blocks. Skips @keyframes / @font-face / @property /
// @charset / @import / @namespace (no interaction-state rules inside).
// Returns flat array of { selector, declarations } for every leaf rule found.
function tokenizeRules(css) {
  if (!css || typeof css !== "string") return [];
  const rules = [];
  parseInto(css, rules);
  return rules;
}

function parseInto(source, rules) {
  let i = 0;
  const len = source.length;

  function skipComment() {
    if (source[i] === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? len : end + 2;
      return true;
    }
    return false;
  }

  function readUntilTopLevel(stopChars) {
    let buf = "";
    let depth = 0;
    while (i < len) {
      if (skipComment()) continue;
      const ch = source[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth = Math.max(0, depth - 1);
      if (depth === 0 && stopChars.includes(ch)) return buf;
      buf += ch;
      i++;
    }
    return buf;
  }

  function readBlock() {
    if (source[i] !== "{") return "";
    i++;
    let buf = "";
    let depth = 1;
    while (i < len && depth > 0) {
      if (skipComment()) continue;
      const ch = source[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          i++;
          return buf;
        }
      }
      buf += ch;
      i++;
    }
    return buf;
  }

  function parseAt() {
    const head = readUntilTopLevel(["{", ";"]);
    if (i >= len) return;
    if (source[i] === ";") {
      i++;
      return;
    }
    const headTrim = head.trim();
    if (/^@keyframes\b/i.test(headTrim) || /^@font-face\b/i.test(headTrim) || /^@property\b/i.test(headTrim) || /^@charset\b/i.test(headTrim) || /^@import\b/i.test(headTrim) || /^@namespace\b/i.test(headTrim)) {
      readBlock();
      return;
    }
    // @media, @supports, @container, @layer — recurse into block
    const block = readBlock();
    parseInto(block, rules);
  }

  while (i < len) {
    if (skipComment()) continue;
    const ch = source[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "@") {
      parseAt();
      continue;
    }
    if (ch === "}") {
      i++;
      continue;
    }
    const selector = readUntilTopLevel(["{", "}", ";"]).trim();
    if (i >= len || source[i] === "}" || source[i] === ";") {
      if (i < len) i++;
      continue;
    }
    const block = readBlock();
    if (selector) rules.push({ selector, declarations: block });
  }
}

function parseDeclarations(block) {
  const decls = {};
  const segments = block.split(";");
  for (const segment of segments) {
    const idx = segment.indexOf(":");
    if (idx === -1) continue;
    const prop = segment.slice(0, idx).trim();
    const value = segment.slice(idx + 1).trim();
    if (!prop || !value) continue;
    decls[prop] = value;
  }
  return decls;
}

// For a compound selector like ".foo.bar:hover:not(:disabled)" return the list
// of state names found, plus the "core" selector with state pseudos stripped.
function classifySelector(selector) {
  const states = new Set();

  // Detect attribute states first (medium uses [disabled], [aria-disabled])
  for (const def of STATE_ATTRS) {
    if (def.match.test(selector)) states.add(def.name);
  }

  // Detect pseudo-class states. Skip pseudos inside :not(...) — they describe
  // exclusion, not application of a state. Medium uses .ca:hover:not(:disabled)
  // which IS a hover rule; the :disabled inside :not() is a guard, not a state.
  let scanStart = 0;
  while (scanStart < selector.length) {
    const colonIdx = selector.indexOf(":", scanStart);
    if (colonIdx === -1) break;
    if (selector[colonIdx + 1] === ":") {
      // Pseudo-element :: (e.g., ::before) — not an interaction state
      scanStart = colonIdx + 2;
      continue;
    }
    // Skip if we are inside a :not(...) — find unbalanced opening before us
    let depth = 0;
    for (let p = 0; p < colonIdx; p++) {
      if (selector[p] === "(") depth++;
      else if (selector[p] === ")") depth = Math.max(0, depth - 1);
    }
    if (depth > 0) {
      scanStart = colonIdx + 1;
      continue;
    }
    let nameEnd = colonIdx + 1;
    while (nameEnd < selector.length && /[\w-]/.test(selector[nameEnd])) nameEnd++;
    const name = selector.slice(colonIdx + 1, nameEnd);
    if (STATE_PSEUDOS.includes(name)) states.add(name);
    // If pseudo has parens, skip past balanced parens
    if (selector[nameEnd] === "(") {
      let p = nameEnd + 1;
      let parenDepth = 1;
      while (p < selector.length && parenDepth > 0) {
        if (selector[p] === "(") parenDepth++;
        else if (selector[p] === ")") parenDepth--;
        p++;
      }
      scanStart = p;
    } else {
      scanStart = nameEnd;
    }
  }

  return [...states];
}

// Strip top-level interaction-state pseudos / attrs from a selector to produce
// its "base form". Pseudos inside :not(...) are guards, not states — they are
// preserved (e.g. ".btn:hover:not(:disabled)" → ".btn:not(:disabled)").
// Medium hashed classes do not benefit much (each class is unique) but
// semantic CSS does.
function stripStates(selector) {
  // Pass 1: strip top-level state pseudos by walking the selector and tracking
  // paren depth. We rebuild without the matched state pseudo segments.
  let out = "";
  let i = 0;
  const len = selector.length;
  while (i < len) {
    const ch = selector[i];
    if (ch === "(") {
      // Copy the entire balanced group (including nested parens) verbatim
      let depth = 1;
      out += ch;
      i++;
      while (i < len && depth > 0) {
        const c = selector[i];
        if (c === "(") depth++;
        else if (c === ")") depth--;
        out += c;
        i++;
      }
      continue;
    }
    if (ch === ":" && selector[i + 1] !== ":") {
      // Try to match a state pseudo at this position
      let nameEnd = i + 1;
      while (nameEnd < len && /[\w-]/.test(selector[nameEnd])) nameEnd++;
      const name = selector.slice(i + 1, nameEnd);
      if (STATE_PSEUDOS.includes(name)) {
        // Skip pseudo name and any attached parenthesized argument
        i = nameEnd;
        if (selector[i] === "(") {
          let depth = 1;
          i++;
          while (i < len && depth > 0) {
            if (selector[i] === "(") depth++;
            else if (selector[i] === ")") depth--;
            i++;
          }
        }
        continue;
      }
    }
    out += ch;
    i++;
  }

  // Pass 2: strip top-level state attribute selectors. We avoid stripping
  // attrs inside parens (rare but possible) by walking again.
  let stripped = "";
  i = 0;
  const len2 = out.length;
  while (i < len2) {
    const ch = out[i];
    if (ch === "(") {
      let depth = 1;
      stripped += ch;
      i++;
      while (i < len2 && depth > 0) {
        const c = out[i];
        if (c === "(") depth++;
        else if (c === ")") depth--;
        stripped += c;
        i++;
      }
      continue;
    }
    if (ch === "[") {
      // Find matching ]
      const close = out.indexOf("]", i);
      if (close === -1) {
        stripped += out.slice(i);
        break;
      }
      const attr = out.slice(i, close + 1);
      const isState = STATE_ATTRS.some((def) => def.match.test(attr));
      if (!isState) stripped += attr;
      i = close + 1;
      continue;
    }
    stripped += ch;
    i++;
  }

  return stripped.trim();
}

// Public: extract component-states data from raw CSS.
function extractComponentStates(css) {
  if (!css || typeof css !== "string") {
    return {
      states_by_selector: {},
      state_value_palette: {},
      summary: { total_state_rules: 0, states_present: [], states_absent: [...STATE_PSEUDOS] },
    };
  }

  const rules = tokenizeRules(css);
  const statesBySelector = {};
  const palette = {
    hover_backgrounds: new Set(),
    hover_colors: new Set(),
    hover_border_colors: new Set(),
    hover_opacities: new Set(),
    disabled_opacities: new Set(),
    disabled_colors: new Set(),
    disabled_backgrounds: new Set(),
    disabled_cursors: new Set(),
    focus_outlines: new Set(),
    focus_box_shadows: new Set(),
    focus_border_colors: new Set(),
    active_backgrounds: new Set(),
  };
  const statesSeen = new Set();
  let totalStateRules = 0;

  for (const rule of rules) {
    const states = classifySelector(rule.selector);
    if (states.length === 0) continue;

    totalStateRules++;
    for (const s of states) statesSeen.add(s);

    const decls = parseDeclarations(rule.declarations);

    // Compound state key like "disabled:hover" preserves order from STATE_PSEUDOS
    const stateKey = states.slice().sort((a, b) => STATE_PSEUDOS.indexOf(a) - STATE_PSEUDOS.indexOf(b)).join(":");

    const base = stripStates(rule.selector);
    if (!statesBySelector[base]) {
      statesBySelector[base] = { base_selector: base, raw_selectors: [], states: {} };
    }
    if (!statesBySelector[base].raw_selectors.includes(rule.selector)) {
      statesBySelector[base].raw_selectors.push(rule.selector);
    }
    if (!statesBySelector[base].states[stateKey]) {
      statesBySelector[base].states[stateKey] = {};
    }
    Object.assign(statesBySelector[base].states[stateKey], decls);

    // Aggregate palette signals
    if (states.includes("hover")) {
      if (decls["background"]) palette.hover_backgrounds.add(decls["background"]);
      if (decls["background-color"]) palette.hover_backgrounds.add(decls["background-color"]);
      if (decls["color"]) palette.hover_colors.add(decls["color"]);
      if (decls["border-color"]) palette.hover_border_colors.add(decls["border-color"]);
      if (decls["opacity"]) palette.hover_opacities.add(decls["opacity"]);
    }
    if (states.includes("disabled")) {
      if (decls["opacity"]) palette.disabled_opacities.add(decls["opacity"]);
      if (decls["color"]) palette.disabled_colors.add(decls["color"]);
      if (decls["background"]) palette.disabled_backgrounds.add(decls["background"]);
      if (decls["background-color"]) palette.disabled_backgrounds.add(decls["background-color"]);
      if (decls["cursor"]) palette.disabled_cursors.add(decls["cursor"]);
    }
    if (states.includes("focus") || states.includes("focus-visible")) {
      if (decls["outline"]) palette.focus_outlines.add(decls["outline"]);
      if (decls["box-shadow"]) palette.focus_box_shadows.add(decls["box-shadow"]);
      if (decls["border-color"]) palette.focus_border_colors.add(decls["border-color"]);
    }
    if (states.includes("active")) {
      if (decls["background"]) palette.active_backgrounds.add(decls["background"]);
      if (decls["background-color"]) palette.active_backgrounds.add(decls["background-color"]);
    }
  }

  const present = [...statesSeen].sort();
  const absent = STATE_PSEUDOS.filter((s) => !statesSeen.has(s));

  // Convert sets to sorted arrays
  const paletteOut = {};
  for (const [k, v] of Object.entries(palette)) {
    paletteOut[k] = [...v].sort();
  }

  return {
    states_by_selector: statesBySelector,
    state_value_palette: paletteOut,
    summary: {
      total_state_rules: totalStateRules,
      total_base_selectors: Object.keys(statesBySelector).length,
      states_present: present,
      states_absent: absent,
    },
  };
}

module.exports = {
  extractComponentStates,
  // exported for tests
  classifySelector,
  stripStates,
  tokenizeRules,
  parseDeclarations,
  STATE_PSEUDOS,
};
