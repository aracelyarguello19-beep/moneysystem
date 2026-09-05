"use strict";

const fs = require("fs");
const path = require("path");
const { sanitizeProps, cleanVariantName } = require("./sanitize.cjs");
const { hasThemeSignal } = require("./theme-inference.cjs");
const {
  parseCustomProperties,
  injectFallbacksOnProps,
  buildThemedVars,
} = require("./var-resolver.cjs");

// ── Shadow ladder (xs/sm/md/lg/xl by blur radius) ───────────────────
function parseShadowBlur(value) {
  // "0 2px 4px rgba(0,0,0,0.1)" → 4 (third value, before optional spread)
  // Multi-shadow uses commas; we look at the FIRST layer.
  const firstLayer = String(value).split(",")[0];
  const m = firstLayer.match(/(?:^|\s)(?:-?[\d.]+)(?:px)?\s+(?:-?[\d.]+)(?:px)?\s+([\d.]+)(?:px)?/);
  return m ? parseFloat(m[1]) : null;
}

function bucketShadows(shadowsArr) {
  if (!Array.isArray(shadowsArr) || shadowsArr.length === 0) return null;
  const parsed = shadowsArr
    .map((s) => ({ value: s.value || s, count: s.count || 1, blur: parseShadowBlur(s.value || s) }))
    .filter((x) => x.blur != null && x.blur > 0); // exclude 0-blur "none"-like entries
  if (parsed.length === 0) return null;
  parsed.sort((a, b) => a.blur - b.blur);
  const buckets = ["xs", "sm", "md", "lg", "xl"];
  const out = {};
  if (parsed.length <= 5) {
    parsed.forEach((p, i) => { out[buckets[i]] = p.value; });
  } else {
    // Pick representatives at ~10%, 30%, 50%, 75%, 95% percentiles
    const ps = [0.1, 0.3, 0.5, 0.75, 0.95];
    ps.forEach((p, i) => {
      const idx = Math.min(parsed.length - 1, Math.floor(p * parsed.length));
      out[buckets[i]] = parsed[idx].value;
    });
  }
  return out;
}

// ── Motion buckets ──────────────────────────────────────────────────
function parseDurationMs(value) {
  const m = String(value).match(/^([\d.]+)(ms|s)$/);
  if (!m) return null;
  return m[2] === "s" ? parseFloat(m[1]) * 1000 : parseFloat(m[1]);
}

/**
 * extractDarkSlots — populate tokens.colors.dark from inputs/dark-mode.json.
 *
 * Strategy:
 *   1. Filter dark_var_sample to vars with global scope (`.dark`, `[data-theme=dark]`,
 *      `:root.dark`, `.dark-theme`, `[data-mode=dark]`). Drop component-scoped vars.
 *   2. Map legacy CSS var names → shadcn slot names via LEGACY_DARK_SYNONYMS.
 *   3. Resolve var() chains using the full cssVars list.
 *   4. Return { background: "#hex", foreground: "#hex", primary, ... } with only
 *      slots that have a real extracted value.
 *
 * NEVER fabricates: returns null if no usable dark slots could be derived.
 */
const LEGACY_DARK_SYNONYMS = {
  // Background slot — site-wide canvas color
  background: [
    "--background", "--ds-background-100", "--bg", "--canvas", "--bg-color",
    "--page-bg", "--color-background", "--color-bg", "--color-canvas",
    "--bg-base", "--surface-default",
  ],
  // Foreground slot — main text color
  foreground: [
    "--foreground", "--ds-foreground-100", "--text", "--ink", "--text-color",
    "--color-foreground", "--color-text", "--color-text-primary", "--text-primary",
  ],
  // Primary CTA fill
  primary: [
    "--primary", "--ds-primary", "--brand", "--color-primary",
    "--color-brand", "--color-accent-primary",
  ],
  "primary-foreground": [
    "--primary-foreground", "--on-primary", "--text-on-primary",
    "--color-on-primary", "--color-primary-foreground",
  ],
  secondary: ["--secondary", "--ds-secondary", "--color-secondary"],
  "secondary-foreground": ["--secondary-foreground", "--on-secondary", "--color-on-secondary"],
  card: [
    "--card", "--ds-card", "--surface-elevated", "--panel",
    "--color-card", "--color-surface-elevated", "--bg-card",
  ],
  "card-foreground": ["--card-foreground", "--text", "--color-card-foreground"],
  popover: [
    "--popover", "--ds-popover", "--surface-elevated",
    "--color-popover", "--bg-popover",
  ],
  muted: [
    "--muted", "--ds-muted", "--surface-muted",
    "--color-muted", "--bg-muted", "--surface-secondary",
  ],
  "muted-foreground": [
    "--muted-foreground", "--text-muted", "--text-secondary",
    "--color-muted-foreground", "--color-text-secondary", "--color-text-muted",
  ],
  accent: [
    "--accent", "--ds-accent", "--brand-accent",
    "--color-accent", "--accent-color",
  ],
  "accent-foreground": [
    "--accent-foreground", "--on-accent", "--color-accent-foreground",
  ],
  destructive: [
    "--destructive", "--error", "--danger", "--red",
    "--color-destructive", "--color-error", "--color-danger", "--color-red",
  ],
  "destructive-foreground": [
    "--destructive-foreground", "--on-error",
    "--color-destructive-foreground", "--color-on-error",
  ],
  border: [
    "--border", "--ds-border", "--hairline",
    "--color-border", "--border-color", "--color-divider",
  ],
  input: [
    "--input", "--ds-input", "--input-bg",
    "--color-input", "--color-input-bg",
  ],
  ring: [
    "--ring", "--focus-ring", "--ds-ring",
    "--color-ring", "--color-focus-ring", "--focus-color",
  ],
  surface: [
    "--surface", "--ds-surface", "--bg",
    "--color-surface", "--surface-color",
  ],
  "surface-foreground": [
    "--surface-foreground", "--text",
    "--color-surface-foreground",
  ],
};

// Selectors that indicate global dark scope (not component-scoped).
// We check each piece of a comma-separated selector list individually.
// A var declared in any of these contexts applies to dark mode globally.
const GLOBAL_DARK_SELECTORS = [
  /^:root\.dark$/,
  /^\.dark$/,
  /^\.dark-theme$/,
  /^\[data-theme=["']?dark["']?\]$/i,
  /^\[data-mode=["']?dark["']?\]$/i,
  /^html\.dark$/i,
  /^body\.dark$/i,
  /^\[data-color-mode=["']?dark["']?\]$/i,
  // :where(.dark) — :where wrapper without specificity boost
  /^:where\(\.dark\)$/,
  /^:where\(\.dark-theme\)$/,
  /^:where\(\[data-theme=["']?dark["']?\]\)$/i,
  // :is(.dark, .dark-theme) — :is wrapper
  /^:is\(\s*\.dark\s*\)$/,
  /^:is\(\s*\.dark-theme\s*\)$/,
  // @media (prefers-color-scheme: dark) — at-rule prefix; selector is ":root" inside
  /^@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/i,
];

function isGlobalDarkScope(selector) {
  if (!selector) return false;
  // Selectors may be combined: ".dark, .dark-theme, .invert-theme" — check each piece.
  // A var applies to GLOBAL dark scope ONLY if at least one piece is a pure
  // dark selector (no descendant combinator). Pieces like ".dark .invert-theme"
  // are component-scoped and DO NOT count as global dark.
  const pieces = selector.split(",").map((s) => s.trim()).filter(Boolean);
  return pieces.some((p) => {
    // Reject if piece contains descendant combinator (whitespace) or other
    // chained classes beyond a single root-like dark selector.
    // Examples that fail: ".dark .invert-theme", "html.dark body"
    // Examples that pass: ".dark", ".dark-theme", "[data-theme=\"dark\"]"
    if (/\s/.test(p)) return false;
    return GLOBAL_DARK_SELECTORS.some((re) => re.test(p));
  });
}

function resolveVarChain(value, cssVars, scopePreference = "dark", seen = new Set()) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  // Custom property names per CSS spec accept letters, digits, underscore,
  // hyphen — including Webflow's "private" prefix `--_button-style---*`.
  // Handle wrapping (e.g. "hsla(var(--x), 1)" — extract var, recurse on substitution)
  const fullMatch = trimmed.match(/^var\(\s*(--[\w-][\w-]*)\s*(?:,\s*([^)]+))?\s*\)$/);
  if (fullMatch) {
    const name = fullMatch[1];
    if (seen.has(name)) return null;
    seen.add(name);
    const decls = cssVars.filter((v) => v.name === name);
    if (decls.length === 0) {
      if (fullMatch[2]) return fullMatch[2].trim();
      return null;
    }
    // Prefer dark-scoped declaration (where multiple values exist for the same var name)
    const darkDecl = decls.find((v) => isGlobalDarkScope(v.selector));
    const rootDecl = decls.find((v) => v.selector === ":root" || /^:root[,]/.test(v.selector));
    const decl = (scopePreference === "dark" && darkDecl) || rootDecl || darkDecl || decls[0];
    return resolveVarChain(decl.value, cssVars, scopePreference, seen);
  }
  // Inline var() inside a function call (e.g. "hsla(var(--x), 1)") — substitute first occurrence
  const inlineMatch = trimmed.match(/var\(\s*(--[\w-][\w-]*)\s*(?:,\s*([^)]+))?\s*\)/);
  if (inlineMatch) {
    const name = inlineMatch[1];
    if (seen.has(name)) return trimmed; // avoid infinite loop, keep original
    const seenNext = new Set(seen);
    seenNext.add(name);
    const decls = cssVars.filter((v) => v.name === name);
    if (decls.length === 0) {
      const fallback = inlineMatch[2];
      if (fallback) {
        return trimmed.replace(inlineMatch[0], fallback.trim());
      }
      return trimmed;
    }
    const darkDecl = decls.find((v) => isGlobalDarkScope(v.selector));
    const rootDecl = decls.find((v) => v.selector === ":root" || /^:root[,]/.test(v.selector));
    const decl = (scopePreference === "dark" && darkDecl) || rootDecl || darkDecl || decls[0];
    const resolvedInner = resolveVarChain(decl.value, cssVars, scopePreference, seenNext);
    if (resolvedInner) {
      return trimmed.replace(inlineMatch[0], resolvedInner);
    }
    return trimmed;
  }
  return trimmed;
}

function extractDarkSlots(darkMode, cssVars) {
  if (!darkMode || !darkMode.has_dark_mode) return null;
  if (!Array.isArray(cssVars) || cssVars.length === 0) return null;

  // Filter cssVars to those in global dark scopes
  const darkVars = cssVars.filter((v) => isGlobalDarkScope(v.selector));
  if (darkVars.length === 0) return null;

  // For each shadcn slot, find the first matching legacy synonym in dark scope.
  // Resolve var() chains preferring dark-scoped declarations.
  const out = {};
  for (const [slot, synonyms] of Object.entries(LEGACY_DARK_SYNONYMS)) {
    for (const syn of synonyms) {
      const match = darkVars.find((v) => v.name === syn);
      if (!match) continue;
      const resolved = resolveVarChain(match.value, cssVars, "dark");
      if (resolved && /^(#|rgb|hsl|oklch|var\()/i.test(resolved.trim())) {
        out[slot] = resolved.trim();
        break;
      }
    }
  }

  return Object.keys(out).length > 0 ? out : null;
}

function bucketMotion(motion) {
  const out = {};
  if (Array.isArray(motion?.durations) && motion.durations.length > 0) {
    // Use UNIQUE values sorted, NOT weighted by count.
    // Counts can be inflated by infinite animations (e.g. logo spin) and would
    // collapse fast/base/slow to the same value. Transition tokens are about
    // distinct steps in the design system, not occurrence frequency.
    const unique = Array.from(new Set(
      motion.durations
        .map((d) => parseDurationMs(d.value || d))
        .filter((ms) => ms != null && ms > 0 && ms <= 1500) // exclude likely-animation values
    )).sort((a, b) => a - b);

    if (unique.length === 0) {
      // Fall back to all durations if filter killed everything
      const all = Array.from(new Set(
        motion.durations.map((d) => parseDurationMs(d.value || d)).filter((ms) => ms != null && ms > 0)
      )).sort((a, b) => a - b);
      if (all.length > 0) unique.push(...all);
    }

    if (unique.length >= 1) {
      const pick = (p) => unique[Math.min(unique.length - 1, Math.floor(p * (unique.length - 1)))];
      out.duration_fast = pick(0) + "ms";
      out.duration_base = pick(0.5) + "ms";
      out.duration_slow = pick(1) + "ms";
    }
  }
  if (Array.isArray(motion?.easings) && motion.easings.length > 0) {
    // Prefer specific cubic-bezier over generic browser keywords (ease/linear/...)
    const generics = new Set(["ease", "ease-in", "ease-out", "ease-in-out", "linear", "step-end", "step-start"]);
    const ranked = motion.easings
      .filter((e) => e.value)
      .sort((a, b) => (b.count || 0) - (a.count || 0));
    const specific = ranked.find((e) => !generics.has(String(e.value).trim()));
    out.easing = specific?.value || ranked[0]?.value || null;
  }
  if (Array.isArray(motion?.keyframes)) {
    out.keyframes_count = motion.keyframes.length;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * assignMotionRoles — map raw motion.json into the Fluentui-style canonical
 * 8-step duration scale + 7-step easing names (per ADR-022 v2 §Layer 2).
 *
 * Strategy:
 *   1. Filter out animation-only durations (>1500ms — likely spins/loops, not transitions).
 *   2. Build the unique sorted set of "transition-friendly" durations.
 *   3. For each canonical role (ultra-fast..ultra-slow), pick the closest
 *      extracted duration. If no match within tolerance, leave that role unset.
 *   4. Easings: map by closest cubic-bezier shape OR direct keyword match.
 *
 * Returns: { "duration-ultra-fast": "<ms>ms", ..., "ease-out": "<curve>", ... }
 *          Each key emitted only if a real value was matched. NEVER fabricates.
 */
const FLUENTUI_DURATION_TARGETS = {
  "duration-ultra-fast": 50,
  "duration-faster": 100,
  "duration-fast": 150,
  "duration-normal": 200,
  "duration-gentle": 350,
  "duration-slow": 500,
  "duration-slower": 700,
  "duration-ultra-slow": 1000,
};

function assignMotionRoles(motion) {
  const out = {};
  if (!motion) return null;

  // ── DURATIONS ──
  if (Array.isArray(motion.durations) && motion.durations.length > 0) {
    const candidatesMs = Array.from(new Set(
      motion.durations
        .map((d) => parseDurationMs(d.value || d))
        .filter((ms) => ms != null && ms > 0 && ms <= 1500)
    )).sort((a, b) => a - b);

    if (candidatesMs.length > 0) {
      // Pair each extracted duration with the closest canonical role WITHIN
      // tolerance. Sorting by delta avoids consuming an exact 150ms match for
      // `duration-faster` before `duration-fast` gets evaluated.
      // Tolerance: 50% of role's target (e.g. ultra-fast=50ms tolerates 25-75ms).
      // This avoids forcing a 250ms candidate into "duration-ultra-fast" slot.
      const pairs = [];
      for (const [role, target] of Object.entries(FLUENTUI_DURATION_TARGETS)) {
        const tolerance = Math.max(target * 0.5, 25); // min ±25ms tolerance
        for (const ms of candidatesMs) {
          const delta = Math.abs(ms - target);
          if (delta <= tolerance) {
            pairs.push({ role, ms, delta });
          }
        }
      }
      pairs.sort((a, b) => a.delta - b.delta || a.ms - b.ms);
      const usedMs = new Set();
      const usedRoles = new Set();
      for (const pair of pairs) {
        if (usedMs.has(pair.ms) || usedRoles.has(pair.role)) continue;
        out[pair.role] = `${pair.ms}ms`;
        usedMs.add(pair.ms);
        usedRoles.add(pair.role);
      }
    }
  }

  // ── EASINGS ──
  if (Array.isArray(motion.easings) && motion.easings.length > 0) {
    const easingByValue = new Map();
    for (const e of motion.easings) {
      const v = (e.value || e || "").toString().trim();
      if (!v) continue;
      easingByValue.set(v.toLowerCase(), v);
    }

    // Direct keyword matches
    if (easingByValue.has("linear")) out["ease-linear"] = "linear";
    if (easingByValue.has("ease-in")) out["ease-in"] = "cubic-bezier(0.4, 0, 1, 1)";
    if (easingByValue.has("ease-out")) out["ease-out"] = "cubic-bezier(0, 0, 0.2, 1)";
    if (easingByValue.has("ease-in-out")) out["ease-in-out"] = "cubic-bezier(0.4, 0, 0.2, 1)";

    // Find specific cubic-bezier easings (most "designed" easings)
    const specifics = motion.easings
      .map((e) => e.value || e)
      .filter((v) => typeof v === "string" && /^cubic-bezier/i.test(v.trim()));

    if (specifics.length > 0) {
      // Heuristic by curve shape:
      //  - Accelerate (ease-in feel): control points push start forward
      //  - Decelerate (ease-out feel): control points pull end backward
      //  - Easy-ease: symmetric S-curve
      // Use a `usedCurves` set so the same cubic-bezier doesn't fill multiple roles.
      const usedCurves = new Set();
      for (const curve of specifics) {
        if (usedCurves.has(curve)) continue;
        const m = curve.match(/cubic-bezier\(\s*([\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/i);
        if (!m) continue;
        const [, x1, y1, x2, y2] = m.map(parseFloat);
        const isDecelerate = y1 < 0.3 && y2 > 0.7;
        const isAccelerate = y1 > 0.3 && y2 < 0.7;
        const isSymmetric = Math.abs((x1 + x2) - 1) < 0.2 && Math.abs((y1 + y2) - 1) < 0.2;
        // Score per role: more specific shape match wins
        const candidates = [];
        if (isDecelerate && !out["ease-decelerate-mid"]) candidates.push({ role: "ease-decelerate-mid", score: y2 - y1 });
        if (isAccelerate && !out["ease-accelerate-mid"]) candidates.push({ role: "ease-accelerate-mid", score: y1 - y2 });
        if (isSymmetric && !out["ease-easy-ease"]) candidates.push({ role: "ease-easy-ease", score: 1 - Math.abs(x1 - x2) });
        if (candidates.length === 0) continue;
        candidates.sort((a, b) => b.score - a.score);
        out[candidates[0].role] = curve;
        usedCurves.add(curve);
      }
    }
  }

  return Object.keys(out).length > 0 ? out : null;
}

// ── Component tokens promotion ──────────────────────────────────────
const PROP_KEY_MAP = {
  "border-radius": "radius",
  "padding": "padding",
  "font-weight": "font_weight",
  "font-size": "font_size",
  "line-height": "line_height",
  "letter-spacing": "letter_spacing",
  "border-width": "border_width",
  "border-color": "border_color",
  "background-color": "bg",
  "color": "text",
  "box-shadow": "shadow",
  "transition": "transition",
  "transform": "transform",
  "opacity": "opacity",
  "outline": "outline",
  "outline-color": "outline_color",
  "outline-offset": "outline_offset",
  "cursor": "cursor",
};

function normalizePropKey(prop) {
  return PROP_KEY_MAP[prop] || prop.replace(/-/g, "_");
}

function liftStateProps(stateProps) {
  if (!stateProps || typeof stateProps !== "object") return null;
  const out = {};
  for (const [prop, info] of Object.entries(stateProps)) {
    if (!info || typeof info !== "object") continue;
    if (info.most_common != null) {
      out[normalizePropKey(prop)] = info.most_common;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

const ATOMIC_LAYER_COMPONENT_RULES = {
  button: {
    layer: "atom",
    reasoning: "q1_indivisible: extracted button control is a primitive action surface",
  },
  input: {
    layer: "atom",
    reasoning: "q1_indivisible: extracted input is a primitive form control",
  },
  badge: {
    layer: "atom",
    reasoning: "q1_indivisible: extracted badge is a primitive status/label surface",
  },
  link: {
    layer: "atom",
    reasoning: "q1_indivisible: extracted link is a primitive navigation/action text",
  },
  avatar: {
    layer: "atom",
    reasoning: "q1_indivisible: extracted avatar is a primitive identity/image token",
  },
  label: {
    layer: "atom",
    reasoning: "q1_indivisible: extracted label is primitive form text",
  },
  tooltip: {
    layer: "molecule",
    reasoning: "q2_one_action: tooltip combines trigger-adjacent text with one disclosure behavior",
  },
  tab: {
    layer: "molecule",
    reasoning: "q2_one_action: tab combines label, selected state, and one navigation action",
  },
  card: {
    layer: "molecule",
    reasoning: "q2_one_action: card is a bounded content composite, not a page region",
  },
  alert: {
    layer: "molecule",
    reasoning: "q2_one_action: alert combines message/status styling into one feedback unit",
  },
  nav: {
    layer: "organism",
    reasoning: "q3_reusable_section: nav is a reusable navigation region composed of links/actions",
  },
  table: {
    layer: "organism",
    reasoning: "q3_reusable_section: table is a reusable data region with repeated cells/rows",
  },
  modal: {
    layer: "organism",
    reasoning: "q3_reusable_section: modal is a reusable overlay region, not a full page slot-contract",
  },
};

function classifyAtomicLayerForComponent(name) {
  const key = String(name || "").toLowerCase();
  const rule = ATOMIC_LAYER_COMPONENT_RULES[key];
  if (!rule) {
    return {
      atomic_layer: null,
      atomic_layer_gap: "extraction_gap(atomic_layer_unclassified)",
    };
  }
  return {
    atomic_layer: rule.layer,
    atomic_layer_reasoning: rule.reasoning,
  };
}

function buildComponents(componentProperties, options = {}) {
  if (!componentProperties?.summary) return null;
  const cssScopes = options.cssScopes || null;

  // Sanitize raw props: drop unset/initial/inherit, debug outline rules,
  // hidden transforms, padding-zero resets. Then inject var() fallbacks so
  // downstream renderers can resolve `var(--ds-x)` even without the source
  // site's :root mounted.
  const finishProps = (props) => {
    if (!props) return props;
    const sanitized = sanitizeProps(props);
    if (Object.keys(sanitized).length === 0) return null;
    if (cssScopes) return injectFallbacksOnProps(sanitized, cssScopes);
    return sanitized;
  };

  const out = {};
  for (const [name, comp] of Object.entries(componentProperties.summary)) {
    const c = {};
    // States (default → flat at top, others → states.{name})
    if (comp.states?.default) {
      const def = finishProps(liftStateProps(comp.states.default));
      if (def) Object.assign(c, def);
    }
    const otherStates = {};
    for (const [stateName, stateProps] of Object.entries(comp.states || {})) {
      if (stateName === "default") continue;
      const lifted = finishProps(liftStateProps(stateProps));
      if (lifted) otherStates[stateName] = lifted;
    }
    if (Object.keys(otherStates).length > 0) c.states = otherStates;
    // Variants are emitted as an OBJECT keyed by variant name (e.g. { primary: {...props} }).
    // Lift to tokens.components.{name}.variants — preserve the per-variant property map.
    // Variant names are humanised (CSS module hashes stripped); duplicates after
    // cleanup are merged so `module__abc__primary` and `module__xyz__primary`
    // collapse into one `primary` entry.
    if (comp.variants && typeof comp.variants === "object" && Object.keys(comp.variants).length > 0) {
      c.variants = {};
      for (const [rawName, variantProps] of Object.entries(comp.variants)) {
        const cleanName = cleanVariantName(rawName);
        if (!cleanName || cleanName === "true" || cleanName === "false") continue;
        const lifted = finishProps(liftStateProps(variantProps));
        if (!lifted) continue;
        // Merge into existing variant of the same humanised name (later wins
        // on key conflicts — last extractor selector usually has more signals).
        c.variants[cleanName] = c.variants[cleanName]
          ? { ...c.variants[cleanName], ...lifted }
          : lifted;
      }
      if (Object.keys(c.variants).length === 0) delete c.variants;
    }
    // Backward-compat: top-level props (before states were detected)
    const topLevel = {};
    for (const [prop, info] of Object.entries(comp)) {
      if (prop === "states" || prop === "variants") continue;
      if (info && typeof info === "object" && info.most_common != null) {
        topLevel[normalizePropKey(prop)] = info.most_common;
      }
    }
    const cleanedTopLevel = finishProps(topLevel);
    if (cleanedTopLevel) {
      for (const [k, v] of Object.entries(cleanedTopLevel)) {
        if (c[k] == null) c[k] = v;
      }
    }
    if (Object.keys(c).length > 0) {
      Object.assign(c, classifyAtomicLayerForComponent(name));
      out[name] = c;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function cleanNullishObject(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (value !== undefined && value !== null && value !== "") out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function buildPatternTokens({ motionBuckets, motionCanonical, focusRing, elevationLadder, zIndex }) {
  const motionTokens = cleanNullishObject(motionCanonical) || cleanNullishObject(motionBuckets);
  const focusTokens = focusRing?.detected
    ? cleanNullishObject({
        outline: focusRing.outline,
        outline_offset: focusRing.outline_offset,
        box_shadow: focusRing.box_shadow,
      })
    : null;
  const elevationTokens = cleanNullishObject(elevationLadder);
  const zIndexTokens = cleanNullishObject({
    base: zIndex?.base,
    dropdown: zIndex?.dropdown,
    modal: zIndex?.modal,
    toast: zIndex?.toast,
    tooltip: zIndex?.tooltip,
  });

  return {
    motion: motionTokens,
    ...(motionTokens ? {} : { motion_gap: "extraction_gap(no_motion_tokens)" }),
    focus: focusTokens,
    ...(focusTokens ? {} : { focus_gap: "extraction_gap(no_focus_tokens)" }),
    elevation: elevationTokens,
    ...(elevationTokens ? {} : { elevation_gap: "extraction_gap(no_elevation_tokens)" }),
    z_index_scale: zIndexTokens,
    ...(zIndexTokens ? {} : { z_index_scale_gap: "extraction_gap(no_z_index_tokens)" }),
  };
}

// ── Meta from style-fingerprint ─────────────────────────────────────
function buildMeta(styleFingerprint) {
  const cls = styleFingerprint?.classification || {};
  if (!cls.primary_archetype) return null;
  const out = {
    style_archetype: cls.primary_archetype,
    archetype_confidence: cls.confidence_score ?? null,
  };
  if (cls.secondary_archetype) out.style_archetype_secondary = cls.secondary_archetype;
  return out;
}

// ── C1: Density inference from spacing scale + button padding ───────
// Returns "compact" | "regular" | "spacious"
function inferDensity(tokensDetected, componentProperties) {
  // Heuristic 1: median of spacing tokens
  const spacingPx = (tokensDetected?.spacing || [])
    .map((s) => parseFloat(s))
    .filter((x) => !isNaN(x) && x > 0);
  spacingPx.sort((a, b) => a - b);
  const medianSpacing = spacingPx.length > 0 ? spacingPx[Math.floor(spacingPx.length / 2)] : null;

  // Heuristic 2: button padding most-common value
  const btnPadding = componentProperties?.summary?.button?.states?.default?.padding?.most_common
    || componentProperties?.summary?.button?.padding?.most_common
    || null;
  const btnPaddingPx = btnPadding ? parsePaddingMaxPx(btnPadding) : null;

  // Composite signal — small numbers = compact, large = spacious
  const signals = [];
  if (medianSpacing != null) {
    if (medianSpacing < 12) signals.push("compact");
    else if (medianSpacing > 24) signals.push("spacious");
    else signals.push("regular");
  }
  if (btnPaddingPx != null) {
    if (btnPaddingPx < 10) signals.push("compact");
    else if (btnPaddingPx > 18) signals.push("spacious");
    else signals.push("regular");
  }
  if (signals.length === 0) return null;
  // Majority vote
  const counts = signals.reduce((a, s) => { a[s] = (a[s] || 0) + 1; return a; }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function parsePaddingMaxPx(value) {
  // "8px 16px" → 16 (largest dimension), "12px" → 12
  const matches = String(value).match(/[\d.]+(?=px)/g);
  if (!matches || matches.length === 0) return null;
  return Math.max(...matches.map((s) => parseFloat(s)).filter((x) => !isNaN(x)));
}

// ── Theme mismatch detection ────────────────────────────────────────
// Compares tokens.colors.surface luminance vs detected default theme.
// Returns null when no signal, or { mismatch: bool, expected, actual, surface_luminance }.
function detectThemeMismatch(tokens, themeDefault) {
  if (!themeDefault?.default || !tokens?.colors?.surface) return null;
  const surface = tokens.colors.surface;
  const lum = computeLumFromHex(surface);
  if (lum == null) return null;
  const actual = lum < 0.4 ? "dark" : "light";
  const expected = themeDefault.default;
  return {
    mismatch: actual !== expected,
    expected,
    actual,
    surface,
    surface_luminance: Math.round(lum * 100) / 100,
    confidence: themeDefault.confidence || "low",
  };
}

function computeLumFromHex(hex) {
  if (!hex || typeof hex !== "string") return null;
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  if ([r, g, b].some((v) => isNaN(v))) return null;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ── Coverage: classify what's detected vs missing, with reason ─────
// Categories mirror the audit (32 cells × 5 layers). For each missing item,
// classifyGap() inspects the raw CSS to decide WHY it's missing:
//   - not_used_by_site: CSS truly has no signal (flat design, no glassmorphism, etc.)
//   - flat_design: shadows are explicitly "none" or near-zero — design intent
//   - extractor_limitation: signal exists in CSS but detector heuristic missed it
//   - obfuscated: CSS-in-JS or hash classes elude pattern matching
//   - partial_detection: some data extracted but not the full structure
const REASON_CODES = {
  not_used_by_site: "Site does not use this token category. CSS has no relevant declarations.",
  flat_design: "Site is intentionally flat. No box-shadow declarations beyond 'none'.",
  no_glassmorphism: "Site does not use backdrop-filter. Glass effects absent by design.",
  no_form_surface: "Site lacks public forms. Label/help/error tokens are conventionally undefined.",
  marketing_surface: "Marketing-only site. Component (tabs/avatar/tooltip) doesn't appear in homepage flow.",
  no_variants: "Site uses a single button style. No variant suffix detected (primary/secondary/ghost).",
  obfuscated: "Site uses CSS-in-JS / hash-based class names that elude pattern matching.",
  extractor_limitation: "Signal exists in CSS but current detector heuristics didn't match.",
  theme_mismatch: "Tokens encode the opposite theme of what the site renders by default. Re-extract recommended.",
  unknown: "Could not classify — investigate manually.",
};

function classifyGap(category, css) {
  if (!css) return "unknown";
  switch (category) {
    case "L3.backdrop_blur":
      return /backdrop-filter\s*:\s*(?!none)/.test(css) ? "extractor_limitation" : "no_glassmorphism";
    case "L3.shadow_ladder": {
      const total = (css.match(/box-shadow\s*:/g) || []).length;
      const none = (css.match(/box-shadow\s*:\s*none/g) || []).length;
      if (total === 0) return "not_used_by_site";
      if (none / Math.max(1, total) > 0.7) return "flat_design";
      return "extractor_limitation";
    }
    case "L2.tooltip":
      return /(?:tooltip|popover|\[role=["']?tooltip)/i.test(css) ? "extractor_limitation" : "not_used_by_site";
    case "L2.modal":
      return /(?:modal|dialog|drawer|\[role=["']?dialog)/i.test(css) ? "extractor_limitation" : "not_used_by_site";
    case "L2.tab":
      return /(?:\.tab\b|tabs|\[role=["']?tab)/i.test(css) ? "extractor_limitation" : "marketing_surface";
    case "L2.avatar":
      return /(?:avatar|profile-pic|profile-img|user-image)/i.test(css) ? "extractor_limitation" : "marketing_surface";
    case "L2.label":
    case "L2.help_text":
    case "L2.error_text":
      return /(?:^|[\s,])label\b|\.form-label|\.field-error|\.help-text/i.test(css) ? "extractor_limitation" : "no_form_surface";
    case "L2.alert":
      return /(?:\.alert|\.banner|\.notice|\.toast|\[role=["']?alert)/i.test(css) ? "extractor_limitation" : "not_used_by_site";
    case "L2.table":
      return /(?:^|[\s,])table\b|\.data-table|\.tbl/i.test(css) ? "extractor_limitation" : "not_used_by_site";
    case "L2.nav":
      return /(?:^|[\s,])nav\b|\.nav|navigation|navbar/i.test(css) ? "obfuscated" : "not_used_by_site";
    case "L2.badge":
      return /(?:badge|tag|pill|chip|eyebrow)/i.test(css) ? "extractor_limitation" : "not_used_by_site";
    case "L2.button.variants":
      return /(?:btn--|btn-(?:primary|secondary|ghost|outline)|\[data-variant|is-primary|is-secondary)/i.test(css)
        ? "extractor_limitation"
        : "no_variants";
    case "L2.button.states":
      return /:hover|:focus|:active|\[data-state/i.test(css) ? "extractor_limitation" : "not_used_by_site";
    default:
      return "unknown";
  }
}

function buildCoverage({ tokens, ext, breakpoints, css }) {
  function present(v) {
    if (v == null) return false;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return !!v;
  }
  function depth(v) {
    if (!v || typeof v !== "object") return 0;
    let d = 1;
    if (v.states && Object.keys(v.states).length) d = 2;
    if (v.variants && (Array.isArray(v.variants) ? v.variants.length : Object.keys(v.variants).length)) d = 3;
    return d;
  }

  const c = ext.components || {};
  const checks = [
    ["L1.colors_semantic", present(tokens.colors)],
    ["L1.colors_extended", Object.keys(tokens.colors || {}).length >= 4],
    ["L1.typography", present(tokens.typography)],
    ["L1.rounded", present(tokens.rounded)],
    ["L1.spacing", present(tokens.spacing)],
    ["L2.button", depth(c.button) >= 1],
    ["L2.button.states", depth(c.button) >= 2],
    ["L2.button.variants", depth(c.button) >= 3],
    ["L2.card", depth(c.card) >= 1],
    ["L2.input", depth(c.input) >= 1],
    ["L2.badge", depth(c.badge) >= 1],
    ["L2.link", depth(c.link) >= 1],
    ["L2.nav", depth(c.nav) >= 1],
    ["L2.tab", depth(c.tab) >= 1],
    ["L2.alert", depth(c.alert) >= 1],
    ["L2.table", depth(c.table) >= 1],
    ["L2.tooltip", depth(c.tooltip) >= 1],
    ["L2.modal", depth(c.modal) >= 1],
    ["L2.avatar", depth(c.avatar) >= 1],
    ["L2.label", depth(c.label) >= 1],
    ["L3.shadow_ladder", present(ext.shadow)],
    ["L3.motion_buckets", present(ext.motion)],
    ["L3.gradient", present(ext.gradient)],
    ["L3.backdrop_blur", present(ext.backdrop_blur)],
    ["L3.opacity_scale", present(ext.opacity)],
    ["L3.focus_ring", present(ext.focus_ring)],
    ["L4.breakpoints", (breakpoints || []).length > 0],
    ["L4.z_index", present(ext.z_index)],
    ["L4.container_max_width", present(ext.container)],
    ["L5.style_archetype", !!ext.meta?.style_archetype],
    ["L5.density", !!ext.meta?.density],
    ["L5.motion_preference", !!ext.meta?.motion_preference],
  ];

  const detected = [];
  const missing = [];
  for (const [cat, ok] of checks) {
    if (ok) {
      detected.push(cat);
    } else {
      missing.push({
        category: cat,
        reason: classifyGap(cat, css),
      });
    }
  }

  return {
    overall: { detected: detected.length, total: checks.length, percent: Math.round((detected.length / checks.length) * 1000) / 10 },
    by_layer: aggregateByLayer(checks),
    detected,
    missing,
    reason_codes: REASON_CODES,
  };
}

function aggregateByLayer(checks) {
  const layers = {};
  for (const [cat, ok] of checks) {
    const layer = cat.split(".")[0];
    if (!layers[layer]) layers[layer] = { detected: 0, total: 0 };
    layers[layer].total++;
    if (ok) layers[layer].detected++;
  }
  for (const k of Object.keys(layers)) {
    layers[k].percent = Math.round((layers[k].detected / layers[k].total) * 100);
  }
  return layers;
}

// ── C1: Motion preference inference from duration distribution ──────
// Returns "snappy" | "smooth" | "minimal"
function inferMotionPreference(motion) {
  if (!motion?.durations || motion.durations.length === 0) return null;
  const ms = motion.durations
    .map((d) => parseDurationMs(d.value || d))
    .filter((x) => x != null && x > 0 && x <= 1500);
  if (ms.length === 0) return "minimal"; // no transitions found, only animations
  ms.sort((a, b) => a - b);
  const median = ms[Math.floor(ms.length / 2)];
  if (median < 200) return "snappy";
  if (median < 400) return "smooth";
  return "minimal";
}

// ── Top-level entry point ───────────────────────────────────────────
// Reads files in `runDir` and returns:
//   {
//     componentsPatch: object (to merge into tokens.json#components),
//     extended: object (full tokens-extended.json content),
//   }
function buildEnrichment(runDir) {
  const read = (rel) => {
    const p = path.join(runDir, rel);
    if (!fs.existsSync(p)) return null;
    try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
  };

  const componentProperties = read("inputs/component-properties.json");
  const shadows = read("inputs/shadows.json");
  const motion = read("inputs/motion.json");
  const styleFingerprint = read("style-fingerprint.json");
  const tokensDetected = read("inputs/tokens-detected.json");
  const darkMode = read("inputs/dark-mode.json");
  const cssVars = read("inputs/css-vars-detected.json");

  // L3/L4 extras (B1) — added by detectGradients/detectBackdropBlur/etc
  const gradients = read("inputs/gradients.json");
  const backdropBlur = read("inputs/backdrop-blur.json");
  const zIndex = read("inputs/z-index.json");
  const container = read("inputs/container.json");
  const opacityScale = read("inputs/opacity-scale.json");
  const focusRing = read("inputs/focus-ring.json");

  // Pre-parse the source CSS's :root and dark-theme blocks once. We pass
  // these scopes into buildComponents so var() values get a concrete
  // fallback injected — `var(--ds-x)` becomes `var(--ds-x, #...)`.
  let cssEarly = "";
  try {
    const cssPath = path.join(runDir, "inputs", "css-collected.css");
    if (fs.existsSync(cssPath)) cssEarly = fs.readFileSync(cssPath, "utf8");
  } catch {}
  const cssScopes = parseCustomProperties(cssEarly);

  const components = buildComponents(componentProperties, { cssScopes });
  const shadowLadder = bucketShadows(shadows);
  const motionBuckets = bucketMotion(motion);
  // ADR-022 v2: Fluentui-style 8-duration + 7-easing canonical scale,
  // populated for tokens.motion (consumed by design-md-builder).
  const motionCanonical = assignMotionRoles(motion);
  const elevationLadder = computeElevationLadder(shadows);
  // ADR-022 v2: tokens.colors.dark slot population from dark-mode CSS vars.
  const darkSlots = extractDarkSlots(darkMode, cssVars);
  const meta = buildMeta(styleFingerprint);

  // C1: density + motion_preference inference
  if (meta) {
    const density = inferDensity(tokensDetected, componentProperties);
    if (density) meta.density = density;
    const motionPref = inferMotionPreference(motion);
    if (motionPref) meta.motion_preference = motionPref;
  }

  const extended = {
    schema_version: "1.1",
    source: { run_dir_basename: path.basename(runDir) },
  };
  if (components) extended.components = components;
  if (shadowLadder) extended.shadow = shadowLadder;
  if (motionBuckets) extended.motion = motionBuckets;
  extended.pattern_tokens = buildPatternTokens({
    motionBuckets,
    motionCanonical,
    focusRing,
    elevationLadder,
    zIndex,
  });
  if (meta) extended.meta = meta;

  // L3 extras
  if (gradients && (gradients.primary || gradients.total_unique > 0)) {
    extended.gradient = {
      primary: gradients.primary,
      secondary: gradients.secondary,
      total_unique: gradients.total_unique,
    };
  }
  if (backdropBlur && backdropBlur.has_backdrop_blur) {
    extended.backdrop_blur = {
      sm: backdropBlur.sm,
      md: backdropBlur.md,
      lg: backdropBlur.lg,
    };
  }
  if (opacityScale && opacityScale.disabled != null) {
    extended.opacity = {
      disabled: opacityScale.disabled,
      muted: opacityScale.muted,
      hover: opacityScale.hover,
    };
  }
  if (focusRing && focusRing.detected) {
    extended.focus_ring = {
      outline: focusRing.outline || null,
      outline_offset: focusRing.outline_offset || null,
      box_shadow: focusRing.box_shadow || null,
    };
  }

  // L4 extras
  if (zIndex && (zIndex.base != null || zIndex.modal != null)) {
    extended.z_index = {
      base: zIndex.base,
      dropdown: zIndex.dropdown,
      modal: zIndex.modal,
      toast: zIndex.toast,
      tooltip: zIndex.tooltip,
    };
  }
  if (container && container.value) {
    extended.container = { max_width: container.value };
  }

  // Load tokens.json early so themed-mode classification (below) can read
  // the surface luminance.
  let tokensJson = null;
  try {
    const tp = path.join(runDir, "tokens.json");
    if (fs.existsSync(tp)) tokensJson = JSON.parse(fs.readFileSync(tp, "utf8"));
  } catch {}

  // Themed CSS custom properties — expose light + dark vars as flat resolved
  // maps so downstream renderers can inline-declare them on a wrapper instead
  // of parsing CSS at runtime.
  //
  // defaultMode classification — high-confidence detector wins, otherwise
  // surface composition decides.
  //
  //   1. theme-default.json with HIGH confidence → trust verbatim. Sites
  //      with explicit `<html data-theme="dark">` (Linear) or
  //      `<meta color-scheme="dark light">` (Vercel) signal their default
  //      unambiguously, even when the LLM-extracted tokens.json snapshots
  //      the light theme.
  //   2. Surface luminance from tokens.json — direct signal of the rendered
  //      surface. Catches Redpine (light surface + dark modal vars) and
  //      aioxsquad (dark surface).
  //   3. theme-default.json with medium confidence as last resort.
  //
  // supportsDark is the canonical toggle signal: only light-default sites
  // that ALSO ship dark vars get one.
  const themed = buildThemedVars(cssScopes);
  const themeDefault = read("inputs/theme-default.json");
  const surfaceColor =
    tokensJson?.preview_tokens?.surface_bg ??
    tokensJson?.colors?.surface ??
    null;
  const surfaceLum = computeLumFromHex(surfaceColor);
  const hasDarkVars = Object.keys(themed.dark).length > 0;
  const detectorHigh = themeDefault?.confidence === "high";

  // Trust theme-default.json verbatim when it has any pick (i.e. when the
  // detector found at least one signal and isn't pure no-signal-fallback).
  // The detector now reads HTML markers AND CSS background-var luminance,
  // so even "low" confidence picks (e.g. OpenAI's `:root:not(:where(.light))`
  // dark default) are more reliable than the LLM-extracted surface, which
  // can snapshot the light theme even when the live site renders dark.
  const detectorPick = themeDefault?.default;
  const detectorHasSignal = hasThemeSignal(themeDefault);

  let defaultMode;
  if (detectorHasSignal && detectorPick) {
    defaultMode = detectorPick === "dark" ? "dark" : "light";
  } else if (surfaceLum != null) {
    defaultMode = surfaceLum < 0.42 ? "dark" : "light";
  } else if (hasDarkVars) {
    defaultMode = "dark";
  } else {
    defaultMode = "light";
  }
  // Mark unused locals so eslint doesn't trip on the higher-confidence path
  // that was simplified away.
  void detectorHigh;

  themed.defaultMode = defaultMode;
  themed.supportsDark = defaultMode === "light" && hasDarkVars;
  if (Object.keys(themed.light).length > 0 || hasDarkVars) {
    extended.themed = themed;
  }
  const breakpoints = read("inputs/breakpoints.json") || [];
  // Reuse the CSS string we already loaded above for buildComponents — no
  // need to re-read the file from disk.
  extended.coverage = buildCoverage({
    tokens: tokensJson || {},
    ext: extended,
    breakpoints,
    css: cssEarly,
  });

  // Theme + mismatch detection — surface dark/light disagreement vs detected default
  if (themeDefault) {
    extended.theme = {
      default: themeDefault.default,
      confidence: themeDefault.confidence,
      signals: themeDefault.signals,
    };
    const mismatch = detectThemeMismatch(tokensJson, themeDefault);
    if (mismatch) {
      extended.theme.mismatch = mismatch.mismatch;
      extended.theme.expected = mismatch.expected;
      extended.theme.actual = mismatch.actual;
      extended.theme.surface_luminance = mismatch.surface_luminance;
      // Append to coverage.missing as a flagged issue when mismatched
      if (mismatch.mismatch && extended.coverage) {
        extended.coverage.missing = extended.coverage.missing || [];
        extended.coverage.missing.push({
          category: "L0.theme_consistency",
          reason: "theme_mismatch",
          detail: `tokens encode '${mismatch.actual}' theme but site renders '${mismatch.expected}' by default`,
        });
      }
    }
  }

  // Primary swap (ADR-022 v2, handoff 2026-05-02) — when the CTA detector
  // identifies a strong primary candidate whose resolved background differs
  // from tokens.colors.primary, we treat the CTA selector as canonical.
  // Frequency-ranked extraction picks accents (Anthropic clay, OpenAI's
  // tweet-blue) that the brand actually treats as secondary.
  const ctaVariants = read("inputs/cta-variants.json");
  const primarySwap = computePrimarySwap(ctaVariants, tokensJson, cssVars);

  // Spacing scale (handoff 2026-05-02 P1) — derived from raw CSS so the
  // design-md scaffold can populate `spacing:` instead of TODO. Strict
  // extraction: returns null when CSS doesn't yield ≥4 distinct values.
  const { detectSpacingScale, splitShadows, filterShadows } = require("./extractors.cjs");
  const spacingScale = detectSpacingScale(cssEarly);

  // Elevation clusters (handoff 2026-05-02 P1) — group filtered shadows
  // by blur radius into flat/raised/floating/overlay/modal tiers.
  // Inset shadows (handoff 2026-05-02 H) — Linear/Anthropic use inset
  // shadows as hairline borders. Split them out so elevation isn't polluted.
  const filteredAll = filterShadows(shadows);
  const partitioned = splitShadows(filteredAll);
  const insetShadows = partitioned.inset.length > 0
    ? partitioned.inset.slice(0, 4).reduce((acc, entry, i) => {
        const tier = ["hairline", "ring", "well", "etched"][i] || `inset-${i}`;
        acc[tier] = entry.value;
        return acc;
      }, {})
    : null;

  // Brand-named shadows (handoff 2026-05-02 #33) — surface --shadow-low/
  // --shadow-medium/--hds-shadow-xs etc. as tokens.shadows.{name}.
  const { extractNamedShadows } = require("./extractors.cjs");
  const namedShadows = extractNamedShadows(cssVars);

  return {
    componentsPatch: components,
    motionCanonical,
    darkSlots,
    primarySwap,
    spacingScale,
    elevationLadder,
    insetShadows,
    namedShadows,
    extended,
  };
}

/**
 * computeElevationLadder — bucket filtered shadows by blur radius into
 * Material-3-style elevation tiers.
 *
 * Tiers (ordered by perceived depth):
 *   flat       blur ≤ 2px        flush surfaces, hairline borders
 *   raised     2 < blur ≤ 8      cards, subtle lift
 *   floating   8 < blur ≤ 24     dropdowns, floating action buttons
 *   overlay    24 < blur ≤ 48    popovers, sheets
 *   modal      blur > 48         dialogs, drawer overlays
 *
 * Returns an object mapping tier → first shadow string in that bucket
 * (preserves the brand's most-used variant per tier). Tiers with no
 * matching shadow are omitted — strict extraction, no defaults.
 */
function computeElevationLadder(shadowsList) {
  const cleaned = Array.isArray(shadowsList)
    ? (require("./extractors.cjs").filterShadows(shadowsList))
    : [];
  if (cleaned.length === 0) return null;
  const tiers = {
    flat:     { max: 2,   value: null, count: 0 },
    raised:   { max: 8,   value: null, count: 0 },
    floating: { max: 24,  value: null, count: 0 },
    overlay:  { max: 48,  value: null, count: 0 },
    modal:    { max: Infinity, value: null, count: 0 },
  };
  // Bucket by max blur across all layers in a multi-layer shadow.
  for (const entry of cleaned) {
    const v = entry.value;
    const blurs = (v.match(/(\d+(?:\.\d+)?)px(?=[\s,)]|$)/g) || [])
      .map((s) => parseFloat(s));
    if (blurs.length === 0) continue;
    const maxBlur = Math.max(...blurs);
    let pickedTier = null;
    for (const [tierName, def] of Object.entries(tiers)) {
      if (maxBlur <= def.max) { pickedTier = tierName; break; }
    }
    if (!pickedTier) continue;
    const t = tiers[pickedTier];
    if (entry.count > t.count) {
      t.count = entry.count;
      t.value = v;
    }
  }
  const out = {};
  for (const [tierName, def] of Object.entries(tiers)) {
    if (def.value) out[tierName] = def.value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * computePrimarySwap — decide whether tokens.colors.primary should be
 * overridden by the CTA detector's primary pick.
 *
 * Returns:
 *   { applied: true, resolved: "#hex", selector, rawBg }
 *   | { applied: false, reason }
 *
 * Decision flow:
 *   1. cta-variants.json#primary must exist and have a bg.
 *   2. Bg gets resolved through cssVars (light scope) — must end in a literal
 *      hex/rgb/hsl. Unresolvable → skip.
 *   3. If resolved equals tokens.colors.primary (after normalization) → no-op.
 *   4. If selector looks library-default (.button, .w-button, body) → skip.
 *   5. Otherwise: apply.
 */
// Selector tokens that signal a third-party / specialized component embed
// rather than a brand-authored CTA. These leak into the candidate pool when
// sites embed Twitter/X widgets, dev tools, or report dashboards.
const SELECTOR_DOMAIN_BLOCKLIST = /\b(tweet|twitter|x-com|instagram|facebook|linkedin|debug|report-module|sandbox|dev-tool|playground|markdown-editor)\b/i;

function computePrimarySwap(ctaVariants, tokensJson, cssVars) {
  if (!ctaVariants || !ctaVariants.primary || !ctaVariants.primary.bg) {
    return { applied: false, reason: "no_cta_primary" };
  }
  const primary = ctaVariants.primary;
  const selector = primary.selector || "";
  const rawBg = primary.bg;

  // Selector quality gate — refuse swaps when the picked CTA looks like a
  // framework default rather than a brand-authored class.
  if (/^\.button(\s|,|$)/.test(selector)) {
    return { applied: false, reason: "library_default_selector", selector };
  }
  if (/\bw-button\b/.test(selector)) {
    return { applied: false, reason: "webflow_default_selector", selector };
  }
  if (/^(body|html|button)(\s|,|$)/.test(selector)) {
    return { applied: false, reason: "tag_selector", selector };
  }
  if (SELECTOR_DOMAIN_BLOCKLIST.test(selector)) {
    return { applied: false, reason: "third_party_selector", selector };
  }

  // Resolve var() chains in light scope (default mode is what shipped CTAs use).
  const resolved = resolveToHex(rawBg, cssVars);
  if (!resolved) {
    return { applied: false, reason: "unresolvable_var", selector, rawBg };
  }

  const currentPrimary = tokensJson?.colors?.primary;
  const currentHex = typeof currentPrimary === "string"
    ? currentPrimary.toLowerCase()
    : (currentPrimary?.value || "").toString().toLowerCase();
  if (currentHex && currentHex === resolved.toLowerCase()) {
    return { applied: false, reason: "already_matches", resolved };
  }

  // Reject swaps whose resolved value isn't a literal hex — `hsla(0, 0%, 100%, 1)`
  // is white, which means we resolved to the surface, not the CTA fill.
  if (!/^#[0-9a-f]{3,8}$/i.test(resolved)) {
    return { applied: false, reason: "non_hex_resolved", resolved, selector };
  }

  // Luminance gate — pure white / pure black resolved values are almost
  // always either the background (transparent button on white surface) or a
  // text color that bled into the bg slot. Brand primary CTAs are colored
  // accents in the 0.06–0.92 luminance range, OR neutral surfaces (Anthropic
  // ivory, Linear graphite) that the extractor ALREADY captured. So if the
  // resolved value is at the extreme ends, refuse and keep the existing pick.
  const lum = computeLumFromHex(resolved);
  if (lum != null && (lum < 0.04 || lum > 0.96)) {
    return { applied: false, reason: "extreme_luminance", resolved, luminance: lum, selector };
  }

  // Surface-collision gate — if the resolved value matches the extracted
  // surface background, the "CTA bg" is actually a transparent button on the
  // page surface, not a colored CTA fill.
  const surfaceBg = (tokensJson?.preview_tokens?.surface_bg || tokensJson?.colors?.surface || "").toString().toLowerCase();
  if (surfaceBg && surfaceBg === resolved.toLowerCase()) {
    return { applied: false, reason: "matches_surface", resolved, selector };
  }

  return { applied: true, resolved, selector, rawBg, luminance: lum };
}

/**
 * resolveToHex — best-effort resolution of a CSS color expression to a literal
 * hex string. Handles:
 *   - bare hex (`#141413` / `#fff`)
 *   - bare rgb()/rgba()/hsl()/hsla() — returned verbatim
 *   - var() chains (recursively resolved through cssVars in light scope)
 * Returns null if resolution can't reach a literal.
 */
function resolveToHex(value, cssVars) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return trimmed;
  if (/^(rgb|rgba|hsl|hsla)\(/i.test(trimmed)) return trimmed;
  if (/^var\(/i.test(trimmed)) {
    const resolved = resolveVarChain(trimmed, cssVars || [], "light");
    if (!resolved) return null;
    if (/^#[0-9a-f]{3,8}$/i.test(resolved.trim())) return resolved.trim();
    if (/^(rgb|rgba|hsl|hsla)\(/i.test(resolved.trim())) return resolved.trim();
    return null;
  }
  return null;
}

// Apply enrichment into a tokens.json object (mutates and returns it).
// Only fills components/motion/dark that the LLM left empty/missing.
function applyEnrichmentToTokens(tokens, componentsPatch, motionCanonical, darkSlots, primarySwap, spacingScale, elevationLadder, insetShadows, namedShadows) {
  if (!tokens || typeof tokens !== "object") return tokens;

  // Components — fill empty/missing slots only
  if (componentsPatch) {
    tokens.components = tokens.components || {};
    for (const [name, fields] of Object.entries(componentsPatch)) {
      const existing = tokens.components[name] || {};
      const merged = { ...fields, ...existing };
      tokens.components[name] = merged;
    }
  }

  // Motion — fill canonical Fluentui scale (ADR-022 v2 §Layer 2)
  if (motionCanonical && typeof motionCanonical === "object") {
    tokens.motion = tokens.motion || {};
    for (const [role, value] of Object.entries(motionCanonical)) {
      if (tokens.motion[role] === undefined || tokens.motion[role] === null) {
        tokens.motion[role] = value;
      }
    }
  }

  // Dark slots — fill tokens.colors.dark with extracted shadcn-mapped vars (ADR-022 v2).
  // Some brands (aioxsquad) use `dark` as a Layer 5 brand primitive (a single
  // hex value), not a slot map. Detect and skip enrichment in that case to
  // avoid corrupting the brand swatch.
  if (darkSlots && typeof darkSlots === "object") {
    tokens.colors = tokens.colors || {};
    if (typeof tokens.colors.dark === "string" || tokens.colors.dark instanceof String) {
      // `dark` is a brand primitive (color hex), not a slot container — preserve
      // it as a swatch and surface dark slots under a non-conflicting key.
      tokens.colors._dark_swatch = tokens.colors.dark;
      tokens.colors.dark = {};
    } else {
      tokens.colors.dark = tokens.colors.dark || {};
    }
    for (const [slot, value] of Object.entries(darkSlots)) {
      if (tokens.colors.dark[slot] === undefined || tokens.colors.dark[slot] === null) {
        tokens.colors.dark[slot] = value;
      }
    }
  }

  // Primary swap — override tokens.colors.primary with the resolved CTA-selector
  // background when extractor frequency picked a non-canonical accent (ADR-022 v2,
  // handoff 2026-05-02). The swap is gated: only applied when the CTA detector
  // produced a high-confidence pick AND the resolved hex differs from tokens'.
  if (primarySwap && primarySwap.applied && primarySwap.resolved) {
    tokens.colors = tokens.colors || {};
    const previous = tokens.colors.primary;
    tokens.colors.primary = primarySwap.resolved;
    tokens.colors._primary_swap = {
      previous,
      source: "cta_selector",
      selector: primarySwap.selector,
      raw_bg: primarySwap.rawBg,
    };
  }

  // Spacing scale (ADR-022 v2 §Layer 3 Tailwind base) — fill tokens.spacing
  // when extractor produced a t-shirt scale and tokens didn't already carry one.
  // When numeric Tailwind-style stops align (≥4 stops on the 4px grid), merge
  // them in alongside the t-shirt aliases — consumers can pick either dialect.
  if (spacingScale && spacingScale.scale && Object.keys(spacingScale.scale).length > 0) {
    if (!tokens.spacing || typeof tokens.spacing !== "object" || Object.keys(tokens.spacing).length === 0) {
      tokens.spacing = { ...spacingScale.scale };
      if (spacingScale.numeric) {
        // Numeric stops appear after t-shirt aliases for readability.
        Object.assign(tokens.spacing, spacingScale.numeric);
      }
    }
  }

  // Elevation ladder — fill tokens.elevation with M3-style depth tiers.
  if (elevationLadder && Object.keys(elevationLadder).length > 0) {
    if (!tokens.elevation || typeof tokens.elevation !== "object" || Object.keys(tokens.elevation).length === 0) {
      tokens.elevation = { ...elevationLadder };
    }
  }

  // Inset shadows — separate slot for hairline-style inset shadows so
  // elevation tiers stay focused on real depth.
  if (insetShadows && Object.keys(insetShadows).length > 0) {
    if (!tokens.shadows_inset || Object.keys(tokens.shadows_inset).length === 0) {
      tokens.shadows_inset = { ...insetShadows };
    }
  }

  // Brand-named shadows — fill tokens.shadows.{name} when extractor surfaced
  // CSS-var-declared brand vocabulary (--shadow-low, --hds-shadow-md, etc).
  if (namedShadows && Object.keys(namedShadows).length > 0) {
    tokens.shadows = tokens.shadows || {};
    for (const [name, value] of Object.entries(namedShadows)) {
      if (tokens.shadows[name] === undefined || tokens.shadows[name] === null) {
        tokens.shadows[name] = value;
      }
    }
  }

  return tokens;
}

module.exports = {
  buildEnrichment,
  applyEnrichmentToTokens,
  computePrimarySwap,
  resolveToHex,
  computeElevationLadder,
  buildPatternTokens,
  classifyAtomicLayerForComponent,
  resolveVarChain,
  assignMotionRoles,
  extractDarkSlots,
  // Exposed for tests
  bucketShadows,
  bucketMotion,
  buildComponents,
  buildMeta,
  buildCoverage,
  classifyGap,
  inferDensity,
  inferMotionPreference,
  parseShadowBlur,
  parseDurationMs,
  normalizePropKey,
  REASON_CODES,
};
