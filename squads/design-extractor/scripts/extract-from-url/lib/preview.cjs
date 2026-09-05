"use strict";

const fs = require("fs");
const path = require("path");
const {
  flattenColors,
  typographyEntries,
  firstFontFamily,
  buildGoogleFontsHref,
  buildSelfHostedFontFaces,
  scaleBlocks,
  parsePx,
  colorToHex,
  pickComponentTokens,
} = require("./tokens.cjs");
const { resolveCssVar } = require("./extractors.cjs");
const { safeHtml } = require("./utils.cjs");

const assetSvgDataUri = (relativePath) => {
  try {
    const svg = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return "";
  }
};

const AIOX_LOGO_WHITE = assetSvgDataUri("assets/aiox/AIOX-White.svg");
const AIOX_LOGO_BLACK = assetSvgDataUri("assets/aiox/AIOX-Black.svg");
const AIOX_FAVICON = assetSvgDataUri("assets/aiox/icon.svg");

function renderPreview({ url, designMd, tokens, pageCopy, cssMeta, detected, cssVars = [], fontFaces = [], usageGraph = [], extractionLog = null, lintResult = null, favicon = null, qualityScore = null, driftReport = null, breakpoints = [], darkMode = null, logo = null, shadows = [], motion = null, embeddedFonts = {}, agentPrompt = "", stack = [], styleFingerprint = null }) {
  const colors = flattenColors(tokens?.colors);
  const typo = typographyEntries(tokens?.typography);
  const fontFamilies = typo.map((t) => firstFontFamily(t.spec)).filter(Boolean);
  const googleFontsHref = buildGoogleFontsHref(fontFamilies);
  const spacing = scaleBlocks(tokens?.spacing);
  const radii = scaleBlocks(tokens?.rounded);

  // C2 — confidence map per token (read from extraction-log) — declared early because used in swatches
  const confColors = (extractionLog && extractionLog.tokens && extractionLog.tokens.colors) || {};
  const confTypo = (extractionLog && extractionLog.tokens && extractionLog.tokens.typography) || {};
  const confPill = (conf) => {
    const dots = conf === "high" ? "●●●" : conf === "medium" ? "●●○" : conf === "low" ? "●○○" : "○○○";
    const cls = conf === "high" ? "conf-high" : conf === "medium" ? "conf-medium" : conf === "low" ? "conf-low" : "conf-unknown";
    return { dots, cls };
  };

  // S2 — usage count per color in the source CSS (Project Wallace pattern).
  // Each hex token in the DESIGN.md is mapped to how many times it actually appears
  // in the raw CSS. Lets the user spot canonical vs legacy/unused colors.
  const hexUsageMap = (detected.colors && detected.colors.hex_usage) || {};
  const colorUsage = (hex) => {
    if (!hex) return null;
    const norm = String(hex).toLowerCase();
    return typeof hexUsageMap[norm] === "number" ? hexUsageMap[norm] : null;
  };

  const safe = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
  const sourceHost = (() => {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url || "source"; }
  })();
  const brandName = (tokens?.name || sourceHost || "Brand").toString();
  const headingSample = (pageCopy?.heading || `${brandName} design system`).slice(0, 60);
  const bodySample = (pageCopy?.body || `${colors.length} color tokens, ${typo.length} typography entries, ${spacing.length} spacing tokens, ${radii.length} radius tokens and ${cssVars.length} native CSS declarations extracted from ${sourceHost}.`).slice(0, 220);
  const confidenceSummary = (extractionLog && extractionLog.confidence_summary) || {};
  const failedFetches = (cssMeta?.failed || []).length;
  const cssFileCount = (cssMeta?.external || []).length + ((cssMeta?.preload || []).length);
  const detectedSummary = `${colors.length} colors · ${typo.length} type · ${spacing.length} spacing · ${radii.length} radii`;

  // Pick semantic anchors from the palette (fallback for sites without component vars)
  const colorByKey = Object.fromEntries(colors.map((c) => [c.key.toLowerCase(), c.value]));
  const pickColor = (...keys) => {
    for (const k of keys) {
      if (colorByKey[k]) return colorByKey[k];
    }
    return null;
  };

  // Component tokens (preferred when source declares --button-*, --card, etc).
  // First check `preview_tokens:` block in the YAML (LLM-resolved, highest fidelity),
  // then fall back to heuristic CSS var lookup, then fall back to colors.* slots.
  const previewTokens = (tokens && tokens.preview_tokens) || {};
  const comp = pickComponentTokens(cssVars);
  const toHex = (v) => colorToHex(v) || v;

  // Helper: read from preview_tokens first, then heuristic, then colors.*
  const pickToken = (previewKey, heuristicValue, ...colorFallbacks) => {
    if (previewTokens[previewKey]) return toHex(previewTokens[previewKey]);
    if (heuristicValue) return toHex(heuristicValue);
    for (const k of colorFallbacks) {
      const v = colorByKey[k];
      if (v) return toHex(v);
    }
    return null;
  };

  // Semantic resolution — `neutral` in design tokens almost always means a TEXT color
  // (muted gray), NEVER a surface background. Keep the two distinct.
  // surface = canvas / page background (white-ish)
  // card_bg = elevated container — falls back to surface if no dedicated token
  const cSurface = pickToken("surface_bg", comp.surface.base, "surface", "background", "bg") || "#ffffff";
  const cCardBg = pickToken("card_bg", comp.surface.card, "card", "card-bg", "surface-elevated") || cSurface;
  // Legacy alias retained for downstream code paths; defaults to card surface, not the muted gray.
  const cNeutral = cCardBg;

  const cText = pickToken("text", comp.text.base, "text", "foreground", "fg") || "#111111";
  const cTextMuted = pickToken("text_muted", comp.text.muted, "text-muted", "text-secondary", "text-subtle", "muted") || "#666666";
  const cBorder = pickToken("border", comp.border.base, "border", "border-strong") || "#e5e5e5";

  // Theme inheritance — canvas follows the brand: dark brand → dark canvas, light brand → light canvas.
  // Luminance via WCAG-style relative formula (good enough for binary dark/light decision).
  const hexToRgb = (hex) => {
    const h = String(hex || "").replace("#", "").trim();
    if (h.length === 3) return [parseInt(h[0]+h[0],16), parseInt(h[1]+h[1],16), parseInt(h[2]+h[2],16)];
    if (h.length === 6) return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
    return [255,255,255];
  };
  const luminance = (hex) => {
    const [r,g,b] = hexToRgb(hex);
    return (0.2126*r + 0.7152*g + 0.0722*b) / 255;
  };
  const isDarkBrand = luminance(cSurface) < 0.5;
  const themeMode = isDarkBrand ? "dark" : "light";
  // Chrome tokens — derived from the brand surface, not from a fixed AIOX palette.
  const chromeBg = cSurface;
  const chromeFg = cText;
  const chromeMuted = cTextMuted;
  const chromeLine = cBorder;
  // Card surface = subtle elevation off the canvas. Use card_bg if extracted, otherwise mix surface with fg.
  const chromeCard = cCardBg !== cSurface ? cCardBg : (isDarkBrand ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)");
  const chromeCardBorder = isDarkBrand ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";

  const fallbackPrimary = pickColor("primary", "colors.primary", "brand", "accent") || "#000000";
  const fallbackSecondary = pickColor("secondary", "colors.secondary", "ink") || "#222222";
  const cPrimary = pickToken("button_primary_bg", comp.button.primary.bg, "primary", "brand", "accent") || fallbackPrimary;
  const cSecondary = pickToken("button_secondary_bg", comp.button.secondary.bg, "secondary", "ink") || fallbackSecondary;
  const cError = pickColor("error", "colors.error", "danger") || "#d33";
  const cSuccess = pickColor("success", "colors.success") || "#3a7";
  const cAccent = pickToken("accent", null, "accent", "clay", "primary") || cPrimary;

  // Button-specific tokens.
  // Critical: button_primary_text falls back to cSurface (white-ish), NEVER to cNeutral —
  // because `neutral` is a muted gray text color in most token systems, not a button text.
  const btnPrimaryBg = pickToken("button_primary_bg", comp.button.primary.bg) || cPrimary;
  const btnPrimaryText = pickToken("button_primary_text", comp.button.primary.text) || pickColor("on-primary", "primary-text", "white") || "#ffffff";
  const btnPrimaryBorder = pickToken("button_primary_border", comp.button.primary.border) || btnPrimaryBg;
  const btnSecondaryBg = pickToken("button_secondary_bg", comp.button.secondary.bg) || "transparent";
  const btnSecondaryText = pickToken("button_secondary_text", comp.button.secondary.text) || cText;
  const btnSecondaryBorder = pickToken("button_secondary_border", comp.button.secondary.border) || cText;
  const btnTertiaryText = pickToken("button_tertiary_text", comp.button.tertiary.text) || cAccent;

  const radiusByKey = Object.fromEntries(radii.map((r) => [r.key.toLowerCase(), r.px]));
  const pickRadius = (...keys) => {
    for (const k of keys) {
      if (typeof radiusByKey[k] === "number") return radiusByKey[k];
    }
    return null;
  };
  const rSm = pickRadius("sm", "small") ?? 4;
  const rMd = pickRadius("md", "main", "default", "medium") ?? 8;
  const rLg = pickRadius("lg", "large") ?? 12;
  const radiusFull = pickRadius("full", "pill", "round") ?? 9999;

  // Component radii — preview_tokens.{button,card,input}_radius is the highest-fidelity source.
  // Falls back to component-properties most_common (script-extracted), then to scale tier defaults.
  // Range guard: anything 0–9999 is acceptable (0 = square cockpit, 9999 = pill).
  const rBtn = (() => {
    const fromPreview = parsePx(previewTokens.button_radius);
    if (fromPreview !== null && fromPreview >= 0 && fromPreview <= 9999) return fromPreview;
    const fromCss = resolveCssVar(cssVars, "--button--radius") || resolveCssVar(cssVars, "--button-radius");
    const cssPx = fromCss ? parsePx(fromCss) : null;
    if (cssPx !== null && cssPx >= 0 && cssPx <= 9999) return cssPx;
    return rMd;
  })();
  const rCard = (() => {
    const fromPreview = parsePx(previewTokens.card_radius);
    if (fromPreview !== null && fromPreview >= 0 && fromPreview <= 9999) return fromPreview;
    return rMd;
  })();
  const rInput = (() => {
    const fromPreview = parsePx(previewTokens.input_radius);
    if (fromPreview !== null && fromPreview >= 0 && fromPreview <= 9999) return fromPreview;
    return rSm;
  })();

  const headingFont = firstFontFamily(typo.find((t) => /h1|display|title|heading/i.test(t.name))?.spec || {}) || "ui-sans-serif";
  const bodyFont = firstFontFamily(typo.find((t) => /body/i.test(t.name))?.spec || {}) || "ui-sans-serif";
  const monoFont = firstFontFamily(typo.find((t) => /mono|code/i.test(t.name))?.spec || {}) || "ui-monospace";
  // Use single quotes around font names with spaces — they live inside style="..." attributes,
  // so double quotes would terminate the attribute and break all subsequent rules.
  const cssFontHeading = headingFont.includes(" ") ? `'${headingFont}'` : headingFont;
  const cssFontBody = bodyFont.includes(" ") ? `'${bodyFont}'` : bodyFont;
  const cssFontMono = monoFont.includes(" ") ? `'${monoFont}'` : monoFont;

  // Annotate each color with its CSS usage count so we can sort / display
  const colorsWithUsage = colors.map(c => ({ ...c, usage: colorUsage(c.value) ?? 0 }));
  const colorsSorted = [...colorsWithUsage].sort((a, b) => b.usage - a.usage);

  const colorSwatches = colorsSorted
    .map(({ key, value, usage }) => {
      const cleanKey = key.replace(/^colors\./, "");
      const confEntry = confColors[cleanKey] || confColors[key] || null;
      const conf = confEntry ? confEntry.confidence : null;
      const pill = confPill(conf);
      const tooltip = confEntry
        ? `${conf} confidence — ${confEntry.source}${confEntry.origin ? " (" + confEntry.origin + ")" : ""} · ${usage > 0 ? `used ${usage}× in CSS` : "not directly referenced"}`
        : `${usage > 0 ? `used ${usage}× in CSS` : "no provenance"}`;
      const usageLabel = usage > 0 ? `${usage}×` : "—";
      const usageClass = usage >= 20 ? "use-hot" : usage >= 5 ? "use-warm" : usage > 0 ? "use-cold" : "use-zero";
      return `
      <button class="swatch" data-copy="${safe(value)}" title="${safe(tooltip)}">
        <div class="swatch-fill" style="background:${safe(value)}"></div>
        <div class="swatch-meta">
          <div class="swatch-key">${safe(key)} <span class="conf-dot ${pill.cls}" title="${safe(tooltip)}">${pill.dots}</span></div>
          <div class="swatch-val">${safe(value)} <span class="swatch-usage ${usageClass}">${safe(usageLabel)}</span></div>
        </div>
      </button>`;
    })
    .join("");

  const typoSpecimens = typo
    .map(({ name, spec }) => {
      const family = firstFontFamily(spec);
      const sample =
        /h1|display|title|heading/i.test(name)
          ? headingSample
          : bodySample;
      const styleStr = `font-family:${family.includes(" ") ? `'${family}'` : family}, sans-serif;`
        + (spec.fontSize ? `font-size:${spec.fontSize};` : "")
        + (spec.fontWeight ? `font-weight:${spec.fontWeight};` : "")
        + (spec.lineHeight ? `line-height:${spec.lineHeight};` : "")
        + (spec.letterSpacing ? `letter-spacing:${spec.letterSpacing};` : "");
      // Aggregate confidence across the entry's properties (worst wins)
      const props = (confTypo[name] && confTypo[name].properties) || {};
      const propConfs = Object.values(props).map((p) => p.confidence);
      const aggConf = propConfs.includes("low") ? "low" : propConfs.includes("medium") ? "medium" : propConfs.length ? "high" : null;
      const pill = confPill(aggConf);
      const tooltip = aggConf
        ? `${aggConf} confidence (${propConfs.length} properties) — hover individual specs for source`
        : "no provenance";
      return `
      <div class="type-row">
        <div class="type-label">
          <span class="chip">${safe(name)} <span class="conf-dot ${pill.cls}" title="${safe(tooltip)}">${pill.dots}</span></span>
          <span class="dim">${safe(family)} · ${safe(spec.fontWeight ?? "")} · ${safe(spec.fontSize ?? "")}</span>
        </div>
        <div class="type-sample" style="${styleStr}">${safe(sample)}</div>
      </div>`;
    })
    .join("");

  // Cap visualization at 96px so a single huge token (e.g. spacing.xxl=256px) doesn't
  // flatten the rest of the scale into invisible nubs. The label still shows the real px.
  const spacingDisplayMax = Math.min(96, Math.max(1, ...spacing.map((s) => s.px)));
  const spacingRows = spacing
    .map(({ key, px }) => {
      const width = Math.max(Math.min(px, spacingDisplayMax) / spacingDisplayMax * 100, 3);
      return `<div class="scale-ladder-row" data-copy="${px}px"><span class="scale-key">${safe(key)}</span><span class="scale-track"><i style="width:${width}%"></i></span><span class="scale-val">${px}px</span></div>`;
    })
    .join("");

  // Cap radius visualization at 32px (full/round becomes a circle preview cap)
  const radiusCells = radii
    .map(({ key, px }) => {
      const visual = Math.min(px, 32);
      const label = px >= 9999 ? "full" : `${px}px`;
      return `<div class="radius-row" data-copy="${px}px"><span class="radius-key">${safe(key)}</span><span class="radius-sample" style="border-radius:${visual}px"></span><span class="radius-val">${label}</span></div>`;
    })
    .join("");

  // Embed tokens.json + raw DESIGN.md for client-side export buttons
  const tokensJson = JSON.stringify(tokens || {});
  const colorListJson = JSON.stringify(colors);
  const designMdJson = JSON.stringify(designMd);
  const designMdFileName = `${(tokens?.name || "design").toString().toLowerCase().replace(/[^a-z0-9]+/g, "-")}.full.md`;
  const designMdCharCount = new Intl.NumberFormat("pt-BR").format((designMd || "").length);
  const designMdLines = (designMd || "").split("\n").map((line, index) => {
    const n = String(index + 1).padStart(2, "0");
    return `<div class="raw-code-line"><span class="raw-line-no">${n}</span><span class="raw-line-text">${line ? safe(line) : "&nbsp;"}</span></div>`;
  }).join("");
  const faviconSrc = favicon?.sourceUrl || favicon?.dataUrl || "";
  const logoSrc = logo?.sourceUrl || logo?.dataUrl || "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${safe(brandName)} — DESIGN.md Preview</title>
${AIOX_FAVICON ? `<link rel="icon" type="image/svg+xml" href="${AIOX_FAVICON}" />` : ""}
${googleFontsHref ? `<link rel="stylesheet" href="${safe(googleFontsHref)}" />` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500;600&display=swap" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism.min.css" />
${(() => {
  const selfHostedBlock = buildSelfHostedFontFaces(fontFaces, url, fontFamilies, embeddedFonts);
  return selfHostedBlock ? `<style>${selfHostedBlock}</style>` : "";
})()}
<style>
  /* AIOX detail chrome. Stage da marca extraída (preview-hero/stage/ds-*/kpi-tile)
     usa cores da marca via inline style, mas a página segue o apps/design. */
  :root {
    --bg:#050505;
    --fg:rgb(244,244,232);
    --fg-strong:rgb(244,244,232);
    --dim:rgba(245,244,231,0.40);
    --dim-soft:rgba(244,244,232,0.70);
    --line:rgba(156,156,156,0.15);
    --line-strong:rgba(156,156,156,0.25);
    --accent:${safe(cAccent || cPrimary || "#D1FF00")};
    --aiox-lime:#D1FF00;
    --accent-text:var(--aiox-lime);
    --accent-soft:rgba(209,255,0,0.08);
    --accent-glow:rgba(209,255,0,0.18);
    --surface:#0F0F11;
    --surface-alt:#18181B;
    --surface-deep:#0A0A0C;
    --preview-content-width:1180px;
  }
  body[data-theme="dark"]{color-scheme:dark}
  body[data-theme="light"]{color-scheme:light}
  *{box-sizing:border-box}
  html{background:#050505;scroll-behavior:smooth}
  body{margin:0;background:#050505;color:rgb(244,244,232);font-family:"Geist",ui-sans-serif,system-ui,-apple-system,sans-serif;padding:0;line-height:1.55;-webkit-font-smoothing:antialiased;font-feature-settings:"ss01" 1,"cv11" 1;counter-reset:section;min-height:100vh}
  /* Centered shell — apps/design wrapper. Content max-width with side gutters. */
  .preview-shell{max-width:1400px;margin:0 auto;padding:0 24px 96px;background:#050505;color:rgb(244,244,232);display:flex;flex-direction:column}
  @media (max-width:840px){.preview-shell{padding:0 14px 56px}}
  /* Hero — DESIGN.MD INSPIRED BY · {brand} */
  header{display:flex;flex-direction:column;gap:18px;width:100%;max-width:var(--preview-content-width);margin:0 auto 38px;padding:0 0 28px;border-bottom:1px solid rgba(156,156,156,0.15);background:#050505;color:rgb(244,244,232)}
  .hero-eyebrow{font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:0.2em;color:rgba(245,244,231,0.40)}
  .header-identity{display:flex;align-items:center;gap:20px;flex-wrap:wrap}
  .favicon{width:56px;height:56px;border:1px solid var(--line);background:var(--surface);flex-shrink:0;object-fit:contain;padding:8px}
  .favicon-placeholder{width:56px;height:56px;border:1px dashed var(--line);flex-shrink:0}
  .header-text{flex:1;min-width:0}
  .brand-name{display:none}
  h1{font-family:"Geist",sans-serif;font-size:clamp(56px,8vw,128px);font-weight:800;letter-spacing:-0.055em;line-height:0.9;margin:0;text-transform:uppercase;color:rgb(244,244,232);overflow-wrap:break-word}
  .subtitle{color:rgba(245,244,231,0.40);font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;margin-top:4px}
  .subtitle a{color:var(--accent-text);text-decoration:none;border-bottom:1px solid var(--line);padding-bottom:1px}
  .subtitle a:hover{color:var(--fg);border-bottom-color:var(--accent-text)}
  .preview-tabs{width:100%;max-width:var(--preview-content-width);margin:0 auto;display:flex;align-items:center;gap:0;overflow-x:auto;border-bottom:1px solid rgba(156,156,156,0.15);font-family:"Geist Mono",ui-monospace,monospace;background:#050505}
  .preview-tab{height:46px;padding:0 20px;display:inline-flex;align-items:center;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dim-soft);font:inherit;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;white-space:nowrap;text-decoration:none}
  .preview-tab:hover{color:var(--fg);border-bottom-color:rgba(244,244,232,0.35)}
  .preview-tab-active{border-bottom-color:var(--accent-text);color:var(--accent-text)}
  .preview-tab-dot{margin-left:8px;color:var(--accent-text);font-size:8px}
  .scroll-anchor{height:1px;scroll-margin-top:18px}
  header{order:0}
  .preview-tabs{order:1}
  #tokens{order:2}
  #typography{order:3}
  #component{order:4}
  #components{order:5}
  #wcag{order:70}
  #design-md{order:80}
  .technical-meta-section,.lint-section,.drift-section,.fontface-section,.token-usage-section,.native-css-section{order:90}
  #technical-details{order:100}

  /* Sections — apps/design SectionHead pattern: [NN]LABEL_ rail + display heading. */
  section{
    --fg:#111111;--fg-strong:#111111;--dim:rgba(17,17,17,0.45);--dim-soft:rgba(17,17,17,0.65);
    --line:rgba(17,17,17,0.12);--line-strong:rgba(17,17,17,0.22);
    --surface:#FFFFFF;--surface-alt:#F5F4EE;--surface-deep:#F7F6F0;--accent:#111111;--accent-text:#111111;--accent-soft:rgba(17,17,17,0.05);--accent-glow:transparent;
    width:100%;max-width:var(--preview-content-width);margin:0 auto;padding:56px 56px 56px 152px;background:#FAF9F4;color:var(--fg);
    border-top:1px solid var(--line);border-left:1px solid var(--line);border-right:1px solid var(--line);
    position:relative;scroll-margin-top:18px;order:10;
  }
  section:first-of-type{border-top:1px solid var(--line);margin-top:0}
  section:last-of-type{border-bottom:1px solid var(--line)}
  section::before{content:attr(data-section-index);position:absolute;left:44px;top:62px;width:78px;font-family:"Geist Mono",ui-monospace,monospace;font-size:12px;font-weight:500;line-height:1;letter-spacing:0.14em;text-transform:uppercase;color:rgba(17,17,17,0.42);margin:0}
  section h2{font-family:"Geist",sans-serif;font-size:clamp(30px,3.1vw,42px);font-weight:800;letter-spacing:-0.04em;color:var(--fg);text-transform:none;border:none;padding:0;margin:0 0 28px;position:static;line-height:0.98}
  section h2::before{content:none}
  @media (max-width:840px){
    header{margin-left:0}
    section{padding:84px 20px 40px;max-width:none}
    section::before{left:20px;top:28px;width:auto}
  }

  /* Scale ladders — compact apps/design-style rows for scalar tokens. */
  .scale-ladder{border:1px solid var(--line);background:var(--surface);display:flex;flex-direction:column}
  .scale-ladder-row{display:grid;grid-template-columns:90px minmax(120px,1fr) 72px;align-items:center;gap:18px;min-height:42px;padding:0 18px;border-bottom:1px solid var(--line);cursor:pointer;color:var(--fg)}
  .scale-ladder-row:last-child{border-bottom:0}
  .scale-ladder-row:hover{background:var(--surface-deep)}
  .scale-key,.scale-val,.radius-key,.radius-val{font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;font-weight:600;letter-spacing:0.12em;color:var(--dim)}
  .scale-key,.radius-key{text-transform:uppercase}
  .scale-val,.radius-val{text-align:right;color:var(--fg)}
  .scale-track{height:14px;background:var(--surface-deep);border:1px solid var(--line);display:block;position:relative;overflow:hidden}
  .scale-track i{display:block;height:100%;min-width:3px;background:var(--fg)}
  .radius-list{border:1px solid var(--line);background:var(--surface);display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
  .radius-row{display:grid;grid-template-columns:90px 1fr 72px;align-items:center;gap:18px;min-height:56px;padding:0 18px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);cursor:pointer}
  .radius-row:nth-child(2n){border-right:0}
  .radius-row:hover{background:var(--surface-deep)}
  .radius-sample{width:42px;height:28px;border:1px solid var(--fg);background:var(--surface-deep);justify-self:start}
  @media (max-width:720px){.scale-ladder-row,.radius-row{grid-template-columns:68px 1fr 56px;gap:12px;padding:0 12px}.radius-list{grid-template-columns:1fr}.radius-row{border-right:0}}
  .name-pill{display:inline-block;background:var(--accent);color:var(--bg);font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.14em;padding:5px 12px;margin-bottom:16px}
  .swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px}
  .swatch{display:flex;flex-direction:column;border:1px solid var(--line);background:var(--surface);cursor:pointer;font:inherit;text-align:left;padding:0;transition:border-color .15s,transform .12s;color:inherit;overflow:hidden}
  .swatch:hover{border-color:var(--accent);transform:translateY(-1px)}
  .swatch-fill{height:84px;border-bottom:1px solid var(--line)}
  .swatch-meta{padding:10px 12px}
  .swatch-key{font-family:"Geist Mono",ui-monospace,monospace;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.12em;color:var(--dim);margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .swatch-val{font-family:"Geist Mono",ui-monospace,monospace;font-size:12px;font-weight:600;color:var(--fg)}
  .type-row{display:flex;flex-direction:column;gap:10px;border-left:2px solid var(--accent);padding-left:18px;padding-block:6px;margin-bottom:28px}
  .type-label{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
  .chip{font-family:"Geist Mono",ui-monospace,monospace;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;background:var(--surface);border:1px solid var(--line);color:var(--fg);padding:3px 9px}
  .dim{color:var(--dim);font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;letter-spacing:0.06em}
  .type-sample{word-break:break-word;color:var(--fg-strong)}
  pre{background:var(--surface-deep);border:1px solid var(--line);color:var(--fg);padding:20px;overflow:auto;font-size:13px;line-height:1.6;max-height:600px;font-family:"Geist Mono",ui-monospace,monospace}
  details{border:1px solid var(--line);background:var(--surface);padding:14px 18px;margin-top:16px;border-radius:2px}
  details[open]{border-color:var(--line-strong)}
  details summary{cursor:pointer;font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.14em;color:var(--accent);outline:none}
  details summary::marker{color:var(--accent)}
  .empty{color:var(--dim);font-family:"Geist Mono",ui-monospace,monospace;font-size:12px;font-style:italic}
  .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--bg);color:var(--accent);font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.14em;padding:10px 18px;border:1px solid var(--accent);box-shadow:0 0 24px var(--accent-glow);opacity:0;pointer-events:none;transition:opacity .2s;z-index:9999}
  .toast.show{opacity:1}
  .meta-grid{display:grid;grid-template-columns:auto 1fr;gap:8px 18px;font-family:"Geist Mono",ui-monospace,monospace;font-size:12px;color:var(--fg)}
  .meta-grid dt{color:var(--accent);text-transform:uppercase;letter-spacing:0.12em;font-weight:600;font-size:10px}
  .meta-grid dd{margin:0;word-break:break-all;color:var(--dim-soft)}
  a{color:var(--fg);text-decoration:none;border-bottom:1px dashed var(--line)}
  a:hover{color:var(--accent);border-bottom-color:var(--accent)}

  /* Component preview (live tokens) — token-source banner */
  .preview-token-source{font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;color:var(--dim);margin-bottom:14px;background:var(--surface-deep);border:1px solid var(--line);padding:10px 14px;overflow-wrap:break-word}
  .preview-token-source code{background:var(--accent-soft);border:1px solid var(--line);color:var(--accent);padding:1px 6px;font-size:10px;border-radius:2px}

  /* Hero zone — full-width brand showcase */
  .preview-hero{padding:48px 40px 56px;border:1px solid var(--line);margin-bottom:0;display:flex;flex-direction:column;gap:16px;align-items:flex-start;overflow:hidden}
  .hero-eyebrow{font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase}
  .hero-display{font-size:clamp(32px,5vw,56px);font-weight:600;line-height:1.05;margin:0;max-width:80%;overflow-wrap:break-word}
  .hero-lead{font-size:16px;line-height:1.5;margin:0;max-width:600px;overflow-wrap:break-word}
  .hero-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px}

  .preview-stage{border:1px solid var(--line);border-top:0;padding:32px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:32px 40px}
  @media (max-width:720px){.preview-stage{grid-template-columns:1fr}}
  .preview-card{display:flex;flex-direction:column;gap:12px;align-items:flex-start;min-width:0;overflow:hidden}
  .preview-card-wide{grid-column:1/-1}
  .preview-card>*{max-width:100%}
  .preview-card h4{margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--dim);font-family:ui-monospace,monospace}

  .ds-btn{display:inline-flex;align-items:center;justify-content:center;padding:12px 24px;font-weight:500;font-size:14px;cursor:pointer;text-decoration:none;font-family:inherit;line-height:1.2;transition:opacity .15s,transform .12s;max-width:100%;white-space:nowrap}
  .ds-btn:hover{opacity:0.92;transform:translateY(-1px)}
  .ds-btn-large{padding:14px 28px;font-size:15px;font-weight:600}

  .ds-card{padding:24px;display:flex;flex-direction:column;gap:10px;width:100%;min-width:0;overflow-wrap:break-word;word-break:break-word}
  .ds-card-editorial{padding:28px;gap:14px}
  .card-eyebrow{font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase}
  .ds-card-title{font-weight:400;font-size:24px;line-height:1.15;overflow-wrap:break-word;hyphens:auto;margin:0}
  .ds-card-body{font-size:14px;line-height:1.55;overflow-wrap:break-word;margin:0}
  .card-meta{display:flex;align-items:center;gap:10px;font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px}
  .meta-dot{display:inline-block;width:3px;height:3px;border-radius:50%}
  .card-cta-row{display:flex;gap:14px;align-items:center;margin-top:8px}

  .ds-input{width:100%;padding:12px 14px;font-size:14px;font-family:inherit;box-sizing:border-box}
  .ds-badge{display:inline-flex;align-items:center;padding:5px 14px;font-size:11px;font-weight:600;font-family:inherit;letter-spacing:0.02em;line-height:1.2;white-space:nowrap}
  .ds-alert{padding:14px 18px;display:flex;gap:10px;align-items:flex-start;font-size:13px;width:100%;overflow-wrap:break-word;line-height:1.5}
  .ds-alert>*{min-width:0}

  /* KPI tile */
  .kpi-tile{padding:24px;display:flex;flex-direction:column;gap:6px;width:100%}
  .kpi-label{font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase}
  .kpi-value{font-size:42px;font-weight:600;line-height:1;letter-spacing:-0.02em;margin:4px 0 6px}
  .kpi-trend{font-size:12px;font-weight:600}

  /* Code block */
  .ds-code{padding:18px;font-size:13px;line-height:1.6;width:100%;overflow:auto;margin:0;white-space:pre}

  /* DESIGN.md raw viewer — apps/design dark code window */
  .raw-md-frame{background:#050505;border:1px solid rgba(156,156,156,0.24);color:rgb(244,244,232);overflow:hidden}
  .raw-md-titlebar{height:54px;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:0 18px;border-bottom:1px solid rgba(156,156,156,0.18);background:#0B0B0D;font-family:"Geist Mono",ui-monospace,monospace}
  .raw-md-file{display:flex;align-items:center;gap:12px;min-width:0;color:rgba(244,244,232,0.72);font-size:12px;letter-spacing:0.04em}
  .raw-md-lights{display:inline-flex;gap:7px;flex-shrink:0}
  .raw-md-lights i{width:10px;height:10px;border-radius:50%;display:block}
  .raw-md-lights i:nth-child(1){background:#ff5f57}
  .raw-md-lights i:nth-child(2){background:#ffbd2e}
  .raw-md-lights i:nth-child(3){background:#28c840}
  .raw-md-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .raw-md-actions{display:flex;align-items:center;gap:16px;flex-shrink:0}
  .raw-md-count{font-size:11px;color:rgba(245,244,231,0.35);letter-spacing:0.08em;white-space:nowrap}
  .raw-md-copy{height:34px;padding:0 14px;border:1px solid rgba(156,156,156,0.24);background:transparent;color:rgb(244,244,232);font-family:"Geist Mono",ui-monospace,monospace;font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;cursor:pointer}
  .raw-md-copy:hover{border-color:#D1FF00;color:#D1FF00}
  .raw-md-code{margin:0;max-height:760px;overflow:auto;background:#050505;color:rgba(244,244,232,0.72);font-family:"Geist Mono",ui-monospace,monospace;font-size:13px;line-height:1.75;padding:28px 0;white-space:normal}
  .raw-code-line{display:grid;grid-template-columns:58px minmax(0,1fr);gap:18px;padding:0 28px 0 0}
  .raw-code-line:hover{background:rgba(209,255,0,0.035)}
  .raw-line-no{color:rgba(245,244,231,0.28);text-align:right;user-select:none}
  .raw-line-text{white-space:pre-wrap;overflow-wrap:anywhere;color:rgba(244,244,232,0.76)}
  @media (max-width:720px){.raw-md-titlebar{align-items:flex-start;height:auto;padding:14px;flex-direction:column}.raw-md-actions{width:100%;justify-content:space-between}.raw-code-line{grid-template-columns:42px minmax(0,1fr);gap:12px;padding-right:14px}}

  /* Type hierarchy stack */
  .hierarchy-stack{display:flex;flex-direction:column;gap:14px;width:100%}
  .h-eyebrow{font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase}
  .h-display{font-size:clamp(28px,4vw,44px);font-weight:600;line-height:1.1;margin:0}
  .h-body{font-size:15px;line-height:1.6;margin:0}

  /* WCAG contrast matrix */
  .matrix-wrap{overflow:auto;border:1px solid var(--line);background:var(--surface)}
  table.matrix{border-collapse:collapse;font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;color:var(--fg)}
  table.matrix th,table.matrix td{border:1px solid var(--line);padding:5px 8px;text-align:center;min-width:64px}
  table.matrix thead th{background:var(--surface-deep);color:var(--accent);font-weight:600;text-transform:uppercase;letter-spacing:0.12em;font-size:10px;position:sticky;top:0}
  table.matrix tbody th{background:var(--surface-deep);color:var(--accent);text-align:left;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;font-size:10px;position:sticky;left:0;z-index:1}
  td.cm-cell{cursor:help;font-weight:600}
  td.cm-fail{background:rgba(239,68,68,0.15);color:#fca5a5}
  td.cm-aa{background:rgba(245,158,11,0.15);color:#fcd34d}
  td.cm-aaa{background:rgba(34,197,94,0.15);color:#86efac}
  .matrix-legend{display:flex;gap:18px;font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;color:var(--dim);margin-top:14px;flex-wrap:wrap;letter-spacing:0.06em}
  .matrix-legend span{display:inline-flex;align-items:center;gap:6px}
  .matrix-legend i{display:inline-block;width:12px;height:12px;border:1px solid var(--line)}

  /* Export buttons — apps/design pattern: borderless mono uppercase, accent on hover. */
  .export-row{display:flex;flex-wrap:wrap;gap:32px 28px;align-items:center}
  .export-btn{display:inline-flex;align-items:center;gap:6px;background:transparent;border:0;color:var(--fg);padding:0;font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.16em;cursor:pointer;transition:color .15s;text-decoration:none}
  .export-btn:hover{color:var(--dim)}
  .export-btn-primary{color:var(--fg);font-size:11px;letter-spacing:0.16em}
  .export-btn-primary:hover{color:var(--dim)}

  /* Technical section (collapsed by default) */
  .technical-section{margin-top:72px}
  .technical-section>details{border:1px dashed var(--line);background:transparent;padding:0}
  .technical-section>details>summary{padding:14px 18px;cursor:pointer;font-family:"Geist Mono",ui-monospace,monospace;color:var(--dim);text-transform:uppercase;letter-spacing:0.14em;list-style:none;font-size:10px}
  .technical-section>details>summary::before{content:"▸ ";color:var(--accent)}
  .technical-section>details[open]>summary::before{content:"▾ "}
  .technical-section>details>summary h2{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.2em;color:var(--dim);border:none;padding:0;display:inline-block;margin:0}
  .technical-section>details>summary h2::before{content:none}
  .technical-section>details>summary:hover h2{color:var(--accent)}
  .tech-content{padding:12px 18px 28px;border-top:1px dashed var(--line)}
  .tech-content h3{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.18em;color:var(--accent);font-family:"Geist Mono",ui-monospace,monospace;margin:28px 0 14px;padding-bottom:8px;border-bottom:1px solid var(--line)}
  .tech-content h3:first-child{margin-top:8px}

  /* B1 — CSS vars table */
  .vars-table-wrap{overflow:auto;border:1px solid var(--line);background:var(--surface);max-height:480px}
  table.vars-table{border-collapse:collapse;width:100%;font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;color:var(--fg)}
  table.vars-table th,table.vars-table td{border-bottom:1px solid var(--line);padding:7px 12px;text-align:left;vertical-align:top}
  table.vars-table thead th{background:var(--surface-deep);color:var(--accent);font-weight:600;text-transform:uppercase;letter-spacing:0.12em;position:sticky;top:0;font-size:10px}
  table.vars-table tbody tr{cursor:pointer;transition:background .12s}
  table.vars-table tbody tr:hover{background:var(--accent-soft)}
  .var-row.is-alias{display:none}
  body.show-aliases .var-row.is-alias{display:table-row;opacity:0.55}
  .pill-prim{color:#86efac;font-weight:600}
  .pill-alias{color:#fcd34d}
  .show-aliases-toggle{display:inline-flex;align-items:center;gap:6px;font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:var(--dim);margin-top:12px;cursor:pointer}
  .dim-label{color:var(--dim);text-transform:uppercase;letter-spacing:0.12em;font-weight:600;font-style:italic}

  /* B2 — @font-face cards */
  .fontface-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
  .fontface-card{border:1px solid var(--line);background:var(--surface);padding:16px;color:var(--fg)}
  .fontface-family{font-weight:700;font-size:14px;letter-spacing:-0.01em;color:var(--fg-strong)}
  .url-line{font-family:"Geist Mono",ui-monospace,monospace;font-size:10px;word-break:break-all;color:var(--dim);margin-top:6px;letter-spacing:0.04em}

  /* B3 — Usage graph */
  .usage-grid{display:flex;flex-direction:column;gap:5px;border:1px solid var(--line);background:var(--surface);padding:16px;max-height:420px;overflow:auto}
  .usage-row{display:grid;grid-template-columns:minmax(180px,30%) 1fr auto;gap:14px;align-items:center}
  .usage-name{font-size:11px;font-weight:600;color:var(--fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:"Geist Mono",ui-monospace,monospace}
  .usage-bar{display:inline-block;height:8px;background:var(--accent);min-width:1px;box-shadow:0 0 8px var(--accent-glow)}
  .usage-count{font-size:10px;color:var(--dim);font-family:"Geist Mono",ui-monospace,monospace;letter-spacing:0.06em}
  .mono{font-family:"Geist Mono",ui-monospace,monospace}

  /* C2 — confidence dots */
  .conf-dot{display:inline-block;font-family:"Geist Mono",ui-monospace,monospace;font-size:8px;letter-spacing:1px;margin-left:6px;vertical-align:middle;cursor:help}
  .conf-high{color:#86efac}
  .conf-medium{color:#fcd34d}
  .conf-low{color:#fca5a5}
  .conf-unknown{color:var(--dim)}

  /* A3 + C2 — header badges */
  .header-badges{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  .badge{display:inline-flex;align-items:center;gap:4px;font-family:"Geist Mono",ui-monospace,monospace;font-size:10px;font-weight:600;padding:4px 10px;border:1px solid var(--line);text-transform:uppercase;letter-spacing:0.12em;color:var(--fg);background:var(--surface)}
  .badge-pass{background:rgba(34,197,94,0.12);color:#86efac;border-color:rgba(34,197,94,0.35)}
  .badge-warn{background:rgba(245,158,11,0.12);color:#fcd34d;border-color:rgba(245,158,11,0.35)}
  .badge-fail{background:rgba(239,68,68,0.12);color:#fca5a5;border-color:rgba(239,68,68,0.35)}
  .badge-skip{background:var(--surface-deep);color:var(--dim);border-color:var(--line)}
  .badge-conf-high{background:rgba(34,197,94,0.12);color:#86efac;border-color:rgba(34,197,94,0.35);text-transform:none;letter-spacing:0.04em}
  .badge-conf-medium{background:rgba(245,158,11,0.12);color:#fcd34d;border-color:rgba(245,158,11,0.35);text-transform:none;letter-spacing:0.04em}
  .badge-conf-low{background:rgba(239,68,68,0.12);color:#fca5a5;border-color:rgba(239,68,68,0.35);text-transform:none;letter-spacing:0.04em}

  /* S2 — usage count badge on swatches */
  .swatch-usage{display:inline-block;font-family:"Geist Mono",ui-monospace,monospace;font-size:9px;font-weight:600;padding:1px 6px;margin-left:4px;border-radius:2px;letter-spacing:0.04em}
  .use-hot{background:var(--accent);color:var(--bg)}
  .use-warm{background:rgba(245,158,11,0.20);color:#fcd34d}
  .use-cold{background:var(--surface-deep);color:var(--fg)}
  .use-zero{background:transparent;color:var(--dim);border:1px dashed var(--line)}

  /* A2 — Quality score card */
  .quality-score{display:grid;grid-template-columns:150px 1fr;gap:28px;align-items:start;background:var(--surface);border:1px solid var(--line);padding:28px;margin-bottom:0;position:relative;max-width:100%}
  .score-grade-block{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding-right:22px;border-right:1px dashed var(--line);min-width:0;height:100%}
  .score-grade{font-family:"Geist",sans-serif;font-size:78px;font-weight:800;line-height:0.92;letter-spacing:-0.06em}
  .score-grade-A{color:#86efac;text-shadow:0 0 24px rgba(134,239,172,0.30)}
  .score-grade-B{color:#bef264;text-shadow:0 0 24px rgba(190,242,100,0.25)}
  .score-grade-C{color:#fcd34d;text-shadow:0 0 24px rgba(252,211,77,0.25)}
  .score-grade-D{color:#fdba74;text-shadow:0 0 24px rgba(253,186,116,0.25)}
  .score-grade-F{color:#fca5a5;text-shadow:0 0 24px rgba(252,165,165,0.30)}
  .score-overall{font-family:"Geist Mono",ui-monospace,monospace;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.18em;color:var(--accent)}
  .score-categories{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .cat-row{display:flex;flex-direction:column;gap:4px;padding:12px 14px;border:1px solid var(--line);background:var(--surface-deep);min-width:0}
  .cat-name{font-family:"Geist Mono",ui-monospace,monospace;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.14em;color:var(--dim)}
  .cat-grade-row{display:flex;align-items:baseline;gap:8px}
  .cat-grade{font-family:"Geist",sans-serif;font-size:24px;font-weight:800;line-height:1}
  .cat-num{font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;color:var(--dim)}
  .cat-value{font-family:"Geist Mono",ui-monospace,monospace;font-size:10px;color:var(--dim);letter-spacing:0.04em}
  .cat-ideal{font-family:"Geist Mono",ui-monospace,monospace;font-size:9px;color:var(--dim);font-style:italic;letter-spacing:0.04em}

  /* A1 — Drift report */
  .drift-section{background:transparent;border:0;padding:0;margin-bottom:0}
  .drift-verdict{display:inline-flex;align-items:center;gap:8px;font-family:"Geist Mono",ui-monospace,monospace;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.18em;padding:8px 16px;border:1px solid var(--line);margin-bottom:20px}
  .verdict-in-sync{background:rgba(34,197,94,0.12);color:#86efac;border-color:rgba(34,197,94,0.35)}
  .verdict-minor-drift{background:rgba(245,158,11,0.12);color:#fcd34d;border-color:rgba(245,158,11,0.35)}
  .verdict-notable-drift{background:rgba(253,186,116,0.12);color:#fdba74;border-color:rgba(253,186,116,0.35)}
  .verdict-major-drift{background:rgba(239,68,68,0.20);color:#fca5a5;border-color:rgba(239,68,68,0.45)}
  .drift-summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:18px}
  .drift-stat{padding:12px;border:1px solid var(--line);background:var(--surface-deep);font-family:"Geist Mono",ui-monospace,monospace}
  .drift-stat-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.14em;color:var(--dim)}
  .drift-stat-value{font-family:"Geist",sans-serif;font-size:24px;font-weight:800;margin-top:6px;color:var(--fg-strong);letter-spacing:-0.02em}
  .drift-table{border-collapse:collapse;width:100%;font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;margin-top:14px;color:var(--fg)}
  .drift-table th,.drift-table td{padding:7px 12px;border-bottom:1px solid var(--line);text-align:left}
  .drift-table th{background:var(--surface-deep);color:var(--accent);text-transform:uppercase;letter-spacing:0.14em;font-size:10px;font-weight:600}
  .drift-swatch{display:inline-block;width:14px;height:14px;border:1px solid var(--line);vertical-align:middle;margin-right:6px}

  /* S1 — Breakpoints */
  .breakpoints-row{display:flex;gap:8px;flex-wrap:wrap}
  .breakpoint-chip{font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;font-weight:600;background:var(--surface);border:1px solid var(--line);color:var(--fg);padding:5px 12px;letter-spacing:0.06em}
  .breakpoint-chip span{color:var(--dim);font-weight:400;margin-left:4px}

  /* S3/S4 — Dark mode toggle + indicator */
  .dark-toggle{display:inline-flex;align-items:center;gap:6px;background:var(--surface);color:var(--accent);border:1px solid var(--accent);padding:6px 14px;cursor:pointer;font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.14em;transition:background .15s,color .15s}
  .dark-toggle:hover{background:var(--accent);color:var(--bg)}
  .dark-indicator{display:inline-flex;align-items:center;gap:4px;font-family:"Geist Mono",ui-monospace,monospace;font-size:10px;color:var(--dim);letter-spacing:0.1em}

  /* E1 — Logo display */
  .logo-display{display:flex;flex-direction:column;align-items:center;gap:24px;padding:56px 24px;border:1px solid var(--line);background:var(--surface);position:relative}
  .logo-display::before,.logo-display::after{content:"";position:absolute;width:10px;height:10px;border:1px solid var(--accent)}
  .logo-display::before{top:0;left:0;border-right:0;border-bottom:0}
  .logo-display::after{bottom:0;right:0;border-left:0;border-top:0}
  .logo-img{max-width:300px;max-height:120px;object-fit:contain}
  .logo-inline-svg{display:flex;align-items:center;justify-content:center;width:300px;height:120px;color:var(--fg)}
  .logo-inline-svg svg{max-width:100%;max-height:100%;width:auto;height:auto;fill:currentColor}
  .logo-meta{display:flex;flex-wrap:wrap;gap:20px;font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;color:var(--dim);justify-content:center;letter-spacing:0.06em}
  .logo-meta-item{display:inline-flex;gap:6px;align-items:center}
  .logo-meta-label{font-weight:600;text-transform:uppercase;letter-spacing:0.14em;color:var(--accent)}
  .logo-meta a{color:var(--dim);word-break:break-all;border-bottom-color:var(--line)}

  /* D6 — Component variants matrix */
  .variant-matrix{padding:28px;border:1px solid var(--line);background:var(--surface);overflow:auto}
  table.variant-table{border-collapse:separate;border-spacing:0 12px;width:100%}
  .variant-table th{font-family:"Geist Mono",ui-monospace,monospace;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.18em;color:var(--accent);text-align:center;padding:6px 12px;border-bottom:1px solid var(--line)}
  .variant-table th:first-child{text-align:left}
  .variant-table td{padding:8px 12px;text-align:center;vertical-align:middle}
  .variant-row-label{font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;font-weight:600;text-align:left !important;color:var(--dim);padding-right:24px !important;white-space:nowrap;letter-spacing:0.1em}

  /* E2 — Shadow ladder */
  .shadow-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:32px 24px;padding:36px;border:1px solid var(--line);background:var(--surface)}
  .shadow-card{display:flex;flex-direction:column;align-items:center;gap:14px;cursor:pointer}
  .shadow-block{width:120px;height:80px;border:1px solid var(--line);background:var(--surface-deep)}
  .shadow-meta{display:flex;flex-direction:column;align-items:center;gap:3px;font-family:"Geist Mono",ui-monospace,monospace;font-size:10px;text-align:center}
  .shadow-rank{font-family:"Geist",sans-serif;font-size:18px;font-weight:800;color:var(--accent);letter-spacing:-0.02em}
  .shadow-count{color:var(--dim);font-weight:600;text-transform:uppercase;letter-spacing:0.14em}
  .shadow-value{color:var(--dim);font-size:9px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:0.04em}

  /* E3 — Motion tokens */
  .motion-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}
  .motion-block{background:var(--surface);border:1px solid var(--line);padding:20px}
  .motion-block-title{font-family:"Geist Mono",ui-monospace,monospace;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.18em;color:var(--accent);margin-bottom:14px}
  .motion-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
  .motion-chip{display:inline-flex;align-items:center;gap:4px;font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;font-weight:600;background:var(--surface-deep);border:1px solid var(--line);color:var(--fg);padding:4px 10px;cursor:pointer;letter-spacing:0.06em;transition:border-color .15s,color .15s}
  .motion-chip span{color:var(--dim);font-weight:400}
  .motion-chip:hover{border-color:var(--accent);color:var(--accent)}
  .motion-demo{display:flex;flex-direction:column;gap:8px}
  .motion-demo-row{display:flex;align-items:center;gap:12px}
  .motion-demo-label{font-family:"Geist Mono",ui-monospace,monospace;font-size:10px;color:var(--dim);min-width:60px;letter-spacing:0.06em}
  .motion-track{flex:1;height:14px;background:var(--surface-deep);position:relative;border:1px solid var(--line);overflow:hidden}
  .motion-ball{position:absolute;top:1px;left:1px;width:12px;height:12px;border-radius:50%;background:var(--accent);box-shadow:0 0 8px var(--accent-glow);animation:motion-slide var(--motion-d, 1s) cubic-bezier(0.4, 0, 0.2, 1) infinite alternate}
  @keyframes motion-slide{0%{left:1px}100%{left:calc(100% - 13px)}}
  .motion-keyframes{display:flex;flex-wrap:wrap;gap:5px}
  .kf-chip{font-family:"Geist Mono",ui-monospace,monospace;font-size:10px;background:var(--surface-deep);border:1px solid var(--line);padding:3px 8px;color:var(--dim);letter-spacing:0.06em}

  /* F — Stack fingerprint */
  .stack-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;background:var(--surface);border:1px solid var(--line);padding:28px}
  .stack-kind{display:flex;flex-direction:column;gap:10px}
  .stack-kind-label{font-family:"Geist Mono",ui-monospace,monospace;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.18em;color:var(--accent);padding-bottom:6px;border-bottom:1px solid var(--line)}
  .stack-tags{display:flex;flex-wrap:wrap;gap:6px}
  .stack-tag{display:inline-flex;align-items:center;font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;font-weight:600;background:var(--accent);color:var(--surface);padding:4px 10px;cursor:help;letter-spacing:0.04em;box-shadow:0 0 12px var(--accent-glow)}

  /* A3 — Lint findings */
  .lint-section{background:var(--surface);border:1px solid var(--line);padding:20px;margin-bottom:48px}
  .lint-section h2{margin-top:0}
  .lint-list{display:flex;flex-direction:column;gap:6px;font-family:"Geist Mono",ui-monospace,monospace;font-size:12px;color:var(--fg)}
  .lint-row{display:flex;gap:8px;align-items:flex-start;padding:7px 10px;border-left:3px solid;background:var(--surface-deep)}
  .lint-error{border-left-color:#fca5a5}
  .lint-warn{border-left-color:#fcd34d}
  .lint-tag{font-weight:600;font-size:10px;letter-spacing:0.14em;background:var(--bg);color:var(--accent);padding:2px 8px;flex-shrink:0;border:1px solid var(--accent)}
  .lint-error .lint-tag{background:rgba(239,68,68,0.20);color:#fca5a5;border-color:rgba(239,68,68,0.45)}
  .lint-warn .lint-tag{background:rgba(245,158,11,0.20);color:#fcd34d;border-color:rgba(245,158,11,0.45)}

  /* ═══════════════════════════════════════════════════════════════
     AIOX brand chrome — header (top) + footer (bottom)
     Dark cockpit · Geist · neon lime accent · hud-frame corners
     Adapted from apps/design (aiox-body, --lime, --cream, --dark)
     Geist + Geist Mono are loaded via <link> in <head>.
     ═══════════════════════════════════════════════════════════════ */
  .aiox-chrome{
    --aiox-dark:#050505;--aiox-cream:rgb(244,244,232);--aiox-lime:#D1FF00;
    --aiox-fg-dim:rgba(245,244,231,0.40);--aiox-fg-meta:#AFAFAF;
    --aiox-border:rgba(156,156,156,0.22);--aiox-surface:#0F0F11;
    background:linear-gradient(180deg,#0A0A0C 0%,var(--aiox-dark) 100%);
    color:var(--aiox-cream);
    font-family:"Geist",ui-sans-serif,system-ui,-apple-system,sans-serif;
    margin:0;padding:14px 40px;
    border-bottom:1px solid var(--aiox-border);
    position:relative;
  }
  .aiox-chrome-row{max-width:1280px;margin:0 auto}
  .aiox-chrome::before,.aiox-chrome::after{
    content:"";position:absolute;width:10px;height:10px;border:1px solid var(--aiox-lime);
  }
  .aiox-chrome::before{top:10px;left:10px;border-right:0;border-bottom:0}
  .aiox-chrome::after{bottom:10px;right:10px;border-left:0;border-top:0}
  .aiox-chrome-row{display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap}
  .aiox-brand{display:flex;align-items:center;gap:16px}
  .aiox-mark{
    display:inline-flex;align-items:center;justify-content:center;
    width:38px;height:38px;background:var(--aiox-lime);
    box-shadow:0 0 16px rgba(209,255,0,0.35);
    overflow:hidden;flex-shrink:0;
  }
  .aiox-mark img{width:100%;height:100%;display:block}
  .aiox-brand-logo{height:24px;width:auto;max-width:122px;display:block}
  .aiox-wordmark{display:flex;flex-direction:column;gap:2px}
  .aiox-wordmark .wm-name{
    font-family:"Geist",sans-serif;font-weight:800;font-size:18px;
    letter-spacing:-0.03em;text-transform:uppercase;color:var(--aiox-cream);
  }
  .aiox-wordmark .wm-tag{
    font-family:"Geist Mono",ui-monospace,monospace;font-weight:500;
    font-size:10px;letter-spacing:0.18em;text-transform:uppercase;
    color:var(--aiox-lime);
  }
  .aiox-meta{
    display:flex;align-items:center;gap:18px;
    font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;
    letter-spacing:0.12em;text-transform:uppercase;color:var(--aiox-fg-meta);
  }
  .aiox-actions{display:flex;align-items:center;gap:8px;margin-left:10px}
  .aiox-action{
    display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;
    border:1px solid var(--aiox-border);background:transparent;color:var(--aiox-cream);
    font-family:"Geist Mono",ui-monospace,monospace;font-size:10px;font-weight:600;
    letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;cursor:pointer;
    transition:border-color .15s,color .15s,background .15s;
  }
  .aiox-action:hover{border-color:var(--aiox-lime);color:var(--aiox-lime)}
  .aiox-action-primary,
  .aiox-action-primary:visited,
  .aiox-action-primary:focus,
  .aiox-action-primary:active{
    background:var(--aiox-lime);
    border-color:var(--aiox-lime);
    color:#050505 !important;
    font-weight:800;
    text-shadow:none;
  }
  .aiox-action-primary:hover{
    background:#b8e600;
    border-color:#b8e600;
    color:#050505 !important;
  }
  @media (max-width:920px){.aiox-meta{width:100%;justify-content:space-between;flex-wrap:wrap}.aiox-actions{margin-left:0;flex-wrap:wrap}}
  .aiox-meta a{color:var(--aiox-cream);text-decoration:none;border-bottom:1px solid var(--aiox-border);padding-bottom:1px;transition:color .15s,border-color .15s}
  .aiox-meta a:hover{color:var(--aiox-lime);border-bottom-color:var(--aiox-lime)}
  .aiox-meta .sep{color:var(--aiox-fg-dim)}
  .aiox-meta .pill{
    display:inline-flex;align-items:center;gap:6px;padding:4px 10px;
    border:1px solid var(--aiox-border);color:var(--aiox-cream);
    text-transform:none;letter-spacing:0.04em;
  }
  .aiox-meta .pill::before{content:"";width:6px;height:6px;background:var(--aiox-lime);box-shadow:0 0 8px var(--aiox-lime)}

  .aiox-footer{
    --aiox-dark:#050505;--aiox-cream:rgb(244,244,232);--aiox-lime:#D1FF00;
    --aiox-fg-dim:rgba(245,244,231,0.40);--aiox-fg-meta:#AFAFAF;
    --aiox-border:rgba(156,156,156,0.22);
    background:var(--aiox-dark);color:var(--aiox-cream);
    font-family:"Geist",ui-sans-serif,system-ui,sans-serif;
    margin:64px 0 0 0;padding:48px 40px;
    border-top:1px solid var(--aiox-border);
    position:relative;
  }
  .aiox-footer::before,.aiox-footer::after{
    content:"";position:absolute;width:10px;height:10px;border:1px solid var(--aiox-lime);
  }
  .aiox-footer::before{top:10px;left:10px;border-right:0;border-bottom:0}
  .aiox-footer::after{bottom:10px;right:10px;border-left:0;border-top:0}
  .aiox-footer-grid{
    display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:32px;align-items:start;
    max-width:1200px;margin:0 auto;
  }
  @media (max-width:720px){.aiox-footer-grid{grid-template-columns:1fr;gap:24px}}
  .aiox-footer-logo{display:block;height:22px;width:auto;max-width:108px;margin:0 0 14px}
  .aiox-footer-col h4{
    font-family:"Geist Mono",ui-monospace,monospace;font-size:10px;font-weight:600;
    letter-spacing:0.2em;text-transform:uppercase;color:var(--aiox-lime);
    margin:0 0 12px 0;
  }
  .aiox-footer-col p{
    font-size:13px;line-height:1.6;color:rgba(244,244,232,0.70);margin:0 0 10px 0;
  }
  .aiox-footer-col a{
    display:block;font-size:13px;line-height:1.8;color:var(--aiox-cream);
    text-decoration:none;transition:color .15s;
  }
  .aiox-footer-col a:hover{color:var(--aiox-lime)}
  .aiox-footer-col code{
    font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;
    color:var(--aiox-lime);background:rgba(209,255,0,0.08);
    padding:2px 6px;border-radius:2px;
  }
  .aiox-footer-bar{
    display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;
    max-width:1200px;margin:32px auto 0 auto;padding-top:20px;
    border-top:1px solid var(--aiox-border);
    font-family:"Geist Mono",ui-monospace,monospace;font-size:10px;
    letter-spacing:0.14em;text-transform:uppercase;color:var(--aiox-fg-dim);
  }
  .aiox-footer-bar .built-by{color:var(--aiox-cream)}
  .aiox-footer-bar .built-by a{color:var(--aiox-lime);text-decoration:none}
  .aiox-footer-bar .built-by a:hover{text-decoration:underline}
</style>
</head>
<body data-theme="${themeMode}">
  <div class="aiox-chrome" role="banner">
    <div class="aiox-chrome-row">
      <div class="aiox-brand">
        ${AIOX_FAVICON ? `<span class="aiox-mark" aria-hidden="true"><img src="${AIOX_FAVICON}" alt="" /></span>` : `<span class="aiox-mark" aria-hidden="true">AX</span>`}
        <div class="aiox-wordmark">
          ${AIOX_LOGO_WHITE ? `<img class="aiox-brand-logo" src="${AIOX_LOGO_WHITE}" alt="AIOX" />` : `<div class="wm-name">AIOX</div>`}
          <div class="wm-tag">design systems for AI agents</div>
        </div>
      </div>
      <div class="aiox-meta">
        <span class="pill">live extract</span>
        <span class="sep">/</span>
        <span>by <a href="https://x.com/oalanicolas" target="_blank" rel="noopener">@oalanicolas</a></span>
        <div class="aiox-actions" aria-label="DESIGN.md actions">
          <button type="button" class="aiox-action" data-copy-md aria-label="Copy DESIGN.md to clipboard">+ copy .md</button>
          <button type="button" class="aiox-action" data-copy-prompt aria-label="Copy AI prompt to clipboard">+ copy prompt</button>
          <a class="aiox-action aiox-action-primary" data-download-md href="data:text/markdown;charset=utf-8,${encodeURIComponent(designMd || "")}" download="DESIGN.md">↓ download</a>
        </div>
      </div>
    </div>
  </div>
  <main class="preview-shell">
  <header>
    <div class="hero-eyebrow">DESIGN.MD INSPIRED BY</div>
    <div class="header-identity">
      <div class="header-text">
        <h1>${safe(brandName.toUpperCase())}</h1>
      </div>
    </div>
    <div class="subtitle">${faviconSrc ? `<img class="favicon" src="${safe(faviconSrc)}" alt="" style="width:18px;height:18px;padding:0;border:0;background:transparent;vertical-align:middle;margin-right:8px" />` : ""}EXTRACTED FROM <a href="${safe(url)}" target="_blank" rel="noopener">${safe(url)}</a></div>
    <div class="header-badges">
      ${(() => {
        if (!lintResult || !lintResult.ran) {
          return `<span class="badge badge-skip" title="Lint did not run">lint: skipped</span>`;
        }
        const e = lintResult.errors_count, w = lintResult.warnings_count;
        const cls = e > 0 ? "badge-fail" : w > 0 ? "badge-warn" : "badge-pass";
        const label = e > 0 ? `lint: ${e} error${e === 1 ? "" : "s"}` : w > 0 ? `lint: ${w} warning${w === 1 ? "" : "s"}` : "lint: pass";
        return `<span class="badge ${cls}" title="@google/design.md@latest">${safe(label)}</span>`;
      })()}
      ${(() => {
        if (!extractionLog) return "";
        const s = extractionLog.confidence_summary || {};
        const total = (s.high || 0) + (s.medium || 0) + (s.low || 0);
        if (!total) return "";
        return `
          <span class="badge badge-conf-high" title="Sourced from CSS vars / @font-face">●●● ${s.high || 0} high</span>
          <span class="badge badge-conf-medium" title="Sourced from non-var CSS declarations">●●○ ${s.medium || 0} medium</span>
          <span class="badge badge-conf-low" title="Inferred without direct CSS source">●○○ ${s.low || 0} low</span>
        `;
      })()}
      ${qualityScore ? `<span class="badge score-grade-${qualityScore.grade}" style="background:transparent;border-color:currentcolor" title="Design quality score">${qualityScore.grade} · ${qualityScore.overall}/100</span>` : ""}
      ${darkMode && darkMode.has_dark_mode ? `<span class="badge" style="background:#000;color:#fff" title="${safe(darkMode.signals.join(" · "))}">dark mode detected</span>` : ""}
      ${breakpoints && breakpoints.length > 0 ? `<span class="badge" style="background:#f0f0f0;color:#333" title="${safe(breakpoints.map(b => b.value).join(" · "))}">${breakpoints.length} breakpoints</span>` : ""}
      ${stack && stack.length > 0 ? `<span class="badge" style="background:#0a4a1a;color:#fff" title="${safe(stack.slice(0,8).map(s => s.name).join(" · "))}">${stack.length} stack signals</span>` : ""}
    </div>
  </header>
  <nav class="preview-tabs" aria-label="Preview sections">
    <a class="preview-tab preview-tab-active" href="#tokens">Colors<span class="preview-tab-dot">●</span></a>
    <a class="preview-tab" href="#typography">Typography</a>
    <a class="preview-tab" href="#component">Component</a>
    <a class="preview-tab" href="#wcag">WCAG</a>
    <a class="preview-tab" href="#design-md">DESIGN.md</a>
    <a class="preview-tab" href="#technical-details">Technical details</a>
  </nav>

  ${lintResult && lintResult.ran && (lintResult.errors_count > 0 || lintResult.warnings_count > 0) ? `
  <section class="lint-section">
    <h2>Lint findings</h2>
    <div class="lint-list">
      ${(lintResult.errors || []).slice(0, 20).map((f) => `<div class="lint-row lint-error"><span class="lint-tag">ERROR</span> ${safe(f.message || JSON.stringify(f))}${f.line ? ` <span class="dim">L${f.line}</span>` : ""}</div>`).join("")}
      ${(lintResult.warnings || []).slice(0, 20).map((f) => `<div class="lint-row lint-warn"><span class="lint-tag">WARN</span> ${safe(f.message || JSON.stringify(f))}${f.line ? ` <span class="dim">L${f.line}</span>` : ""}</div>`).join("")}
      ${(!lintResult.errors && !lintResult.warnings && lintResult.stdout_excerpt) ? `<details><summary>Raw lint output</summary><pre>${safe(lintResult.stdout_excerpt)}</pre></details>` : ""}
    </div>
  </section>
  ` : ""}

  ${stack && stack.length > 0 ? `
  <section class="technical-meta-section">
    <h2>Stack fingerprint</h2>
    <p class="dim" style="font-family:ui-monospace,monospace;font-size:11px;margin-bottom:12px">${stack.length} technology signals detected from HTML + CSS source.</p>
    <div class="stack-grid">
      ${(() => {
        // Group by kind
        const byKind = {};
        for (const s of stack) {
          if (!byKind[s.kind]) byKind[s.kind] = [];
          byKind[s.kind].push(s);
        }
        const kindOrder = ["framework", "builder", "cms", "ecommerce", "css-framework", "component-library", "animation", "3d", "analytics", "auth", "backend", "ab-testing", "support", "hosting", "cdn"];
        const knownKinds = kindOrder.filter(k => byKind[k]);
        const otherKinds = Object.keys(byKind).filter(k => !kindOrder.includes(k));
        return [...knownKinds, ...otherKinds].map(kind => `
          <div class="stack-kind">
            <div class="stack-kind-label">${safe(kind.replace(/-/g, " "))}</div>
            <div class="stack-tags">
              ${byKind[kind].map(s => `<span class="stack-tag" title="${safe(s.evidence)}">${safe(s.name)}</span>`).join("")}
            </div>
          </div>
        `).join("");
      })()}
    </div>
  </section>
  ` : ""}

  ${styleFingerprint && styleFingerprint.classification ? `
  <section class="technical-meta-section">
    <h2>Visual archetype</h2>
    <p class="dim" style="font-family:ui-monospace,monospace;font-size:11px;margin-bottom:12px">
      Style classification against canonical archetypes from
      <code>squads/design-ops/data/style-fingerprints.yaml</code>.
      Complementary to the technical Stack fingerprint above.
    </p>
    <div class="stack-grid">
      <div class="stack-kind">
        <div class="stack-kind-label">primary archetype</div>
        <div class="stack-tags">
          <span class="stack-tag" style="background:${styleFingerprint.classification.primary_archetype ? "#0a4a1a" : "#666"};color:#fff" title="${safe(styleFingerprint.classification.explanation || "")}">
            ${safe(styleFingerprint.classification.primary_archetype || "unclassified")}
            ${styleFingerprint.classification.confidence_score != null ? ` · ${styleFingerprint.classification.confidence_score}%` : ""}
          </span>
        </div>
      </div>
      ${styleFingerprint.classification.secondary_archetype ? `
      <div class="stack-kind">
        <div class="stack-kind-label">secondary archetype</div>
        <div class="stack-tags">
          <span class="stack-tag" style="background:#444;color:#fff">${safe(styleFingerprint.classification.secondary_archetype)}</span>
        </div>
      </div>
      ` : ""}
      <div class="stack-kind">
        <div class="stack-kind-label">extracted signals</div>
        <div class="stack-tags">
          ${Object.entries(styleFingerprint.extracted_signals || {})
            .filter(([, v]) => v != null)
            .map(([k, v]) => `<span class="stack-tag" style="background:#1f2937;color:#fff">${safe(k.replace(/_/g, " "))}: ${safe(String(v))}</span>`)
            .join("")}
        </div>
      </div>
    </div>
    ${styleFingerprint.classification.explanation ? `
    <p class="dim" style="font-family:ui-monospace,monospace;font-size:11px;margin-top:12px;line-height:1.5">
      <strong>Why this archetype:</strong> ${safe(styleFingerprint.classification.explanation)}
    </p>
    ` : ""}
    ${styleFingerprint.archetype_distance ? `
    <details style="margin-top:12px;font-family:ui-monospace,monospace;font-size:11px">
      <summary style="cursor:pointer;color:var(--dim)">Show all archetype scores</summary>
      <ul style="margin-top:8px;list-style:none;padding-left:0">
        ${Object.entries(styleFingerprint.archetype_distance)
          .sort((a, b) => b[1] - a[1])
          .map(([name, score]) => `<li style="display:flex;justify-content:space-between;padding:2px 0"><span>${safe(name)}</span><span>${score.toFixed(1)}%</span></li>`)
          .join("")}
      </ul>
    </details>
    ` : ""}
  </section>
  ` : ""}

  ${driftReport ? `
  <section class="drift-section">
    <h2>Drift report</h2>
    <p class="dim" style="font-family:ui-monospace,monospace;font-size:11px;margin-bottom:12px">
      Compared <code>${safe(driftReport.compared_against || "local")}</code> against the live extraction.
      Tolerance: ${driftReport.tolerance} (RGB euclidean distance).
    </p>
    <div class="drift-verdict verdict-${driftReport.summary.verdict}">${safe(driftReport.summary.verdict.toUpperCase())}</div>
    <div class="drift-summary-grid">
      <div class="drift-stat"><div class="drift-stat-label">Drift score</div><div class="drift-stat-value">${driftReport.summary.drift_score}</div></div>
      <div class="drift-stat"><div class="drift-stat-label">Drifted</div><div class="drift-stat-value">${driftReport.summary.total_drifted}</div></div>
      <div class="drift-stat"><div class="drift-stat-label">Added</div><div class="drift-stat-value">${driftReport.summary.total_added}</div></div>
      <div class="drift-stat"><div class="drift-stat-label">Removed</div><div class="drift-stat-value">${driftReport.summary.total_removed}</div></div>
      <div class="drift-stat"><div class="drift-stat-label">Matched</div><div class="drift-stat-value">${driftReport.summary.total_matched}</div></div>
    </div>
    ${driftReport.colors.drifted.length > 0 ? `
      <h3 style="font-size:12px;font-family:ui-monospace,monospace;text-transform:uppercase;letter-spacing:0.06em;margin:16px 0 8px;color:var(--dim)">Colors drifted</h3>
      <table class="drift-table">
        <thead><tr><th>token</th><th>local</th><th>live</th><th>delta</th></tr></thead>
        <tbody>
          ${driftReport.colors.drifted.slice(0, 20).map(d => `<tr>
            <td>${safe(d.key)}</td>
            <td><span class="drift-swatch" style="background:${safe(d.local)}"></span>${safe(d.local)}</td>
            <td><span class="drift-swatch" style="background:${safe(d.live)}"></span>${safe(d.live)}</td>
            <td>${d.delta}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    ` : ""}
    ${driftReport.typography.drifted.length > 0 ? `
      <h3 style="font-size:12px;font-family:ui-monospace,monospace;text-transform:uppercase;letter-spacing:0.06em;margin:16px 0 8px;color:var(--dim)">Typography drifted</h3>
      <table class="drift-table">
        <thead><tr><th>scale</th><th>local family</th><th>live family</th><th>match</th></tr></thead>
        <tbody>
          ${driftReport.typography.drifted.slice(0, 10).map(d => `<tr>
            <td>${safe(d.key)}</td>
            <td>${safe(String((d.local && d.local.fontFamily) || "—").split(",")[0])}</td>
            <td>${safe(String((d.live && d.live.fontFamily) || "—").split(",")[0])}</td>
            <td>${d.match.familyMatch ? "fam ✓" : "fam ✗"} · ${d.match.sizeMatch ? "size ✓" : "size ✗"}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    ` : ""}
  </section>
  ` : ""}

  <section id="tokens">
    <h2>Colors</h2>
    ${colors.length ? `<div class="swatches">${colorSwatches}</div>` : `<p class="empty">No color tokens in frontmatter.</p>`}
  </section>

  <section id="component">
    <h2>Component preview (live tokens)</h2>
    <div class="preview-token-source" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:0">
        <strong>Token source:</strong>
        ${(() => {
          const sources = [];
          if (Object.keys(previewTokens).length > 0) sources.push(`<code>preview_tokens</code> (LLM-resolved, ${Object.keys(previewTokens).length} keys)`);
          if (comp.button.primary.bg) sources.push(`<code>--*-button-*</code> (CSS var heuristic)`);
          if (comp.surface.card) sources.push(`<code>card</code>`);
          if (comp.text.base) sources.push(`<code>text</code>`);
          if (comp.border.base) sources.push(`<code>border</code>`);
          if (sources.length === 0) return `<code>colors.*</code> (frontmatter fallback — no component tokens detected)`;
          return sources.join(" · ");
        })()}
      </div>
      <button id="dark-toggle" class="dark-toggle" style="display:none">dark mode</button>
    </div>

    <!-- HERO ZONE — brand identity at full impact -->
    <div class="preview-hero" style="background:${safe(cSurface)};color:${safe(cText)};font-family:${safe(cssFontBody)},ui-sans-serif,system-ui,sans-serif;border-radius:${rLg}px">
      <div class="hero-eyebrow" style="font-family:${safe(cssFontMono)},ui-monospace,monospace;color:${safe(cAccent)}">${safe(brandName.toUpperCase())} · ${safe(detectedSummary.toUpperCase())}</div>
      <h1 class="hero-display" style="font-family:${safe(cssFontHeading)},ui-serif,Georgia,serif;color:${safe(cText)};letter-spacing:-0.025em">${safe(headingSample)}</h1>
      <p class="hero-lead" style="font-family:${safe(cssFontBody)},ui-sans-serif,sans-serif;color:${safe(cTextMuted)}">${safe(bodySample)}</p>
      <div class="hero-actions">
        <button class="ds-btn ds-btn-large" style="background:${safe(btnPrimaryBg)};color:${safe(btnPrimaryText)};border:1px solid ${safe(btnPrimaryBorder)};border-radius:${rBtn}px">
          Primary CTA <span style="margin-left:6px">→</span>
        </button>
        <button class="ds-btn ds-btn-large" style="background:${safe(btnSecondaryBg)};color:${safe(btnSecondaryText)};border:1px solid ${safe(btnSecondaryBorder)};border-radius:${rBtn}px">
          Secondary CTA
        </button>
      </div>
    </div>

    <!-- COMPONENT GRID -->
    <div class="preview-stage" style="background:${safe(cSurface)};color:${safe(cText)};font-family:${safe(cssFontBody)},ui-sans-serif,system-ui,sans-serif">
      <div class="preview-card">
        <h4>Buttons</h4>
        <button class="ds-btn ds-btn-large" style="background:${safe(btnPrimaryBg)};color:${safe(btnPrimaryText)};border:1px solid ${safe(btnPrimaryBorder)};border-radius:${rBtn}px">
          Primary button <span style="margin-left:4px">→</span>
        </button>
        <button class="ds-btn ds-btn-large" style="background:${safe(btnSecondaryBg)};color:${safe(btnSecondaryText)};border:1px solid ${safe(btnSecondaryBorder)};border-radius:${rBtn}px">
          Secondary button
        </button>
        <button class="ds-btn ds-btn-tertiary" style="background:transparent;color:${safe(btnTertiaryText)};border:0;text-decoration:underline;justify-content:flex-start;padding-left:0">
          Tertiary link →
        </button>
      </div>

      <div class="preview-card">
        <h4>Editorial card</h4>
        <article class="ds-card ds-card-editorial" style="background:${safe(cCardBg)};border:1px solid ${safe(cBorder)};border-radius:${rCard}px">
          <div class="card-eyebrow" style="font-family:${safe(cssFontMono)},ui-monospace,monospace;color:${safe(cAccent)}">${safe(sourceHost.toUpperCase())}</div>
          <div class="ds-card-title" style="font-family:${safe(cssFontHeading)},ui-serif,Georgia,serif;color:${safe(cText)}">${safe(headingSample.slice(0, 50))}</div>
          <div class="ds-card-body" style="color:${safe(cTextMuted)}">${safe(bodySample.slice(0, 140))}</div>
          <div class="card-meta" style="font-family:${safe(cssFontMono)},ui-monospace,monospace;color:${safe(cTextMuted)}">
            <span>${safe(sourceHost.toUpperCase())}</span>
            <span class="meta-dot" style="background:${safe(cBorder)}"></span>
            <span>${cssVars.length} CSS VARS</span>
          </div>
          <div class="card-cta-row">
            <a class="ds-btn" href="${safe(url)}" target="_blank" rel="noopener" style="background:${safe(btnPrimaryBg)};color:${safe(btnPrimaryText)};border:1px solid ${safe(btnPrimaryBorder)};border-radius:${rBtn}px;font-size:13px">Open source</a>
            <button class="ds-btn ds-btn-tertiary" data-copy="${safe(headingSample)}" style="background:transparent;color:${safe(btnTertiaryText)};border:0;font-size:13px;padding:0;text-decoration:underline">Copy heading</button>
          </div>
        </article>
      </div>

      <div class="preview-card">
        <h4>Input + badges</h4>
        <input class="ds-input" type="text" value="${safe(sourceHost)}" readonly style="background:${safe(cCardBg)};color:${safe(cText)};border:1px solid ${safe(cBorder)};border-radius:${rInput}px" />
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span class="ds-badge" style="background:${safe(cAccent)};color:${safe(btnPrimaryText)};border-radius:${rBtn}px">${colors.length} colors</span>
          <span class="ds-badge" style="background:transparent;color:${safe(cText)};border:1px solid ${safe(cBorder)};border-radius:${rBtn}px">${typo.length} type</span>
          <span class="ds-badge" style="background:${safe(cSuccess)};color:${safe(btnPrimaryText)};border-radius:${rBtn}px">${cssVars.length} CSS vars</span>
          <span class="ds-badge" style="background:${safe(failedFetches ? cError : cCardBg)};color:${safe(failedFetches ? btnPrimaryText : cText)};border:1px solid ${safe(failedFetches ? cError : cBorder)};border-radius:${rBtn}px">${failedFetches} failed fetches</span>
        </div>
      </div>

      <div class="preview-card">
        <h4>KPI tile</h4>
        <div class="kpi-tile" style="background:${safe(cCardBg)};border:1px solid ${safe(cBorder)};border-radius:${rCard}px">
          <div class="kpi-label" style="font-family:${safe(cssFontMono)},ui-monospace,monospace;color:${safe(cTextMuted)}">NATIVE CSS TOKENS</div>
          <div class="kpi-value" style="font-family:${safe(cssFontHeading)},ui-serif,Georgia,serif;color:${safe(cText)};letter-spacing:-0.02em">${cssVars.length}</div>
          <div class="kpi-trend" style="color:${safe(cSuccess)};font-family:${safe(cssFontMono)},ui-monospace,monospace">${safe(detectedSummary)}</div>
        </div>
      </div>

      <div class="preview-card">
        <h4>Alerts</h4>
        <div class="ds-alert" style="background:${safe(cCardBg)};color:${safe(cText)};border-left:3px solid ${safe(cSuccess)};border-radius:${rSm}px">
          <strong>CSS source</strong> — ${cssFileCount} stylesheet files, ${cssMeta.inline_style_blocks} inline blocks, ${cssMeta.inline_style_attrs} inline style attributes.
        </div>
        <div class="ds-alert" style="background:${safe(cCardBg)};color:${safe(cText)};border-left:3px solid ${safe(cAccent)};border-radius:${rSm}px">
          <strong>Token graph</strong> — ${usageGraph.length} unique tokens, ${cssVars.length} native CSS declarations.
        </div>
        <div class="ds-alert" style="background:${safe(cCardBg)};color:${safe(cText)};border-left:3px solid ${safe(failedFetches ? cError : cBorder)};border-radius:${rSm}px">
          <strong>Fetch status</strong> — ${failedFetches ? `${failedFetches} stylesheet fetches failed.` : "No stylesheet fetch failures recorded."} ${confidenceSummary.high != null ? `${confidenceSummary.high || 0} high-confidence tokens.` : ""}
        </div>
      </div>

      <div class="preview-card">
        <h4>Code block</h4>
        <pre class="ds-code" style="background:${safe(cCardBg)};color:${safe(cText)};border:1px solid ${safe(cBorder)};border-radius:${rSm}px;font-family:${safe(cssFontMono)},ui-monospace,monospace"><span style="color:${safe(cTextMuted)}">// design.tokens.ts</span>
<span style="color:${safe(cAccent)}">export const</span> tokens = {
  primary:   <span style="color:${safe(cSuccess)}">"${safe(btnPrimaryBg)}"</span>,
  surface:   <span style="color:${safe(cSuccess)}">"${safe(cSurface)}"</span>,
  text:      <span style="color:${safe(cSuccess)}">"${safe(cText)}"</span>,
};</pre>
      </div>

      <div class="preview-card preview-card-wide">
        <h4>Type hierarchy</h4>
        <div class="hierarchy-stack">
          <div class="h-eyebrow" style="font-family:${safe(cssFontMono)},ui-monospace,monospace;color:${safe(cAccent)}">${safe(brandName.toUpperCase())} · TYPE</div>
          <div class="h-display" style="font-family:${safe(cssFontHeading)},ui-serif,Georgia,serif;color:${safe(cText)};letter-spacing:-0.025em">${safe(headingSample)}</div>
          <div class="h-body" style="font-family:${safe(cssFontBody)},ui-sans-serif,sans-serif;color:${safe(cTextMuted)}">${safe(bodySample.slice(0, 200))}</div>
          <a href="${safe(url)}" target="_blank" rel="noopener" style="color:${safe(cAccent)};font-family:${safe(cssFontBody)};text-decoration:underline">Open source →</a>
        </div>
      </div>
    </div>
  </section>

  ${logo ? `
  <section>
    <h2>Logo</h2>
    <div class="logo-display" style="background:${safe(cSurface)};color:${safe(cText)}">
      ${logo.kind === "svg-inline" && logo.dataUrl && logo.dataUrl.startsWith("data:image/svg+xml;utf8,")
        ? `<div class="logo-inline-svg" style="color:${safe(cText)};max-width:300px;max-height:120px">${decodeURIComponent(logo.dataUrl.replace(/^data:image\/svg\+xml;utf8,/, ""))}</div>`
        : logoSrc ? `<img src="${safe(logoSrc)}" alt="logo" class="logo-img" />` : `<p class="empty">Logo metadata found, but no renderable image data.</p>`}
      <div class="logo-meta">
        <div class="logo-meta-item"><span class="logo-meta-label">source</span> <code>${safe(logo.source)}</code></div>
        <div class="logo-meta-item"><span class="logo-meta-label">format</span> ${safe(logo.mime)}</div>
        <div class="logo-meta-item"><span class="logo-meta-label">size</span> ${(logo.size / 1024).toFixed(1)}KB</div>
        ${logo.sourceUrl ? `<div class="logo-meta-item"><span class="logo-meta-label">url</span> <a href="${safe(logo.sourceUrl)}" target="_blank" style="color:${safe(cText)}">${safe(logo.sourceUrl.length > 60 ? logo.sourceUrl.slice(0,60) + "…" : logo.sourceUrl)}</a></div>` : ""}
      </div>
    </div>
  </section>
  ` : ""}

  <!-- D6 — Component variant matrix (button states + sizes + variants) -->
  <section id="components">
    <h2>Component variants matrix</h2>
    <p class="dim" style="font-family:ui-monospace,monospace;font-size:11px;margin-bottom:12px">Each cell renders a single button using the live tokens. Use this to audit the full surface of the component at a glance.</p>
    <div class="variant-matrix" style="background:${safe(cSurface)}">
      <table class="variant-table" style="color:${safe(cText)};font-family:${safe(cssFontBody)},ui-sans-serif,sans-serif">
        <thead>
          <tr><th></th><th>SM</th><th>MD</th><th>LG</th></tr>
        </thead>
        <tbody>
          ${[
            { name: "Primary · default", bg: btnPrimaryBg, color: btnPrimaryText, border: btnPrimaryBorder, opacity: 1 },
            { name: "Primary · hover", bg: btnPrimaryBg, color: btnPrimaryText, border: btnPrimaryBorder, opacity: 0.9 },
            { name: "Primary · disabled", bg: btnPrimaryBg, color: btnPrimaryText, border: btnPrimaryBorder, opacity: 0.4 },
            { name: "Secondary · default", bg: btnSecondaryBg, color: btnSecondaryText, border: btnSecondaryBorder, opacity: 1 },
            { name: "Secondary · hover", bg: btnSecondaryBg, color: btnSecondaryText, border: btnSecondaryBorder, opacity: 0.7 },
            { name: "Tertiary · default", bg: "transparent", color: btnTertiaryText, border: "transparent", opacity: 1, underline: true },
          ].map(row => `
            <tr>
              <td class="variant-row-label">${safe(row.name)}</td>
              ${[
                { size: "SM", padding: "6px 12px", fontSize: "12px" },
                { size: "MD", padding: "10px 20px", fontSize: "14px" },
                { size: "LG", padding: "14px 28px", fontSize: "16px" },
              ].map(s => `
                <td>
                  <button class="ds-btn" style="background:${safe(row.bg)};color:${safe(row.color)};border:1px solid ${safe(row.border)};border-radius:${rBtn}px;opacity:${row.opacity};padding:${s.padding};font-size:${s.fontSize};${row.underline ? 'text-decoration:underline' : ''}">
                    ${row.underline ? "Link" : "Action"} ${s.size}
                  </button>
                </td>
              `).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <h2>Spacing</h2>
    ${spacing.length ? `<div class="scale-ladder">${spacingRows}</div>` : `<p class="empty">No spacing tokens.</p>`}
  </section>

  <section>
    <h2>Radius</h2>
    ${radii.length ? `<div class="radius-list">${radiusCells}</div>` : `<p class="empty">No radius tokens.</p>`}
  </section>

  ${shadows && shadows.length > 0 ? `
  <section>
    <h2>Shadows · elevation ladder</h2>
    <p class="dim" style="font-family:ui-monospace,monospace;font-size:11px;margin-bottom:12px">${shadows.length} unique shadow values found in source CSS. Cards rendered live with the shadow applied.</p>
    <div class="shadow-grid" style="background:${safe(cSurface)}">
      ${shadows.slice(0, 8).map((s, i) => `
        <div class="shadow-card" data-copy="${safe(s.value)}" title="Click to copy box-shadow value">
          <div class="shadow-block" style="background:${safe(cCardBg)};box-shadow:${safe(s.value)};border-radius:${rCard}px"></div>
          <div class="shadow-meta">
            <div class="shadow-rank">${i + 1}</div>
            <div class="shadow-count">${s.count}× use${s.count === 1 ? "" : "s"}</div>
            <div class="shadow-value">${safe(s.value.length > 80 ? s.value.slice(0, 80) + "…" : s.value)}</div>
          </div>
        </div>
      `).join("")}
    </div>
  </section>
  ` : ""}

  ${motion && (motion.durations.length > 0 || motion.easings.length > 0 || motion.keyframes.length > 0) ? `
  <section>
    <h2>Motion tokens</h2>
    <div class="motion-grid">
      ${motion.durations.length > 0 ? `
        <div class="motion-block">
          <div class="motion-block-title">Durations</div>
          <div class="motion-chips">
            ${motion.durations.map(d => `<span class="motion-chip" data-copy="${safe(d.value)}" title="${d.count}× declarations">${safe(d.value)} <span>${d.count}×</span></span>`).join("")}
          </div>
          <!-- Live demo: ball animates with each duration -->
          <div class="motion-demo">
            ${motion.durations.slice(0, 4).map(d => `
              <div class="motion-demo-row">
                <span class="motion-demo-label">${safe(d.value)}</span>
                <div class="motion-track">
                  <div class="motion-ball" style="--motion-d:${safe(d.value)};background:${safe(cAccent)}"></div>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      ` : ""}
      ${motion.easings.length > 0 ? `
        <div class="motion-block">
          <div class="motion-block-title">Easings</div>
          <div class="motion-chips">
            ${motion.easings.map(e => `<span class="motion-chip" data-copy="${safe(e.value)}" title="${e.count}× declarations">${safe(e.value.length > 40 ? e.value.slice(0,40) + "…" : e.value)} <span>${e.count}×</span></span>`).join("")}
          </div>
        </div>
      ` : ""}
      ${motion.keyframes.length > 0 ? `
        <div class="motion-block">
          <div class="motion-block-title">@keyframes (${motion.keyframes.length})</div>
          <div class="motion-keyframes">
            ${motion.keyframes.slice(0, 20).map(k => `<span class="kf-chip">${safe(k)}</span>`).join("")}
          </div>
        </div>
      ` : ""}
    </div>
  </section>
  ` : ""}

  <section class="fontface-section">
    <h2>@font-face declarations</h2>
    ${fontFaces.length === 0 ? `<p class="empty">No @font-face declarations found.</p>` : `
    <div class="fontface-grid">
      ${fontFaces.map((f) => `
        <div class="fontface-card">
          <div class="fontface-family">${safe(f.family)}</div>
          <dl class="meta-grid" style="margin-top:8px">
            <dt>weight</dt><dd>${safe(f.weight || "—")}</dd>
            <dt>style</dt><dd>${safe(f.style || "—")}</dd>
            <dt>display</dt><dd>${safe(f.display || "—")}</dd>
            ${f.unicode_range ? `<dt>unicode</dt><dd>${safe(f.unicode_range.slice(0, 60))}</dd>` : ""}
            <dt>formats</dt><dd>${(f.src_formats || []).map((x) => safe(x)).join(", ") || "—"}</dd>
          </dl>
          ${f.src_urls.length ? `<details style="margin-top:10px"><summary>${f.src_urls.length} src url(s)</summary>${f.src_urls.map((u) => `<div class="url-line">${safe(u)}</div>`).join("")}</details>` : ""}
        </div>
      `).join("")}
    </div>
    `}
  </section>

  <section id="typography">
    <h2>Typography</h2>
    ${typo.length ? typoSpecimens : `<p class="empty">No typography tokens in frontmatter.</p>`}
  </section>

  <section class="token-usage-section">
    <h2>Token usage graph</h2>
    ${usageGraph.length === 0 ? `<p class="empty">No tokens.</p>` : `
    <p class="dim" style="font-family:ui-monospace,monospace;font-size:11px;margin-bottom:12px">Most-referenced tokens are canonical. Zero references suggest legacy/dead tokens.</p>
    <div class="usage-grid">
      ${usageGraph.slice(0, 60).map((u) => {
        const w = Math.min(100, u.references * 3);
        return `<div class="usage-row">
          <span class="mono usage-name">${safe(u.name)}</span>
          <span class="usage-bar" style="width:${w}%"></span>
          <span class="mono usage-count">${u.references}× refs · ${u.declarations}× decl</span>
        </div>`;
      }).join("")}
    </div>
    `}
  </section>

  <section class="native-css-section">
    <h2>Native CSS tokens (ground truth)</h2>
    ${cssVars.length === 0 ? `<p class="empty">No CSS variables declared in source.</p>` : `
    <p class="dim" style="font-family:ui-monospace,monospace;font-size:11px;margin-bottom:12px">${cssVars.length} declarations found · primitives shown first, aliases (var-of-var) hidden by default</p>
    <div class="vars-table-wrap">
      <table class="vars-table">
        <thead><tr><th>name</th><th>value</th><th>scope</th><th>refs</th><th>kind</th></tr></thead>
        <tbody id="cssvars-tbody">
          ${cssVars.slice(0, 200).map((v) => {
            const refs = (usageGraph.find((u) => u.name === v.name) || {}).references || 0;
            const isColor = /^#|^rgb|^hsl|^oklch/i.test(v.value);
            const swatch = isColor ? `<span style="display:inline-block;width:14px;height:14px;background:${safe(v.value)};border:1px solid #ccc;vertical-align:middle;margin-right:6px"></span>` : "";
            return `<tr class="var-row ${v.is_alias ? 'is-alias' : 'is-primitive'}" data-copy="${safe(v.value)}" title="Click to copy">
              <td class="mono">${safe(v.name)}</td>
              <td class="mono">${swatch}${safe(v.value)}</td>
              <td class="mono dim">${safe(v.selector)}</td>
              <td class="mono">${refs}</td>
              <td class="mono ${v.is_alias ? 'pill-alias' : 'pill-prim'}">${v.is_alias ? 'alias' : 'primitive'}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
    <label class="show-aliases-toggle">
      <input type="checkbox" id="show-aliases" /> show aliases
    </label>
    `}
  </section>

  <section id="wcag">
    <h2>WCAG contrast matrix</h2>
    <div id="contrast-matrix" class="matrix-wrap"><p class="empty" style="padding:16px">Computing…</p></div>
    <div class="matrix-legend">
      <span><i style="background:#d9f5dd"></i> AAA (≥7.0)</span>
      <span><i style="background:#fff7d6"></i> AA (≥4.5)</span>
      <span><i style="background:#fde2e2"></i> Fail (&lt;4.5)</span>
      <span style="color:var(--dim)">cell shows ratio · hover for status</span>
    </div>
  </section>

  <section id="design-md">
    <h2>DESIGN.md (raw)</h2>
    <div class="raw-md-frame">
      <div class="raw-md-titlebar">
        <div class="raw-md-file">
          <span class="raw-md-lights" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="raw-md-name">${safe(designMdFileName)}</span>
        </div>
        <div class="raw-md-actions">
          <span class="raw-md-count">${safe(designMdCharCount)} chars</span>
          <button type="button" class="raw-md-copy" data-copy-md>Copiar</button>
        </div>
      </div>
      <pre class="raw-md-code"><code>${designMdLines}</code></pre>
    </div>
  </section>

  <section id="technical-details" class="technical-section">
    <details>
      <summary><h2 style="display:inline-block;margin:0">Technical details</h2></summary>
      <div class="tech-content">
        <h3>Source</h3>
        <dl class="meta-grid">
          <dt>URL</dt><dd>${safe(url)}</dd>
          <dt>External CSS files</dt><dd>${cssMeta.external.length}</dd>
          <dt>Preload CSS files</dt><dd>${(cssMeta.preload || []).length}</dd>
          <dt>@import resolved</dt><dd>${cssMeta.imports_resolved || 0}</dd>
          <dt>Inline &lt;style&gt; blocks</dt><dd>${cssMeta.inline_style_blocks}</dd>
          <dt>Inline style="" attrs</dt><dd>${cssMeta.inline_style_attrs}</dd>
          <dt>Failed fetches</dt><dd>${(cssMeta.failed || []).length}</dd>
          <dt class="dim-label">— detected —</dt><dd></dd>
          <dt>Hex colors</dt><dd>${detected.colors.hex.length}</dd>
          <dt>Font families</dt><dd>${detected.typography.family.length}</dd>
          <dt>Font sizes</dt><dd>${detected.typography.size.length}</dd>
          <dt>Radii</dt><dd>${detected.radii.length}</dd>
          <dt>Native CSS vars</dt><dd>${cssVars.length}</dd>
          <dt>@font-face blocks</dt><dd>${fontFaces.length}</dd>
          <dt>Unique tokens (graph)</dt><dd>${usageGraph.length}</dd>
        </dl>

        ${breakpoints && breakpoints.length > 0 ? `
        <h3>Breakpoints</h3>
        <div class="breakpoints-row">
          ${breakpoints.map(b => `<span class="breakpoint-chip">${safe(b.value)} <span>${b.count}×</span></span>`).join("")}
        </div>
        ` : ""}

        <h3>Token exports</h3>
        <div class="export-row">
          <button class="export-btn export-btn-primary" data-export="design-md">Copy DESIGN.md</button>
          <button class="export-btn export-btn-primary" data-export="agent-prompt" title="Paste into v0, Cursor, Claude, Lovable">Copy as AI agent prompt</button>
          <button class="export-btn" data-export="tailwind">Copy as Tailwind config</button>
          <button class="export-btn" data-export="css-vars">Copy as CSS variables</button>
          <button class="export-btn" data-export="dtcg">Copy as DTCG JSON</button>
          <button class="export-btn" data-export="style-dictionary">Copy as Style Dictionary</button>
          <button class="export-btn" data-export="raw-json">Copy raw tokens.json</button>
        </div>

        ${darkMode ? `
        <h3>Dark mode signals</h3>
        ${darkMode.has_dark_mode ? `
          <ul style="font-family:ui-monospace,monospace;font-size:12px;color:var(--dim);margin:0 0 12px;padding-left:20px">
            ${darkMode.signals.map(s => `<li>${safe(s)}</li>`).join("")}
          </ul>
          <details style="margin-top:8px">
            <summary>${darkMode.dark_var_count} dark-scoped CSS vars</summary>
            <pre><code class="language-json">${safe(JSON.stringify(darkMode.dark_var_sample, null, 2))}</code></pre>
          </details>
        ` : `<p class="empty">No dark mode signals detected.</p>`}
        ` : ""}

        <h3>Audit</h3>
        <details>
          <summary>Detected tokens (regex pass over CSS)</summary>
          <pre><code class="language-json">${safe(JSON.stringify(detected, null, 2))}</code></pre>
        </details>
        <details>
          <summary>CSS fetch trace</summary>
          <pre><code class="language-json">${safe(JSON.stringify(cssMeta, null, 2))}</code></pre>
        </details>
        ${qualityScore ? `
        <details>
          <summary>Quality score breakdown</summary>
          <pre><code class="language-json">${safe(JSON.stringify(qualityScore, null, 2))}</code></pre>
        </details>
        ` : ""}
      </div>
    </details>
  </section>

  <div class="toast" id="toast"></div>

  <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-core.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-markdown.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-json.min.js"></script>
  <script>
    var TOKENS = ${tokensJson};
    var COLORS = ${colorListJson};
    var DESIGN_MD = ${designMdJson};
    var AGENT_PROMPT = ${JSON.stringify(agentPrompt)};
  </script>
  <script>
    (function(){
      var toast = document.getElementById('toast');
      var t;
      function showToast(msg){
        toast.textContent = msg;
        toast.classList.add('show');
        clearTimeout(t);
        t = setTimeout(function(){ toast.classList.remove('show'); }, 1600);
      }

      // ── data-copy clicks (swatches, spacing, radii, var rows) ───
      document.body.addEventListener('click', function(e){
        var el = e.target.closest('[data-copy]');
        if (!el) return;
        var v = el.getAttribute('data-copy');
        navigator.clipboard.writeText(v).then(function(){ showToast('Copied ' + v); });
      });

      // ── B1 toggle — show aliases ───────────────────────────────
      var aliasToggle = document.getElementById('show-aliases');
      if (aliasToggle) {
        aliasToggle.addEventListener('change', function(){
          document.body.classList.toggle('show-aliases', aliasToggle.checked);
        });
      }

      // ── S4 — Dark/light toggle for component preview ──────────
      var darkToggle = document.getElementById('dark-toggle');
      if (darkToggle && TOKENS && TOKENS.colors) {
        var isDark = false;
        var c = TOKENS.colors;
        // Pre-compute dark variants if present in the colors map
        var darkSurface = c['surface-dark'] || c['background-dark'] || c['bg-dark'] || c.dark || c.void;
        var darkText = c['text-dark'] || c['foreground-dark'] || c['fg-dark'] || c.cream || c['ivory-light'];
        var darkCard = c['surface-elevated-dark'] || c['surface-dark'] || c.dark;

        var lightSurface = c.surface || c.background || c.neutral || '#ffffff';
        var lightText = c.text || c.foreground || c['ink'] || '#111111';
        var lightCard = c.surface || c['surface-muted'] || c.neutral || '#ffffff';

        function applyTheme(dark) {
          var stage = document.querySelector('.preview-stage');
          var hero = document.querySelector('.preview-hero');
          var cards = document.querySelectorAll('.ds-card, .kpi-tile, .ds-input, .ds-code, .ds-alert');
          if (!stage) return;
          var surface = dark ? (darkSurface || '#0a0a0a') : lightSurface;
          var text = dark ? (darkText || '#f5f4e7') : lightText;
          var cardBg = dark ? (darkCard || '#181918') : lightCard;
          stage.style.background = surface;
          stage.style.color = text;
          if (hero) { hero.style.background = surface; hero.style.color = text; }
          cards.forEach(function(card){
            if (card.classList.contains('ds-input') || card.classList.contains('ds-code') || card.classList.contains('ds-alert')) {
              card.style.background = cardBg;
              card.style.color = text;
            } else {
              card.style.background = cardBg;
            }
          });
          darkToggle.textContent = dark ? 'light mode' : 'dark mode';
        }

        // Only show toggle if both light and dark variants exist
        if (darkSurface && darkText) {
          darkToggle.style.display = 'inline-flex';
          darkToggle.addEventListener('click', function(){
            isDark = !isDark;
            applyTheme(isDark);
          });
        } else {
          darkToggle.style.display = 'none';
        }
      }

      // ── WCAG contrast matrix ────────────────────────────────────
      function parseColor(s){
        if (!s) return null;
        s = String(s).trim();
        var m;
        if (m = s.match(/^#([0-9a-f]{3})$/i)) {
          var c = m[1];
          return [parseInt(c[0]+c[0],16), parseInt(c[1]+c[1],16), parseInt(c[2]+c[2],16)];
        }
        if (m = s.match(/^#([0-9a-f]{6})$/i)) {
          return [parseInt(m[1].slice(0,2),16), parseInt(m[1].slice(2,4),16), parseInt(m[1].slice(4,6),16)];
        }
        if (m = s.match(/^#([0-9a-f]{8})$/i)) {
          return [parseInt(m[1].slice(0,2),16), parseInt(m[1].slice(2,4),16), parseInt(m[1].slice(4,6),16)];
        }
        if (m = s.match(/^rgba?\(([^)]+)\)$/i)) {
          var parts = m[1].split(/[,\s\/]+/).map(parseFloat);
          return [parts[0], parts[1], parts[2]];
        }
        return null;
      }
      function relLum(rgb){
        var c = rgb.map(function(v){
          v = v / 255;
          return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
        });
        return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2];
      }
      function contrast(a, b){
        var la = relLum(a), lb = relLum(b);
        var L1 = Math.max(la, lb), L2 = Math.min(la, lb);
        return (L1 + 0.05) / (L2 + 0.05);
      }
      function classify(r){
        if (r >= 7) return 'cm-aaa';
        if (r >= 4.5) return 'cm-aa';
        return 'cm-fail';
      }

      function renderMatrix(){
        var container = document.getElementById('contrast-matrix');
        if (!COLORS || !COLORS.length) {
          container.innerHTML = '<p class="empty" style="padding:16px">No colors to compare.</p>';
          return;
        }

        // Heuristic split: rows = text candidates (text*, ink, primary-ish),
        // cols = background candidates (neutral, surface, bg, primary)
        var textKeys = COLORS.filter(function(c){
          return /text|ink|primary|secondary|tertiary|fg|foreground/i.test(c.key);
        });
        var bgKeys = COLORS.filter(function(c){
          return /neutral|surface|background|bg|canvas|paper|primary|secondary|accent/i.test(c.key);
        });
        if (!textKeys.length) textKeys = COLORS.slice(0, Math.min(8, COLORS.length));
        if (!bgKeys.length) bgKeys = COLORS.slice(0, Math.min(8, COLORS.length));
        // cap to 12 each side to keep matrix readable
        textKeys = textKeys.slice(0, 12);
        bgKeys = bgKeys.slice(0, 12);

        var html = '<table class="matrix"><thead><tr><th>text \\\\ bg</th>';
        bgKeys.forEach(function(b){
          html += '<th title="' + b.value + '"><div style="width:18px;height:18px;background:' + b.value + ';border:1px solid #999;display:inline-block;vertical-align:middle"></div><br>' + b.key + '</th>';
        });
        html += '</tr></thead><tbody>';
        textKeys.forEach(function(tx){
          html += '<tr><th title="' + tx.value + '"><div style="width:18px;height:18px;background:' + tx.value + ';border:1px solid #999;display:inline-block;vertical-align:middle"></div> ' + tx.key + '</th>';
          bgKeys.forEach(function(b){
            var rgbT = parseColor(tx.value), rgbB = parseColor(b.value);
            if (!rgbT || !rgbB) {
              html += '<td class="cm-cell">—</td>';
              return;
            }
            var ratio = contrast(rgbT, rgbB);
            var cls = classify(ratio);
            var label = cls === 'cm-aaa' ? 'AAA' : cls === 'cm-aa' ? 'AA' : 'fail';
            html += '<td class="cm-cell ' + cls + '" title="' + ratio.toFixed(2) + ':1 — ' + label + '">' + ratio.toFixed(2) + '</td>';
          });
          html += '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
      }
      renderMatrix();

      // ── Token exports ───────────────────────────────────────────
      function flatten(obj, prefix){
        prefix = prefix || '';
        var out = [];
        if (!obj || typeof obj !== 'object') return out;
        Object.keys(obj).forEach(function(k){
          var key = prefix ? prefix + '-' + k : k;
          var v = obj[k];
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            out = out.concat(flatten(v, key));
          } else if (typeof v === 'string' || typeof v === 'number') {
            out.push({ name: key, value: String(v) });
          }
        });
        return out;
      }

      function asTailwind(){
        var c = TOKENS.colors || {};
        var lines = ['/** @type {import("tailwindcss").Config} */', 'module.exports = {', '  theme: {', '    extend: {', '      colors: ' + JSON.stringify(c, null, 8).replace(/\\n/g, '\\n      ') + ','];
        if (TOKENS.spacing) lines.push('      spacing: ' + JSON.stringify(TOKENS.spacing, null, 8).replace(/\\n/g, '\\n      ') + ',');
        if (TOKENS.rounded) lines.push('      borderRadius: ' + JSON.stringify(TOKENS.rounded, null, 8).replace(/\\n/g, '\\n      ') + ',');
        var fonts = {};
        Object.keys(TOKENS.typography || {}).forEach(function(name){
          var spec = TOKENS.typography[name];
          if (spec && spec.fontFamily) {
            var fam = String(spec.fontFamily).split(',').map(function(s){ return s.trim().replace(/['"]/g, ''); });
            fonts[name] = fam;
          }
        });
        if (Object.keys(fonts).length) lines.push('      fontFamily: ' + JSON.stringify(fonts, null, 8).replace(/\\n/g, '\\n      ') + ',');
        lines.push('    },', '  },', '};');
        return lines.join('\\n');
      }

      function asCssVars(){
        var lines = [':root {'];
        flatten(TOKENS.colors, 'color').forEach(function(t){ lines.push('  --' + t.name + ': ' + t.value + ';'); });
        flatten(TOKENS.spacing, 'space').forEach(function(t){ lines.push('  --' + t.name + ': ' + t.value + ';'); });
        flatten(TOKENS.rounded, 'radius').forEach(function(t){ lines.push('  --' + t.name + ': ' + t.value + ';'); });
        Object.keys(TOKENS.typography || {}).forEach(function(name){
          var spec = TOKENS.typography[name] || {};
          Object.keys(spec).forEach(function(prop){
            lines.push('  --type-' + name + '-' + prop.replace(/[A-Z]/g, function(m){ return '-' + m.toLowerCase(); }) + ': ' + spec[prop] + ';');
          });
        });
        lines.push('}');
        return lines.join('\\n');
      }

      function asDtcg(){
        function bucket(obj, type){
          var out = {};
          if (!obj) return out;
          Object.keys(obj).forEach(function(k){
            var v = obj[k];
            if (v && typeof v === 'object' && !Array.isArray(v) && !('value' in v)) {
              out[k] = bucket(v, type);
            } else {
              out[k] = { '$value': v, '$type': type };
            }
          });
          return out;
        }
        var dtcg = {};
        if (TOKENS.colors) dtcg.color = bucket(TOKENS.colors, 'color');
        if (TOKENS.spacing) dtcg.spacing = bucket(TOKENS.spacing, 'dimension');
        if (TOKENS.rounded) dtcg.borderRadius = bucket(TOKENS.rounded, 'dimension');
        if (TOKENS.typography) {
          dtcg.typography = {};
          Object.keys(TOKENS.typography).forEach(function(name){
            dtcg.typography[name] = { '$value': TOKENS.typography[name], '$type': 'typography' };
          });
        }
        return JSON.stringify(dtcg, null, 2);
      }

      function asStyleDictionary(){
        function wrap(obj){
          var out = {};
          if (!obj) return out;
          Object.keys(obj).forEach(function(k){
            var v = obj[k];
            if (v && typeof v === 'object' && !Array.isArray(v)) {
              out[k] = wrap(v);
            } else {
              out[k] = { value: v };
            }
          });
          return out;
        }
        var sd = { color: wrap(TOKENS.colors), size: { spacing: wrap(TOKENS.spacing), radius: wrap(TOKENS.rounded) }, font: wrap(TOKENS.typography) };
        return JSON.stringify(sd, null, 2);
      }

      var EXPORTS = {
        'design-md': function(){ return DESIGN_MD; },
        'agent-prompt': function(){ return AGENT_PROMPT; },
        'tailwind': asTailwind,
        'css-vars': asCssVars,
        'dtcg': asDtcg,
        'style-dictionary': asStyleDictionary,
        'raw-json': function(){ return JSON.stringify(TOKENS, null, 2); },
      };
      var EXPORT_LABELS = {
        'design-md': 'DESIGN.md',
        'agent-prompt': 'AI agent prompt',
        'tailwind': 'Tailwind config',
        'css-vars': 'CSS variables',
        'dtcg': 'DTCG JSON',
        'style-dictionary': 'Style Dictionary',
        'raw-json': 'tokens.json',
      };

      document.querySelectorAll('[data-export]').forEach(function(btn){
        btn.addEventListener('click', function(){
          var fmt = btn.getAttribute('data-export');
          var fn = EXPORTS[fmt];
          if (!fn) return;
          var text;
          try { text = fn(); } catch(err){ showToast('Export failed: ' + err.message); return; }
          navigator.clipboard.writeText(text).then(function(){
            showToast('Copied as ' + (EXPORT_LABELS[fmt] || fmt));
          });
        });
      });
    })();
  </script>
  <script>
    // Section rail numbers follow the visual flex order, not the source order.
    (function(){
      var sections = Array.prototype.slice.call(document.querySelectorAll('main.preview-shell > section'));
      sections
        .sort(function(a,b){
          var oa = parseInt(getComputedStyle(a).order || '0', 10);
          var ob = parseInt(getComputedStyle(b).order || '0', 10);
          if (oa !== ob) return oa - ob;
          return Array.prototype.indexOf.call(a.parentNode.children, a) - Array.prototype.indexOf.call(b.parentNode.children, b);
        })
        .forEach(function(sec, index){
          sec.dataset.sectionIndex = '[' + String(index + 1).padStart(2, '0') + ']';
        if (sec.dataset.rail) return;
        var h2 = sec.querySelector('h2');
        var raw = h2 ? h2.textContent.trim() : (sec.className || 'section').replace(/-/g,' ');
        sec.dataset.rail = raw.toUpperCase().replace(/\s+/g, '_');
      });
    })();
  </script>
  <script>
    // Action bar — COPY .MD / COPY AI PROMPT / DOWNLOAD .MD wiring.
    (function(){
      var DM = ${JSON.stringify(designMd || "")};
      var AP = ${JSON.stringify(agentPrompt || "")};
      function flash(btn, msg){
        var orig = btn.innerHTML;
        btn.innerHTML = '<span class="ab-glyph">✓</span>' + msg;
        setTimeout(function(){ btn.innerHTML = orig; }, 1400);
      }
      document.querySelectorAll('[data-copy-md]').forEach(function(copyMd){
        copyMd.addEventListener('click', function(){
          navigator.clipboard.writeText(DM).then(function(){ flash(copyMd, 'COPIED'); });
        });
      });
      var copyPrompt = document.querySelector('[data-copy-prompt]');
      if (copyPrompt) {
        if (!AP) { copyPrompt.disabled = true; copyPrompt.style.opacity = '0.4'; copyPrompt.title = 'No AI prompt available'; }
        copyPrompt.addEventListener('click', function(){
          if (!AP) return;
          navigator.clipboard.writeText(AP).then(function(){ flash(copyPrompt, 'COPIED'); });
        });
      }
    })();
  </script>
  </main>
  <footer class="aiox-footer" role="contentinfo">
    <div class="aiox-footer-grid">
      <div class="aiox-footer-col">
        ${AIOX_LOGO_WHITE ? `<img class="aiox-footer-logo" src="${AIOX_LOGO_WHITE}" alt="AIOX" />` : `<h4>AIOX · DESIGN.md</h4>`}
        <h4>DESIGN.md</h4>
        <p>Galeria curada de DESIGN.md — extraia, explore e use sistemas visuais de qualquer marca diretamente em Claude, Cursor, v0 e Lovable. Formato aberto, comunidade aberta.</p>
        <p>Powered by <code>@google/design.md</code> + <code>claude-cli</code>. Static analysis, no headless browser.</p>
      </div>
      <div class="aiox-footer-col">
        <h4>Skill</h4>
        <a href="https://github.com/SynkraAI/sinkra-hub" target="_blank" rel="noopener">github · sinkra-hub</a>
        <a href="https://github.com/google-labs-code/design.md" target="_blank" rel="noopener">spec · @google/design.md</a>
        <a href="https://design.aioxsquad.ai/" target="_blank" rel="noopener">design.aioxsquad.ai</a>
      </div>
      <div class="aiox-footer-col">
        <h4>Creator</h4>
        <a href="https://x.com/oalanicolas" target="_blank" rel="noopener">@oalanicolas · x.com</a>
        <a href="https://github.com/alanicolas" target="_blank" rel="noopener">@alanicolas · github</a>
        <a href="https://linkedin.com/in/alanicolas" target="_blank" rel="noopener">alan nicolas · linkedin</a>
      </div>
    </div>
    <div class="aiox-footer-bar">
      <span class="built-by">built by <a href="https://x.com/oalanicolas" target="_blank" rel="noopener">@oalanicolas</a> · aiox squad</span>
      <span>design systems for AI agents</span>
    </div>
  </footer>
</body>
</html>`;
}


module.exports = { renderPreview };
