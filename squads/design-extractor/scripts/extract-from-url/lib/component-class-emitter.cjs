"use strict";

// component-class-emitter.cjs
//
// Emits plain CSS component classes (.preview-cta-primary, .preview-input,
// .preview-card, .preview-badge) using extracted declarations from
// component-properties.json, component-states.json, and motion.json.
//
// Per squads/design-ops/rules/tailwind-v4.md:
//   - DO NOT use @apply for component classes that depend on custom @theme
//     tokens. Tailwind v4 Browser CDN does not reliably resolve @apply +
//     custom tokens. Plain CSS using var(--color-*) is the safe path.
//   - Emit complete border shorthand when overriding a parent shorthand
//     (medium .md-panel-do bug — full re-assert beats border-color alone).
//
// Per .claude/rules/extraction-no-fallbacks.md:
//   - ONLY emit classes whose evidence comes from extracted data
//     (component-properties.json + tokens.json + state palette).
//   - DO NOT invent default heights, paddings, or radii. Skip if missing.
//   - Comment any inferred values with `/* inferred */` so consumers can
//     decide whether to honor or override.

function pickMostCommon(propertyEntry) {
  if (!propertyEntry || typeof propertyEntry !== "object") return null;
  if (typeof propertyEntry.most_common === "string" && propertyEntry.most_common) {
    return propertyEntry.most_common;
  }
  return null;
}

function pickFirstNonTransparent(propertyEntry) {
  // Medium has many `color: transparent` reset rules. Skip those when picking
  // a representative color.
  if (!propertyEntry || !Array.isArray(propertyEntry.all_values)) return null;
  for (const entry of propertyEntry.all_values) {
    const value = entry && entry.value;
    if (typeof value === "string" && value !== "transparent" && value !== "inherit") {
      return value;
    }
  }
  return null;
}

function pickColor(propertyEntry) {
  const mc = pickMostCommon(propertyEntry);
  if (mc && mc !== "transparent" && mc !== "inherit") return mc;
  return pickFirstNonTransparent(propertyEntry);
}

const CSS_IDENTIFIER_RE = /^-?[_a-zA-Z][_a-zA-Z0-9-]*$/;
const CSS_PROPERTY_RE = /^(?:-?[_a-zA-Z][_a-zA-Z0-9-]*|--[_a-zA-Z0-9-]+)$/;

function isSafeCssValue(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (!normalized) return false;
  if (/[\0<>;{}]/.test(normalized)) return false;
  if (/\/\*|\*\//.test(normalized)) return false;
  if (/<\/?\s*style\b/i.test(normalized)) return false;
  if (/<\/?\s*script\b/i.test(normalized)) return false;
  if (/@import\b/i.test(normalized)) return false;
  if (/\bexpression\s*\(/i.test(normalized)) return false;
  if (/\bjavascript\s*:/i.test(normalized)) return false;
  return true;
}

function cssDecl(property, value) {
  if (!CSS_PROPERTY_RE.test(property)) return null;
  if (!isSafeCssValue(value)) return null;
  return `  ${property}: ${value.trim()};`;
}

function hasBalancedKeyframeBraces(body) {
  let depth = 0;
  for (const ch of body) {
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

function isSafeKeyframeBody(body) {
  if (typeof body !== "string") return false;
  const normalized = body.trim();
  if (!normalized) return false;
  if (/[\0<>]/.test(normalized)) return false;
  if (/\/\*|\*\//.test(normalized)) return false;
  if (/<\/?\s*style\b/i.test(normalized)) return false;
  if (/<\/?\s*script\b/i.test(normalized)) return false;
  if (/@/.test(normalized)) return false;
  if (/\bexpression\s*\(/i.test(normalized)) return false;
  if (/\bjavascript\s*:/i.test(normalized)) return false;
  return hasBalancedKeyframeBraces(normalized);
}

function emitButton(componentSummary, statePalette, prefix) {
  const lines = [];
  const btn = componentSummary && componentSummary.button;
  if (!btn || typeof btn !== "object") return lines;

  // Primary CTA — base
  const baseDecls = [];
  const bg = pickColor(btn["background-color"]) || pickColor(btn["background"]);
  const color = pickColor(btn["color"]);
  const border = pickMostCommon(btn["border-width"]);
  const borderRadius = pickMostCommon(btn["border-radius"]);
  const fontSize = pickMostCommon(btn["font-size"]);
  const fontWeight = pickMostCommon(btn["font-weight"]);
  const padding = pickMostCommon(btn["padding"]);

  for (const decl of [
    cssDecl("background-color", bg),
    cssDecl("color", color),
    cssDecl("border-radius", borderRadius),
    cssDecl("font-size", fontSize),
    cssDecl("font-weight", fontWeight),
    cssDecl("padding", padding),
    cssDecl("border-width", border),
  ]) {
    if (decl) baseDecls.push(decl);
  }

  if (baseDecls.length > 0) {
    lines.push(`.${prefix}-cta-primary {`);
    lines.push(...baseDecls);
    lines.push("}");
  }

  // Hover variant — derive from state palette if present
  if (statePalette && Array.isArray(statePalette.hover_backgrounds) && statePalette.hover_backgrounds.length > 0) {
    const hoverDecl = cssDecl("background-color", statePalette.hover_backgrounds[0]);
    if (hoverDecl) {
      lines.push(`.${prefix}-cta-primary:hover {`);
      lines.push(hoverDecl);
      lines.push("}");
    }
  }

  // Disabled variant — opacity from state palette if present
  if (statePalette && Array.isArray(statePalette.disabled_opacities) && statePalette.disabled_opacities.length > 0) {
    const opacityDecl = cssDecl("opacity", statePalette.disabled_opacities[0]);
    const cursorDecl = statePalette.disabled_cursors && statePalette.disabled_cursors.length > 0
      ? cssDecl("cursor", statePalette.disabled_cursors[0])
      : null;
    if (!opacityDecl && !cursorDecl) return lines;
    lines.push(`.${prefix}-cta-primary:disabled {`);
    if (opacityDecl) lines.push(opacityDecl);
    if (cursorDecl) lines.push(cursorDecl);
    lines.push("}");
  }

  return lines;
}

function emitInput(componentSummary, prefix) {
  const lines = [];
  const inp = componentSummary && componentSummary.input;
  if (!inp || typeof inp !== "object") return lines;

  const decls = [];
  const color = pickColor(inp["color"]);
  const bg = pickColor(inp["background-color"]) || pickColor(inp["background"]);
  const fontSize = pickMostCommon(inp["font-size"]);
  const padding = pickMostCommon(inp["padding"]);
  const borderRadius = pickMostCommon(inp["border-radius"]);

  for (const decl of [
    cssDecl("color", color),
    cssDecl("background-color", bg),
    cssDecl("font-size", fontSize),
    cssDecl("padding", padding),
    cssDecl("border-radius", borderRadius),
  ]) {
    if (decl) decls.push(decl);
  }

  if (decls.length > 0) {
    lines.push(`.${prefix}-input {`);
    lines.push(...decls);
    lines.push("}");
  }
  return lines;
}

function emitCard(componentSummary, prefix) {
  const lines = [];
  const card = componentSummary && componentSummary.card;
  if (!card || typeof card !== "object") return lines;

  const decls = [];
  const bg = pickColor(card["background-color"]) || pickColor(card["background"]);
  const color = pickColor(card["color"]);
  const padding = pickMostCommon(card["padding"]);
  const borderRadius = pickMostCommon(card["border-radius"]);

  for (const decl of [
    cssDecl("background-color", bg),
    cssDecl("color", color),
    cssDecl("padding", padding),
    cssDecl("border-radius", borderRadius),
  ]) {
    if (decl) decls.push(decl);
  }

  if (decls.length > 0) {
    lines.push(`.${prefix}-card {`);
    lines.push(...decls);
    lines.push("}");
  }
  return lines;
}

function emitBadge(componentSummary, prefix) {
  const lines = [];
  const badge = componentSummary && componentSummary.badge;
  if (!badge || typeof badge !== "object") return lines;

  const decls = [];
  const bg = pickColor(badge["background-color"]) || pickColor(badge["background"]);
  const color = pickColor(badge["color"]);
  const fontSize = pickMostCommon(badge["font-size"]);
  const padding = pickMostCommon(badge["padding"]);
  const borderRadius = pickMostCommon(badge["border-radius"]);

  for (const decl of [
    cssDecl("background-color", bg),
    cssDecl("color", color),
    cssDecl("font-size", fontSize),
    cssDecl("padding", padding),
    cssDecl("border-radius", borderRadius),
  ]) {
    if (decl) decls.push(decl);
  }

  if (decls.length > 0) {
    lines.push(`.${prefix}-badge {`);
    lines.push(...decls);
    lines.push("}");
  }
  return lines;
}

function emitMotionTokens(motion, prefix = "preview") {
  const lines = [];
  if (!motion) return lines;
  const transitions = Array.isArray(motion.transitions) ? motion.transitions : [];
  if (transitions.length === 0) return lines;

  // Emit a single transition declaration with the canonical brand profile.
  // Per medium gold-standard: only properties present in source are
  // animated. Combine into a multi-property transition.
  const dominant = transitions[0];
  if (!dominant || !dominant.duration) return lines;

  const props = [...new Set(transitions.map((t) => t.property))]
    .filter((p) => p && p !== "all" && CSS_PROPERTY_RE.test(p));
  if (props.length === 0) return lines;

  const dur = dominant.duration;
  if (!isSafeCssValue(dur)) return lines;
  if (!dominant.timing || !isSafeCssValue(dominant.timing)) return lines;
  const timing = dominant.timing;

  const transitionValue = props.map((p) => `${p} ${dur} ${timing}`).join(", ");
  lines.push(`/* Brand-canonical transition (only properties extracted from source) */`);
  lines.push(`.${prefix}-transition {`);
  lines.push(`  transition: ${transitionValue};`);
  lines.push(`}`);
  return lines;
}

function emitKeyframes(motion) {
  const lines = [];
  if (!motion || !motion.keyframe_bodies || typeof motion.keyframe_bodies !== "object") return lines;
  for (const [name, body] of Object.entries(motion.keyframe_bodies)) {
    if (!name || !body) continue;
    if (!CSS_IDENTIFIER_RE.test(name)) continue;
    if (!isSafeKeyframeBody(body)) continue;
    lines.push(`@keyframes ${name} {`);
    lines.push(`  ${body.trim()}`);
    lines.push(`}`);
  }
  return lines;
}

// Public: emit the brand component CSS string. Inputs:
//   componentProperties — content of inputs/component-properties.json
//   componentStates     — content of inputs/component-states.json
//   motion              — content of inputs/motion.json (extended)
//   options.prefix      — class prefix (default "preview")
function emitComponentClasses(input) {
  const data = input || {};
  const prefix = (data.options && data.options.prefix) || "preview";
  const componentSummary = (data.componentProperties && data.componentProperties.summary) || {};
  const statePalette = (data.componentStates && data.componentStates.state_value_palette) || {};

  const sections = [];
  const buttonLines = emitButton(componentSummary, statePalette, prefix);
  if (buttonLines.length > 0) sections.push(buttonLines.join("\n"));
  const inputLines = emitInput(componentSummary, prefix);
  if (inputLines.length > 0) sections.push(inputLines.join("\n"));
  const cardLines = emitCard(componentSummary, prefix);
  if (cardLines.length > 0) sections.push(cardLines.join("\n"));
  const badgeLines = emitBadge(componentSummary, prefix);
  if (badgeLines.length > 0) sections.push(badgeLines.join("\n"));
  const motionLines = emitMotionTokens(data.motion, prefix);
  if (motionLines.length > 0) sections.push(motionLines.join("\n"));
  const keyframeLines = emitKeyframes(data.motion);
  if (keyframeLines.length > 0) sections.push(keyframeLines.join("\n"));

  if (sections.length === 0) {
    return `/* No component classes emitted — extraction yielded no actionable signal. */`;
  }

  const header = [
    `/* Component classes emitted from extracted data only.`,
    ` * Per .claude/rules/extraction-no-fallbacks.md, missing slots are`,
    ` * deliberately omitted — downstream decides whether to fill them.`,
    ` */`,
  ].join("\n");

  return [header, ...sections].join("\n\n");
}

module.exports = {
  emitComponentClasses,
  // exported for tests
  emitButton,
  emitInput,
  emitCard,
  emitBadge,
  emitMotionTokens,
  emitKeyframes,
  pickColor,
  isSafeCssValue,
  isSafeKeyframeBody,
};
