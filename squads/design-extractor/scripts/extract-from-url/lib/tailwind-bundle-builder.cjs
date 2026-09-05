"use strict";

// tailwind-bundle-builder.cjs
//
// Produces a self-contained `showcase.html` artifact that visualizes extracted
// sidecars as an atomic-design tour: source-verified palette, typography
// specimens, interaction-state matrix, motion evidence, and asymmetry signals.
//
// All content is rendered from extracted data only. Per
// .claude/rules/extraction-no-fallbacks.md — sections with no data emit a
// visible extraction_gap block or do not render. The showcase is honest about
// coverage and is not the SOT; DESIGN.md remains canonical.

const { emitTailwindTheme } = require("./tailwind-theme-emitter.cjs");
const { emitComponentClasses } = require("./component-class-emitter.cjs");
const { A11Y_FOCUS_CSS, A11Y_SKIP_LINK_CSS, A11Y_SKIP_LINK_HTML } = require("./html-polish.cjs");

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escAttr(s) {
  return escapeHtml(s);
}

function renderExtractionGap(slot, reason) {
  return `
    <section id="${escAttr(slot)}" data-extraction-gap="${escAttr(reason)}" class="border-t py-12 px-6 md:px-12" style="border-color: var(--color-border);">
      <div class="grid gap-8 md:grid-cols-[200px_1fr]">
        <div class="font-mono text-[11px] uppercase tracking-[0.18em] opacity-60">extraction gap</div>
        <div>
          <h2 class="text-h1 font-semibold">${escapeHtml(slot)}</h2>
          <p class="mt-3 opacity-70">${escapeHtml(`extraction_gap(${reason})`)}</p>
        </div>
      </div>
    </section>`;
}

function specimenStyle(style) {
  if (!style || typeof style !== "object") return "";
  const declarations = [];
  if (style.fontFamily) declarations.push(`font-family:${escAttr(style.fontFamily)}`);
  if (style.fontSize) declarations.push(`font-size:${escAttr(style.fontSize)}`);
  if (style.fontWeight) declarations.push(`font-weight:${escAttr(style.fontWeight)}`);
  if (style.lineHeight) declarations.push(`line-height:${escAttr(style.lineHeight)}`);
  if (style.letterSpacing) declarations.push(`letter-spacing:${escAttr(style.letterSpacing)}`);
  return declarations.length > 0 ? ` style="${declarations.join(";")};"` : "";
}

function specimenMeta(style) {
  if (!style || typeof style !== "object") return "extraction_gap(typography_style_empty)";
  const parts = [];
  if (style.fontSize) parts.push(style.fontSize);
  if (style.lineHeight) parts.push(`lh ${style.lineHeight}`);
  if (style.fontWeight) parts.push(`w${style.fontWeight}`);
  if (style.letterSpacing) parts.push(`ls ${style.letterSpacing}`);
  return parts.length > 0 ? parts.join(" / ") : "extraction_gap(typography_metrics_missing)";
}

// ── Section: source-verified palette ──────────────────────────────────
// Each swatch shows hex + role + the selector(s) that produced it.

function renderPaletteSection(tokens, provenance) {
  const colors = (tokens && tokens.colors) || {};
  const colorEntries = Object.entries(colors).filter(([, v]) => typeof v === "string" && v.startsWith("#"));
  if (colorEntries.length === 0) return "";

  const swatches = colorEntries
    .map(([role, hex]) => {
      const lc = String(hex).toLowerCase();
      const provBucket = provenance && provenance.colors && provenance.colors[lc];
      const sources = provBucket ? provBucket.selectors.slice(0, 3) : [];
      const primaryCtx = provBucket ? provBucket.primary_context : null;
      const sourcesHtml = sources.length === 0
        ? '<span class="opacity-50 text-xs">no provenance recorded</span>'
        : sources.map((s) => `<code class="text-[11px] opacity-70">${escapeHtml(s.selector)} <span class="opacity-50">(${escapeHtml(s.property)})</span></code>`).join('<br>');
      return `
        <div class="border p-4" style="border-color: var(--color-border);">
          <div class="h-16 w-full" style="background:${escAttr(hex)};"></div>
          <div class="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] opacity-70">${escapeHtml(role)}</div>
          <div class="mt-1 font-mono text-[11px]">${escapeHtml(hex)}</div>
          ${primaryCtx ? `<div class="mt-1 text-[11px] opacity-60">primary: ${escapeHtml(primaryCtx)}</div>` : ""}
          <div class="mt-3 leading-relaxed">${sourcesHtml}</div>
        </div>`;
    })
    .join("");

  return `
    <!-- 01 ATOMS · Color palette (source-verified) -->
    <section id="section-01-color" class="border-t py-12 px-6 md:px-12" style="border-color: var(--color-border);">
      <div class="grid gap-8 md:grid-cols-[200px_1fr]">
        <div class="font-mono text-[11px] uppercase tracking-[0.18em] opacity-60">
          <span style="color: var(--color-primary);">01</span> · ATOMS · color palette
          <div class="mt-2 opacity-70">${colorEntries.length} role${colorEntries.length === 1 ? "" : "s"}</div>
        </div>
        <div>
          <h2 class="text-h1 font-semibold">Source-verified palette</h2>
          <p class="mt-3 opacity-70">Each swatch traces back to the CSS selectors that produced it.</p>
          <div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            ${swatches}
          </div>
        </div>
      </div>
    </section>`;
}

// ── Section: typography specimens ─────────────────────────────────────

function renderTypographySection(tokens) {
  const typography = (tokens && tokens.typography) || {};
  const styles = Object.entries(typography);
  if (styles.length === 0) return "";

  const specimens = styles
    .map(([name, style]) => {
      if (!style) return "";
      return `
        <div class="border p-5" style="border-color: var(--color-border);">
          <div class="font-mono text-[11px] uppercase tracking-[0.14em] opacity-60">${escapeHtml(name)}</div>
          <div class="mt-4"${specimenStyle(style)}>
            Design system specimen
          </div>
          <div class="mt-3 font-mono text-[11px] opacity-60">
            ${escapeHtml(specimenMeta(style))}
          </div>
        </div>`;
    })
    .join("");

  return `
    <!-- 02 ATOMS · Typography -->
    <section id="section-02-typography" class="border-t py-12 px-6 md:px-12" style="border-color: var(--color-border);">
      <div class="grid gap-8 md:grid-cols-[200px_1fr]">
        <div class="font-mono text-[11px] uppercase tracking-[0.18em] opacity-60">
          <span style="color: var(--color-primary);">02</span> · ATOMS · typography
          <div class="mt-2 opacity-70">${styles.length} style${styles.length === 1 ? "" : "s"}</div>
        </div>
        <div>
          <h2 class="text-h1 font-semibold">Typography</h2>
          <div class="mt-8 grid gap-4 lg:grid-cols-2">
            ${specimens}
          </div>
        </div>
      </div>
    </section>`;
}

// ── Section: button states matrix ─────────────────────────────────────

function renderButtonMatrixSection(componentStates) {
  const palette = (componentStates && componentStates.state_value_palette) || {};
  const present = (componentStates && componentStates.summary && componentStates.summary.states_present) || [];
  if (present.length === 0) return "";

  const stateCells = (state, palettes) => {
    if (palettes.length === 0) return '<td class="p-4 opacity-40">—</td>';
    return `<td class="p-4"><div class="flex flex-wrap gap-2">${palettes
      .slice(0, 4)
      .map((v) => `<span class="inline-block h-6 w-6 border" style="background:${escAttr(v)};border-color:var(--color-border);" title="${escAttr(v)}"></span>`)
      .join("")}</div><div class="mt-1 font-mono text-[10px] opacity-60">${palettes.length} value${palettes.length === 1 ? "" : "s"}</div></td>`;
  };

  return `
    <!-- 04 MOLECULES · Button states matrix -->
    <section id="section-04-states" class="border-t py-12 px-6 md:px-12" style="border-color: var(--color-border);">
      <div class="grid gap-8 md:grid-cols-[200px_1fr]">
        <div class="font-mono text-[11px] uppercase tracking-[0.18em] opacity-60">
          <span style="color: var(--color-primary);">04</span> · MOLECULES · button states
        </div>
        <div>
          <h2 class="text-h1 font-semibold">Interaction state palette</h2>
          <p class="mt-3 opacity-70">Aggregated from extracted state rules. Empty cells mean the source CSS contains no rules for that pairing — honest report.</p>
          <table class="mt-8 w-full border" style="border-color: var(--color-border);border-collapse:collapse;">
            <thead>
              <tr class="font-mono text-[11px] uppercase tracking-[0.14em] opacity-60">
                <th class="p-3 text-left border-r" style="border-color: var(--color-border);">slot</th>
                <th class="p-3 text-left border-r" style="border-color: var(--color-border);">hover</th>
                <th class="p-3 text-left border-r" style="border-color: var(--color-border);">disabled</th>
                <th class="p-3 text-left">focus</th>
              </tr>
            </thead>
            <tbody>
              <tr class="border-t" style="border-color: var(--color-border);">
                <td class="p-4 font-mono text-[12px]">backgrounds</td>
                ${stateCells("hover", palette.hover_backgrounds || [])}
                ${stateCells("disabled", palette.disabled_backgrounds || [])}
                ${stateCells("focus", palette.focus_box_shadows || palette.focus_outlines || [])}
              </tr>
              <tr class="border-t" style="border-color: var(--color-border);">
                <td class="p-4 font-mono text-[12px]">colors</td>
                ${stateCells("hover", palette.hover_colors || [])}
                ${stateCells("disabled", palette.disabled_colors || [])}
                ${stateCells("focus", palette.focus_border_colors || [])}
              </tr>
              <tr class="border-t" style="border-color: var(--color-border);">
                <td class="p-4 font-mono text-[12px]">opacities</td>
                ${stateCells("hover", palette.hover_opacities || [])}
                ${stateCells("disabled", palette.disabled_opacities || [])}
                <td class="p-4 opacity-40">—</td>
              </tr>
            </tbody>
          </table>
          <div class="mt-4 font-mono text-[11px] opacity-60">
            states present: ${present.join(", ") || "(none)"}<br>
            states absent: ${(componentStates.summary.states_absent || []).join(", ") || "(none)"}
          </div>
        </div>
      </div>
    </section>`;
}

// ── Section: motion demo ──────────────────────────────────────────────

function renderMotionSection(motion) {
  if (!motion) return "";
  const transitions = motion.transitions || [];
  const keyframes = motion.keyframe_bodies || {};
  if (transitions.length === 0 && Object.keys(keyframes).length === 0) return "";

  const transitionRows = transitions
    .map((t) => `
      <tr class="border-t" style="border-color: var(--color-border);">
        <td class="p-3 font-mono text-[12px]">${escapeHtml(t.property)}</td>
        <td class="p-3 font-mono text-[12px]">${escapeHtml(t.duration)}</td>
        <td class="p-3 font-mono text-[12px]">${escapeHtml(t.timing || "extraction_gap(motion_timing_missing)")}</td>
        <td class="p-3 font-mono text-[12px] opacity-60">×${t.count}</td>
      </tr>`)
    .join("");

  const keyframeBlocks = Object.entries(keyframes)
    .map(([name, body]) => `
      <div class="border p-4" style="border-color: var(--color-border);">
        <div class="font-mono text-[11px] uppercase tracking-[0.14em] opacity-60">@keyframes ${escapeHtml(name)}</div>
        <pre class="mt-3 overflow-x-auto text-[11px] font-mono opacity-80">${escapeHtml(body)}</pre>
      </div>`)
    .join("");

  return `
    <!-- 03 ATOMS · Motion -->
    <section id="section-03-motion" class="border-t py-12 px-6 md:px-12" style="border-color: var(--color-border);">
      <div class="grid gap-8 md:grid-cols-[200px_1fr]">
        <div class="font-mono text-[11px] uppercase tracking-[0.18em] opacity-60">
          <span style="color: var(--color-primary);">03</span> · ATOMS · motion
        </div>
        <div>
          <h2 class="text-h1 font-semibold">Motion language</h2>
          ${transitions.length > 0 ? `
          <table class="mt-8 w-full border" style="border-color: var(--color-border);border-collapse:collapse;">
            <thead>
              <tr class="font-mono text-[11px] uppercase tracking-[0.14em] opacity-60">
                <th class="p-3 text-left border-r" style="border-color: var(--color-border);">property</th>
                <th class="p-3 text-left border-r" style="border-color: var(--color-border);">duration</th>
                <th class="p-3 text-left border-r" style="border-color: var(--color-border);">timing</th>
                <th class="p-3 text-left">count</th>
              </tr>
            </thead>
            <tbody>${transitionRows}</tbody>
          </table>` : ""}
          ${keyframeBlocks ? `<div class="mt-6 grid gap-3 lg:grid-cols-2">${keyframeBlocks}</div>` : ""}
        </div>
      </div>
    </section>`;
}

// ── Section: asymmetries panel ────────────────────────────────────────

function renderAsymmetriesSection(asymmetryReport) {
  if (!asymmetryReport || !Array.isArray(asymmetryReport.asymmetries)) return "";
  const list = asymmetryReport.asymmetries;
  if (list.length === 0) return "";
  const rows = list
    .map((a) => `
      <div class="border p-5" style="border-color: var(--color-border);">
        <div class="flex items-baseline gap-3">
          <span class="font-mono text-[10px] uppercase tracking-[0.16em] opacity-60">${escapeHtml(a.severity)}</span>
          <span class="font-mono text-[11px] opacity-50">${escapeHtml(a.category)}</span>
        </div>
        <h3 class="mt-2 font-medium">${escapeHtml(a.title)}</h3>
        <p class="mt-2 text-sm opacity-80 leading-relaxed">${escapeHtml(a.description)}</p>
        <details class="mt-3 text-[12px]"><summary class="cursor-pointer opacity-60">design implication</summary><div class="mt-2 opacity-80">${escapeHtml(a.design_implication)}</div></details>
      </div>`)
    .join("");

  return `
    <!-- 13 EXTRACTION · Brand identity asymmetries -->
    <section id="section-13-asymmetries" class="border-t py-12 px-6 md:px-12" style="border-color: var(--color-border);">
      <div class="grid gap-8 md:grid-cols-[200px_1fr]">
        <div class="font-mono text-[11px] uppercase tracking-[0.18em] opacity-60">
          <span style="color: var(--color-primary);">13</span> · brand identity signals
          <div class="mt-2 opacity-70">${list.length} signal${list.length === 1 ? "" : "s"}</div>
        </div>
        <div>
          <h2 class="text-h1 font-semibold">Asymmetries</h2>
          <p class="mt-3 opacity-70">Patterns of absence, uniformity, sparseness. Each is a brand decision downstream consumers MUST honor.</p>
          <div class="mt-8 grid gap-4 lg:grid-cols-2">
            ${rows}
          </div>
        </div>
      </div>
    </section>`;
}

// ── Public: build the full showcase ────────────────────────────────────

function buildShowcaseHtml(context) {
  const ctx = context || {};
  const tokens = ctx.tokens || {};
  const provenance = ctx.provenance;
  const componentStates = ctx.componentStates;
  const motion = ctx.motion;
  const asymmetryReport = ctx.asymmetryReport;
  const componentProperties = ctx.componentProperties;
  const url = ctx.url || "";
  const brandLabel = ctx.brand || tokens.name || "Brand";

  const themeBlock = emitTailwindTheme(tokens);
  const componentCss = emitComponentClasses({
    componentProperties,
    componentStates,
    motion,
    options: { prefix: "preview" },
  });

  const sections = [
    { id: "section-01-color", label: "01 Color", html: renderPaletteSection(tokens, provenance) },
    { id: "section-02-typography", label: "02 Typography", html: renderTypographySection(tokens) },
    { id: "section-03-motion", label: "03 Motion", html: renderMotionSection(motion) },
    { id: "section-04-states", label: "04 States", html: renderButtonMatrixSection(componentStates) },
    { id: "section-13-asymmetries", label: "13 Signals", html: renderAsymmetriesSection(asymmetryReport) },
  ].filter(Boolean);

  const renderedSections = sections.filter((section) => section.html);
  const navHtml = renderedSections.length > 0
    ? `<nav aria-label="Showcase sections" class="sticky top-0 z-10 border-b px-6 py-3 md:px-12" style="border-color: var(--color-border); background: var(--color-surface);">
        <div class="flex flex-wrap gap-3 font-mono text-[11px] uppercase tracking-[0.14em]">
          ${renderedSections.map((section) => `<a class="opacity-70 hover:opacity-100" href="#${escAttr(section.id)}">${escapeHtml(section.label)}</a>`).join("\n          ")}
        </div>
      </nav>`
    : "";
  const sectionsHtml = renderedSections.length > 0
    ? renderedSections.map((section) => section.html).join("\n")
    : renderExtractionGap("showcase", "no_extracted_sections");

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${escapeHtml(brandLabel)} · Atomic Design Showcase</title>`,
    '  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>',
    themeBlock,
    "  <style>",
    A11Y_FOCUS_CSS,
    A11Y_SKIP_LINK_CSS,
    componentCss,
    "  </style>",
    "</head>",
    `<body style="background: var(--color-surface); color: var(--color-text); -webkit-font-smoothing: antialiased;">`,
    A11Y_SKIP_LINK_HTML,
    '<header class="border-b py-8 px-6 md:px-12" style="border-color: var(--color-border);">',
    '  <div class="mb-6 border px-4 py-3 text-[12px]" style="border-color: var(--color-border);" role="note">Visualization of DESIGN.md tokens. SOT is DESIGN.md.</div>',
    `  <div class="font-mono text-[11px] uppercase tracking-[0.16em] opacity-60">${escapeHtml(url)}</div>`,
    `  <h1 class="mt-2 text-h1 font-semibold">${escapeHtml(brandLabel)} · Atomic Design Showcase</h1>`,
    '  <p class="mt-3 opacity-70 max-w-2xl">Self-contained brand surface — every swatch, specimen, state, and signal traces back to the source CSS. No fallbacks. No invention.</p>',
    "</header>",
    navHtml,
    '<main id="main-content">',
    sectionsHtml,
    "</main>",
    '<footer class="border-t py-8 px-6 md:px-12 text-[12px] opacity-60" style="border-color: var(--color-border);">',
    "  Generated by /design-md — squads/design-ops/scripts/extract-from-url",
    "</footer>",
    "</body>",
    "</html>",
  ].join("\n");
}

const buildTailwindBundle = buildShowcaseHtml;

module.exports = {
  buildShowcaseHtml,
  buildTailwindBundle,
  // exported for tests
  renderPaletteSection,
  renderTypographySection,
  renderButtonMatrixSection,
  renderMotionSection,
  renderAsymmetriesSection,
  escapeHtml,
};
