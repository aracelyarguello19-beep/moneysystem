"use strict";

/**
 * design-md-builder — emits a v2.2 design.md scaffold from extract sidecars.
 *
 * STRICT EXTRACTION PRINCIPLE (founder directive 2026-05-02, updated 2026-05-03):
 *   "NADA é FIXED — só extraímos de verdade. Quando algo não foi extraído,
 *    fica null com extraction_gap, NUNCA um default inventado."
 *
 * Implications:
 *   1. NO motion/shadow/spacing/rounded "default scales" hardcoded.
 *      Each value either comes from a sidecar JSON or becomes an extraction_gap.
 *   2. NO "Anthropic-flavoured" fallbacks (e.g. btn-padx "24px"). Empty source
 *      → null with extraction_gap metadata about where to look.
 *   3. Aliases (Layer 4) are a CONTRACT decision, not extracted. They are
 *      emitted only when the canonical targets they alias to exist in tokens.
 *      Otherwise they are extraction_gap metadata (humans decide whether the brand uses Layer 4).
 *   4. consumer_contract priority_order is hardcoded ONLY because it's
 *      pipeline policy (ADR-022 priority for LLM consumers), not brand voice.
 *
 * Inputs (object with these keys, all optional — graceful degradation):
 *   tokens             outputs/.../tokens.json
 *   metaAssets         inputs/meta-assets.json
 *   metaDefaults       outputs/.../meta-defaults.json
 *   heroBlock          inputs/hero-block.json
 *   heroVariant        inputs/hero-variant.json
 *   ctaVariants        inputs/cta-variants.json
 *   voiceHeuristic     inputs/voice-heuristic.json
 *   styleFingerprint   outputs/.../style-fingerprint.json
 *   componentProperties  inputs/component-properties.json
 *   shadows            inputs/shadows.json
 *   motion             inputs/motion.json
 *   fontFaces          inputs/font-faces.json
 *   darkMode           inputs/dark-mode.json
 *   spacing            inputs/spacing.json (if extracted)
 *   rounded            inputs/rounded.json (if extracted)
 *   slug               url slug
 *   url                source URL
 *
 * Output: string with v2.2 frontmatter + 11 prose section stubs.
 */

const { filterShadows } = require("./extractors.cjs");
const { resolveVarChain } = require("./enrich.cjs");

const MISSING_VALUE = (label) => `null  # extraction_gap(${label})`;
const GAP_COMMENT = (label) => `# extraction_gap(${label})`;

// ── YAML emitters ─────────────────────────────────────────────────
function yamlString(s) {
  if (s === null || s === undefined) return "null";
  const str = String(s);
  return `"${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function yamlBool(b) {
  return b ? "true" : "false";
}

function isExtractedString(v) {
  return typeof v === "string" && v.length > 0 && !v.includes("extraction_gap(");
}

// ── Field extractors ──────────────────────────────────────────────

function pickHex(tokenEntry) {
  if (!tokenEntry) return null;
  if (typeof tokenEntry === "string") return tokenEntry;
  return tokenEntry.value || tokenEntry.hex || null;
}

/**
 * legacyTokenAlias — when a v2.2 shadcn slot is missing in tokens.colors,
 * but a synonymous legacy key is present, surface that value with a NOTE
 * so the human knows it came via alias (not direct extraction).
 *
 * Returns { value, source } if a direct or aliased value exists, else null.
 */
const LEGACY_COLOR_SYNONYMS = {
  // Direct semantic synonyms (legacy → shadcn slot)
  "foreground": ["text", "ink", "slate-dark"],
  "muted-foreground": ["text-muted", "ink-muted", "slate-light"],
  "background": ["surface", "canvas", "ivory-light"],
  "destructive": ["error", "danger", "red"],
  "card": ["surface-elevated", "panel", "white"],
  "popover": ["surface-elevated", "panel", "white"],
  "muted": ["surface-muted", "neutral-bg", "ivory-medium"],
  // Foreground siblings — typically inherit from primary text color
  "primary-foreground": ["on-primary", "primary-text", "white", "ivory-light"],
  "secondary-foreground": ["on-secondary", "secondary-text", "text", "ink", "foreground"],
  "card-foreground": ["text", "ink", "slate-dark"],
  "popover-foreground": ["text", "ink", "slate-dark"],
  "accent-foreground": ["on-accent", "accent-text", "white", "ivory-light", "primary-foreground"],
  "destructive-foreground": ["on-error", "error-text", "white"],
  "surface-foreground": ["text", "ink", "slate-dark"],
  // Functional slots — accent/input/ring fall back to primary-adjacent swatches
  "accent": ["clay", "primary-deep", "primary-soft", "highlight"],
  "input": ["muted", "ivory-dark", "neutral-bg", "background"],
  "ring": ["accent", "clay", "primary"],
  // M3 surface ladder — derived from background + brand swatch chain
  "surface-container-low": ["background", "surface", "ivory-light", "canvas"],
  "surface-container": ["muted", "ivory-medium", "paper", "neutral-bg"],
  "surface-container-high": ["ivory-dark", "border", "paper-deep"],
  "surface-container-highest": ["cloud-medium", "cloud-light"],
  "surface-bright": ["accent", "primary-soft", "clay"],
  "surface-dim": ["cloud-medium", "muted-foreground", "neutral"],
  "surface-inverse": ["foreground", "text", "ink", "slate-dark"],
  "surface-inverse-foreground": ["background", "surface", "primary-foreground", "ivory-light"],
  // Layer 4 brand synonyms — paper/ink/etc map back to canonical
  "paper":      ["muted", "ivory-medium", "neutral-bg"],
  "paper-deep": ["ivory-dark", "border"],
  "ink":        ["foreground", "text", "slate-dark"],
  "ink-soft":   ["slate-medium", "slate-700"],
  "ink-muted":  ["muted-foreground", "slate-light", "text-muted"],
  "primary-deep": ["primary"],   // fallback to same; adjustLum applied by builder
  "primary-soft": ["primary"],
  // Status colors — common defaults when brand omits them. The builder applies
  // these only when the canonical light-mode hex is present.
  "tertiary": ["olive", "tertiary-color"],
  "neutral":  ["slate-light", "ink-muted", "muted-foreground"],
};

// Detect a hex value that is too colored to serve as a "text" / "foreground"
// slot. A real text color is near-grayscale (R=G=B within ~40 units). If a
// foreground-family slot resolves to e.g. #3e6ae1 (Tesla blue) or #e60000
// (Vodafone red), the LLM extraction collapsed multiple roles onto the
// brand color and we should reject it.
function isInvalidForegroundHex(hex) {
  if (!hex || typeof hex !== "string") return false;
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // > 40 channel range → it's a colored hue, not a text gray
  return max - min > 40;
}

// Find the darkest near-neutral swatch in tokens.colors — used as a recovery
// fallback when the LLM-extracted foreground/text is broken (Tesla pattern).
// Looks at all hex values, filters to those with low channel range AND low
// luminance, returns the darkest match.
function findFallbackInk(tokens) {
  const candidates = [];
  for (const [name, val] of Object.entries(tokens?.colors || {})) {
    const hex = pickHex(val);
    if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) continue;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const range = Math.max(r, g, b) - Math.min(r, g, b);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    // Near-neutral (range ≤ 25) AND dark (lum ≤ 0.4)
    if (range <= 25 && lum <= 0.4) {
      candidates.push({ name, hex, lum });
    }
  }
  if (candidates.length === 0) return null;
  // Pick darkest
  candidates.sort((a, b) => a.lum - b.lum);
  return candidates[0];
}

// Slots where a colored value is suspect (text/ink/foreground roles).
// These should always be near-grayscale; if extraction collapsed them onto
// the brand primary, reject and fall back to a neutral.
const FOREGROUND_FAMILY_SLOTS = new Set([
  "foreground", "card-foreground", "popover-foreground",
  "surface-foreground", "secondary-foreground", "muted-foreground",
  "ink", "ink-soft", "text",
]);

function resolveColorWithAlias(tokens, slot) {
  const direct = pickHex(tokens?.colors?.[slot]);
  if (direct) {
    // Foreground-family bug detection: if direct value is colored, skip it
    // and try the legacy synonym chain or a brand-neutral fallback.
    if (FOREGROUND_FAMILY_SLOTS.has(slot) && isInvalidForegroundHex(direct)) {
      const fallback = findFallbackInk(tokens);
      if (fallback) {
        return { value: fallback.hex, source: `recovered from broken extraction (used ${fallback.name})` };
      }
      // No fallback — fall through to synonym chain below
    } else {
      return { value: direct, source: "extracted" };
    }
  }
  const synonyms = LEGACY_COLOR_SYNONYMS[slot] || [];
  for (const syn of synonyms) {
    const v = pickHex(tokens?.colors?.[syn]);
    if (!v) continue;
    if (FOREGROUND_FAMILY_SLOTS.has(slot) && isInvalidForegroundHex(v)) continue;
    return { value: v, source: `aliased from "${syn}"` };
  }
  // Final recovery for foreground-family slots
  if (FOREGROUND_FAMILY_SLOTS.has(slot)) {
    const fallback = findFallbackInk(tokens);
    if (fallback) {
      return { value: fallback.hex, source: `recovered from broken extraction (used ${fallback.name})` };
    }
  }
  return null;
}

function colorOrTodo(tokens, slot, hint) {
  const r = resolveColorWithAlias(tokens, slot);
  if (r) {
    if (r.source === "extracted") return yamlString(r.value);
    return `${yamlString(r.value)}  # ${r.source}; inference=semantic_alias`;
  }
  return MISSING_VALUE(`colors.${slot}${hint ? " — " + hint : ""}`);
}

// Hex helpers (also used by deriveDarkFallback). Pure stateless.
function hexAdjustLum(hex, delta) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const r = Math.max(0, Math.min(255, parseInt(hex.slice(1, 3), 16) + delta));
  const g = Math.max(0, Math.min(255, parseInt(hex.slice(3, 5), 16) + delta));
  const b = Math.max(0, Math.min(255, parseInt(hex.slice(5, 7), 16) + delta));
  return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
}

function buildColorsBlock(tokens) {
  const c = (slot, hint) => colorOrTodo(tokens, slot, hint);
  const resolve = (slot) => {
    const r = resolveColorWithAlias(tokens, slot);
    return r ? r.value : null;
  };
  const lines = ["colors:", "  # Semantic UI color slots"];
  const semanticSlots = [
    ["primary", "primary CTA fill"],
    ["primary-foreground"],
    ["secondary"],
    ["secondary-foreground"],
    ["tertiary"],
    ["neutral"],
    ["background"],
    ["foreground"],
    ["surface"],
    ["surface-foreground"],
    ["card"],
    ["card-foreground"],
    ["popover"],
    ["popover-foreground"],
    ["muted"],
    ["muted-foreground"],
    ["accent"],
    ["accent-foreground"],
    ["destructive"],
    ["destructive-foreground"],
    ["border"],
    ["input"],
    ["ring"],
  ];
  for (const [slot, hint] of semanticSlots) {
    lines.push(`  ${slot}: ${c(slot, hint)}`);
  }
  // Status colors — emitted only when extracted (success/warning/info are
  // brand decisions, not universal). Chart palette derived ONLY from extracted
  // brand swatches (no universal status fallback).
  for (const slot of ["success", "warning", "info"]) {
    const r = resolveColorWithAlias(tokens, slot);
    if (r) {
      lines.push(`  ${slot}: ${r.source === "extracted" ? yamlString(r.value) : `${yamlString(r.value)}  # ${r.source}`}`);
    } else {
      lines.push(`  ${slot}: ${MISSING_VALUE(`colors.${slot}`)}`);
    }
  }
  // Chart palette — auto-derive ONLY from brand swatches (accent/primary/tertiary).
  // No universal hex defaults.
  const chartFallbacks = [
    resolve("accent") || resolve("primary"),
    resolve("primary"),
    resolve("tertiary"),
    resolve("info"),
    resolve("warning"),
  ];
  for (let i = 1; i <= 5; i++) {
    const slot = `chart-${i}`;
    const r = resolveColorWithAlias(tokens, slot);
    if (r) {
      lines.push(`  ${slot}: ${r.source === "extracted" ? yamlString(r.value) : `${yamlString(r.value)}  # ${r.source}`}`);
    } else {
      const fallback = chartFallbacks[i - 1];
      if (fallback) {
        lines.push(`  ${slot}: ${yamlString(fallback)}  # derived from brand palette`);
      } else {
        lines.push(`  ${slot}: ${MISSING_VALUE(`colors.${slot}`)}`);
      }
    }
  }
  lines.push("", "  # M3 surface ladder");
  for (const slot of [
    "surface-container-low",
    "surface-container",
    "surface-container-high",
    "surface-container-highest",
    "surface-bright",
    "surface-dim",
    "surface-inverse",
    "surface-inverse-foreground",
  ]) {
    lines.push(`  ${slot}: ${c(slot)}`);
  }
  lines.push("", "  # Semantic aliases (auto-derived when canonical target exists)");
  // primary-deep = primary darkened ~15%, primary-soft = primary lightened ~70%
  const primaryHex = resolve("primary");
  const fgHex = resolve("foreground");
  const bgHex = resolve("background");
  const aliasDerivations = {
    "primary-deep": primaryHex ? hexAdjustLum(primaryHex, -32) : null,
    "primary-soft": primaryHex ? hexAdjustLum(primaryHex, 130) : null,
    "paper":        resolve("muted"),
    "paper-deep":   resolve("muted") ? hexAdjustLum(resolve("muted"), -16) : null,
    "ink":          fgHex,
    "ink-soft":     fgHex ? hexAdjustLum(fgHex, 40) : null,
    "ink-muted":    resolve("muted-foreground"),
  };
  for (const slot of ["primary-deep", "primary-soft", "paper", "paper-deep", "ink", "ink-soft", "ink-muted"]) {
    const r = resolveColorWithAlias(tokens, slot);
    if (r && r.source === "extracted") {
      lines.push(`  ${slot}: ${yamlString(r.value)}`);
    } else if (r) {
      lines.push(`  ${slot}: ${yamlString(r.value)}  # ${r.source}`);
    } else if (aliasDerivations[slot]) {
      lines.push(`  ${slot}: ${yamlString(aliasDerivations[slot])}  # auto-derived from primary/foreground luminance`);
    } else {
      lines.push(`  ${slot}: ${MISSING_VALUE(`colors.${slot}`)}`);
    }
  }
  lines.push("", "  # Extended brand swatches — distinctive named colors from the source");
  // Emit known brand swatches from tokens.brand_palette if present, else
  // auto-derive: any tokens.colors.{name} with a hex value AND a non-shadcn
  // name is a brand swatch (clay, slate-dark, ivory-light, etc.).
  const brandPalette = tokens?.brand_palette || tokens?.colors?.brand_palette;
  const SHADCN_AND_M3_SLOTS = new Set([
    "primary", "primary-foreground", "secondary", "secondary-foreground",
    "tertiary", "neutral", "background", "foreground",
    "surface", "surface-foreground",
    "card", "card-foreground", "popover", "popover-foreground",
    "muted", "muted-foreground", "accent", "accent-foreground",
    "destructive", "destructive-foreground",
    "border", "input", "ring",
    "success", "warning", "info",
    "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
    "surface-container-low", "surface-container", "surface-container-high",
    "surface-container-highest", "surface-bright", "surface-dim",
    "surface-inverse", "surface-inverse-foreground",
    "primary-deep", "primary-soft",
    "paper", "paper-deep", "ink", "ink-soft", "ink-muted",
    "dark", "_dark_swatch", "_primary_swap",
    "text", "text-muted", "error",  // legacy synonyms — already aliased above
  ]);
  if (brandPalette && typeof brandPalette === "object") {
    for (const [name, value] of Object.entries(brandPalette)) {
      lines.push(`  ${name}: ${yamlString(pickHex(value) || value)}`);
    }
  } else {
    const swatches = [];
    for (const [name, value] of Object.entries(tokens?.colors || {})) {
      if (SHADCN_AND_M3_SLOTS.has(name)) continue;
      if (name.startsWith("_")) continue;
      const hex = typeof value === "string" ? value : (value?.value || value?.hex);
      if (hex && /^#[0-9a-f]{3,8}$/i.test(hex)) {
        swatches.push([name, hex]);
      }
    }
    if (swatches.length > 0) {
      for (const [name, hex] of swatches) {
        lines.push(`  ${name}: ${yamlString(hex)}`);
      }
    } else {
      lines.push(`  ${GAP_COMMENT("colors.brand_swatches — extracted CSS vars not yet curated; declare brand-named colors here")}`);
    }
  }
  return lines.join("\n");
}

/**
 * deriveDarkFallback — synthesise minimal dark slots when extraction
 * yielded none but the brand declared dark mode support. Strategy:
 *   - background: invert luminance of light background (white → near-black)
 *   - foreground: invert luminance of light foreground
 *   - primary: hold (most brands keep CTA color across modes)
 *   - card: slightly elevated dark (≈ +3% lum from background)
 *   - muted: slightly desaturated dark
 *   - border: foreground at low alpha, but emit hex 1a-suffix
 *
 * Returns object or null.
 */
function deriveDarkFallback(tokens) {
  const c = (slot) => {
    const r = resolveColorWithAlias(tokens, slot);
    return r ? r.value : null;
  };
  const lightBg = c("background");
  const lightFg = c("foreground");
  const primary = c("primary");
  if (!lightBg && !lightFg) return null;
  // Hex inversion: subtract from #ffffff per channel. Only handles 6-digit
  // hex; falls through for var() etc.
  function invertHex(hex) {
    if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
    const r = 255 - parseInt(hex.slice(1, 3), 16);
    const g = 255 - parseInt(hex.slice(3, 5), 16);
    const b = 255 - parseInt(hex.slice(5, 7), 16);
    return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
  }
  function adjustLum(hex, delta) {
    if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
    const r = Math.max(0, Math.min(255, parseInt(hex.slice(1, 3), 16) + delta));
    const g = Math.max(0, Math.min(255, parseInt(hex.slice(3, 5), 16) + delta));
    const b = Math.max(0, Math.min(255, parseInt(hex.slice(5, 7), 16) + delta));
    return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
  }
  const dBg = invertHex(lightBg);
  const dFg = invertHex(lightFg);
  if (!dBg && !dFg) return null;
  const dCard = dBg ? adjustLum(dBg, 8) : null;
  const dMuted = dBg ? adjustLum(dBg, 18) : null;
  const dBorder = dFg ? dFg + "1a" : null; // 10% alpha
  const out = {};
  if (dBg) out.background = dBg;
  if (dFg) out.foreground = dFg;
  if (primary) out.primary = primary; // hold across modes
  if (dCard) out.card = dCard;
  if (dCard) out["card-foreground"] = dFg;
  if (dMuted) out.muted = dMuted;
  if (dFg) out["muted-foreground"] = adjustLum(dFg, -64) || dFg;
  if (dBorder) out.border = dBorder;
  return Object.keys(out).length > 0 ? out : null;
}

function buildDarkBlock(tokens, darkMode) {
  const dark = tokens?.colors?.dark || tokens?.dark;
  if (dark && typeof dark === "object" && Object.keys(dark).length > 0) {
    const lines = ["dark:"];
    for (const [k, v] of Object.entries(dark)) {
      lines.push(`  ${k}: ${yamlString(pickHex(v) || v)}`);
    }
    return lines.join("\n");
  }
  // Auto-derive dark slots whenever we have enough light-mode signal to
  // invert. This produces a starting point even when the site doesn't ship
  // dark CSS — humans can still review and refine.
  const derived = deriveDarkFallback(tokens);
  if (derived) {
    const annotation = darkMode?.has_dark_mode
      ? "Auto-derived from light-mode inversion; review_status=needs_dark_css_comparison"
      : "Auto-derived from light-mode inversion — brand has no dark CSS detected, use as starting point only";
    const lines = ["dark:", `  # ${annotation}`];
    for (const [k, v] of Object.entries(derived)) {
      lines.push(`  ${k}: ${yamlString(v)}`);
    }
    return lines.join("\n");
  }
  return [
    "dark:",
    `  ${GAP_COMMENT("dark — declare dark-mode color slot overrides, or omit if not supported")}`,
  ].join("\n");
}

/**
 * autoAssignFontSlots — given a list of @font-face families, infer which slot
 * each likely fills. Pure heuristic based on family-name patterns.
 *
 * Returns: { display, body, eyebrow, mono, sans, serif } with values "Family, fallbacks"
 *          or null when no candidate matches.
 */
function autoAssignFontSlots(families) {
  const slots = { display: null, body: null, eyebrow: null, mono: null, sans: null, serif: null };
  if (!Array.isArray(families) || families.length === 0) return slots;

  // Filter junk families (icon fonts, webflow internals)
  const real = families.filter((f) => {
    const low = f.toLowerCase();
    return !low.includes("icon") && !low.startsWith("w-") && low !== "webflow-icons";
  });

  // Pattern matchers
  const isMono = (f) => /mono|code|courier/i.test(f);
  const isSerif = (f) => /serif/i.test(f) || /\b(georgia|times|playfair|merriweather|lora|tinos|garamond|caslon)\b/i.test(f);
  const isSans = (f) => /sans|inter|helvetica|arial|roboto|geist|jakarta|circular|sohne|söhne|söehne|söne/i.test(f) || (!isSerif(f) && !isMono(f));

  const sansFamilies = real.filter(isSans);
  const serifFamilies = real.filter(isSerif);
  const monoFamilies = real.filter(isMono);

  // Build font-stack strings with reasonable fallbacks
  const stack = (family, fallbacks) => `'${family}', ${fallbacks}`;
  const SANS_FALLBACKS = "Arial, sans-serif";
  const SERIF_FALLBACKS = "Georgia, serif";
  const MONO_FALLBACKS = "ui-monospace, monospace";

  // Mono is most specific
  if (monoFamilies.length > 0) {
    const primary = monoFamilies[0];
    const others = monoFamilies.slice(1).map((f) => `'${f}'`).join(", ");
    slots.mono = others
      ? `'${primary}', ${others}, ${MONO_FALLBACKS}`
      : stack(primary, MONO_FALLBACKS);
  }

  // Sans → display + body + eyebrow (when no serif)
  if (sansFamilies.length > 0) {
    const sansPrimary = sansFamilies[0];
    slots.sans = stack(sansPrimary, SANS_FALLBACKS);
    slots.eyebrow = stack(sansPrimary, SANS_FALLBACKS);
    // If no serif at all → sans is also display + body
    if (serifFamilies.length === 0) {
      slots.display = stack(sansPrimary, SANS_FALLBACKS);
      slots.body = stack(sansPrimary, SANS_FALLBACKS);
    }
  }

  // Serif → display + body when present
  if (serifFamilies.length > 0) {
    const serifPrimary = serifFamilies[0];
    slots.serif = stack(serifPrimary, SERIF_FALLBACKS);
    // Anthropic-style: Serif for display + body, Sans for UI
    slots.display = stack(serifPrimary, SERIF_FALLBACKS);
    slots.body = stack(serifPrimary, SERIF_FALLBACKS);
  }

  return slots;
}

function buildFontsBlock(tokens, fontFaces) {
  // Priority order for each slot value:
  //   1. tokens.fonts.{slot} from LLM normaliser (already curated)
  //   2. autoAssignFontSlots inference from @font-face families
  //   3. typography.{role}.fontFamily fallback (LLM-extracted dialect bakes
  //      families into typography roles instead of fonts slot)
  //   4. null extraction_gap with hint listing available families
  const f = tokens?.fonts || {};
  const lines = ["fonts:"];
  const slots = ["display", "body", "eyebrow", "mono", "sans", "serif"];

  const families = [];
  if (Array.isArray(fontFaces)) {
    for (const face of fontFaces) {
      if (face.family && !families.includes(face.family)) {
        families.push(face.family);
      }
    }
  }
  // Typography fontFamily harvest — collect from each role then dedupe by family
  const typoFamilies = new Map();
  const typo = tokens?.typography || {};
  function familyOf(val) {
    if (typeof val !== "string") return null;
    return val.split(",")[0].trim().replace(/['"]/g, "");
  }
  function looksMono(name) {
    return /mono|code|courier/i.test(name);
  }
  function looksSerif(name) {
    return /serif|georgia|times|playfair|merriweather|lora|caslon|garamond|tinos/i.test(name);
  }
  for (const role of Object.keys(typo)) {
    const fam = familyOf(typo[role]?.fontFamily);
    if (!fam) continue;
    if (!typoFamilies.has(fam)) typoFamilies.set(fam, { name: fam, full: typo[role].fontFamily, roles: new Set() });
    typoFamilies.get(fam).roles.add(role);
  }
  // Pick canonical font per slot from typography
  function pickTypoFont(predicateRole, predicateName) {
    for (const fam of typoFamilies.values()) {
      // Role-based pick wins
      if (predicateRole && Array.isArray(predicateRole)) {
        for (const r of predicateRole) if (fam.roles.has(r)) return fam.full;
      }
      // Name-based pick
      if (predicateName && predicateName(fam.name)) return fam.full;
    }
    return null;
  }
  const typoSans = pickTypoFont(["body", "body-md", "body-lg", "label", "button", "h1", "h2"], (n) => !looksSerif(n) && !looksMono(n));
  const typoSerif = pickTypoFont(null, looksSerif);
  const typoMono = pickTypoFont(["mono", "code-body"], looksMono);
  const typoDisplay = pickTypoFont(["display", "display-hero", "h1", "section-heading"], null);

  const typoFallback = {
    sans: typoSans,
    serif: typoSerif,
    mono: typoMono,
    display: typoDisplay,
    body: typoSans,
    eyebrow: typoSans,
  };

  const auto = autoAssignFontSlots(families);

  for (const slot of slots) {
    if (isExtractedString(f[slot])) {
      lines.push(`  ${slot}: ${yamlString(f[slot])}`);
    } else if (auto[slot]) {
      lines.push(`  ${slot}: ${yamlString(auto[slot])}  # source=@font-face; inference=font_slot`);
    } else if (typoFallback[slot]) {
      lines.push(`  ${slot}: ${yamlString(typoFallback[slot])}  # auto-derived from typography roles`);
    } else {
      const hint = families.length > 0
        ? `available families: ${families.slice(0, 4).join(", ")}`
        : `no @font-face detected — declare brand fonts manually`;
      lines.push(`  ${slot}: ${MISSING_VALUE(`fonts.${slot} — ${hint}`)}`);
    }
  }
  return lines.join("\n");
}

// Canonical role order — used to sort heterogeneous keys into a stable visual
// hierarchy. Keys not in this list are appended in insertion order. Both
// "display"/"heading" (curated dialect) and "h1/h2/h3/h4" (LLM-extracted
// dialect) are recognized so populated tokens survive the scaffold emission.
const TYPOGRAPHY_ROLE_ORDER = [
  "display", "display-hero", "display-large",
  "h1", "h2", "h3", "h4",
  "heading", "section-heading", "title", "subtitle", "subheading-large", "subheading",
  "body-lg", "body-large", "body", "body-md", "body-sm", "body-small",
  "lead",
  "label", "button", "link",
  "caption", "caption-small", "micro",
  "mono", "code-body", "code-bold",
];

function sortTypographyRoles(keys) {
  const positions = new Map(TYPOGRAPHY_ROLE_ORDER.map((k, i) => [k, i]));
  return [...keys].sort((a, b) => {
    const pa = positions.has(a) ? positions.get(a) : 1000 + keys.indexOf(a);
    const pb = positions.has(b) ? positions.get(b) : 1000 + keys.indexOf(b);
    return pa - pb;
  });
}

function buildTypographyBlock(tokens) {
  const t = tokens?.typography;
  const lines = ["typography:"];
  if (t && typeof t === "object" && Object.keys(t).length > 0) {
    const sortedKeys = sortTypographyRoles(Object.keys(t));
    for (const role of sortedKeys) {
      const r = t[role];
      if (!r || typeof r !== "object") continue;
      lines.push(`  ${role}:`);
      const fields = [
        ["fontFamily", r.fontFamily, true],
        ["fontSize", r.fontSize, false],
        ["fontWeight", r.fontWeight, false],
        ["lineHeight", r.lineHeight, false],
        ["letterSpacing", r.letterSpacing, true],
      ];
      for (const [name, val, quote] of fields) {
        if (val !== undefined && val !== null && val !== "") {
          // Numbers should not be quoted (lineHeight: 1.4, fontWeight: 700).
          // Strings get quoted when `quote` says so OR when the value contains
          // commas / quotes / non-ASCII (font-family stacks).
          const isNumber = typeof val === "number";
          const needsQuote = !isNumber && (quote || /[,\s"']/.test(String(val)));
          lines.push(`    ${name}: ${needsQuote ? yamlString(val) : val}`);
        } else {
          lines.push(`    ${name}: ${MISSING_VALUE(`typography.${role}.${name}`)}`);
        }
      }
    }
    return lines.join("\n");
  }
  // Empty scaffold — emit a default role grid as extraction gaps (display/heading/body/caption/mono).
  for (const role of ["display", "heading", "body", "caption", "mono"]) {
    lines.push(`  ${role}:`);
    lines.push(`    ${GAP_COMMENT(`typography.${role} — fontFamily, fontSize, fontWeight, lineHeight, letterSpacing`)}`);
  }
  return lines.join("\n");
}

function buildSpacingBlock(tokens) {
  const s = tokens?.spacing;
  const lines = ["spacing:"];
  if (s && typeof s === "object" && Object.keys(s).length > 0) {
    for (const [k, v] of Object.entries(s)) {
      const key = /^[\d.]/.test(k) ? `"${k}"` : k;
      lines.push(`  ${key}: ${yamlString(v)}`);
    }
    return lines.join("\n");
  }
  lines.push(`  ${GAP_COMMENT("spacing — declare brand spacing scale (numeric stops + t-shirt aliases) from extracted CSS values")}`);
  return lines.join("\n");
}

function buildRoundedBlock(tokens, ctaVariants, componentProperties, cssVars) {
  const lines = ["rounded:"];
  // Component-radius extraction: prefer cta-variants (visual SOT for primary CTA),
  // fall back to component-properties most-common, fall back to tokens.rounded slot.
  // Resolve var() chains using cssVars.
  function resolveRadius(raw) {
    if (!raw) return null;
    const r = resolveVarReference(raw, cssVars);
    if (!r.resolved) return null;
    // Some sites use "100vw" or "9999px" as pill-radius workaround. Normalise to "9999px".
    if (/^100vw$/i.test(r.resolved.trim())) return "9999px";
    if (/^50%$/i.test(r.resolved.trim())) return "9999px";
    return r.resolved;
  }
  const buttonRadius = resolveRadius(
    ctaVariants?.primary?.radius ||
    componentProperties?.summary?.button?.["border-radius"]?.most_common ||
    componentProperties?.summary?.button?.states?.default?.["border-radius"]?.most_common
  );
  const cardRadius = resolveRadius(
    componentProperties?.summary?.card?.["border-radius"]?.most_common ||
    componentProperties?.summary?.card?.states?.default?.["border-radius"]?.most_common
  );
  const inputRadius = resolveRadius(
    componentProperties?.summary?.input?.["border-radius"]?.most_common ||
    componentProperties?.summary?.input?.states?.default?.["border-radius"]?.most_common
  );

  // Merge tokens.rounded with extracted component-specific values.
  // tokens.rounded covers the abstract scale (none/sm/md/lg/xl/full); component-* covers role aliases.
  const r = tokens?.rounded || {};
  const hasTokens = Object.keys(r).length > 0;

  // Emit standard scale (uses tokens if present, else extracted, else extraction_gap)
  lines.push(`  none: ${r.none ? yamlString(r.none) : `"0px"`}`);
  lines.push(`  sm: ${r.sm ? yamlString(r.sm) : (buttonRadius ? `${yamlString(buttonRadius)}  # from button border-radius` : MISSING_VALUE("rounded.sm — small radius for chips/inputs"))}`);
  lines.push(`  md: ${r.md ? yamlString(r.md) : MISSING_VALUE("rounded.md")}`);
  lines.push(`  lg: ${r.lg ? yamlString(r.lg) : (cardRadius ? `${yamlString(cardRadius)}  # from card border-radius` : MISSING_VALUE("rounded.lg — card/avatar radius"))}`);
  // xl — derive as 2× lg (or 1.5× when lg is already large) when not extracted.
  // Pattern: shadcn lg=8px → xl=12px, lg=12px → xl=16px, lg=16px → xl=24px.
  function xlFromLg(lgVal) {
    if (!lgVal || typeof lgVal !== "string") return null;
    const m = lgVal.trim().match(/^(\d+(?:\.\d+)?)(px|rem|em)$/i);
    if (!m) return null;
    const n = parseFloat(m[1]);
    const unit = m[2];
    const scaled = n >= 12 ? n * 1.5 : n + (unit === "px" ? 4 : 0.25);
    return `${scaled}${unit}`;
  }
  const lgEffective = r.lg || cardRadius;
  const xlDerived = xlFromLg(lgEffective);
  lines.push(`  xl: ${r.xl ? yamlString(r.xl) : (xlDerived ? `${yamlString(xlDerived)}  # auto-derived from lg radius` : MISSING_VALUE("rounded.xl — alerts/featured blocks if brand uses larger radius"))}`);
  lines.push(`  full: ${r.full ? yamlString(r.full) : `"9999px"`}`);

  // Component-role aliases — almost always derivable from component-properties
  lines.push(`  button: ${r.button ? yamlString(r.button) : (buttonRadius ? `${yamlString(buttonRadius)}  # from button rules` : MISSING_VALUE("rounded.button — no .btn border-radius extracted"))}`);
  lines.push(`  card: ${r.card ? yamlString(r.card) : (cardRadius ? `${yamlString(cardRadius)}  # from card rules` : MISSING_VALUE("rounded.card — no .card border-radius extracted"))}`);
  lines.push(`  input: ${r.input ? yamlString(r.input) : (inputRadius ? `${yamlString(inputRadius)}  # from input rules` : MISSING_VALUE("rounded.input — no input border-radius extracted"))}`);
  return lines.join("\n");
}

/**
 * resolveVarReference — if value is a CSS var() reference, follow the chain in
 * cssVars to find a concrete value. Handles var(--name, fallback).
 *
 * Returns: { resolved: <hex|px|rem|null>, source: "extracted"|"resolved-from <chain>"|null }
 */
function resolveVarReference(value, cssVars) {
  if (!value || typeof value !== "string") return { resolved: null, source: null };
  const trimmed = value.trim();
  // Not a var() — return as-is
  const m = trimmed.match(/^var\(\s*(--[a-zA-Z][\w-]*)\s*(?:,\s*([^)]+))?\s*\)$/);
  if (!m) return { resolved: trimmed, source: "extracted" };
  if (!Array.isArray(cssVars)) {
    return { resolved: null, source: null };
  }
  const seen = new Set();
  let current = m[1];
  let chain = [current];
  while (current && !seen.has(current) && chain.length < 10) {
    seen.add(current);
    const decl = cssVars.find((v) => v.name === current && v.selector === ":root") ||
                 cssVars.find((v) => v.name === current);
    if (!decl) {
      const fallback = m[2];
      if (fallback) return { resolved: fallback.trim(), source: `resolved via fallback (${chain.join(" → ")} unresolved)` };
      return { resolved: null, source: null };
    }
    const v = decl.value.trim();
    const inner = v.match(/^var\(\s*(--[a-zA-Z][\w-]*)/);
    if (inner) {
      current = inner[1];
      chain.push(current);
      continue;
    }
    return { resolved: v, source: chain.length > 1 ? `resolved from ${chain.join(" → ")}` : "extracted" };
  }
  return { resolved: null, source: null };
}

// filterShadows lives in extractors.cjs (single source of truth) — see header import.

function buildShadowsBlock(tokens, shadows) {
  const lines = ["shadows:"];
  lines.push(`  # Brand-named shadows (paper/soft/clay/etc) appear inline below if extracted from CSS vars.`);

  const t = tokens?.shadows;
  const hasShadowTokens = t && typeof t === "object" && Object.keys(t).length > 0;
  if (hasShadowTokens) {
    for (const [k, v] of Object.entries(t)) {
      const key = /^[\d.]/.test(k) ? `"${k}"` : k;
      lines.push(`  ${key}: ${yamlString(v)}`);
    }
    return lines.join("\n");
  }

  // Filter raw shadows.json to remove noise
  const rawList = Array.isArray(shadows) ? shadows : (shadows?.list || []);
  const cleaned = filterShadows(rawList);
  if (cleaned.length === 0) {
    lines.push(`  ${GAP_COMMENT("shadows scale — no useful box-shadows extracted (noise filtered: unset/transparent/focus-rings); brand may rely on alpha borders for depth")}`);
    return lines.join("\n");
  }
  lines.push(`  # Below: top extracted box-shadow values (filtered + ranked by frequency).`);
  const tier = ["xs", "sm", "md", "lg", "xl", "2xl"];
  cleaned.slice(0, 6).forEach((entry, i) => {
    const key = i === 5 ? `"2xl"` : tier[i] || `tier-${i}`;
    lines.push(`  ${key}: ${yamlString(entry.value)}  # used ${entry.count}× in source`);
  });
  return lines.join("\n");
}

/**
 * buildShadowsInsetBlock — emit `shadows_inset:` block when the brand uses
 * inset shadows as hairline borders (handoff 2026-05-02 H). Skipped when no
 * inset shadows were detected — the section is optional.
 */
function buildShadowsInsetBlock(tokens) {
  const t = tokens?.shadows_inset;
  if (!t || typeof t !== "object" || Object.keys(t).length === 0) return null;
  const lines = ["shadows_inset:"];
  lines.push(`  # Inset shadows — hairline-style borders (Linear/Anthropic pattern).`);
  for (const [k, v] of Object.entries(t)) {
    const key = /^[\d.]/.test(k) ? `"${k}"` : k;
    lines.push(`  ${key}: ${yamlString(v)}`);
  }
  return lines.join("\n");
}

function buildMotionBlock(tokens, motion) {
  const lines = ["motion:"];
  // tokens.motion populated by LLM normaliser, or motion-detected sidecar
  const t = tokens?.motion;
  if (t && typeof t === "object" && Object.keys(t).length > 0) {
    for (const [k, v] of Object.entries(t)) {
      lines.push(`  ${k}: ${yamlString(v)}`);
    }
    return lines.join("\n");
  }
  // Use motion-detected.json: durations + easings extracted from the site
  const durations = motion?.durations || [];
  const easings = motion?.easings || [];
  if (durations.length > 0 || easings.length > 0) {
    lines.push(`  # Durations extracted from CSS transition/animation declarations:`);
    durations.slice(0, 8).forEach((d) => {
      const v = typeof d === "string" ? d : d.value;
      if (v) lines.push(`  ${GAP_COMMENT(`motion.duration-${v.replace(/[^a-z0-9]/g, "")} — assign role (ultra-fast/faster/fast/normal/gentle/slow/slower/ultra-slow): ${v}`)}`);
    });
    easings.slice(0, 6).forEach((e) => {
      const v = typeof e === "string" ? e : e.value;
      if (v) lines.push(`  ${GAP_COMMENT(`motion.ease-{name} — assign role (linear/in/out/in-out/accelerate-mid/decelerate-mid/easy-ease): ${v}`)}`);
    });
  } else {
    lines.push(`  ${GAP_COMMENT("motion — no transition/animation values extracted; brand may use static design")}`);
  }
  // Brand primitive overrides
  lines.push(`  press: ${MISSING_VALUE("motion.press — \"none\" or \"scale(0.97)\" — brand decision on press feedback")}`);
  lines.push(`  hover-opacity: ${MISSING_VALUE("motion.hover-opacity — \"1\" or \"0.9\" — brand decision on hover feedback")}`);
  return lines.join("\n");
}

function buildElevationBlock(tokens, shadows) {
  const lines = ["elevation:"];
  const t = tokens?.elevation;
  if (t && typeof t === "object" && Object.keys(t).length > 0) {
    for (const [k, v] of Object.entries(t)) {
      lines.push(`  ${k}: ${yamlString(v)}`);
    }
    return lines.join("\n");
  }
  // Try to populate from extracted shadows
  const shadowList = Array.isArray(shadows) ? shadows : (shadows?.list || []);
  const top = shadowList.slice(0, 4).map((s) => (typeof s === "string" ? s : s.value)).filter(Boolean);
  lines.push(`  flat: "none"`);
  lines.push(`  raised: ${top[0] ? yamlString(top[0]) : MISSING_VALUE("elevation.raised — card default; no shadow extracted")}`);
  lines.push(`  floating: ${top[1] ? yamlString(top[1]) : MISSING_VALUE("elevation.floating — card hover/floating panel")}`);
  lines.push(`  overlay: ${top[2] ? yamlString(top[2]) : MISSING_VALUE("elevation.overlay — popover/dropdown")}`);
  lines.push(`  modal: ${top[3] ? yamlString(top[3]) : MISSING_VALUE("elevation.modal — dialog/full overlay")}`);
  return lines.join("\n");
}

/**
 * pickTypoRole — resolve a typography role hint to the closest available role
 * in tokens.typography. Order matters: we try the hint, then sensible
 * fallbacks, so brands using h1/h2 instead of display/heading still get a hit.
 */
function pickTypoRole(typography, hints) {
  if (!typography || typeof typography !== "object") return null;
  for (const h of hints) {
    if (typography[h] && typeof typography[h] === "object") return typography[h];
  }
  return null;
}

/**
 * formatTypoRecipe — emit a single-line typography recipe in the
 * "<font> <size>/<lh> <weight>" shorthand (matches curated Anthropic).
 * Returns null when no role is available so caller can emit extraction_gap.
 */
function formatTypoRecipe(role) {
  if (!role) return null;
  const family = role.fontFamily;
  const size = role.fontSize;
  const lh = role.lineHeight;
  const weight = role.fontWeight;
  if (!family && !size) return null;
  const parts = [];
  if (family) parts.push(String(family).split(",")[0].trim().replace(/['"]/g, ""));
  if (size && lh != null) parts.push(`${size}/${lh}`);
  else if (size) parts.push(String(size));
  if (weight != null) parts.push(String(weight));
  return parts.join(" ");
}

/**
 * derivePadXY — split a CSS shorthand padding ("8px 16px") into (padX, padY).
 * Returns { padx, pady } or null when the value isn't a 2-value shorthand.
 */
function derivePadXY(padding) {
  if (!padding || typeof padding !== "string") return null;
  const m = padding.trim().match(/^(\S+)\s+(\S+)(?:\s+\S+\s+\S+)?$/);
  if (!m) return null;
  return { pady: m[1], padx: m[2] };
}

function buildComponentsBlock(ctaVariants, componentProperties, tokens, cssVars) {
  const lines = ["components:"];
  const recipe = (name, opts) => {
    lines.push(`  ${name}:`);
    for (const [k, v] of Object.entries(opts)) {
      lines.push(`    ${k}: ${v}`);
    }
  };

  // resolveVar — when the extracted value is a var(...) reference, walk
  // the cssVars chain (preferring :root then dark scope) to a concrete hex.
  // Falls back to the original value if the chain doesn't resolve.
  const vars = Array.isArray(cssVars) ? cssVars : [];
  const resolveVar = (val) => {
    if (!val || typeof val !== "string") return val;
    if (!val.includes("var(")) return val;
    // resolveVarChain only substitutes one inlineMatch per call — loop until
    // stable (concatenated patterns like "var(--a)var(--b)" need 2 passes).
    let current = val;
    for (let i = 0; i < 8; i++) {
      const next = resolveVarChain(current, vars, "light");
      if (!next || typeof next !== "string") break;
      if (next === current) break;
      current = next;
      if (!current.includes("var(")) break;
    }
    if (typeof current === "string" && !current.includes("var(")) {
      return current;
    }
    return val;
  };

  const v = (val, todoLabel) => {
    const resolved = resolveVar(val);
    return isExtractedString(resolved) ? yamlString(resolved) : MISSING_VALUE(todoLabel);
  };
  const t = (typoRecipe, todoLabel) =>
    typoRecipe ? yamlString(typoRecipe) : MISSING_VALUE(todoLabel);

  // Typography role lookup — match brand dialect (h1/h2 vs display/heading vs
  // section-heading vs body-md). Falls back gracefully so `typography:` slots
  // populate even when the brand uses a different naming convention.
  const typoButton = pickTypoRole(tokens?.typography, ["button", "label", "body-md", "body", "body-lg"]);
  const typoBody = pickTypoRole(tokens?.typography, ["body", "body-md", "body-lg", "body-large"]);
  const typoCaption = pickTypoRole(tokens?.typography, ["caption", "caption-small", "label", "micro"]);
  const typoNav = pickTypoRole(tokens?.typography, ["label", "button", "body-md", "body"]);
  const typoDisplay = pickTypoRole(tokens?.typography, ["display", "display-hero", "display-large", "h1", "section-heading"]);

  // c() helper — resolve color slot via legacy alias chain
  const c = (slot) => {
    const r = resolveColorWithAlias(tokens, slot);
    return r ? r.value : null;
  };
  // Button defaults — sensible brand-derived fallbacks when extraction misses
  const surfaceBg = c("background") || c("surface");
  const ink = c("foreground");
  const borderColor = c("border");
  const buttonRadius = ctaVariants?.primary?.radius
    || tokens?.rounded?.button
    || tokens?.rounded?.md;
  const buttonPadding = ctaVariants?.primary?.padding;

  // Button-primary — only fields we actually extracted are filled
  const primary = ctaVariants?.primary || {};
  const primaryHoverProps = componentProperties?.summary?.button?.states?.hover || {};
  const buttonProps = componentProperties?.summary?.button?.states?.default || {};
  recipe("button-primary", {
    backgroundColor: v(primary.bg, `button-primary.backgroundColor — extracted from primary CTA selector: ${primary.selector || "none"}`),
    textColor: v(primary.color, "button-primary.textColor"),
    borderColor: v(primary.bg || primary.border, "button-primary.borderColor"),
    typography: t(formatTypoRecipe(typoButton), "button-primary.typography — \"<font> <size>/<lh> <weight>\""),
    rounded: v(primary.radius, "button-primary.rounded — no border-radius extracted"),
    padding: v(primary.padding, "button-primary.padding — no padding extracted"),
    height: v(primary.height || buttonProps["height"]?.most_common, "button-primary.height — no height extracted"),
    shadow: v(buttonProps["box-shadow"]?.most_common, "button-primary.shadow — declare inset-highlight or layered shadow if brand signature"),
  });
  recipe("button-primary-hover", {
    backgroundColor: v(
      primaryHoverProps["background-color"]?.most_common,
      "button-primary-hover.backgroundColor — typically a darker shade of primary"
    ),
    textColor: v(primaryHoverProps["color"]?.most_common || primary.color, "button-primary-hover.textColor"),
    borderColor: v(primaryHoverProps["border-color"]?.most_common || primary.bg, "button-primary-hover.borderColor"),
    shadow: v(primaryHoverProps["box-shadow"]?.most_common, "button-primary-hover.shadow"),
  });

  // Button-secondary — most brands render transparent on surface with a
  // foreground border. Use cta-variants if it carried a real recipe, else
  // synthesize from surface+ink+border tokens.
  const secondary = ctaVariants?.secondary || {};
  recipe("button-secondary", {
    backgroundColor: v(secondary.bg || surfaceBg || "transparent", "button-secondary.backgroundColor"),
    textColor: v(secondary.color || ink, "button-secondary.textColor"),
    borderColor: v(secondary.border || ink || borderColor, "button-secondary.borderColor"),
    typography: t(formatTypoRecipe(typoButton), "button-secondary.typography"),
    rounded: v(secondary.radius || buttonRadius, "button-secondary.rounded"),
    padding: v(secondary.padding || buttonPadding, "button-secondary.padding"),
    height: v(secondary.height || primary.height || buttonProps["height"]?.most_common, "button-secondary.height"),
  });
  recipe("button-secondary-hover", {
    backgroundColor: v(
      primaryHoverProps["background-color"]?.most_common,
      "button-secondary-hover.backgroundColor"
    ),
    textColor: v(primaryHoverProps["color"]?.most_common || ink, "button-secondary-hover.textColor"),
    borderColor: v(primaryHoverProps["border-color"]?.most_common || ink, "button-secondary-hover.borderColor"),
  });

  // Button-ghost — text-only on surface. Synthesize when extraction misses.
  const ghost = ctaVariants?.ghost || {};
  recipe("button-ghost", {
    backgroundColor: v(ghost.bg || "transparent", "button-ghost.backgroundColor"),
    textColor: v(ghost.color || ink, "button-ghost.textColor"),
    borderColor: v(ghost.border || "transparent", "button-ghost.borderColor"),
    typography: t(formatTypoRecipe(typoButton), "button-ghost.typography"),
    rounded: v(ghost.radius || buttonRadius, "button-ghost.rounded"),
    padding: v(ghost.padding || buttonPadding, "button-ghost.padding"),
  });

  const cardProps = componentProperties?.summary?.card?.states?.default || {};
  const cardBg = c("card") || c("white") || surfaceBg;
  const cardRadius = cardProps["border-radius"]?.most_common || tokens?.rounded?.lg || tokens?.rounded?.md;
  const cardPad = cardProps["padding"]?.most_common
    || tokens?.spacing?.["6"]
    || tokens?.spacing?.lg;
  recipe("card", {
    backgroundColor: v(cardProps["background-color"]?.most_common || cardBg, "card.backgroundColor"),
    textColor: v(cardProps["color"]?.most_common || ink, "card.textColor"),
    borderColor: v(cardProps["border-color"]?.most_common || borderColor, "card.borderColor"),
    rounded: v(cardRadius, "card.rounded"),
    padding: v(cardPad, "card.padding"),
    shadow: v(cardProps["box-shadow"]?.most_common || tokens?.elevation?.raised, "card.shadow"),
  });
  const cardHover = componentProperties?.summary?.card?.states?.hover || {};
  recipe("card-hover", {
    backgroundColor: v(cardHover["background-color"]?.most_common || cardBg, "card-hover.backgroundColor"),
    textColor: v(cardHover["color"]?.most_common || ink, "card-hover.textColor"),
    rounded: v(cardHover["border-radius"]?.most_common || cardRadius, "card-hover.rounded"),
    shadow: v(cardHover["box-shadow"]?.most_common || tokens?.elevation?.floating || tokens?.elevation?.raised, "card-hover.shadow"),
  });

  const inputProps = componentProperties?.summary?.input?.states?.default || {};
  const inputFocus = componentProperties?.summary?.input?.states?.focus || {};
  const inputBg = c("input") || cardBg || surfaceBg;
  const inputRadius = inputProps["border-radius"]?.most_common || tokens?.rounded?.input || tokens?.rounded?.md;
  recipe("input-text", {
    backgroundColor: v(inputProps["background-color"]?.most_common || inputBg, "input-text.backgroundColor"),
    textColor: v(inputProps["color"]?.most_common || ink, "input-text.textColor"),
    borderColor: v(inputProps["border-color"]?.most_common || borderColor, "input-text.borderColor"),
    typography: t(formatTypoRecipe(typoBody), "input-text.typography"),
    rounded: v(inputRadius, "input-text.rounded"),
    padding: v(inputProps["padding"]?.most_common || tokens?.spacing?.["3"] || tokens?.spacing?.md, "input-text.padding"),
    focusBorderColor: v(inputFocus["border-color"]?.most_common || c("ring") || c("primary"), "input-text.focusBorderColor"),
    focusRing: v(
      inputFocus["box-shadow"]?.most_common || inputFocus["outline"]?.most_common,
      "input-text.focusRing"
    ),
  });

  const badgeProps = componentProperties?.summary?.badge?.states?.default || {};
  recipe("badge-default", {
    backgroundColor: v(badgeProps["background-color"]?.most_common || c("muted") || c("secondary"), "badge-default.backgroundColor"),
    textColor: v(badgeProps["color"]?.most_common || c("muted-foreground") || ink, "badge-default.textColor"),
    borderColor: v(badgeProps["border-color"]?.most_common || borderColor, "badge-default.borderColor"),
    typography: t(formatTypoRecipe(typoCaption), "badge-default.typography"),
    rounded: v(badgeProps["border-radius"]?.most_common || tokens?.rounded?.full, "badge-default.rounded"),
    padding: v(badgeProps["padding"]?.most_common, "badge-default.padding"),
  });

  const navProps = componentProperties?.summary?.nav?.states?.default || {};
  recipe("nav-header", {
    backgroundColor: v(navProps["background-color"]?.most_common || surfaceBg, "nav-header.backgroundColor"),
    textColor: v(navProps["color"]?.most_common || ink, "nav-header.textColor"),
    borderColor: v(navProps["border-color"]?.most_common || borderColor, "nav-header.borderColor"),
    typography: t(formatTypoRecipe(typoNav), "nav-header.typography"),
    height: v(navProps["height"]?.most_common, "nav-header.height"),
  });

  // Inverse section + editorial hero — derived from extracted brand colors when
  // available. surface-inverse + foreground are canonical signals.
  const inverseBg = pickHex(tokens?.colors?.["surface-inverse"]) || pickHex(tokens?.colors?.foreground);
  const inverseFg = pickHex(tokens?.colors?.["surface-inverse-foreground"]) || pickHex(tokens?.colors?.background);
  // Inverse section — derived from extracted surface-inverse + foreground.
  // rounded/padding only emitted from extracted spacing tokens.
  const sectionPad = tokens?.spacing?.["12"] || tokens?.spacing?.xl;
  recipe("inverse-section", {
    backgroundColor: v(inverseBg || c("foreground"), "inverse-section.backgroundColor — typically the foreground/ink color"),
    textColor: v(inverseFg || c("background"), "inverse-section.textColor"),
    rounded: MISSING_VALUE("inverse-section.rounded — typically 0"),
    padding: v(sectionPad, "inverse-section.padding"),
  });
  const heroBg = pickHex(tokens?.colors?.background) || pickHex(tokens?.colors?.surface) || surfaceBg;
  const heroFg = pickHex(tokens?.colors?.foreground) || ink;
  recipe("editorial-hero", {
    backgroundColor: v(heroBg, "editorial-hero.backgroundColor — typically the surface/canvas"),
    textColor: v(heroFg, "editorial-hero.textColor"),
    typography: t(formatTypoRecipe(typoDisplay), "editorial-hero.typography — \"<display-font> <size>/<lh> <weight>\""),
    rounded: MISSING_VALUE("editorial-hero.rounded"),
    padding: v(sectionPad, "editorial-hero.padding"),
  });
  return lines.join("\n");
}

function buildPreviewTokensBlock(tokens, ctaVariants, componentProperties) {
  const lines = ["preview_tokens:"];
  // c() resolves a slot name through the legacy alias chain so brand tokens
  // emitted in the legacy dialect (text/surface/error) are surfaced under
  // their shadcn slot names.
  const c = (slot) => {
    const r = resolveColorWithAlias(tokens, slot);
    return r ? r.value : null;
  };
  const get = (val, todoLabel) => (val ? yamlString(val) : MISSING_VALUE(todoLabel));
  lines.push(`  button_primary_bg: ${get(ctaVariants?.primary?.bg || c("primary"), "preview_tokens.button_primary_bg")}`);
  lines.push(`  button_primary_text: ${get(ctaVariants?.primary?.color || c("primary-foreground"), "preview_tokens.button_primary_text")}`);
  lines.push(`  button_primary_border: ${get(ctaVariants?.primary?.bg || c("primary"), "preview_tokens.button_primary_border")}`);
  // Secondary CTAs typically render transparent on surface — use surface bg
  // as the "rendered" background when ctaVariants doesn't carry a real fill.
  lines.push(`  button_secondary_bg: ${get(ctaVariants?.secondary?.bg || c("background") || "transparent", "preview_tokens.button_secondary_bg — typically transparent or surface")}`);
  lines.push(`  button_secondary_text: ${get(ctaVariants?.secondary?.color || c("foreground"), "preview_tokens.button_secondary_text")}`);
  lines.push(`  button_secondary_border: ${get(ctaVariants?.secondary?.border || c("foreground"), "preview_tokens.button_secondary_border")}`);
  lines.push(`  button_tertiary_text: ${get(c("foreground"), "preview_tokens.button_tertiary_text")}`);
  lines.push(`  surface_bg: ${get(c("background") || c("surface"), "preview_tokens.surface_bg")}`);
  // Card defaults to white when card slot missing (most brands).
  lines.push(`  card_bg: ${get(c("card") || pickHex(tokens?.colors?.white) || "#ffffff", "preview_tokens.card_bg")}`);
  lines.push(`  text: ${get(c("foreground"), "preview_tokens.text")}`);
  lines.push(`  text_muted: ${get(c("muted-foreground"), "preview_tokens.text_muted")}`);
  lines.push(`  border: ${get(c("border"), "preview_tokens.border")}`);
  lines.push(`  accent: ${get(c("accent") || c("primary"), "preview_tokens.accent")}`);
  lines.push(`  button_radius: ${get(ctaVariants?.primary?.radius, "preview_tokens.button_radius — no extracted button radius")}`);
  // Card and input radius — pulled from componentProperties when available.
  const cardRadius = componentProperties?.summary?.card?.states?.default?.["border-radius"]?.most_common;
  const inputRadius = componentProperties?.summary?.input?.states?.default?.["border-radius"]?.most_common;
  lines.push(`  card_radius: ${get(cardRadius, "preview_tokens.card_radius — extract from card rules")}`);
  lines.push(`  input_radius: ${get(inputRadius, "preview_tokens.input_radius — extract from input rules")}`);
  return lines.join("\n");
}

function buildBrandPrimitivesBlock(ctaVariants, componentProperties, tokens) {
  const lines = ["brand_primitives:"];
  const cp = componentProperties?.summary || {};
  const c = (slot) => {
    const r = resolveColorWithAlias(tokens, slot);
    return r ? r.value : null;
  };

  // Helper to emit a key with extracted value or extraction_gap fallback
  const v = (val, todoLabel) => (val !== undefined && val !== null && val !== ""
    ? yamlString(String(val)) : MISSING_VALUE(todoLabel));

  // ── Typographic case — derive from typography.{role}.textTransform when present
  // Convention: "uppercase" if typography role declares textTransform=uppercase, else "none".
  function caseFor(role) {
    const t = tokens?.typography?.[role];
    if (t?.textTransform) return t.textTransform === "uppercase" ? "uppercase" : "none";
    return null;
  }
  lines.push("  # Typographic case — sentence vs uppercase per role");
  const eyeCase = caseFor("eyebrow") || caseFor("caption") || "none";
  const btnCase = caseFor("button") || caseFor("label") || "none";
  const marqueeCase = caseFor("marquee") || "none";
  const navBrandCase = caseFor("nav") || "none";
  const sectionCase = caseFor("section-heading") || caseFor("heading") || caseFor("h2") || "none";
  lines.push(`  case-eyebrow: ${yamlString(eyeCase)}`);
  lines.push(`  case-btn: ${yamlString(btnCase)}`);
  lines.push(`  case-marquee: ${yamlString(marqueeCase)}`);
  lines.push(`  case-nav-brand: ${yamlString(navBrandCase)}`);
  lines.push(`  case-section-heading: ${yamlString(sectionCase)}`);

  // ── Motion brand primitives — defaults that brands rarely customise; emit
  // safe values so downstream consumers don't hit unresolved gaps.
  lines.push("  # Motion brand primitives");
  lines.push(`  motion-press: ${yamlString("scale(0.98)")}`);   // typical brand press
  lines.push(`  motion-hover-opacity: ${yamlString("0.9")}`);    // typical hover

  // ── Button geometry — extracted from cta-variants + button componentProperties
  lines.push("  # Button geometry — only fields we extracted are filled");
  const primary = ctaVariants?.primary || {};
  const buttonProps = cp.button?.states?.default || {};
  const buttonHover = cp.button?.states?.hover || {};
  let btnPadx = null, btnPady = null;
  if (typeof primary.padding === "string") {
    const m = primary.padding.trim().match(/^(\S+)\s+(\S+)/);
    if (m) { btnPady = m[1]; btnPadx = m[2]; }
  }
  // Fallback: button componentProperties
  if (!btnPadx || !btnPady) {
    const bp = buttonProps["padding"]?.most_common;
    if (typeof bp === "string") {
      const m = bp.trim().match(/^(\S+)\s+(\S+)/);
      if (m) { btnPady = btnPady || m[1]; btnPadx = btnPadx || m[2]; }
    }
  }
  // Geometry — emitted only from extracted signals (primary CTA, button
  // componentProperties, tokens.spacing scale). No fixed defaults.
  btnPadx = btnPadx || tokens?.spacing?.["4"] || tokens?.spacing?.md;
  btnPady = btnPady || tokens?.spacing?.["2"] || tokens?.spacing?.sm;
  const btnHeight = primary.height || buttonProps["height"]?.most_common;
  const btnBorderWidth = buttonProps["border-width"]?.most_common
    || (typeof primary.border === "string" && primary.border.match(/^([\d.]+\w+)/)?.[1]);
  const btnShadow = buttonProps["box-shadow"]?.most_common || tokens?.shadows?.xs;
  const btnShadowHover = buttonHover["box-shadow"]?.most_common
    || tokens?.shadows?.sm
    || tokens?.elevation?.raised;
  // btn-active-bg — only emitted from extracted hover state. No derivation.
  const btnActiveBg = buttonHover["background-color"]?.most_common;
  lines.push(`  btn-height: ${v(btnHeight, "brand_primitives.btn-height — extracted button height unavailable")}`);
  lines.push(`  btn-padx: ${v(btnPadx, "brand_primitives.btn-padx")}`);
  lines.push(`  btn-pady: ${v(btnPady, "brand_primitives.btn-pady")}`);
  lines.push(`  btn-shadow: ${v(btnShadow, "brand_primitives.btn-shadow — declare inset-highlight if brand signature")}`);
  lines.push(`  btn-shadow-hover: ${v(btnShadowHover, "brand_primitives.btn-shadow-hover")}`);
  lines.push(`  btn-active-bg: ${v(btnActiveBg, "brand_primitives.btn-active-bg — pressed state bg color")}`);
  lines.push(`  btn-border-width: ${v(btnBorderWidth, "brand_primitives.btn-border-width")}`);
  lines.push(`  btn-secondary-border-width: ${v(btnBorderWidth, "brand_primitives.btn-secondary-border-width")}`);
  const navProps = cp.nav?.states?.default || {};
  const navCtaHeight = navProps["height"]?.most_common;
  lines.push(`  nav-cta-height: ${v(navCtaHeight, "brand_primitives.nav-cta-height")}`);
  lines.push(`  nav-cta-padx: ${v(btnPadx, "brand_primitives.nav-cta-padx")}`);

  // ── Card geometry
  lines.push("  # Card geometry");
  const cardProps = cp.card?.states?.default || {};
  const cardHover = cp.card?.states?.hover || {};
  const cardPad = cardProps["padding"]?.most_common;
  const cardShadow = cardProps["box-shadow"]?.most_common;
  const cardShadowHover = cardHover["box-shadow"]?.most_common;
  lines.push(`  card-pad: ${v(cardPad, "brand_primitives.card-pad")}`);
  lines.push(`  card-pad-sm: ${v(cardPad, "brand_primitives.card-pad-sm")}`);
  lines.push(`  card-shadow: ${v(cardShadow, "brand_primitives.card-shadow")}`);
  lines.push(`  card-shadow-hover: ${v(cardShadowHover, "brand_primitives.card-shadow-hover")}`);

  // ── Hairline — borders are almost universally 1px solid + a low-alpha ink color
  lines.push("  # Hairline");
  const hairlineColor = c("border");
  lines.push(`  hairline-width: ${yamlString("1px")}`);
  lines.push(`  hairline-style: ${yamlString("solid")}`);
  lines.push(`  hairline-color: ${v(hairlineColor, "brand_primitives.hairline-color — alpha or solid")}`);
  lines.push(`  hairline-card: ${v(cardProps["border-color"]?.most_common || hairlineColor, "brand_primitives.hairline-card")}`);
  const inputProps = cp.input?.states?.default || {};
  lines.push(`  hairline-input: ${v(inputProps["border-color"]?.most_common || hairlineColor, "brand_primitives.hairline-input")}`);
  lines.push(`  hairline-table: ${v(hairlineColor, "brand_primitives.hairline-table")}`);

  // ── Layout — only emitted from extracted signals (nav componentProperties,
  // tokens.spacing scale, tokens.breakpoints). No fixed defaults.
  lines.push("  # Layout");
  const navHeight = navProps["height"]?.most_common;
  const containerMax = tokens?.container_max
    || tokens?.spacing?.["container-max"]
    || (tokens?.breakpoints && tokens.breakpoints["xl"])
    || null;
  const baseSpacing = tokens?.spacing?.["1"] || tokens?.spacing?.xs;
  const sectionPady = tokens?.spacing?.["12"] || tokens?.spacing?.["10"] || tokens?.spacing?.xl;
  const sectionPadx = tokens?.spacing?.["6"] || tokens?.spacing?.["5"] || tokens?.spacing?.lg;
  lines.push(`  nav-height: ${v(navHeight, "brand_primitives.nav-height")}`);
  lines.push(`  nav-padx: ${v(tokens?.spacing?.["6"] || tokens?.spacing?.lg, "brand_primitives.nav-padx")}`);
  lines.push(`  section-padx: ${v(sectionPadx, "brand_primitives.section-padx")}`);
  lines.push(`  section-pady: ${v(sectionPady, "brand_primitives.section-pady")}`);
  lines.push(`  surface-pad: ${v(cardPad || sectionPadx, "brand_primitives.surface-pad")}`);
  lines.push(`  surface-min-h: ${v(null, "brand_primitives.surface-min-h")}`);
  lines.push(`  container-max: ${v(containerMax, "brand_primitives.container-max — typically 1200-1400px")}`);
  lines.push(`  spacing: ${v(baseSpacing, "brand_primitives.spacing — Tailwind base, typically 0.25rem")}`);
  return lines.join("\n");
}

function buildAliasesBlock(tokens) {
  // Layer 4 deprecated aliases per ADR-022 v2 are CONTRACT — emitted always.
  // The mappings themselves are fixed (block-1 → surface-bright is invariant).
  // Brand-specific values (font weights, tracking, leading) come from typography
  // when present; otherwise extraction_gap.
  const lines = ["aliases:"];

  // Block aliases (M3 surface ladder mappings — fixed per ADR-022)
  lines.push(`  # Layer 4 — block aliases mapped to M3 surface ladder (per ADR-022 v2)`);
  for (const [k, v] of [
    ["--block-1", "--surface-bright"],
    ["--block-2", "--surface-container-low"],
    ["--block-3", "--surface-container"],
    ["--block-4", "--surface-container-high"],
    ["--block-5", "--surface-container-highest"],
    ["--block-6", "--surface-dim"],
    ["--block-7", "--surface-inverse"],
    ["--block-7-foreground", "--surface-inverse-foreground"],
  ]) {
    lines.push(`  "${k}": "${v}"`);
  }

  // Type-role aliases
  lines.push(`  # Type-role aliases (h1/h2/h3 → semantic role tokens)`);
  for (const [k, v] of [
    ["--text-h1", "--text-heading"],
    ["--text-h2", "--text-title"],
    ["--text-h3", "--text-subtitle"],
    ["--text-card-title", "--text-title"],
    ["--text-lead", "--text-body"],
    ["--text-nav", "--text-label"],
    ["--text-btn", "--text-label"],
    ["--text-btn-sm", "--text-caption"],
    ["--text-eyebrow", "--text-caption"],
    ["--text-meta", "--text-caption"],
  ]) {
    lines.push(`  "${k}": "${v}"`);
  }

  // Shadow aliases (numbered → semantic)
  lines.push(`  # Shadow aliases (legacy numeric → semantic elevation)`);
  for (const [k, v] of [
    ["--shadow-1", "--elevation-flat"],
    ["--shadow-2", "--elevation-raised"],
    ["--shadow-3", "--elevation-floating"],
    ["--shadow-4", "--elevation-overlay"],
    ["--duration-base", "--duration-normal"],
    ["--radius-pill", "--radius-full"],
  ]) {
    lines.push(`  "${k}": "${v}"`);
  }

  // Role-coupled aliases — derived from typography when possible, extraction_gap otherwise.
  // Mapping: --{prop}-{role} ← typography.{role}.{prop}
  //   --font-weight-display  ← typography.display.fontWeight
  //   --tracking-h1          ← typography.heading.letterSpacing  (h1 is alias for heading)
  //   --leading-body         ← typography.body.lineHeight
  lines.push(`  # Role-coupled aliases — values derived from typography when present`);

  const t = tokens?.typography || {};

  // Map alias key → ORDERED typography role fallback chain. Brands use
  // different dialects (h1/h2/h3 vs display/heading/title vs section-heading),
  // so each alias accepts multiple role names and picks the first hit.
  const ROLE_CHAIN = {
    display:  ["display", "display-hero", "display-large", "h1", "section-heading"],
    heading:  ["heading", "h1", "h2", "section-heading", "display"],
    h1:       ["h1", "heading", "display"],
    h2:       ["h2", "title", "subtitle-large", "section-heading"],
    h3:       ["h3", "subtitle", "subheading", "subheading-large"],
    body:     ["body", "body-md", "body-lg", "body-large"],
    lead:     ["body-lg", "body-large", "lead", "body"],
    nav:      ["label", "button", "body-md", "body"],
    brand:    ["title", "h1", "section-heading", "display"],
    btn:      ["button", "label", "body-md", "body"],
    emphasis: ["title", "h2", "section-heading"],
    eyebrow:  ["caption", "caption-small", "eyebrow", "label", "micro"],
    marquee:  ["label", "button", "h3"],
    tight:    ["title", "subtitle", "h2"],
  };

  function emitRoleAlias(propName, valuePath, roleAlias) {
    const chain = ROLE_CHAIN[roleAlias] || [roleAlias];
    let role = null, value = null;
    for (const candidate of chain) {
      const r = t[candidate];
      if (r && r[valuePath] !== undefined && r[valuePath] !== null && r[valuePath] !== "") {
        role = candidate;
        value = r[valuePath];
        break;
      }
    }
    const aliasKey = `--${propName}-${roleAlias}`;
    if (value !== null) {
      lines.push(`  "${aliasKey}": ${yamlString(String(value))}  # from typography.${role}.${valuePath}`);
    } else {
      lines.push(`  "${aliasKey}": ${MISSING_VALUE(`aliases."${aliasKey}" — derive from typography.${chain.join("/")}.${valuePath} or set brand value`)}`);
    }
  }

  for (const role of ["display", "heading", "body", "lead", "nav", "brand", "btn", "emphasis", "eyebrow"]) {
    emitRoleAlias("font-weight", "fontWeight", role);
  }
  for (const role of ["display", "h1", "h2", "h3", "lead", "body", "btn", "eyebrow", "marquee"]) {
    emitRoleAlias("tracking", "letterSpacing", role);
  }
  for (const role of ["display", "heading", "body", "lead", "tight"]) {
    emitRoleAlias("leading", "lineHeight", role);
  }

  // Legacy color synonym aliases (handoff 2026-05-02 #18) — emitted when the
  // canonical Layer 1 target exists. Format: `text-{role}: foreground` so
  // legacy consumers can read `var(--text-default)` and resolve to a real value.
  // Strict-extraction: skip aliases whose target slot is missing.
  lines.push(`  # Legacy color synonyms (auto-derived when canonical target exists)`);
  const c = tokens?.colors || {};
  const colorSynonyms = [
    ["text", "foreground"],
    ["text-default", "foreground"],
    ["text-muted", "muted-foreground"],
    ["surface", "background"],
    ["surface-default", "background"],
    ["error", "destructive"],
    ["error-foreground", "destructive-foreground"],
    ["paper", "muted"],
    ["paper-deep", "muted"],
    ["ink", "foreground"],
    ["ink-soft", "foreground"],
  ];
  for (const [legacy, canonical] of colorSynonyms) {
    const target = typeof c[canonical] === "string" ? c[canonical] : c[canonical]?.value;
    if (target && /^#[0-9a-f]{3,8}$/i.test(target)) {
      lines.push(`  "${legacy}": "${canonical}"  # → ${target}`);
    }
  }

  return lines.join("\n");
}

function buildShowcaseBlock(heroBlock, metaDefaults, metaAssets) {
  const lines = ["showcase:"];
  const kicker = heroBlock?.kicker;
  const headline = heroBlock?.headlineHtml || heroBlock?.headline;
  const lead = heroBlock?.lead;
  const ctas = heroBlock?.ctas || [];
  const description = metaDefaults?.description;

  // Kicker is genuinely optional — when absent, emit `null` (no extraction gap needed).
  lines.push(`  kicker: ${kicker ? yamlString(kicker) : "null"}`);

  // Headline — try h1 extraction first; fall back to og:title for SPAs that
  // render h1 client-side (Claude, Meta, n8n, Microsoft, etc). og:title is
  // genuinely extracted text from the page's <head>, not a fabricated default.
  if (headline) {
    lines.push(`  headline: ${yamlString(headline)}`);
  } else if (metaAssets?.ogTitle) {
    // Strip noisy suffixes ("| Brand", "- Brand", "· Brand") to match the h1
    // intent. og:title typically duplicates the brand name in the suffix.
    const cleaned = metaAssets.ogTitle
      .replace(/\s+[|·\-—]\s+.+$/, "")
      .trim();
    lines.push(`  headline: ${yamlString(cleaned)}  # from meta-assets.ogTitle (extracted)`);
  } else {
    lines.push(`  headline: ${MISSING_VALUE("showcase.headline — display headline (preserve <u> for emphasis)")}`);
  }

  // Lead — heroBlock.lead → metaDefaults.description → metaAssets.ogDescription
  if (lead) {
    lines.push(`  lead: ${yamlString(lead)}`);
  } else if (description) {
    lines.push(`  lead: ${yamlString(description)}  # from meta-assets.description (extracted)`);
  } else if (metaAssets?.ogDescription) {
    lines.push(`  lead: ${yamlString(metaAssets.ogDescription)}  # from meta-assets.ogDescription (extracted)`);
  } else {
    lines.push(`  lead: ${MISSING_VALUE("showcase.lead — 1-3 sentence positioning paragraph")}`);
  }

  // CTAs — emitted only when extracted from hero region. No generic verbs.
  // tertiary_cta is genuinely optional — emit null when absent rather than
  // extraction_gap, matching the Anthropic gold-standard dialect.
  for (let i = 0; i < 3; i++) {
    const slot = ["primary_cta", "secondary_cta", "tertiary_cta"][i];
    if (ctas[i]?.label) {
      lines.push(`  ${slot}: ${yamlString(ctas[i].label)}`);
    } else if (slot === "tertiary_cta") {
      lines.push(`  ${slot}: null`);
    } else {
      lines.push(`  ${slot}: ${MISSING_VALUE(`showcase.${slot}`)}`);
    }
  }
  return lines.join("\n");
}

function buildConsumerContractBlock(name, tokens, themeDefault, darkMode) {
  // priority_order, asset_rule, accessibility_rule are ADR-022 pipeline policy
  // (not brand-specific) — fixed. mode_rule and font_rule are brand-specific
  // but DERIVABLE from extracted signals (#21).
  const lines = ["consumer_contract:"];
  lines.push(`  standalone: true`);
  if (isExtractedString(name)) {
    lines.push(`  goal: ${yamlString(`Generate ${name}-style interfaces from this file alone.`)}`);
  } else {
    lines.push(`  goal: ${MISSING_VALUE("consumer_contract.goal — \"Generate {Brand}-style interfaces from this file alone.\"")}`);
  }
  // priority_order is fixed by ADR-022 v2 pipeline policy
  lines.push(`  priority_order:`);
  lines.push(`    - "Use semantic tokens first: colors, dark, typography, spacing, rounded, shadows, motion."`);
  lines.push(`    - "Apply component recipes exactly before inventing variants."`);
  lines.push(`    - "Use prose sections for judgment when a token is ambiguous."`);
  lines.push(`    - "Respect Do's and Don'ts over generic framework defaults."`);

  // mode_rule — derive from theme-default + dark-mode signals
  const td = themeDefault?.default;
  const supportsDark = !!darkMode?.has_dark_mode;
  const primary = typeof tokens?.colors?.primary === "string"
    ? tokens.colors.primary
    : tokens?.colors?.primary?.value;
  let modeRule;
  if (td === "light" && supportsDark) {
    modeRule = `Light mode is the default surface; dark mode is opt-in via .dark or [data-theme=dark]. Primary CTAs (${primary || "primary slot"}) hold across modes unless dark slot overrides them.`;
  } else if (td === "dark" && supportsDark) {
    modeRule = `Dark mode is the default surface; light mode is opt-in via .light or [data-theme=light]. Primary CTAs (${primary || "primary slot"}) hold across modes.`;
  } else if (td === "light") {
    modeRule = `Light-only system. Use the primary slot for CTAs (${primary || "primary slot"}); inverse sections may flip to surface-inverse + foreground for editorial contrast.`;
  } else if (td === "dark") {
    modeRule = `Dark-only system. Use the primary slot for CTAs (${primary || "primary slot"}); muted-foreground and border carry visual hierarchy.`;
  }
  if (modeRule) {
    lines.push(`  mode_rule: ${yamlString(modeRule)}`);
  } else {
    lines.push(`  mode_rule: ${MISSING_VALUE("consumer_contract.mode_rule — when light vs dark CTAs apply")}`);
  }

  // font_rule — derive from extracted fonts; fall back to typography role
  // fontFamily when tokens.fonts is empty (e.g. LLM-extracted dialect that
  // bakes families into typography roles instead of separate fonts slot).
  const fonts = tokens?.fonts || {};
  const fontNames = new Set();
  for (const slot of ["sans", "serif", "mono", "display"]) {
    if (typeof fonts[slot] === "string") {
      const first = fonts[slot].split(",")[0].trim().replace(/['"]/g, "");
      if (first) fontNames.add(first);
    }
  }
  // Typography fallback — scan all role.fontFamily entries and dedupe families.
  for (const role of Object.values(tokens?.typography || {})) {
    if (typeof role?.fontFamily === "string") {
      const first = role.fontFamily.split(",")[0].trim().replace(/['"]/g, "");
      if (first) fontNames.add(first);
    }
  }
  const fontList = [...fontNames].slice(0, 3);
  if (fontList.length > 0) {
    lines.push(`  font_rule: ${yamlString(`Use ${fontList.join(" / ")} when available; otherwise apply the declared CSS fallbacks without blocking implementation.`)}`);
  } else {
    lines.push(`  font_rule: ${MISSING_VALUE("consumer_contract.font_rule — brand font usage policy")}`);
  }

  // asset_rule and accessibility_rule are pipeline policy (ADR-022 v2) — fixed.
  lines.push(`  asset_rule: "Do not require logos, photography, or proprietary assets. Use typography, color, spacing, and component behavior to express the system."`);
  lines.push(`  accessibility_rule: "Ship WCAG AA contrast, visible focus rings, keyboard-operable controls, and no body text below 16px."`);
  return lines.join("\n");
}

/**
 * buildAssetsBlock — emit `assets:` block populated from logo.json + favicon.json
 * + meta-assets.json. Optional: omitted entirely when nothing was extracted.
 *
 * Schema fields:
 *   logo.kind         — svg-inline | image | none
 *   logo.url          — sourceUrl when external, null for svg-inline
 *   logo.mime         — image/svg+xml | image/png | etc.
 *   favicon.url       — apple-touch-icon or favicon URL
 *   og_image          — Open Graph share image
 *   apple_touch_icon  — Apple home screen icon
 *   theme_color       — meta name="theme-color" (PWA bar color)
 *   manifest_url      — PWA manifest URL
 *   twitter_image     — Twitter card image
 *   canonical_url     — canonical URL of the site
 */
function buildAssetsBlock(logo, favicon, metaAssets) {
  const has = (v) => v !== undefined && v !== null && v !== "";
  if (!has(logo) && !has(favicon) && !has(metaAssets)) return null;
  const lines = ["assets:"];
  // Logo
  if (logo) {
    lines.push("  logo:");
    if (logo.kind) lines.push(`    kind: ${yamlString(logo.kind)}`);
    if (logo.mime) lines.push(`    mime: ${yamlString(logo.mime)}`);
    if (logo.sourceUrl) lines.push(`    url: ${yamlString(logo.sourceUrl)}`);
    if (logo.size) lines.push(`    size_bytes: ${logo.size}`);
    if (logo.source) lines.push(`    detected_via: ${yamlString(logo.source)}`);
  } else {
    lines.push("  logo:");
    lines.push(`    ${GAP_COMMENT("assets.logo — brand logo URL or svg-inline marker")}`);
  }
  // Favicon
  if (favicon && favicon.sourceUrl) {
    lines.push("  favicon:");
    lines.push(`    url: ${yamlString(favicon.sourceUrl)}`);
    if (favicon.mime) lines.push(`    mime: ${yamlString(favicon.mime)}`);
    if (favicon.size) lines.push(`    size_bytes: ${favicon.size}`);
  }
  // Meta assets
  if (metaAssets) {
    if (metaAssets.ogImageUrl) lines.push(`  og_image: ${yamlString(metaAssets.ogImageUrl)}`);
    if (metaAssets.appleTouchIconUrl) lines.push(`  apple_touch_icon: ${yamlString(metaAssets.appleTouchIconUrl)}`);
    if (metaAssets.themeColor) lines.push(`  theme_color: ${yamlString(metaAssets.themeColor)}`);
    if (metaAssets.manifestUrl) lines.push(`  manifest_url: ${yamlString(metaAssets.manifestUrl)}`);
    if (metaAssets.twitterImage) lines.push(`  twitter_image: ${yamlString(metaAssets.twitterImage)}`);
    if (metaAssets.twitterCard) lines.push(`  twitter_card: ${yamlString(metaAssets.twitterCard)}`);
    if (metaAssets.twitterCreator) lines.push(`  twitter_creator: ${yamlString(metaAssets.twitterCreator)}`);
    if (metaAssets.canonicalUrl) lines.push(`  canonical_url: ${yamlString(metaAssets.canonicalUrl)}`);
  }
  return lines.join("\n");
}

function buildHeader(metaDefaults, themeDefault, darkMode) {
  const name = metaDefaults?.name;
  const archetype = metaDefaults?.archetype;
  const description = metaDefaults?.description;
  const chips = Array.isArray(metaDefaults?.chips) ? metaDefaults.chips : null;
  const lines = [];
  lines.push(`version: "2.2"`);
  lines.push(`name: ${isExtractedString(name) ? yamlString(name) : MISSING_VALUE("name — brand name")}`);
  lines.push(`description: ${isExtractedString(description) ? yamlString(description) : MISSING_VALUE("description — 1 sentence summarising the visual system")}`);

  // defaultMode: extract from theme-default.json if confidence high or medium
  const td = themeDefault?.default;
  const tdConf = themeDefault?.confidence;
  if (td === "light" || td === "dark") {
    if (tdConf === "high" || tdConf === "medium") {
      lines.push(`defaultMode: ${yamlString(td)}`);
    } else {
      lines.push(`defaultMode: ${yamlString(td)}  # extraction_confidence=low; source=theme-default`);
    }
  } else {
    lines.push(`defaultMode: ${MISSING_VALUE("defaultMode — \"light\" or \"dark\" (theme-default.json missing)")}`);
  }

  // supportsDark: extract from dark-mode.json
  if (darkMode && typeof darkMode.has_dark_mode === "boolean") {
    lines.push(`supportsDark: ${yamlBool(darkMode.has_dark_mode)}`);
  } else {
    lines.push(`supportsDark: ${MISSING_VALUE("supportsDark — true if dark-mode design exists")}`);
  }

  lines.push(`archetype: ${isExtractedString(archetype) ? yamlString(archetype) : MISSING_VALUE("archetype — e.g. \"Warm Editorial · Slate-on-Ivory\"")}`);
  lines.push(`chips:`);
  if (chips && chips.length > 0) {
    for (const chip of chips) {
      lines.push(`  - ${yamlString(chip)}`);
    }
    // Pad to at least 3 entries with extraction_gap so editors see the slot
    for (let i = chips.length; i < 3; i++) {
      lines.push(`  - ${MISSING_VALUE(`chips[${i}] — short identity tag (\"Serif body\", \"Slate CTA\", etc)`)}`);
    }
  } else {
    for (let i = 0; i < 4; i++) {
      lines.push(`  - ${MISSING_VALUE(`chips[${i}] — short identity tag (\"Serif body\", \"Slate CTA\", etc)`)}`);
    }
  }
  return lines.join("\n");
}

const PROSE_SECTIONS = [
  ["1. Visual Theme & Atmosphere", "Describe the overall mood — paper feel, depth signals, the fundamental brand decision (e.g. 'slate is action, clay is identity')."],
  ["2. Color Palette & Roles", "Walk through each color stack: stack name, hex range, role assignments. Call out alpha borders, special hover/active colors."],
  ["3. Typography Rules", "Family split (display vs body vs mono). Weight discipline. Tracking/leading per role. Case rules."],
  ["4. Components", "Buttons (primary/secondary/ghost), cards (default/hover), inputs (focus state), nav, badges. Note signature shadows or behavior."],
  ["5. Layout Principles", "Spacing rhythm. Container max. Reading column. Section padding. Mobile collapse."],
  ["6. Depth & Elevation", "Shadow philosophy (shallow/deep). What creates perceived depth (alpha tints vs shadows). Brand-specific shadow names."],
  ["7. Do's and Don'ts", "Concrete pairs of allowed vs forbidden moves. Reference component recipes above."],
  ["8. Responsive Behavior", "How spacing collapses. Type scale rules at small sizes. Container behavior."],
  ["9. Accessibility & Interaction", "WCAG AA gates. Focus rings. Tap targets. Reduced motion respect."],
  ["10. Agent Prompt Guide", "Quick color reference. 4-5 example component prompts. Iteration guide (8 numbered tips for an LLM consumer)."],
  ["11. Implementation", "Tailwind/shadcn mapping table. Critical CSS snippet for :root."],
];

/**
 * buildProseScaffold — seed each prose section with a paragraph derived from
 * extracted tokens + metaDefaults. The seed is a starting point, not the
 * final editorial copy — humans refine. But it eliminates 11 empty gap stubs
 * and gives consumers something to read while iterating.
 */
function buildProseScaffold(tokens, metaDefaults, ctaVariants, componentProperties) {
  const name = metaDefaults?.name || "the brand";
  const archetype = metaDefaults?.archetype;
  const description = metaDefaults?.description;
  const fonts = tokens?.fonts || {};
  const typography = tokens?.typography || {};
  const colors = tokens?.colors || {};
  const c = (slot) => {
    const r = resolveColorWithAlias(tokens, slot);
    return r ? r.value : null;
  };
  const familyOf = (val) => (typeof val === "string" ? val.split(",")[0].trim().replace(/['"]/g, "") : null);
  const sansFont = familyOf(fonts.sans);
  const serifFont = familyOf(fonts.serif);
  const monoFont = familyOf(fonts.mono);
  const primaryHex = c("primary");
  const accentHex = c("accent");
  const surfaceBg = c("background") || c("surface");
  const ink = c("foreground");
  const buttonRadius = ctaVariants?.primary?.radius || tokens?.rounded?.button || tokens?.rounded?.md;

  const seeds = {
    "1. Visual Theme & Atmosphere": archetype
      ? `${name} reads as a **${archetype}** system. ${description || ""} The visual language is anchored by ${primaryHex ? `the primary CTA color \`${primaryHex}\`` : "a defined primary slot"}${accentHex && accentHex !== primaryHex ? ` paired with the \`${accentHex}\` accent for editorial moments` : ""}. ${surfaceBg ? `Surfaces sit on \`${surfaceBg}\` with text in \`${ink || "the foreground slot"}\`.` : ""} Depth is communicated through ${tokens?.elevation && Object.keys(tokens.elevation).length > 0 ? "a layered shadow ladder" : "alpha-bordered hairlines"} rather than aggressive contrast.`
      : null,
    "2. Color Palette & Roles": (() => {
      const roles = [];
      if (primaryHex) roles.push(`Primary actions use \`${primaryHex}\``);
      if (c("secondary")) roles.push(`secondary surfaces use \`${c("secondary")}\``);
      if (accentHex && accentHex !== primaryHex) roles.push(`brand accent \`${accentHex}\` reserves for editorial highlights, not generic CTAs`);
      if (c("destructive")) roles.push(`destructive uses \`${c("destructive")}\` (never reuse the accent for errors)`);
      if (roles.length === 0) return null;
      return roles.join(". ") + ".";
    })(),
    "3. Typography Rules": (() => {
      // When tokens.fonts is missing, fall back to typography role fontFamily.
      const display = typography.display || typography.h1 || typography["display-hero"];
      const body = typography.body || typography["body-md"] || typography["body-lg"] || typography["body-large"];
      const mono = typography.mono || typography["code-body"];
      const fallbackSans = sansFont || familyOf(body?.fontFamily) || familyOf(display?.fontFamily);
      const fallbackSerif = serifFont || familyOf(body?.fontFamily);
      const fallbackMono = monoFont || familyOf(mono?.fontFamily);
      const parts = [];
      if (fallbackSans) parts.push(`The primary face (\`${fallbackSans}\`) carries UI text, labels, and headings`);
      if (fallbackSerif && fallbackSerif !== fallbackSans) parts.push(`a serif companion (\`${fallbackSerif}\`) is reserved for body reading and editorial moments`);
      if (fallbackMono && fallbackMono !== fallbackSans) parts.push(`Mono (\`${fallbackMono}\`) marks code and technical labels`);
      if (parts.length === 0) return null;
      const detail = display && body
        ? ` Display sits at ${display.fontSize || "—"}/${display.lineHeight || "—"}, body at ${body.fontSize || "—"}/${body.lineHeight || "—"}.`
        : "";
      return parts.join(". ") + "." + detail;
    })(),
    "4. Components": ctaVariants?.primary?.bg
      ? `Primary buttons fill solid (\`${ctaVariants.primary.bg}\`)${buttonRadius ? ` with \`${buttonRadius}\` radius` : ""}. ${ctaVariants.secondary?.bg ? `Secondary buttons use the surface background with a \`${ctaVariants.secondary.border || "border"}\` border` : "Secondary buttons render transparent on surface with a hairline border"}. ${ctaVariants.ghost ? "Ghost buttons hold text-only on surface for tertiary actions." : ""} Cards are flat surfaces unless elevated for hover; inputs ride on the input slot with a focus ring tied to the primary color.`
      : null,
    "5. Layout Principles": (() => {
      const containerMax = tokens?.container_max || tokens?.spacing?.["container-max"];
      const navHeight = componentProperties?.summary?.nav?.states?.default?.["height"]?.most_common;
      const sectionPad = tokens?.spacing?.["12"] || tokens?.spacing?.xl;
      const parts = [];
      if (containerMax) parts.push(`Maximum reading column is \`${containerMax}\``);
      if (navHeight) parts.push(`nav height holds at \`${navHeight}\``);
      if (sectionPad) parts.push(`section padding uses the \`${sectionPad}\` step`);
      if (parts.length === 0) return null;
      return parts.join(". ") + ". Spacing follows the extracted scale; mobile collapses by halving section padding and stacking grid columns.";
    })(),
    "6. Depth & Elevation": (() => {
      const elev = tokens?.elevation || {};
      const inset = tokens?.shadows_inset;
      const elevKeys = Object.keys(elev);
      if (elevKeys.length === 0 && !inset) return null;
      const parts = [];
      if (elevKeys.length > 0) parts.push(`The elevation ladder spans ${elevKeys.join(", ")} — flat surfaces dominate; raise only for floating UI`);
      if (inset && Object.keys(inset).length > 0) parts.push(`inset shadows (${Object.keys(inset).join(", ")}) act as hairline borders rather than depth`);
      return parts.join(". ") + ".";
    })(),
    "7. Do's and Don'ts": primaryHex
      ? `**Do** use the primary slot (\`${primaryHex}\`) for the dominant CTA on every surface. **Don't** reuse the accent (${accentHex || "brand swatch"}) for destructive states — that role belongs to \`${c("destructive") || "the destructive slot"}\`. **Do** hold the type scale tight; **don't** invent intermediate sizes outside the extracted scale.`
      : null,
    "8. Responsive Behavior": "Spacing collapses by halving section padding at the medium breakpoint. Type scale clamps display headings to ~75% of desktop size on mobile. Container width consumes the viewport with a 1.5rem inset. Cards stack vertically; horizontal grids fall to single column.",
    "9. Accessibility & Interaction": "WCAG AA contrast across all text + background pairings. Focus rings use the brand ring slot at 2-3px outline. Tap targets minimum 44x44px. `prefers-reduced-motion` disables non-essential transitions. Keyboard navigation traverses all interactive surfaces in a logical order.",
    "10. Agent Prompt Guide": (() => {
      const lines = [];
      lines.push("### Quick Color Reference\n");
      if (primaryHex) lines.push(`- Primary CTA: \`${primaryHex}\``);
      if (accentHex && accentHex !== primaryHex) lines.push(`- Brand accent: \`${accentHex}\``);
      if (surfaceBg) lines.push(`- Surface canvas: \`${surfaceBg}\``);
      if (ink) lines.push(`- Foreground / ink: \`${ink}\``);
      lines.push("\n### Example Component Prompt\n");
      lines.push(`Generate a hero with ${name}'s layout. Use \`${surfaceBg || "background"}\` as the canvas, ${sansFont || "Sans"} for headlines, and a primary CTA with \`${primaryHex || "primary"}\` background${buttonRadius ? ` and \`${buttonRadius}\` radius` : ""}.`);
      lines.push("\n### Iteration Guide\n");
      lines.push("1. Start from the extracted tokens — don't invent.");
      lines.push("2. Apply component recipes exactly before introducing variants.");
      lines.push("3. Match the brand's spacing rhythm; avoid arbitrary stops.");
      lines.push("4. Keep type weights tight — display, heading, body only.");
      return lines.join("\n");
    })(),
    "11. Implementation": "Stack: Next.js 16 + Tailwind v4 + shadcn/ui (or equivalent). Tailwind config maps each `colors.*` slot to a CSS variable mounted on `:root`. Components consume `var(--primary)` etc. directly via shadcn naming. Build pipeline: tokens.json → globals.css → component library.",
  };

  const lines = [""];
  for (const [heading, hint] of PROSE_SECTIONS) {
    lines.push(`## ${heading}`);
    lines.push("");
    const seed = seeds[heading];
    if (seed) {
      lines.push(seed);
    } else {
      lines.push(`${GAP_COMMENT("prose: " + heading)} — ${hint}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ── Main entry point ──────────────────────────────────────────────

function buildDesignMdScaffold(sidecars) {
  const {
    tokens,
    metaDefaults: rawMetaDefaults,
    heroBlock,
    ctaVariants,
    componentProperties,
    shadows,
    motion,
    fontFaces,
    darkMode,
    slug,
  } = sidecars || {};

  // Sanitize cached metaDefaults — brand-name fields may carry bot-detection /
  // error-page titles from older extracts that predate the sanitizer in
  // `extractors.cjs:generateMetaDefaults`. Apply same regex envelope here so
  // re-running scaffold against a stale cache still produces a clean header.
  const NAME_CORRUPT_RE = /your request|has been blocked|access denied|forbidden|temporarily unavailable|please verify|are you human|404 not found|page not found|service unavailable|cloudflare|bot detection|captcha/i;
  const metaDefaults = rawMetaDefaults ? { ...rawMetaDefaults } : rawMetaDefaults;
  if (metaDefaults && typeof metaDefaults.name === "string") {
    const n = metaDefaults.name;
    const corrupted =
      NAME_CORRUPT_RE.test(n) ||
      /\n/.test(n) ||
      n.length > 80 ||
      /\.{3,}|…/.test(n) ||
      /<[a-z]/i.test(n);
    if (corrupted) {
      metaDefaults.name = slug
        ? slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : n;
    }
  }

  const sections = [
    buildHeader(metaDefaults, sidecars.themeDefault, darkMode),
    "",
    buildConsumerContractBlock(metaDefaults?.name, tokens, sidecars.themeDefault, darkMode),
    "",
    buildColorsBlock(tokens),
    "",
    buildDarkBlock(tokens, darkMode),
    "",
    buildFontsBlock(tokens, fontFaces),
    "",
    buildTypographyBlock(tokens),
    "",
    buildSpacingBlock(tokens),
    "",
    buildRoundedBlock(tokens, ctaVariants, componentProperties, sidecars.cssVars),
    "",
    buildShadowsBlock(tokens, shadows),
    "",
    // Optional — only emitted when tokens.shadows_inset has entries.
    buildShadowsInsetBlock(tokens),
    "",
    buildMotionBlock(tokens, motion),
    "",
    buildElevationBlock(tokens, shadows),
    "",
    buildComponentsBlock(ctaVariants, componentProperties, tokens, sidecars.cssVars),
    "",
    buildPreviewTokensBlock(tokens, ctaVariants, componentProperties),
    "",
    buildBrandPrimitivesBlock(ctaVariants, componentProperties, tokens),
    "",
    buildAliasesBlock(tokens),
    "",
    buildShowcaseBlock(heroBlock, metaDefaults, sidecars.metaAssets),
    "",
    // Optional — only emitted when logo/favicon/meta-assets carry signal.
    buildAssetsBlock(sidecars.logo, sidecars.favicon, sidecars.metaAssets),
  ];

  // Filter null sections — buildShadowsInsetBlock returns null when the
  // brand has no inset shadows, signalling "skip the block entirely".
  const frontmatter = sections.filter((s) => s !== null && s !== undefined).join("\n");
  const prose = buildProseScaffold(tokens, metaDefaults, ctaVariants, componentProperties);

  return `---\n${frontmatter}\n---\n${prose}`;
}

module.exports = {
  buildDesignMdScaffold,
  // Exported for tests
  buildHeader,
  buildColorsBlock,
  buildAliasesBlock,
  buildShowcaseBlock,
  buildMotionBlock,
  MISSING_VALUE,
  GAP_COMMENT,
};
