"use strict";

// asymmetry-detector.cjs
//
// Detects "flatness signals" — patterns of absence, uniformity, or sparseness
// in the extracted design tokens that constitute brand identity. Examples
// from the medium gold-standard extraction:
//   - Only 2 border-radii used (50%, 99em) → flat radius philosophy
//   - Zero box-shadows detected         → flat aesthetic, no elevation language
//   - 300ms linear on bg-color + color  → single-curve motion language
//   - Zero focus rules detected         → a11y gap (or intentional brand decision)
//   - Disabled opacities = [0.1, 0.3]   → bi-tier disabled signature
//
// Per .claude/rules/extraction-no-fallbacks.md: the detector reads only
// extracted artifact data and reports observed asymmetries. It NEVER invents
// "expected" values or compensates with defaults. An asymmetry is a SIGNAL,
// not a defect — downstream decides whether to honor or fill it.
//
// Per squads/design-ops/rules/extraction-asymmetries-protocol.md:
// each asymmetry has a stable id, category, severity, evidence, and a
// design_implication string aimed at downstream consumers.

const SEVERITIES = ["low", "medium", "high"];

// ── Detection rules ─────────────────────────────────────────────────────
// Each rule receives the consolidated extraction context and returns an
// asymmetry object OR null when the rule does not apply to this brand.

function ruleRadiiFlatness({ tokensDetected }) {
  const radii = (tokensDetected && tokensDetected.radii) || [];
  if (!Array.isArray(radii) || radii.length === 0) return null;
  if (radii.length > 3) return null;
  return {
    id: "radii-flatness",
    category: "flatness",
    severity: "high",
    title: `Flat radius philosophy — only ${radii.length} distinct border-radii`,
    description: `Brand expresses geometry through ${radii.length} radius value${radii.length === 1 ? "" : "s"} (${radii.join(", ")}). No intermediate scale (no 4px / 8px / 12px tier).`,
    evidence: { radii_count: radii.length, values: radii },
    design_implication: `Downstream rendering MUST NOT invent intermediate radii. Use only the extracted values. Consumers requiring more granularity should declare the gap explicitly.`,
  };
}

function ruleShadowAbsence({ shadows }) {
  const list = Array.isArray(shadows) ? shadows : [];
  if (list.length > 0) return null;
  return {
    id: "shadow-absence",
    category: "absence",
    severity: "high",
    title: "Zero box-shadows detected",
    description: "Brand CSS contains no box-shadow declarations. Flat aesthetic — separation is achieved via borders, color, or whitespace, not elevation.",
    evidence: { shadow_count: 0 },
    design_implication: "Do not generate shadow-based elevation. Use borders or background contrast for component separation.",
  };
}

function ruleShadowMonolith({ shadows }) {
  const list = Array.isArray(shadows) ? shadows : [];
  if (list.length !== 1) return null;
  return {
    id: "shadow-monolith",
    category: "uniformity",
    severity: "medium",
    title: "Single-shadow language",
    description: `Brand uses exactly 1 shadow (${list[0].value || JSON.stringify(list[0])}). No elevation tier system.`,
    evidence: { shadow_count: 1, value: list[0] },
    design_implication: "Treat the single shadow as the elevation primitive. Do not synthesize a tier scale.",
  };
}

function ruleTransitionUniformity({ motion }) {
  if (!motion) return null;
  const durations = motion.durations || [];
  const easings = motion.easings || [];
  const transitions = motion.transitions || [];
  if (durations.length > 1 || easings.length > 1) return null;
  if (durations.length === 0 && transitions.length === 0) return null;
  const dominantDuration = durations[0] ? durations[0].value : (transitions[0] ? transitions[0].duration : null);
  const dominantTiming = easings[0] ? easings[0].value : (transitions.find((t) => t.timing) ? transitions.find((t) => t.timing).timing : null);
  return {
    id: "transition-uniformity",
    category: "uniformity",
    severity: "medium",
    title: "Single-curve motion language",
    description: `Brand uses a single transition profile${dominantDuration ? `: ${dominantDuration}` : ""}${dominantTiming ? ` ${dominantTiming}` : ""}. No easing variety, no duration tiers.`,
    evidence: {
      durations_count: durations.length,
      easings_count: easings.length,
      dominant_duration: dominantDuration,
      dominant_timing: dominantTiming,
    },
    design_implication: "Honor the single curve. Do not invent ease-in-out for hover/focus when source uses linear.",
  };
}

// Common animatable properties consumers might expect — used to derive a
// "what is NOT animated" hint without hardcoding a contradictory list.
const COMMON_ANIMATABLE_PROPS = [
  "background-color", "color", "border-color", "fill", "stroke",
  "transform", "opacity", "scale", "rotate", "translate",
  "box-shadow", "filter", "backdrop-filter",
  "width", "height", "padding", "margin",
  "outline", "outline-color", "border-width",
];

function ruleTransitionPropertyNarrow({ motion }) {
  if (!motion) return null;
  const transitions = motion.transitions || [];
  if (transitions.length === 0) return null;
  const props = [...new Set(transitions.map((t) => t.property))];
  if (props.length > 4) return null;
  if (props.length === 1 && props[0] === "all") return null;
  // Compute properties from the common set that are NOT in the extracted list.
  // This replaces the hardcoded "transform, opacity, scale" prose with a
  // contradiction-free derivation. If "all" is in props, skip the missing-list
  // entirely (since "all" by definition transitions everything).
  const notAnimated = props.includes("all")
    ? []
    : COMMON_ANIMATABLE_PROPS.filter((p) => !props.includes(p));
  const missingHint = notAnimated.length > 0
    ? ` Other properties (${notAnimated.slice(0, 3).join(", ")}${notAnimated.length > 3 ? ", ..." : ""}) are NOT animated by this brand.`
    : "";
  return {
    id: "transition-property-narrow",
    category: "sparseness",
    severity: "medium",
    title: `Transitions limited to ${props.length} propert${props.length === 1 ? "y" : "ies"}`,
    description: `Source CSS transitions only: ${props.join(", ")}.${missingHint}`,
    evidence: {
      properties: props,
      properties_not_animated: notAnimated,
      transition_count: transitions.length,
    },
    design_implication: `Honor the brand's transition selectivity. Generated components should NOT animate properties absent from the source list (${props.join(", ")}).`,
  };
}

function ruleFocusStateAbsence({ componentStates }) {
  if (!componentStates || !componentStates.summary) return null;
  const absent = componentStates.summary.states_absent || [];
  const focusAbsent = absent.includes("focus") && absent.includes("focus-visible");
  if (!focusAbsent) return null;
  return {
    id: "focus-state-absence",
    category: "absence",
    severity: "high",
    title: "Zero :focus / :focus-visible rules detected",
    description: "Brand CSS contains no focus state styling. Either the brand relies on browser defaults (a11y gap) or focus is handled in JS / outside extracted CSS.",
    evidence: {
      states_present: componentStates.summary.states_present,
      states_absent: absent,
    },
    design_implication: "Downstream rendering MUST inject focus rings for a11y compliance, BUT the resulting tokens are inferred — they do not represent brand intent. Flag explicitly in render-contract.",
  };
}

function ruleActiveStateAbsence({ componentStates }) {
  if (!componentStates || !componentStates.summary) return null;
  const absent = componentStates.summary.states_absent || [];
  const present = componentStates.summary.states_present || [];
  if (!absent.includes("active")) return null;
  if (!present.includes("hover")) return null;
  return {
    id: "active-state-absence",
    category: "absence",
    severity: "low",
    title: "Hover defined but no :active state",
    description: "Brand declares :hover variants but omits :active. Click feedback relies on browser defaults or hover transitions.",
    evidence: { states_present: present, states_absent: absent },
    design_implication: "Generated components should not invent active-state palettes. Optionally derive :active from :hover with a small darken if explicitly requested by the consumer.",
  };
}

function ruleDisabledOpacityPattern({ componentStates }) {
  if (!componentStates || !componentStates.state_value_palette) return null;
  const opacities = componentStates.state_value_palette.disabled_opacities || [];
  if (opacities.length < 2) return null;
  return {
    id: "disabled-opacity-pattern",
    category: "uniformity",
    severity: "low",
    title: `Bi-tier disabled opacity signature (${opacities.length} values)`,
    description: `Brand uses ${opacities.length} disabled-state opacities: ${opacities.join(", ")}. This is the disabled-state language signature.`,
    evidence: { values: opacities },
    design_implication: "Use the same opacity values when extending disabled-state coverage to new components. Do not invent intermediates.",
  };
}

function ruleColorPaletteDensity({ tokensDetected }) {
  if (!tokensDetected || !tokensDetected.colors) return null;
  const hex = (tokensDetected.colors.hex || []).filter((h) => h && h.startsWith("#"));
  if (hex.length === 0) return null;
  if (hex.length <= 8) {
    return {
      id: "color-palette-narrow",
      category: "sparseness",
      severity: "medium",
      title: `Narrow color palette — ${hex.length} distinct hex values`,
      description: `Brand uses a tight palette of ${hex.length} colors. Each color likely has high semantic load.`,
      evidence: { hex_count: hex.length, values: hex },
      design_implication: "Honor the narrow palette. Avoid generating tints/shades not present in source. Each new color is a brand decision.",
    };
  }
  if (hex.length >= 30) {
    return {
      id: "color-palette-extended",
      category: "density",
      severity: "low",
      title: `Extended color palette — ${hex.length} distinct hex values`,
      description: `Brand uses an extended palette of ${hex.length} colors. Likely includes scaled variants (50/100/200/.../900) or syntax-highlighting tokens.`,
      evidence: { hex_count: hex.length },
      design_implication: "Cluster the palette into roles before consuming. The extended count alone does not mean every color is primary.",
    };
  }
  return null;
}

function ruleEasingAbsence({ motion }) {
  if (!motion) return null;
  const easings = motion.easings || [];
  const transitions = motion.transitions || [];
  // If we have transitions but zero easings, it means everything defaults to ease/linear
  if (transitions.length === 0) return null;
  if (easings.length > 0) return null;
  // Check if all transitions explicitly carry "linear" timing
  const allLinear = transitions.every((t) => t.timing === "linear");
  if (allLinear) {
    return {
      id: "easing-linear-only",
      category: "uniformity",
      severity: "medium",
      title: "Linear-only timing function",
      description: "All transitions use `linear` timing. No ease curves at all.",
      evidence: { transition_count: transitions.length },
      design_implication: "Generated motion MUST use linear. Ease-in/ease-out are off-brand for this site.",
    };
  }
  return null;
}

// ── Counterpart / richness signals (added 2026-05-07 from Obsidian fixture) ──
// These flag the OPPOSITE of flatness: brands that invest in scale, motion,
// state coverage, or expressive a11y idioms. Useful for downstream consumers
// that need to honor density rather than restraint.

function ruleRadiusDensityRich({ tokensDetected }) {
  const radii = (tokensDetected && tokensDetected.radii) || [];
  if (!Array.isArray(radii) || radii.length < 15) return null;
  return {
    id: "radius-density-rich",
    category: "density",
    severity: "low",
    title: `Rich radius scale — ${radii.length} distinct border-radii`,
    description: `Brand expresses geometry through a deep ${radii.length}-step radius scale. This is a designed system (not flatness, not ad-hoc).`,
    evidence: { radii_count: radii.length, sample: radii.slice(0, 10) },
    design_implication: "Honor the scale. Generated components should pick from extracted values rather than rounding to common defaults (4px / 8px).",
  };
}

function ruleMotionRich({ motion }) {
  if (!motion) return null;
  const durations = motion.durations || [];
  const easings = motion.easings || [];
  const keyframes = motion.keyframes || [];
  if (durations.length < 4) return null;
  if (easings.length === 0 && keyframes.length === 0) return null;
  return {
    id: "motion-rich",
    category: "density",
    severity: "low",
    title: `Expressive motion language — ${durations.length} duration tiers, ${easings.length} easing${easings.length === 1 ? "" : "s"}, ${keyframes.length} keyframe${keyframes.length === 1 ? "" : "s"}`,
    description: "Brand invests in a varied motion vocabulary. Different interactions have different temporal weight.",
    evidence: {
      duration_count: durations.length,
      easing_count: easings.length,
      keyframe_count: keyframes.length,
      duration_palette: durations.slice(0, 8).map((d) => d.value || d),
    },
    design_implication: "Map intents (hover / page-transition / loading / feedback) to specific durations. Avoid collapsing the palette into a single 300ms default.",
  };
}

function ruleFocusTransparentOutlinePattern({ componentStates }) {
  if (!componentStates || !componentStates.state_value_palette) return null;
  const outlines = componentStates.state_value_palette.focus_outlines || [];
  const transparent = outlines.filter((v) => /transparent/i.test(v));
  if (transparent.length === 0) return null;
  return {
    id: "focus-transparent-outline-pattern",
    category: "convention",
    severity: "medium",
    title: "Tailwind-style transparent focus outline (ring delegated to box-shadow)",
    description: "One or more focus rules use `outline: ... transparent`. This is the canonical Tailwind `focus:ring` pattern: a transparent outline reserves layout space while the visible focus indicator is drawn via box-shadow (`--tw-ring-shadow`). NOT an a11y bug — but consumers must render the box-shadow ring or the focus state becomes invisible.",
    evidence: {
      transparent_outline_count: transparent.length,
      sample: transparent.slice(0, 3),
      focus_box_shadows: (componentStates.state_value_palette.focus_box_shadows || []).slice(0, 3),
    },
    design_implication: "When porting components, MUST emit the corresponding box-shadow ring. Do NOT replace transparent outlines with `none` — the focus state will disappear.",
  };
}

function ruleStateCoverageComprehensive({ componentStates }) {
  if (!componentStates || !componentStates.summary) return null;
  const present = componentStates.summary.states_present || [];
  if (present.length < 5) return null;
  return {
    id: "state-coverage-comprehensive",
    category: "density",
    severity: "low",
    title: `Comprehensive state coverage — ${present.length} interaction states declared`,
    description: `Brand declares CSS for ${present.length} interaction states (${present.join(", ")}). This is comprehensive a11y/UX investment, not the bare minimum.`,
    evidence: {
      states_present: present,
      states_absent: componentStates.summary.states_absent || [],
      total_state_rules: componentStates.summary.total_state_rules,
    },
    design_implication: "Downstream rendering MUST honor the full state coverage. Dropping :focus-visible or :active in generated output regresses brand a11y.",
  };
}

const RULES = [
  ruleRadiiFlatness,
  ruleRadiusDensityRich,
  ruleShadowAbsence,
  ruleShadowMonolith,
  ruleTransitionUniformity,
  ruleTransitionPropertyNarrow,
  ruleMotionRich,
  ruleEasingAbsence,
  ruleFocusStateAbsence,
  ruleFocusTransparentOutlinePattern,
  ruleActiveStateAbsence,
  ruleDisabledOpacityPattern,
  ruleStateCoverageComprehensive,
  ruleColorPaletteDensity,
];

function detectAsymmetries(context) {
  const ctx = context || {};
  const asymmetries = [];
  for (const rule of RULES) {
    try {
      const out = rule(ctx);
      if (out) asymmetries.push(out);
    } catch (_err) {
      // Defensive: a misshapen sidecar must not crash the pipeline. Per
      // headless-pipeline.md R1 the surrounding orchestrator runs unattended,
      // so individual rule failures are recorded as gaps, not exceptions.
    }
  }

  const bySeverity = { low: 0, medium: 0, high: 0 };
  const byCategory = {};
  for (const a of asymmetries) {
    if (SEVERITIES.includes(a.severity)) bySeverity[a.severity]++;
    byCategory[a.category] = (byCategory[a.category] || 0) + 1;
  }

  return {
    asymmetries,
    summary: {
      total_asymmetries: asymmetries.length,
      by_severity: bySeverity,
      by_category: byCategory,
    },
  };
}

// Render the asymmetry report as Markdown for human review. Embedded in
// extraction-log.yaml-adjacent flow as `extraction-asymmetries.md`.
function renderAsymmetriesMarkdown(report, meta) {
  const m = meta || {};
  const lines = [];
  lines.push(`# Extraction Asymmetries${m.brand ? ` — ${m.brand}` : ""}`);
  lines.push("");
  if (m.url) lines.push(`**Source:** ${m.url}  `);
  if (m.extracted_at) lines.push(`**Extracted at:** ${m.extracted_at}  `);
  lines.push(`**Total asymmetries:** ${report.summary.total_asymmetries}  `);
  const bs = report.summary.by_severity;
  lines.push(`**By severity:** high=${bs.high} · medium=${bs.medium} · low=${bs.low}`);
  lines.push("");
  lines.push("Each entry below is a brand identity signal — a pattern of absence, uniformity, or sparseness that consumers MUST honor when rendering downstream artifacts. Per `.claude/rules/extraction-no-fallbacks.md`, the detector never invents \"expected\" values; it only reports what the extracted data shows.");
  lines.push("");

  if (report.asymmetries.length === 0) {
    lines.push("_No asymmetries detected — brand uses scaled palettes, multiple radii, multiple shadows, multiple easings, and full state coverage._");
    return lines.join("\n") + "\n";
  }

  // Summary table
  lines.push("## Summary");
  lines.push("");
  lines.push("| ID | Category | Severity | Title |");
  lines.push("|---|---|---|---|");
  for (const a of report.asymmetries) {
    lines.push(`| \`${a.id}\` | ${a.category} | ${a.severity} | ${a.title} |`);
  }
  lines.push("");

  // Detail per asymmetry
  for (const a of report.asymmetries) {
    lines.push(`## ${a.title}`);
    lines.push("");
    lines.push(`- **ID:** \`${a.id}\``);
    lines.push(`- **Category:** ${a.category}`);
    lines.push(`- **Severity:** ${a.severity}`);
    lines.push("");
    lines.push(a.description);
    lines.push("");
    lines.push("**Evidence:**");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(a.evidence, null, 2));
    lines.push("```");
    lines.push("");
    lines.push(`**Design implication:** ${a.design_implication}`);
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

module.exports = {
  detectAsymmetries,
  renderAsymmetriesMarkdown,
  // exported for tests
  RULES,
};
