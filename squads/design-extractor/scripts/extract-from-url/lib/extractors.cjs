"use strict";

// Static-CSS extractors and analyzers.
// Each function takes a CSS string (or HTML+CSS) and returns structured tokens.
// Pure functions — no I/O. Easy to test.

const cheerio = require("cheerio");
const TurndownService = require("turndown");

// ── CSS truncation for LLM input (cost discipline) ──────────────────
// Empirical: Apple css-collected.css = 668KB. Phase 6 LLM cost = $5.50/run with Opus.
// Most of that is brand-irrelevant utility CSS. The DESIGN.md generator only needs:
//   1. :root and theme vars (token primitives)
//   2. dark mode overrides (.dark, [data-theme=dark], @media prefers-color-scheme: dark)
//   3. component selectors that actually use the tokens (via usage-graph hint)
//   4. font-face declarations (already extracted but kept here for context)
// Strategy: select prioritized rule blocks until budget is hit, drop the rest.
// Default budget: 100KB (~25K tokens) — keeps Phase 6 input within ~4× compression.

const DEFAULT_CSS_BUDGET_BYTES = 100 * 1024;

function truncateCssForLlm(css, options = {}) {
  const budget = options.budgetBytes || DEFAULT_CSS_BUDGET_BYTES;
  if (!css || css.length <= budget) {
    return { truncated: css || "", original_bytes: (css || "").length, kept_bytes: (css || "").length, dropped: false };
  }

  // Split into rule blocks (`selector { ... }`) keeping ranges. Naive but effective:
  //   we walk the string, balancing braces, capturing each top-level block.
  const blocks = [];
  let depth = 0;
  let blockStart = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const block = css.slice(blockStart, i + 1);
        blocks.push(block);
        blockStart = i + 1;
      }
    }
  }

  // Score each block by priority. Higher score = keep first.
  const scored = blocks.map((block, idx) => {
    let score = 0;
    const head = block.slice(0, 200).toLowerCase();
    // 1. :root and CSS var declarations — highest priority (token primitives)
    if (/:root\b/.test(head)) score += 1000;
    // 2. Dark mode (.dark, data-theme, prefers-color-scheme)
    if (/\.dark\b|\[data-theme[^\]]*\]|prefers-color-scheme/.test(head)) score += 800;
    // 3. @theme inline (Tailwind v4 token mapping)
    if (/@theme\b/.test(head)) score += 700;
    // 4. font-face — kept for context (already separately extracted)
    if (/@font-face\b/.test(head)) score += 600;
    // 5. CSS-vars-heavy blocks (lots of --foo: declarations)
    const varCount = (block.match(/--[a-z][\w-]*\s*:/gi) || []).length;
    score += Math.min(varCount * 5, 500);
    // 6. Component-like selectors (most common: button, input, card, modal/dialog)
    if (/\b(button|input|card|modal|dialog|form|nav|header|footer|menu|tooltip|select)\b/.test(head)) {
      score += 200;
    }
    // 7. Atom selectors (single class/element) score moderately
    if (/^[\s\w*][^,{]{0,30}\{/.test(block)) score += 50;
    // Penalty: very long media query blocks (responsive utility soup)
    if (/@media\b/.test(head) && block.length > 5000) score -= 200;
    // Penalty: vendor prefixes / animation keyframes (low signal for tokens)
    if (/@-webkit-|@-moz-|@keyframes\b/.test(head) && block.length > 2000) score -= 100;

    return { idx, block, score, len: block.length };
  });

  // Sort by score desc, then accumulate until budget is exhausted.
  scored.sort((a, b) => b.score - a.score);
  const kept = [];
  let used = 0;
  for (const item of scored) {
    if (used + item.len > budget) continue;
    kept.push(item);
    used += item.len;
  }

  // Restore original document order so the LLM sees natural cascade
  kept.sort((a, b) => a.idx - b.idx);
  const truncated = kept.map(k => k.block).join("\n\n");

  const summary = `\n/* TRUNCATED for LLM budget — kept ${kept.length}/${blocks.length} blocks (${used}/${css.length} bytes ≈ ${Math.round(used / css.length * 100)}%) */\n`;
  return {
    truncated: summary + truncated,
    original_bytes: css.length,
    kept_bytes: used,
    blocks_total: blocks.length,
    blocks_kept: kept.length,
    dropped: true,
  };
}

// ── Phase 3e: Stack suppression table ───────────────────────────────
// Parent framework suppresses child markers (redundant signal — preserved with suppressed_by field)
const STACK_SUPPRESSIONS = {
  "Next.js":   ["React"],
  "Nuxt":      ["Vue"],
  "SvelteKit": ["Svelte"],
  "Astro":     ["React", "Vue", "Svelte"],
};

// ── Phase 3a: Regex token detection (legacy heuristic helper) ───────
function detectTokens(css) {
  const colorsHex = new Set();
  const colorsRgb = new Set();
  const colorsHsl = new Set();
  const fontFamilies = new Set();
  const fontSizes = new Set();
  const lineHeights = new Set();
  const fontWeights = new Set();
  const radii = new Set();
  const spacing = new Set();
  const googleFonts = new Set();

  for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) colorsHex.add(m[0].toLowerCase());
  for (const m of css.matchAll(/rgba?\([^)]+\)/gi)) colorsRgb.add(m[0].replace(/\s+/g, ""));
  for (const m of css.matchAll(/hsla?\([^)]+\)/gi)) colorsHsl.add(m[0].replace(/\s+/g, ""));
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{\n]+)/gi)) {
    const value = m[1].replace(/['"]/g, "").trim();
    value.split(",").map((v) => v.trim()).filter(Boolean).forEach((v) => fontFamilies.add(v));
  }
  for (const m of css.matchAll(/font-size\s*:\s*([^;}{\n]+)/gi)) fontSizes.add(m[1].trim());
  for (const m of css.matchAll(/line-height\s*:\s*([^;}{\n]+)/gi)) lineHeights.add(m[1].trim());
  for (const m of css.matchAll(/font-weight\s*:\s*([^;}{\n]+)/gi)) fontWeights.add(m[1].trim());
  for (const m of css.matchAll(/border-radius\s*:\s*([^;}{\n]+)/gi)) radii.add(m[1].trim());
  for (const m of css.matchAll(/(?:padding|margin|gap)\s*:\s*([^;}{\n]+)/gi)) spacing.add(m[1].trim());
  for (const m of css.matchAll(/fonts\.googleapis\.com[^"'\s)]+/gi)) googleFonts.add(m[0]);

  return {
    colors: {
      hex: [...colorsHex].sort(),
      rgb: [...colorsRgb].slice(0, 80),
      hsl: [...colorsHsl].slice(0, 80),
    },
    typography: {
      family: [...fontFamilies].sort(),
      size: [...fontSizes].slice(0, 60),
      weight: [...fontWeights].sort(),
      line_height: [...lineHeights].slice(0, 40),
    },
    radii: [...radii].slice(0, 40),
    spacing: [...spacing].slice(0, 80),
    google_fonts_urls: [...googleFonts],
  };
}

// ── Phase 3b: Native CSS variable detection (ground truth) ──────────
function detectCssVars(css) {
  const declarations = [];
  const ruleRe = /([^{}]+)\{([^}]*)\}/g;
  let match;
  let line = 1;
  let lastIndex = 0;
  while ((match = ruleRe.exec(css)) !== null) {
    line += (css.slice(lastIndex, match.index).match(/\n/g) || []).length;
    lastIndex = match.index;
    const selector = match[1].trim().replace(/\s+/g, " ").slice(0, 200);
    const body = match[2];
    // Match custom property names that may start with letter, underscore, or
    // digit (Webflow emits "private" vars as `--_button-style---background`,
    // and some sites use `--1`/`--2` for grid columns).
    const declRe = /(--[\w-][\w-]*)\s*:\s*([^;]+?)\s*(?:;|$)/g;
    let dm;
    while ((dm = declRe.exec(body)) !== null) {
      const name = dm[1];
      const value = dm[2].trim();
      const isAlias = /^var\(/.test(value);
      declarations.push({ selector, name, value, is_alias: isAlias, line });
    }
  }
  return declarations;
}

// ── Phase 3c: @font-face exhaustive parsing ─────────────────────────
// Tracks origin CSS file via collectCss() comment markers so relative
// font URLs (e.g. Next.js `url(../media/foo.woff2)`) resolve against
// the CSS file URL, not the page URL.
//
// collectCss() emits three marker shapes:
//   /* ── <url> ── */                 → top-level chunk file
//   /* ── @import → <url> ── */       → push imported url
//   /* ── /@import ── */              → pop back to parent
//
// We walk the markers in order, maintaining a chunk + import stack, and
// emit ranges [start, end, url) so that any byte in the bundled CSS
// resolves to its true origin URL.
function buildOriginIndex(css) {
  const tokenRe = /\/\*\s*──\s*(@import\s*→\s*(https?:\/\/[^\s]+?)|\/@import|(https?:\/\/[^\s]+?))\s*──\s*\*\//g;
  const events = [];
  let m;
  while ((m = tokenRe.exec(css)) !== null) {
    if (m[2]) events.push({ index: m.index + m[0].length, kind: "import_push", url: m[2] });
    else if (m[3]) events.push({ index: m.index + m[0].length, kind: "chunk", url: m[3] });
    else events.push({ index: m.index + m[0].length, kind: "import_pop" });
  }
  const ranges = [];
  let chunk = null;
  const importStack = [];
  let cursor = 0;
  for (const ev of events) {
    const current = importStack.length > 0 ? importStack[importStack.length - 1] : chunk;
    if (current && ev.index > cursor) ranges.push({ start: cursor, end: ev.index, url: current });
    if (ev.kind === "chunk") {
      chunk = ev.url;
      importStack.length = 0;
    } else if (ev.kind === "import_push") {
      importStack.push(ev.url);
    } else if (ev.kind === "import_pop") {
      importStack.pop();
    }
    cursor = ev.index;
  }
  const tail = importStack.length > 0 ? importStack[importStack.length - 1] : chunk;
  if (tail) ranges.push({ start: cursor, end: css.length, url: tail });
  return ranges;
}
function originAt(ranges, pos) {
  for (const r of ranges) {
    if (pos >= r.start && pos < r.end) return r.url;
  }
  return null;
}
function detectFontFaces(css) {
  const faces = [];
  const origins = buildOriginIndex(css);
  const re = /@font-face\s*\{([^}]+)\}/gi;
  let match;
  while ((match = re.exec(css)) !== null) {
    const body = match[1];
    const get = (prop) => {
      const m = body.match(new RegExp(`${prop}\\s*:\\s*([^;]+?)\\s*(?:;|$)`, "i"));
      return m ? m[1].trim().replace(/['"]/g, "") : null;
    };
    const family = get("font-family");
    if (!family) continue;
    const srcRaw = body.match(/src\s*:\s*([^;]+?)\s*(?:;|$)/i);
    const urls = srcRaw
      ? [...srcRaw[1].matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map((m) => m[1])
      : [];
    const formats = srcRaw
      ? [...srcRaw[1].matchAll(/format\(\s*["']?([^"')]+)["']?\s*\)/gi)].map((m) => m[1])
      : [];
    faces.push({
      family,
      weight: get("font-weight"),
      style: get("font-style"),
      display: get("font-display"),
      stretch: get("font-stretch"),
      unicode_range: get("unicode-range"),
      src_urls: urls,
      src_formats: formats,
      source_css_url: originAt(origins, match.index),
      raw: match[0].slice(0, 500),
    });
  }
  return faces;
}

// ── Phase 3d: Token usage graph (declarations × references) ─────────
function buildUsageGraph(css, declarations) {
  const usage = new Map();
  for (const d of declarations) {
    if (!usage.has(d.name)) usage.set(d.name, { declarations: 0, references: 0 });
    usage.get(d.name).declarations++;
  }
  const refRe = /var\(\s*(--[a-zA-Z][\w-]*)/g;
  let m;
  while ((m = refRe.exec(css)) !== null) {
    const name = m[1];
    if (!usage.has(name)) usage.set(name, { declarations: 0, references: 0 });
    usage.get(name).references++;
  }
  const out = [];
  for (const [name, counts] of usage.entries()) {
    out.push({ name, ...counts });
  }
  out.sort((a, b) => b.references - a.references);
  return out;
}

// ── Phase 3e: Stack fingerprint detection ───────────────────────────
/**
 * Detects technology stack from HTML, CSS, CSS metadata, and HTTP response headers.
 * Returns an array of match objects: { name, kind, evidence, confidence, suppressed_by? }
 *
 * @param {string} html - Raw HTML content
 * @param {string} css - Concatenated CSS content
 * @param {object} cssMeta - CSS metadata (external URLs, etc.)
 * @param {object} [headers={}] - HTTP response headers (keys lowercased). Default {} for backward compat.
 */
function detectStack(html, css, cssMeta, headers = {}) {
  const matches = [];
  // Dedup by (name, kind) pair — header-based detection wins over CSS-URL heuristic
  const add = (name, kind, evidence, confidence = "medium") => {
    if (matches.some(m => m.name === name && m.kind === kind)) return;
    matches.push({ name, kind, evidence: evidence.slice(0, 120), confidence });
  };

  const sample = html.slice(0, 200000);

  // ── Header-based detections (always "high" — server response is fact, not inference) ──
  if ((headers["server"] && /cloudflare/i.test(headers["server"])) || headers["cf-ray"]) {
    add("Cloudflare", "cdn", "Cloudflare server header / cf-ray", "high");
  }
  if (headers["x-vercel-id"] || (headers["server"] && /vercel/i.test(headers["server"]))) {
    add("Vercel", "hosting", "x-vercel-id header", "high");
  }
  if ((headers["server"] && /netlify/i.test(headers["server"])) || headers["x-nf-request-id"]) {
    add("Netlify", "hosting", "Netlify response header", "high");
  }
  if (headers["x-shopify-stage"] || headers["x-shopid"]) {
    add("Shopify", "ecommerce", "Shopify response header", "high");
  }
  if (headers["x-powered-by"] && /Next\.js/i.test(headers["x-powered-by"])) {
    add("Next.js", "framework", "x-powered-by header", "high");
  }
  if (headers["x-github-request-id"]) {
    add("GitHub Pages", "hosting", "GitHub Pages response header", "high");
  }

  // Frameworks (build-time / runtime)
  if (/__next|_next\/static\/|next-route-announcer/i.test(sample)) add("Next.js", "framework", "_next/static/ paths in HTML", "high");
  if (/__nuxt|_nuxt\/|nuxt-link/i.test(sample)) add("Nuxt", "framework", "_nuxt/ paths", "high");
  if (/data-reactroot|react-dom|__react/i.test(sample)) add("React", "framework", "react markers", "medium");
  if (/data-svelte|__svelte_kit/i.test(sample)) add("SvelteKit", "framework", "svelte markers", "high");
  if (/_astro\/|astro-island/i.test(sample)) add("Astro", "framework", "_astro/ paths", "high");
  if (/data-vue-meta|__vue/i.test(sample)) add("Vue", "framework", "vue markers", "medium");
  if (/data-wf-page|w-webflow|w-richtext|webflow/i.test(sample)) add("Webflow", "builder", "data-wf-page or w- classes", "high");
  if (/wix-(?:site|protocol)|x-wix-/i.test(sample)) add("Wix", "builder", "wix markers", "high");
  if (/data-framer|framer-motion-data/i.test(sample)) add("Framer", "builder", "framer markers", "high");
  if (/Squarespace\.|sqspthumb|static\d?\.squarespace/i.test(sample)) add("Squarespace", "builder", "squarespace markers", "high");
  if (/wp-content\/|wp-includes\/|\/wp-json\//i.test(sample)) add("WordPress", "cms", "wp-content / wp-includes paths", "high");
  if (/data-shopify|shopify\.com\/cdn|window\.Shopify/i.test(sample)) add("Shopify", "ecommerce", "shopify markers", "high");
  if (/__GHOST_URL__|content\/.*\/ghost/i.test(sample)) add("Ghost", "cms", "ghost markers", "high");
  if (/cdn\.contentful\.com|ctfassets/i.test(sample)) add("Contentful", "cms", "contentful CDN", "high");
  if (/cdn\.sanity\.io/i.test(sample)) add("Sanity", "cms", "sanity CDN", "high");

  // CSS frameworks
  if (/tailwindcss\s+v(\d+)/i.test(css)) {
    const m = css.match(/tailwindcss\s+v(\d+(?:\.\d+)?)/i);
    add(`Tailwind CSS${m ? ` v${m[1]}` : ""}`, "css-framework", "tailwindcss banner in CSS", "high");
  } else if (/--tw-translate-x|tw-bg-opacity|--tw-/i.test(css)) {
    // Inferred from var usage without explicit banner
    add("Tailwind CSS", "css-framework", "--tw-* CSS variables", "medium");
  }
  // shadcn tokens are explicit namespace markers → high
  if (/--shadcn|hsl\(var\(--background\)\)|--popover-foreground/i.test(css)) add("shadcn/ui", "component-library", "shadcn/ui design tokens", "high");
  // MUI explicit class prefix → high
  if (/\.MuiButton-|\.MuiCard-|@mui\/material/i.test(sample) || /\.Mui[A-Z]/.test(css)) add("Material UI", "component-library", "MUI class prefix", "high");
  // Radix explicit data attributes → high
  if (/data-radix-|--radix-/i.test(css) || /@radix-ui\//i.test(sample)) add("Radix UI", "component-library", "radix data attributes", "high");
  // Chakra namespace → high
  if (/chakra\.|--chakra-|chakra-ui/i.test(css) || /__chakra/i.test(sample)) add("Chakra UI", "component-library", "chakra markers", "high");
  if (/--mantine-|mantine\.style/i.test(css) || /mantine/i.test(sample)) add("Mantine", "component-library", "mantine markers", "medium");
  if (/bulma|\.is-primary\.is-/i.test(css)) add("Bulma", "css-framework", "bulma classes", "medium");
  if ((/bootstrap(?:\.min)?\.css|\/bootstrap\//i.test(sample)) || (/\.col-md-\d/i.test(css) && /\.container-fluid|\.row\s*\{/i.test(css))) {
    add("Bootstrap", "css-framework", "bootstrap markers", "medium");
  }

  // Animation libraries
  if (/gsap\.|window\.gsap|gsap\.registerPlugin/i.test(sample)) add("GSAP", "animation", "gsap calls", "high");
  if (/framer-motion|m\.div|motion\.div/i.test(sample)) add("Framer Motion", "animation", "motion. component", "high");
  if (/lenis|smooth-scroll-lenis|@studio-freight\/lenis/i.test(sample)) add("Lenis", "animation", "lenis smooth scroll", "medium");
  if (/lottie-(?:web|player)|\.lottie/i.test(sample)) add("Lottie", "animation", "lottie player", "high");
  if (/three\.js|three\.module|\.glb|\.gltf/i.test(sample)) add("Three.js", "3d", "three.js / GLTF assets", "high");
  if (/spline\.design|spline\.runtime/i.test(sample)) add("Spline", "3d", "spline runtime", "high");

  // Analytics
  if (/googletagmanager|gtag\(|google-analytics/i.test(sample)) add("Google Analytics / GTM", "analytics", "gtag or googletagmanager", "high");
  if (/segment\.com\/analytics|window\.analytics\.load/i.test(sample)) add("Segment", "analytics", "segment loader", "high");
  if (/mixpanel\.|cdn\.mxpnl/i.test(sample)) add("Mixpanel", "analytics", "mixpanel", "high");
  if (/plausible\.io|plausible\.outbound/i.test(sample)) add("Plausible", "analytics", "plausible", "high");
  if (/posthog\.|app\.posthog\.com/i.test(sample)) add("PostHog", "analytics", "posthog", "high");
  if (/amplitude\.|cdn\.amplitude/i.test(sample)) add("Amplitude", "analytics", "amplitude", "high");
  if (/heap\.io|heap\.|cdn\.heapanalytics/i.test(sample)) add("Heap", "analytics", "heap analytics", "high");
  if (/hotjar\.com|static\.hotjar/i.test(sample)) add("Hotjar", "analytics", "hotjar", "high");
  if (/cdn\.vercel-insights|_vercel\/insights/i.test(sample)) add("Vercel Analytics", "analytics", "vercel insights", "medium");

  // Auth / forms / backend
  if (/clerk\.com|@clerk\/|clerk\.dev/i.test(sample)) add("Clerk", "auth", "clerk", "high");
  if (/auth0\.com|@auth0\//i.test(sample)) add("Auth0", "auth", "auth0", "high");
  if (/next-auth|nextauth/i.test(sample)) add("NextAuth", "auth", "nextauth", "high");
  if (/supabase\.co|@supabase\//i.test(sample)) add("Supabase", "backend", "supabase", "high");
  if (/firebaseapp\.com|firebase\.|@firebase\//i.test(sample)) add("Firebase", "backend", "firebase", "high");

  // Hosting / CDN (CSS-URL inference — medium confidence, header check above is high)
  if ((cssMeta?.external || []).some(u => /vercel\.com|vercel-storage|vercel-app/i.test(u))) add("Vercel", "hosting", "vercel CDN in stylesheets", "medium");
  if ((cssMeta?.external || []).some(u => /cloudflare|cdn\.cloudflare/i.test(u))) add("Cloudflare", "cdn", "cloudflare CDN", "medium");
  if ((cssMeta?.external || []).some(u => /akamai/i.test(u))) add("Akamai", "cdn", "akamai CDN", "medium");
  if ((cssMeta?.external || []).some(u => /cdn\.prod\.website-files\.com/i.test(u))) add("Webflow CDN", "cdn", "webflow CDN", "high");

  // A/B testing + Live chat
  if (/optimizely\.|cdn\.optimizely/i.test(sample)) add("Optimizely", "ab-testing", "optimizely", "high");
  if (/cdn\.split\.io|sdk\.split\.io/i.test(sample)) add("Split", "ab-testing", "split sdk", "high");
  if (/intercom\.|widget\.intercom/i.test(sample)) add("Intercom", "support", "intercom", "high");
  if (/drift\.com\/widget|driftt\.com/i.test(sample)) add("Drift", "support", "drift", "high");
  if (/crisp\.chat|static\.crisp/i.test(sample)) add("Crisp", "support", "crisp", "high");
  if (/zdassets\.com|zendesk\.com\/embeddable/i.test(sample)) add("Zendesk", "support", "zendesk widget", "high");

  // Brand-proprietary stacks
  if (/ac-globalnav|ac-localnav|ac-gn-|ac-ln-|globalnav-content/i.test(sample) || /--sk-(?:button|body|focus)-/i.test(css)) {
    add("Apple Storekit (SK Design System)", "design-system", "ac-globalnav / --sk-* tokens", "high");
  }
  if (/--anthropic-|class="anthropic-/i.test(css) || /AnthropicSerif|AnthropicSans|AnthropicMono/i.test(css)) {
    add("Anthropic Brand System", "design-system", "Anthropic Sans/Serif/Mono", "high");
  }
  if (/--bb-(?:lime|dark|cream|surface|ink)/i.test(css)) {
    add("AIOX Brandbook", "design-system", "--bb-* token namespace", "high");
  }
  if (/--geist-|@vercel\/geist|GeistSans|GeistMono/i.test(css) || /__geist/i.test(sample)) {
    add("Vercel Geist", "design-system", "--geist-* tokens or Geist Sans/Mono", "high");
  }

  // ── S3: Cross-signal suppression pass ───────────────────────────────
  // Mark redundant child signals with suppressed_by — preserve evidence, mark as secondary
  for (const [parent, children] of Object.entries(STACK_SUPPRESSIONS)) {
    if (matches.find(m => m.name === parent)) {
      for (const child of children) {
        const childMatch = matches.find(m => m.name === child);
        if (childMatch && !childMatch.suppressed_by) {
          childMatch.suppressed_by = parent;
        }
      }
    }
  }

  return matches;
}

// ── Phase 3f: Style fingerprint classification (visual archetype) ────

// Archetype expectations distilled from squads/design-ops/data/style-fingerprints.yaml.
// Each archetype lists expected signal values with weights for scoring.
// Single source of truth for the algorithm; YAML is the prose reference.
const ARCHETYPES = {
  "shadcn-neutral": {
    // shadcn is monochrome with subtle-to-moderate accents (Github's blue, lucide).
    // GitHub real homepage has 3 backdrop-filter declarations (modals/dropdowns) but
    // overall is shadcn-flavored. Glass is permitted as auxiliary surface, not primary.
    radius_scale:       ["moderate", "minimal", "minimal-to-moderate"],
    color_saturation:   ["near-zero", "moderate"],
    spacing_density:    ["moderate"],
    typography_weight:  ["regular-bold", "regular-medium-semibold-bold", "regular"],
    shadow_intensity:   ["subtle", "none", "moderate"],
    surface_treatment:  ["flat-with-border", "flat", "glass"],
  },
  "carbon-enterprise": {
    // Carbon palette is grayscale-dominant with single saturated brand blue; median
    // chroma is "very-low". Empirical: real Carbon CSS yields very-low saturation.
    // surface_treatment: prefer borders, but accept flat when sample lacks border decls.
    radius_scale:       ["minimal", "minimal-to-moderate"],
    color_saturation:   ["moderate", "very-low"],
    spacing_density:    ["compact"],
    typography_weight:  ["regular-bold", "regular"],
    shadow_intensity:   ["none"],
    surface_treatment:  ["flat-with-border", "flat"],
  },
  "material-elevation": {
    radius_scale:       ["moderate", "minimal-to-moderate"],
    color_saturation:   ["high"],
    spacing_density:    ["moderate"],
    typography_weight:  ["regular-medium-semibold-bold", "regular-bold"],
    shadow_intensity:   ["strong", "moderate"],
    surface_treatment:  ["shadowed", "soft-shadowed"],
  },
  "polaris-friendly": {
    // Polaris allows broader font weights (Inter 400/500/600 common in admin context).
    // shopify.com homepage uses gradients on hero — accept "gradient" surface as valid.
    // CALIBRATION 2026-04-27: Polaris does NOT use glass surfaces (e-commerce wants
    // clarity, not Apple-style frosted overlays). Removed "glass" greediness.
    radius_scale:       ["moderate", "moderate-high"],
    color_saturation:   ["moderate", "high", "very-low"],
    spacing_density:    ["very-roomy", "moderate"],
    typography_weight:  ["regular-bold", "regular-medium-semibold-bold", "regular"],
    shadow_intensity:   ["subtle", "moderate", "strong"],
    surface_treatment:  ["soft-shadowed", "flat", "flat-with-border", "gradient"],
  },
  "apple-glass": {
    // Calibrated 2026-04-27 from real apple.com run: shadow_intensity comes back
    // "strong" (Apple uses prominent dropshadows on cards/floating elements),
    // typography_weight is "regular-medium-semibold-bold" (SF Pro 4-weight),
    // spacing_density is "moderate" (header/nav are tight; only hero is roomy).
    // Glass is the strong invariant. CRITICAL: reject "high-with-gradients" saturation —
    // that's marketing-gradient territory (Stripe), not Apple's restrained mono palette.
    radius_scale:       ["high", "moderate-high", "moderate"],
    color_saturation:   ["near-zero", "very-low"],  // Apple is strictly mono — NO high/high-with-gradients
    spacing_density:    ["very-roomy", "moderate"],
    typography_weight:  ["thin-bold", "regular-bold", "regular-medium-semibold-bold"],
    shadow_intensity:   ["subtle", "none", "moderate", "strong"],
    surface_treatment:  ["glass"],
  },
  "cinematic-streaming": {
    // Netflix-style public/marketing surfaces: dark-first, high-contrast,
    // content/hero driven, with sparse saturated red CTA and cinematic gradient
    // overlays. This is intentionally separate from apple-glass: translucent
    // dark form controls and one blurred media panel are not enough to make a
    // whole system feel like frosted glass.
    //
    // CALIBRATION 2026-05-03 (A2 fix): pre-fix this archetype matched Amazon
    // (orange brand), Itaú (orange brand) and other non-streaming sites at
    // 91-100% confidence because the only specific signal (color_role_pattern
    // = red-on-black) was treated as a bonus, not a requirement. Without it,
    // every other signal accepts permissive defaults that any dark-themed site
    // satisfies. Now requires red-on-black hard.
    required:           ["color_role_pattern"],   // hard gate — without this, score = 0
    radius_scale:       ["minimal-to-moderate", "moderate", "moderate-high"],
    color_saturation:   ["very-low", "moderate", "high"],
    spacing_density:    ["moderate", "very-roomy"],
    typography_weight:  ["regular-bold", "regular-medium-semibold-bold", "thin-bold"],
    shadow_intensity:   ["strong", "moderate", "subtle"],
    surface_treatment:  ["gradient", "shadowed", "flat-with-border", "flat"],
    color_role_pattern: ["red-on-black"],
  },
  "marketing-corporate": {
    // Marketing/corporate sites with a saturated brand color (orange Itaú/Amazon,
    // blue Santander/Bradesco, green Nubank/Cash, etc.) over light surface,
    // moderate-to-roomy spacing, mixed gradient + flat surfaces. Catches the
    // "well-funded marketing landing page that isn't shadcn-flat, isn't Apple
    // glass, isn't streaming-cinematic" segment that previously fell into
    // cinematic-streaming by default.
    //
    // HARD GATE: must have a saturated palette. Without "high" or
    // "high-with-gradients" saturation this is just shadcn-neutral or
    // carbon-enterprise. The required-signal mechanism prevents this archetype
    // from absorbing every moderate-everywhere site.
    required:           ["color_saturation"],
    radius_scale:       ["minimal-to-moderate", "moderate", "moderate-high"],
    color_saturation:   ["high", "high-with-gradients"],
    spacing_density:    ["moderate", "very-roomy"],
    typography_weight:  ["regular-bold", "regular-medium-semibold-bold", "regular"],
    shadow_intensity:   ["subtle", "moderate", "none"],
    surface_treatment:  ["flat", "flat-with-border", "gradient", "soft-shadowed"],
  },
  "brutalist-mono": {
    radius_scale:       ["minimal", "high"],   // Geist allows 0 OR pill
    color_saturation:   ["near-zero"],
    spacing_density:    ["moderate"],
    typography_weight:  ["regular-bold"],
    shadow_intensity:   ["none"],
    surface_treatment:  ["flat", "flat-with-border"],
  },
  "govuk-conservative": {
    radius_scale:       ["minimal"],
    color_saturation:   ["moderate"],
    spacing_density:    ["moderate"],
    typography_weight:  ["bold-only", "regular-bold"],
    shadow_intensity:   ["none"],
    surface_treatment:  ["flat-thick-border"],
  },
  "porsche-precision": {
    // Porsche signature: NEVER plain "regular" weight (always uses bold pairing —
    // 400 + 700 Porsche Next). When sample shows only 400/no 700, this is NOT Porsche.
    // Surface: precise/border preferred; accept flat when CSS sample lacks border decls.
    radius_scale:       ["minimal", "minimal-to-moderate"],
    color_saturation:   ["very-low", "near-zero"],
    spacing_density:    ["compact", "moderate", "very-roomy"],
    typography_weight:  ["regular-bold"],
    shadow_intensity:   ["none"],
    surface_treatment:  ["flat-with-precise-borders", "flat-with-border", "flat"],
  },
  "ant-china-enterprise": {
    // Ant blue is highly saturated → median chroma can read as "high" or "high-with-gradients"
    // (when palette includes 14 named colors). Accept both.
    // surface_treatment: prefer borders, accept flat when sample is thin.
    radius_scale:       ["minimal", "minimal-to-moderate"],
    color_saturation:   ["high", "high-with-gradients"],
    spacing_density:    ["compact"],
    typography_weight:  ["regular"],
    shadow_intensity:   ["subtle"],
    surface_treatment:  ["flat-with-border", "flat"],
  },
  "marketing-gradient": {
    // Stripe.com mixes gradient hero with glass cards — accept both surfaces.
    // The diagnostic signal is "high-with-gradients" saturation, not surface alone.
    radius_scale:       ["high", "moderate-high"],
    color_saturation:   ["high-with-gradients", "high"],
    spacing_density:    ["very-roomy"],
    typography_weight:  ["thin-bold", "regular-bold"],
    shadow_intensity:   ["moderate", "strong"],
    surface_treatment:  ["gradient", "glass"],
  },
  "community-polished": {
    radius_scale:       ["moderate", "moderate-high"],
    color_saturation:   ["high", "moderate"],
    spacing_density:    ["moderate"],
    typography_weight:  ["regular-bold", "regular-medium-semibold-bold"],
    shadow_intensity:   ["moderate", "subtle"],
    surface_treatment:  ["soft-shadowed"],
  },
};

// ── helpers: signal extraction ──────────────────────────────────────

// Convert hex/rgb/hsl to approximate oklch chroma. Cheap heuristic — not perceptually exact.
// Returns C ∈ [0, ~0.5+] where 0 = pure gray, > 0.18 = saturated.
function approxChroma(colorString) {
  const s = colorString.trim();
  let r, g, b;

  const hexMatch = s.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hexMatch) {
    let h = hexMatch[1];
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    if (h.length === 8) h = h.slice(0, 6); // strip alpha
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    const rgbMatch = s.match(/rgba?\(\s*([\d.]+)\s*,?\s*([\d.]+)\s*,?\s*([\d.]+)/i);
    if (rgbMatch) {
      r = parseFloat(rgbMatch[1]);
      g = parseFloat(rgbMatch[2]);
      b = parseFloat(rgbMatch[3]);
    } else {
      const hslMatch = s.match(/hsla?\(\s*([\d.]+)\s*,?\s*([\d.]+)%\s*,?\s*([\d.]+)%/i);
      if (hslMatch) {
        const sat = parseFloat(hslMatch[2]) / 100;
        const lit = parseFloat(hslMatch[3]) / 100;
        // hsl saturation×min(L, 1-L) approximates oklch chroma magnitude
        return sat * Math.min(lit, 1 - lit) * 0.6;
      }
      const oklchMatch = s.match(/oklch\(\s*[\d.]+\s+([\d.]+)/i);
      if (oklchMatch) return parseFloat(oklchMatch[1]);
      return null;
    }
  }
  if (r === undefined) return null;
  // Quick saturation proxy: max(R,G,B) - min(R,G,B), normalized
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const range = (max - min) / 255; // 0 = gray, 1 = max saturation
  return range * 0.4; // scale into oklch C-ish range
}

// Hue bucket classifier — Constituição §8 compliant.
// Returns one of 9 buckets: red | orange | yellow | green | cyan | blue | purple | pink | neutral.
// Returns NULL when input is unparseable (caller must emit TODO marker, NEVER a fallback bucket).
//
// Wedge ranges calibrated to brand-naming intuition (HSV hue is biased toward primary RGB
// channels vs CIE Lab perceptual hue; we compensate by shifting boundaries empirically against
// 13 well-known brand colors). The classifier is deterministic; there is no "default" bucket.
const HUE_WEDGES = [
  { name: "red",    min: 350, max: 360 }, // wrap-around upper half
  { name: "red",    min:   0, max:  12 },
  { name: "orange", min:  12, max:  45 },
  { name: "yellow", min:  45, max:  70 },
  { name: "green",  min:  70, max: 165 },
  { name: "cyan",   min: 165, max: 195 },
  { name: "blue",   min: 195, max: 225 }, // narrower; 225-235 is indigo/purple territory
  { name: "purple", min: 225, max: 310 },
  { name: "pink",   min: 310, max: 350 }, // wider; deep pinks (Airbnb rausch) at ~350
];

function bucketHue(colorString) {
  if (typeof colorString !== "string" || !colorString.trim()) return null;
  const s = colorString.trim();
  let r, g, b;

  const hexMatch = s.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hexMatch) {
    let h = hexMatch[1];
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    if (h.length === 8) h = h.slice(0, 6);
    if (h.length !== 6) return null;
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    const rgbMatch = s.match(/rgba?\(\s*([\d.]+)\s*,?\s*([\d.]+)\s*,?\s*([\d.]+)/i);
    if (rgbMatch) {
      r = parseFloat(rgbMatch[1]);
      g = parseFloat(rgbMatch[2]);
      b = parseFloat(rgbMatch[3]);
    } else {
      // hsl/oklch deferred — preview.json rarely emits them as-is and we have hex/rgb
      // covered. Return null (TODO marker upstream) instead of inventing.
      return null;
    }
  }
  if (![r, g, b].every(Number.isFinite)) return null;

  // Achromatic guard. Chroma proxy = (max-min)/255. Below 0.08 (~20/255 spread) we
  // call the colour neutral — a meaningful answer, not a fallback.
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = (max - min) / 255;
  if (chroma < 0.08) return "neutral";

  // HSV hue (degrees). Standard formula.
  const d = max - min;
  let hue;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  if (hue < 0) hue += 360;

  // Range lookup (deterministic, no nearest-neighbor ambiguity).
  for (const wedge of HUE_WEDGES) {
    if (hue >= wedge.min && hue < wedge.max) return wedge.name;
  }
  // Hue 360 wraps to 0; covered by [345,360).
  return null;
}

// Bucket a list of swatches into the unique set of hue buckets they hit.
// Returns an array of distinct names. Inputs that fail to classify are
// dropped silently (caller is responsible for emitting TODO when input
// quality is itself insufficient — we don't conflate "bad input" with
// "valid neutral").
function bucketHues(colorList) {
  if (!Array.isArray(colorList) || colorList.length === 0) return [];
  const seen = new Set();
  for (const c of colorList) {
    const bucket = bucketHue(c);
    if (bucket) seen.add(bucket);
  }
  return [...seen];
}

function classifyColorSaturation(tokensDetected) {
  const allColors = [
    ...(tokensDetected?.colors?.hex || []),
    ...(tokensDetected?.colors?.rgb || []),
    ...(tokensDetected?.colors?.hsl || []),
  ];
  if (allColors.length === 0) return null;

  const chromas = allColors.map(approxChroma).filter(c => c !== null);
  if (chromas.length === 0) return "near-zero";

  // Use MEDIAN (not average) so a single saturated accent color (Porsche red,
  // shadcn destructive) does not dominate the verdict for an otherwise mono palette.
  const sorted = [...chromas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // For decisions the AVERAGE-OF-FILTERED (non-mono) is also tracked as a tiebreaker.
  const filtered = chromas.filter(c => c > 0.005);
  const avg = filtered.length > 0
    ? filtered.reduce((a, b) => a + b, 0) / filtered.length
    : 0;

  // If most colors are mono (median ≈ 0) → palette is mono regardless of accent count.
  if (median <= 0.02 && avg <= 0.10) return "near-zero";
  if (median <= 0.05 || avg <= 0.10)  return "very-low";
  if (avg <= 0.18) return "moderate";
  if (avg <= 0.30) return "high";
  return "high-with-gradients";
}

// Parse a CSS dimension string to pixels. Returns null if not parseable.
function dimToPx(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  const remMatch = v.match(/^([\d.]+)\s*rem$/);
  if (remMatch) return parseFloat(remMatch[1]) * 16;
  const pxMatch = v.match(/^([\d.]+)\s*px$/);
  if (pxMatch) return parseFloat(pxMatch[1]);
  if (/^[\d.]+$/.test(v)) return parseFloat(v);
  return null;
}

function classifyRadiusScale(tokensDetected, cssVarsDetected) {
  // Prefer --radius-* CSS vars; fallback to tokensDetected.radii
  const varsArr = Array.isArray(cssVarsDetected) ? cssVarsDetected : [];
  const fromVars = varsArr
    .filter(v => v && v.name && (/--radius/i.test(v.name) || /--rounded/i.test(v.name)))
    .map(v => dimToPx(v.value))
    .filter(n => n !== null && n >= 0 && n < 200);  // skip 9999px (pill)

  const fromTokens = [...(tokensDetected?.radii || [])]
    .map(r => {
      const m = String(r).match(/[\d.]+(?:px|rem)?/);
      return m ? dimToPx(m[0]) : null;
    })
    .filter(n => n !== null && n >= 0 && n < 200);

  const samples = fromVars.length > 0 ? fromVars : fromTokens;
  if (samples.length === 0) return null;

  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  if (avg <= 2)  return "minimal";
  if (avg <= 6)  return "minimal-to-moderate";
  if (avg <= 12) return "moderate";
  if (avg <= 18) return "moderate-high";
  return "high";
}

function classifySpacingDensity(tokensDetected) {
  const spacings = [...(tokensDetected?.spacing || [])]
    .map(s => {
      const first = String(s).match(/[\d.]+(?:px|rem)?/);
      return first ? dimToPx(first[0]) : null;
    })
    .filter(n => n !== null && n > 0 && n < 300);

  if (spacings.length === 0) return null;

  const distinct = [...new Set(spacings)].sort((a, b) => a - b);
  const baseUnit = distinct[0];
  const maxSpacing = distinct[distinct.length - 1];
  const range = maxSpacing - baseUnit;
  const stepCount = distinct.length;

  // Detect "very-roomy" pattern: large jumps (next/prev ratio > 1.6) on at least 30% of steps,
  // OR max spacing > 80px (Apple/marketing hero spacing)
  let largeJumps = 0;
  for (let i = 1; i < distinct.length; i++) {
    if (distinct[i] / distinct[i - 1] > 1.6) largeJumps++;
  }
  const largeJumpRatio = largeJumps / Math.max(distinct.length - 1, 1);

  // Compact: tight base + many steps (Carbon-style 8px grid with 10+ values)
  if (baseUnit >= 7 && stepCount >= 8) return "compact";
  // Compact: base 8px and steps span > 100px (B2B dense)
  if (baseUnit >= 8 && range > 80) return "compact";
  // Very-roomy: max spacing > 80px (hero/marketing scale) OR ratio > 30%
  if (maxSpacing >= 80 || largeJumpRatio > 0.3) return "very-roomy";
  return "moderate";
}

function classifyTypographyWeight(tokensDetected, fontFaces) {
  const weights = new Set();

  // From tokensDetected.fontWeights (raw CSS font-weight values)
  const fontWeightsArr = (tokensDetected && Array.isArray(tokensDetected.fontWeights))
    ? tokensDetected.fontWeights
    : [];
  for (const w of fontWeightsArr) {
    const n = parseInt(w, 10);
    if (!isNaN(n)) weights.add(n);
    if (/^(normal|regular)$/i.test(w)) weights.add(400);
    if (/^bold$/i.test(w)) weights.add(700);
    if (/^light$/i.test(w)) weights.add(300);
  }

  // From fontFaces
  const fontFacesArr = Array.isArray(fontFaces) ? fontFaces : [];
  for (const ff of fontFacesArr) {
    if (!ff) continue;
    if (typeof ff.weight === "number") weights.add(ff.weight);
    else if (typeof ff.weight === "string") {
      const n = parseInt(ff.weight, 10);
      if (!isNaN(n)) weights.add(n);
    }
  }

  const arr = [...weights].sort((a, b) => a - b);
  if (arr.length === 0) return null;

  const hasThin   = arr.some(w => w <= 300);
  const hasReg    = arr.some(w => w >= 400 && w <= 450);
  const hasMedium = arr.some(w => w >= 500 && w <= 550);
  const hasSemi   = arr.some(w => w >= 600 && w <= 650);
  const hasBold   = arr.some(w => w >= 700);

  if (hasThin && hasBold && !hasReg) return "thin-bold";
  if (arr.length === 1 && hasBold)   return "bold-only";
  if (hasReg && hasMedium && hasSemi && hasBold) return "regular-medium-semibold-bold";
  if (hasReg && hasBold)             return "regular-bold";
  if (hasReg && !hasBold)            return "regular";
  return null;
}

function classifyShadowIntensity(shadows) {
  let list;
  if (Array.isArray(shadows)) list = shadows;
  else if (shadows && Array.isArray(shadows.declarations)) list = shadows.declarations;
  else if (shadows && Array.isArray(shadows.list)) list = shadows.list;
  else list = [];
  if (list.length === 0) return "none";

  // Each shadow has alpha + blur (parse from CSS value)
  let maxAlpha = 0;
  let maxBlur = 0;
  for (const s of list) {
    const value = typeof s === "string" ? s : (s.value || s.shadow || "");
    const alphaMatch = value.match(/rgba?\([^)]+,\s*(0?\.\d+|1(?:\.0+)?)\s*\)/);
    if (alphaMatch) maxAlpha = Math.max(maxAlpha, parseFloat(alphaMatch[1]));
    // Extract blur (3rd numeric in the box-shadow declaration: x y blur ...)
    const blurMatch = value.match(/(?:^|\s)(?:-?\d+(?:\.\d+)?(?:px|rem)?\s+){2}(\d+(?:\.\d+)?)px/);
    if (blurMatch) maxBlur = Math.max(maxBlur, parseFloat(blurMatch[1]));
  }

  // Recalibrated thresholds based on empirical samples:
  //   shadcn typical: alpha 0.05-0.10, blur 1-3px, 1-2 shadows → subtle
  //   material:      alpha 0.20+,     blur 4-15px, 3+ shadows → strong
  //   marketing:     colored shadows blur 30+px, alpha 0.10-0.20 → moderate or strong
  if (maxAlpha < 0.05 && maxBlur < 2) return "none";
  if (list.length <= 2 && maxAlpha <= 0.12 && maxBlur < 8) return "subtle";
  if (maxAlpha >= 0.20 || maxBlur >= 20) return "strong";
  return "moderate";
}

function classifySurfaceTreatment(css, shadowIntensity, radiusScale, tokensDetected) {
  const cssText = css || "";

  // ── glass: requires MULTIPLE backdrop-filter declarations OR a single one
  // accompanied by translucent rgba/hsla backgrounds (apple-glass signature).
  // A single isolated blur (header overlay, modal backdrop) is common in modern
  // sites and is NOT enough — it caused 4/5 false positives in 2026-04-27 batch.
  const blurRules = countRulesWith(cssText, /(?:-webkit-)?backdrop-filter\s*:\s*blur/gi);
  const translucentBgs = (cssText.match(/background(?:-color)?:\s*(?:rgba|hsla)\([^)]+,\s*0?\.\d/gi) || []).length;
  const brightTranslucentBgs = (cssText.match(/background(?:-color)?:\s*rgba\(\s*(?:2[0-5]\d|255)\s*,\s*(?:2[0-5]\d|255)\s*,\s*(?:2[0-5]\d|255)\s*,\s*0?\.\d/gi) || []).length;
  const isGlass = blurRules >= 3 || (blurRules >= 1 && translucentBgs >= 5 && brightTranslucentBgs >= 3);

  // ── gradient: requires MULTIPLE gradient declarations on backgrounds
  // (not just one hero gradient, which is universal in modern marketing).
  // Threshold: ≥3 gradient declarations OR ≥1 gradient on body/html (full surface).
  const gradientMatches = (cssText.match(/linear-gradient|radial-gradient|conic-gradient/gi) || []).length;
  const fullSurfaceGradient = /(?:body|html|main)[^{]*\{[^}]*(?:linear-gradient|radial-gradient)/i.test(cssText);
  const isGradient = gradientMatches >= 3 || fullSurfaceGradient;

  if (isGlass) return "glass";
  if (isGradient) return "gradient";

  // Check border thickness from raw CSS
  const borderWidths = [...cssText.matchAll(/border(?:-width)?:\s*([\d.]+)\s*px/gi)]
    .map(m => parseFloat(m[1]))
    .filter(n => n > 0 && n < 20);
  const maxBorder = borderWidths.length > 0 ? Math.max(...borderWidths) : 0;

  if (maxBorder >= 3) return "flat-thick-border";

  if (shadowIntensity === "moderate" || shadowIntensity === "strong") return "shadowed";
  if (shadowIntensity === "subtle" && (radiusScale === "moderate-high" || radiusScale === "high")) {
    return "soft-shadowed";
  }
  if (shadowIntensity === "none" && maxBorder > 0) return "flat-with-border";
  if (maxBorder > 0) return "flat-with-border";
  return "flat";
}

function classifyColorRolePattern(tokensDetected, css = "") {
  const colors = [
    ...(tokensDetected?.colors?.hex || []),
    ...(tokensDetected?.colors?.rgb || []),
  ].map(colorToRgb).filter(Boolean);
  if (!colors.length) return null;

  const hasNearBlack = colors.some(({ r, g, b }) => relativeLuminanceRgb(r, g, b) < 0.04);
  const hasWhite = colors.some(({ r, g, b }) => relativeLuminanceRgb(r, g, b) > 0.88);
  const hasBrandRed = colors.some(({ r, g, b }) => r >= 180 && g <= 65 && b <= 65);

  if (!hasNearBlack || !hasWhite || !hasBrandRed) return null;

  const backgrounds = extractBackgroundColorSignals(css);
  const redTokenUsage = countBrandRedTokenUsage(tokensDetected);
  if (backgrounds.total >= 3) {
    // Streaming surfaces are dark-first with red as an accent. Retail banking
    // and ecommerce pages often contain black text, white surfaces and red
    // CTAs, but their background declarations are still light-dominant.
    if (backgrounds.dark > backgrounds.light * 1.25 && (backgrounds.red > 0 || redTokenUsage >= 2)) return "red-on-black";
    return null;
  }

  // Synthetic/unit-test fallback when no CSS declaration context is available.
  if (!tokensDetected?.colors?.hex_usage) return "red-on-black";
  return null;
}

function countBrandRedTokenUsage(tokensDetected) {
  const usage = tokensDetected?.colors?.hex_usage || {};
  let count = 0;
  for (const [hex, value] of Object.entries(usage)) {
    const rgb = colorToRgb(hex);
    if (!rgb) continue;
    if (rgb.r >= 180 && rgb.g <= 65 && rgb.b <= 65) count += Number(value) || 0;
  }
  return count;
}

function extractBackgroundColorSignals(css) {
  const result = { total: 0, dark: 0, light: 0, red: 0 };
  if (typeof css !== "string" || !css) return result;
  const declarationRe = /(?:background(?:-color)?|background-image)\s*:\s*([^;}{]+)/gi;
  let match;
  while ((match = declarationRe.exec(css)) !== null) {
    const value = match[1] || "";
    const colorMatches = value.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)/g) || [];
    for (const raw of colorMatches) {
      const rgb = colorToRgb(raw);
      if (!rgb) continue;
      result.total++;
      const luminance = relativeLuminanceRgb(rgb.r, rgb.g, rgb.b);
      if (luminance < 0.04) result.dark++;
      if (luminance > 0.88) result.light++;
      if (rgb.r >= 180 && rgb.g <= 65 && rgb.b <= 65) result.red++;
    }
  }
  return result;
}

function colorToRgb(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((char) => char + char).join("");
    if (h.length === 8) h = h.slice(0, 6);
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }

  const rgb = raw.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (!rgb) return null;
  return {
    r: clampChannel(parseInt(rgb[1], 10)),
    g: clampChannel(parseInt(rgb[2], 10)),
    b: clampChannel(parseInt(rgb[3], 10)),
  };
}

function clampChannel(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, value));
}

function relativeLuminanceRgb(r, g, b) {
  const [rr, gg, bb] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
}

function countRulesWith(cssText, pattern) {
  let count = 0;
  const ruleRe = /[^{}]+\{[^}]*\}/g;
  let match;
  while ((match = ruleRe.exec(cssText)) !== null) {
    pattern.lastIndex = 0;
    if (pattern.test(match[0])) count++;
  }
  return count;
}

// ── archetype scoring ──────────────────────────────────────────────

// Signal weights — rare/specific signals score higher because they are stronger evidence.
// surface_treatment "glass" or "gradient" is very specific (hard to fake).
// color_saturation "high-with-gradients" implies colorful brand — strong distinguisher.
// shadow_intensity "strong" + spacing "very-roomy" both correlate with marketing/elevation.
const SIGNAL_WEIGHTS = {
  radius_scale:      1.0,
  color_saturation:  1.5,   // primary brand signal
  spacing_density:   1.0,
  typography_weight: 1.0,
  shadow_intensity:  1.0,
  surface_treatment: 2.0,   // strong specificity (glass/gradient/flat-thick-border are diagnostic)
  color_role_pattern: 1.5,
};

// Bonus matches when the signal value itself is rare (penalizes archetypes that match
// only on common/generic values like "moderate everywhere").
const RARE_SIGNAL_VALUES = {
  color_saturation:  ["high-with-gradients", "near-zero"],
  color_role_pattern: ["red-on-black"],
  surface_treatment: ["glass", "gradient", "flat-thick-border", "flat-with-precise-borders"],
  typography_weight: ["thin-bold", "bold-only"],
  shadow_intensity:  ["strong"],
  radius_scale:      ["high", "minimal"],
  spacing_density:   ["very-roomy", "compact"],
};

function scoreAgainstArchetype(signals, expected) {
  // Hard gate (A2): if archetype declares `required: [...]`, EVERY listed
  // signal must (a) be detected and (b) match an expected value. Otherwise
  // score = 0 regardless of other matches. Prevents permissive archetypes
  // (cinematic-streaming, marketing-gradient) from absorbing sites that just
  // happen to have a few common signals.
  const required = Array.isArray(expected.required) ? expected.required : null;
  if (required) {
    for (const sig of required) {
      const expectedValues = expected[sig];
      if (!Array.isArray(expectedValues)) continue;
      if (!signals[sig] || !expectedValues.includes(signals[sig])) {
        return 0;
      }
    }
  }

  let score = 0;
  let total = 0;
  for (const [signal, expectedValues] of Object.entries(expected)) {
    if (signal === "required") continue;
    const weight = SIGNAL_WEIGHTS[signal] || 1.0;
    total += weight;
    if (signals[signal] && expectedValues.includes(signals[signal])) {
      let matchScore = weight;
      // Bonus: archetype matches on a RARE signal value → stronger evidence
      if (RARE_SIGNAL_VALUES[signal]?.includes(signals[signal])) {
        matchScore *= 1.5;
        total += weight * 0.5; // keep total scaled (so max remains 100%)
      }
      score += matchScore;
    }
  }
  return total > 0 ? (score / total) * 100 : 0;
}

/**
 * Classifies the extracted visual style against canonical archetypes defined in
 * `squads/design-ops/data/style-fingerprints.yaml`.
 *
 * Complementary to detectStack(): detectStack identifies TECHNICAL stack
 * (Next.js, Tailwind, Radix). classifyStyle identifies VISUAL archetype
 * (shadcn-neutral, apple-glass, carbon-enterprise, etc.) — orthogonal signals.
 *
 * @param {object} tokensDetected - Output of detectTokens (colors/spacing/radius/etc.)
 * @param {Array}  cssVarsDetected - Output of detectCssVars
 * @param {object} shadows - Output of detectShadows
 * @param {Array}  fontFaces - Output of detectFontFaces
 * @param {string} css - Concatenated CSS content (for backdrop-filter / gradient detection)
 * @returns {object} { extracted_signals, classification, archetype_distance }
 */
function classifyStyle(tokensDetected, cssVarsDetected, shadows, fontFaces, css) {
  // 1. Extract signals
  const radius_scale       = classifyRadiusScale(tokensDetected, cssVarsDetected);
  const color_saturation   = classifyColorSaturation(tokensDetected);
  const spacing_density    = classifySpacingDensity(tokensDetected);
  const typography_weight  = classifyTypographyWeight(tokensDetected, fontFaces);
  const shadow_intensity   = classifyShadowIntensity(shadows);
  const surface_treatment  = classifySurfaceTreatment(css, shadow_intensity, radius_scale, tokensDetected);
  const color_role_pattern = classifyColorRolePattern(tokensDetected, css);

  const extracted_signals = {
    radius_scale,
    color_saturation,
    spacing_density,
    typography_weight,
    shadow_intensity,
    surface_treatment,
    color_role_pattern,
  };

  // 2. Score against each archetype
  const archetype_distance = {};
  for (const [name, expected] of Object.entries(ARCHETYPES)) {
    archetype_distance[name] = scoreAgainstArchetype(extracted_signals, expected);
  }

  // 3. Pick winner
  const ranked = Object.entries(archetype_distance).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return Object.keys(ARCHETYPES[b[0]] || {}).length - Object.keys(ARCHETYPES[a[0]] || {}).length;
  });
  const [topName, topScore] = ranked[0];
  const [secondName, secondScore] = ranked[1];

  const minimum_confidence_threshold = 50;  // % of signals matching
  const multi_archetype_threshold    = 0.85; // top-2 within 85%

  let primary_archetype = null;
  let secondary_archetype = null;
  let confidence_score = topScore;

  if (topScore >= minimum_confidence_threshold) {
    primary_archetype = topName;
    const secondHasMatchedSpecificRole =
      !extracted_signals.color_role_pattern ||
      ARCHETYPES[secondName]?.color_role_pattern?.includes(extracted_signals.color_role_pattern);
    if (secondHasMatchedSpecificRole && secondScore >= topScore * multi_archetype_threshold && secondScore >= minimum_confidence_threshold) {
      secondary_archetype = secondName;
    }
  }

  // 4. Build explanation
  const matched = [];
  const mismatched = [];
  if (primary_archetype) {
    const expected = ARCHETYPES[primary_archetype];
    for (const [signal, expectedValues] of Object.entries(expected)) {
      if (extracted_signals[signal] && expectedValues.includes(extracted_signals[signal])) {
        matched.push(`${signal}=${extracted_signals[signal]}`);
      } else if (extracted_signals[signal]) {
        mismatched.push(`${signal}=${extracted_signals[signal]} (expected ${expectedValues.join("|")})`);
      }
    }
  }

  const explanation = primary_archetype
    ? `Matched ${primary_archetype} on: ${matched.join(", ")}${mismatched.length ? `. Diverged on: ${mismatched.join(", ")}` : ""}.`
    : "No archetype reached confidence threshold (50%). Style is unclassified or hybrid.";

  return {
    extracted_signals,
    classification: {
      primary_archetype,
      confidence_score: Math.round(confidence_score),
      secondary_archetype,
      explanation,
    },
    archetype_distance,
    _reference: "squads/design-ops/data/style-fingerprints.yaml",
  };
}

// ── S4: Stack summary helper for LLM injection ──────────────────────
/**
 * Filters suppressed matches, sorts by confidence (high > medium > low), returns top 8.
 * Emits compact objects { name, kind, confidence } — no evidence, no suppressed_by.
 * Output is designed to stay < 2KB when JSON-serialized (R5 budget).
 *
 * @param {Array} matches - Raw detectStack output
 * @returns {Array} Filtered, sorted, truncated summary
 */
function summarizeStackForPrompt(matches) {
  const confidenceOrder = { high: 0, medium: 1, low: 2 };
  return matches
    .filter(m => !m.suppressed_by)
    .sort((a, b) => (confidenceOrder[a.confidence] ?? 99) - (confidenceOrder[b.confidence] ?? 99))
    .slice(0, 8)
    .map(({ name, kind, confidence }) => ({ name, kind, confidence }));
}

// ── Phase 3f: Shadow extraction (elevation ladder) ──────────────────
/**
 * filterShadows — drop noise entries from a raw box-shadow list.
 *
 * Removes:
 *   - reset/empty values: "unset" / "none" / "0" / "initial" / "inherit"
 *   - "none disguised": every color stop is transparent (#0000, rgba(...,0))
 *   - focus rings: single-stop "0 0 Npx Mpx <color>" (no Y offset)
 *
 * Keeps:
 *   - real elevation shadows with non-zero Y offset
 *   - multi-layer shadows (Anthropic pattern)
 *   - inset shadows (preserved — caller decides if they're elevation or border)
 *
 * Accepts list-of-strings or list-of-{value,count}; returns list-of-{value,count}
 * to preserve frequency information that callers (builder, scale assignment)
 * use to rank tiers.
 */
function filterShadows(rawList) {
  if (!Array.isArray(rawList)) return [];
  const out = [];
  for (const entry of rawList) {
    const v = typeof entry === "string" ? entry : entry?.value;
    const count = typeof entry === "object" && entry ? (entry.count || 1) : 1;
    if (!v || typeof v !== "string") continue;
    const trimmed = v.trim().toLowerCase();
    if (!trimmed
        || trimmed === "unset"
        || trimmed === "none"
        || trimmed === "0"
        || trimmed === "initial"
        || trimmed === "inherit") continue;
    // "none disguised": all color stops resolve to fully transparent.
    const stopColors = trimmed.match(/(#[0-9a-f]{4,8}|rgba?\([^)]+\)|transparent)/gi) || [];
    if (stopColors.length > 0) {
      const allTransparent = stopColors.every((c) => {
        if (c === "transparent") return true;
        if (/^#[0-9a-f]{4}$/i.test(c) && c.toLowerCase().endsWith("0000")) return true;
        if (/^#[0-9a-f]{8}$/i.test(c) && c.toLowerCase().endsWith("00")) return true;
        if (/rgba?\([^)]*,\s*0\s*\)$/i.test(c)) return true;
        return false;
      });
      if (allTransparent) continue;
    }
    // Focus ring: single-layer "0 0 <blur> [<spread>] <color>" — no Y offset.
    const layers = v.split(/,(?![^()]*\))/);
    if (layers.length === 1) {
      const layerTokens = layers[0].trim().split(/\s+/);
      if (layerTokens.length >= 4 && layerTokens[0] === "0" && layerTokens[1] === "0") {
        continue;
      }
    }
    out.push({ value: v, count });
  }
  return out;
}

/**
 * splitShadows — partition a filtered shadow list into elevation vs inset.
 *
 * Why: inset shadows are typically hairline borders ("border-as-shadow"
 * pattern, see Linear/Anthropic). Mixing them with elevation shadows confuses
 * scale assignment (xs/sm/md). Separating them lets the design-md emit
 * elevation as elevation and surface the inset class as a distinct slot.
 *
 * Returns:
 *   {
 *     elevation: [...],   // shadows whose layers have no `inset` keyword
 *     inset:     [...],   // shadows where ALL layers are `inset`
 *     mixed:     [...],   // shadows with both elevation + inset layers
 *                         //   (kept in elevation, but flagged for inspection)
 *   }
 */
function splitShadows(filteredList) {
  if (!Array.isArray(filteredList)) return { elevation: [], inset: [], mixed: [] };
  const elevation = [];
  const inset = [];
  const mixed = [];
  for (const entry of filteredList) {
    const v = typeof entry === "string" ? entry : entry?.value;
    if (!v) continue;
    const layers = v.split(/,(?![^()]*\))/).map((l) => l.trim());
    const insetLayers = layers.filter((l) => /\binset\b/i.test(l));
    const elevationLayers = layers.filter((l) => !/\binset\b/i.test(l));
    if (insetLayers.length === layers.length && insetLayers.length > 0) {
      inset.push(entry);
    } else if (insetLayers.length > 0 && elevationLayers.length > 0) {
      mixed.push(entry);
      elevation.push(entry); // mixed shadows still carry elevation; emit but flag
    } else {
      elevation.push(entry);
    }
  }
  return { elevation, inset, mixed };
}

/**
 * extractNamedShadows — surface brand-named shadow tokens from cssVars.
 *
 * Many design systems (Linear, Stripe HDS, Tailwind plugins) declare
 * `--shadow-low / --shadow-medium / --shadow-high` or `--hds-shadow-xs/sm`.
 * We emit them as tokens.shadows.{name} so the design.md scaffold can
 * surface brand vocabulary instead of just numeric tiers.
 *
 * Filters:
 *   - Skip framework internals: --tw-*, --bs-*, --mantine-* etc.
 *   - Skip if value is a single var() reference (not a real shadow declaration)
 *   - Skip transparent-only ("0 0 0 transparent")
 *   - Skip values shorter than 8 chars (not a shadow recipe)
 *   - Prefer :root scope; if dark scope is the only one, accept it.
 *
 * Returns object map { name → shadow value } or null when nothing found.
 */
const FRAMEWORK_VAR_PREFIXES = /^--(tw|bs|mantine|chakra|mui|ant|next|nextui|radix)-/;

function extractNamedShadows(cssVars) {
  if (!Array.isArray(cssVars) || cssVars.length === 0) return null;
  const named = {};
  for (const decl of cssVars) {
    if (!decl || typeof decl.name !== "string") continue;
    if (!/shadow/i.test(decl.name)) continue;
    if (FRAMEWORK_VAR_PREFIXES.test(decl.name)) continue;
    const value = String(decl.value || "").trim();
    if (value.length < 8) continue;
    // Pure var() reference is just an alias — skip; we want primitive recipes.
    if (/^var\(--[\w-]+\)$/.test(value)) continue;
    // Reject transparent-only values
    if (/^0\s+0\s+0\s+transparent\s*$/i.test(value)) continue;
    if (/^none$/i.test(value)) continue;
    // Strip "--" prefix and "shadow-" / "shadow_" anchor for the emitted key.
    // `--shadow-low` → `low`. `--hds-shadow-md` → `md`. `--paper-shadow` → `paper`.
    let key = decl.name.replace(/^--/, "");
    key = key.replace(/^(hds|ds|brand|theme|color|core|sys)-/, "");
    key = key.replace(/^shadow[-_]/, "").replace(/[-_]shadow$/, "");
    if (!key || key.length > 32) continue;
    // Skip when key is empty after normalization (vars literally named --shadow)
    if (key === "shadow") continue;
    // Prefer first-seen :root scope for stability; allow other scopes only as fallback.
    const isRoot = decl.selector === ":root" || /^:root\b/.test(decl.selector);
    const existing = named[key];
    if (!existing) {
      named[key] = { value, scope: isRoot ? "root" : "other" };
    } else if (existing.scope !== "root" && isRoot) {
      named[key] = { value, scope: "root" };
    }
  }
  if (Object.keys(named).length === 0) return null;
  // Emit as { key: value } sorted by tier-like order when applicable.
  const ORDER = ["xs", "sm", "md", "lg", "xl", "2xl", "low", "medium", "high", "stack-low", "stack-medium", "stack-high"];
  const out = {};
  const keys = Object.keys(named);
  // Push known-order keys first, in declared sequence.
  for (const k of ORDER) if (named[k]) out[k] = named[k].value;
  // Then any remaining keys in original declaration order.
  for (const k of keys) if (!(k in out)) out[k] = named[k].value;
  return out;
}

function detectShadows(css) {
  const re = /box-shadow\s*:\s*([^;}]+)/gi;
  const counts = {};
  let m;
  while ((m = re.exec(css)) !== null) {
    const value = m[1].trim();
    if (value === "none" || value === "inherit" || value === "initial") continue;
    if (value.length > 250) continue;
    counts[value] = (counts[value] || 0) + 1;
  }
  const raw = Object.entries(counts)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
  // Filter noise (reset values, transparent stops, focus rings) before ranking
  // so tokens-extended.shadow + design-md scaffolds both consume a clean list.
  const filtered = filterShadows(raw);
  return filtered.slice(0, 16);
}

// ── Phase 3g: Motion / animation tokens ─────────────────────────────
function detectMotion(css) {
  const durations = {};
  for (const m of css.matchAll(/transition[\w-]*\s*:\s*([^;}]+)/gi)) {
    const value = m[1];
    for (const dur of value.match(/\b\d+(?:\.\d+)?(ms|s)\b/gi) || []) {
      durations[dur] = (durations[dur] || 0) + 1;
    }
  }
  for (const m of css.matchAll(/animation-duration\s*:\s*([^;}]+)/gi)) {
    const value = m[1].trim();
    for (const dur of value.match(/\b\d+(?:\.\d+)?(ms|s)\b/gi) || []) {
      durations[dur] = (durations[dur] || 0) + 1;
    }
  }
  const easings = {};
  for (const m of css.matchAll(/cubic-bezier\([^)]+\)/gi)) {
    const value = m[0].replace(/\s+/g, "");
    easings[value] = (easings[value] || 0) + 1;
  }
  for (const m of css.matchAll(/transition-timing-function\s*:\s*([^;}]+)/gi)) {
    const value = m[1].trim();
    if (/^(ease(-in)?(-out)?|linear|step-start|step-end)$/.test(value)) {
      easings[value] = (easings[value] || 0) + 1;
    }
  }
  const keyframes = [];
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    keyframes.push(m[1]);
  }

  // ── NEW: transitions[] — pair property ↔ duration ↔ timing ──────────
  // Parses `transition: <prop> <dur> <timing>?` shorthand (any token order)
  // including comma-separated multi-prop lists.
  // Knowledge encoded: medium uses `transition: background-color 300ms linear, color 300ms linear`
  // — pairing matters because the duration counts alone hide the property selectivity.
  const transitions = {};
  const isDuration = (tok) => /^\d+(?:\.\d+)?(ms|s)$/.test(tok);
  const isNamedEasing = (tok) => /^(ease(-in)?(-out)?|linear|step-start|step-end)$/.test(tok);
  const isCubicBezier = (tok) => /^cubic-bezier\(/.test(tok);
  const isStepsFn = (tok) => /^steps\(/.test(tok);
  const isTiming = (tok) => isNamedEasing(tok) || isCubicBezier(tok) || isStepsFn(tok);
  const isKnownProperty = (tok) =>
    /^(all|none|[a-z][a-z0-9-]*)$/i.test(tok) && !isDuration(tok) && !isTiming(tok) && tok !== "" && !/^-?\d/.test(tok);

  for (const m of css.matchAll(/(?:^|[\s;{}])transition\s*:\s*([^;}]+)/gi)) {
    const value = m[1].trim();
    // Split on commas that are NOT inside parens (cubic-bezier/steps args).
    const segments = [];
    let depth = 0;
    let buf = "";
    for (const ch of value) {
      if (ch === "(") depth++;
      else if (ch === ")") depth = Math.max(0, depth - 1);
      if (ch === "," && depth === 0) {
        segments.push(buf.trim());
        buf = "";
      } else {
        buf += ch;
      }
    }
    if (buf.trim()) segments.push(buf.trim());

    for (const segment of segments) {
      // Tokenize while preserving paren-wrapped chunks (cubic-bezier(...)).
      const tokens = [];
      let tDepth = 0;
      let tBuf = "";
      for (const ch of segment) {
        if (ch === "(") tDepth++;
        else if (ch === ")") tDepth = Math.max(0, tDepth - 1);
        if (/\s/.test(ch) && tDepth === 0) {
          if (tBuf) {
            tokens.push(tBuf);
            tBuf = "";
          }
        } else {
          tBuf += ch;
        }
      }
      if (tBuf) tokens.push(tBuf);

      let prop = null;
      let dur = null;
      let timing = null;
      for (const tok of tokens) {
        if (!dur && isDuration(tok)) {
          dur = tok;
          continue;
        }
        if (!timing && isTiming(tok)) {
          timing = tok;
          continue;
        }
        if (!prop && isKnownProperty(tok)) {
          prop = tok;
          continue;
        }
      }
      // CSS spec: missing property defaults to "all". Only emit if we have at least a duration.
      if (!dur) continue;
      const property = prop || "all";
      const key = `${property}::${dur}::${timing || ""}`;
      transitions[key] = transitions[key] || {
        property,
        duration: dur,
        timing: timing || null,
        count: 0,
      };
      transitions[key].count += 1;
    }
  }

  // ── NEW: keyframe_bodies — body of each @keyframes block ────────────
  // Knowledge encoded: medium k1 spinner extracts `rotate 0→360deg over 2s linear`.
  // Without bodies, downstream loses the actual animation spec.
  // Single-level brace matching (CSS does not nest @keyframes).
  const keyframeBodies = {};
  let cursor = 0;
  while (cursor < css.length) {
    const re = /@keyframes\s+([\w-]+)\s*\{/g;
    re.lastIndex = cursor;
    const match = re.exec(css);
    if (!match) break;
    const name = match[1];
    const bodyStart = match.index + match[0].length;
    let depth = 1;
    let i = bodyStart;
    while (i < css.length && depth > 0) {
      const ch = css[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    if (depth === 0) {
      const body = css.slice(bodyStart, i - 1).replace(/\s+/g, " ").trim();
      if (!keyframeBodies[name]) keyframeBodies[name] = body;
      cursor = i;
    } else {
      cursor = bodyStart;
    }
  }

  return {
    durations: Object.entries(durations).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    easings: Object.entries(easings).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    keyframes: [...new Set(keyframes)].slice(0, 30),
    // NEW fields — additive, do not break back-compat
    transitions: Object.values(transitions).sort((a, b) => b.count - a.count).slice(0, 30),
    keyframe_bodies: keyframeBodies,
  };
}

// ── Phase 3h: Breakpoints (media queries) ───────────────────────────
function detectBreakpoints(css) {
  // Match BOTH legacy and modern media query syntax:
  //   legacy: (min-width: 900px) / (max-width: 30em)
  //   modern: (width>=900px) / (width<=899px)
  const legacy = /\(\s*(?:min|max)-width\s*:\s*([\d.]+)\s*(px|rem|em)\s*\)/gi;
  const modern = /\(\s*width\s*[<>]=?\s*([\d.]+)\s*(px|rem|em)\s*\)/gi;
  const counts = {};
  for (const re of [legacy, modern]) {
    let m;
    while ((m = re.exec(css)) !== null) {
      const value = `${m[1]}${m[2]}`;
      counts[value] = (counts[value] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

// ── Phase 3h2: Spacing scale ────────────────────────────────────────
/**
 * detectSpacingScale — extract a t-shirt spacing scale from raw CSS.
 *
 * Reads padding/margin/gap declarations (and their padding-{top,right,bottom,left}
 * + margin-{top,right,bottom,left} + gap row/column siblings), tokenizes each
 * declaration into individual length values, normalizes to pixels (1rem = 16px,
 * 1em = 16px assumption), then ranks distinct values by frequency.
 *
 * Returns { scale: { xs, sm, md, lg, xl, "2xl", "3xl", "4xl" }, raw: [...] }
 * where the scale assigns the top-frequency values to t-shirt buckets ordered
 * by px value, and `raw` keeps the full ranked list for inspection. Returns
 * null if fewer than 4 distinct values are found (signal too weak).
 *
 * Strict-extraction principle: NO defaults injected. If a brand has no spacing
 * pattern (e.g. all inline pixels), the caller should TODO.
 */
function detectSpacingScale(css) {
  if (!css || typeof css !== "string") return null;
  // Match every space-related declaration. We capture the value side and
  // tokenize separately so shorthand (`padding: 8px 16px`) and longhand
  // (`padding-left: 12px`) feed the same bucket.
  const declRe = /\b(padding|margin|gap|row-gap|column-gap|padding-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end)|margin-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))\s*:\s*([^;}]+)/gi;
  const counts = {};
  let m;
  while ((m = declRe.exec(css)) !== null) {
    const value = m[2].trim();
    // Skip values that obviously aren't lengths
    if (/var\(|calc\(|inherit|initial|unset|auto|min-content|max-content|fit-content|0%|0$/.test(value)) {
      // calc/var: cannot resolve here; track only literal lengths
    }
    // Tokenize: split on whitespace, ignore tokens that aren't bare lengths
    const tokens = value.split(/\s+/).filter(Boolean);
    for (const tok of tokens) {
      // Skip negatives — they're transforms, not spacing primitives
      if (tok.startsWith("-")) continue;
      // Match `<num><unit>` where unit is px/rem/em (rem dominates modern DS).
      // Reject 0 (not a scale entry — it's the "no spacing" sentinel).
      const lenMatch = tok.match(/^(\d+(?:\.\d+)?)(px|rem|em)$/i);
      if (!lenMatch) continue;
      const num = parseFloat(lenMatch[1]);
      if (num === 0) continue;
      const unit = lenMatch[2].toLowerCase();
      const px = unit === "px" ? num : num * 16; // assume 1rem/em ≈ 16px
      // Round to nearest 0.5px to collapse `15.999rem`-style noise
      const px2 = Math.round(px * 2) / 2;
      const key = `${px2}px|${tok}`; // preserve original literal for emit
      counts[key] = counts[key] || { value: tok, px: px2, count: 0 };
      counts[key].count += 1;
    }
  }
  const entries = Object.values(counts).sort((a, b) => b.count - a.count);
  if (entries.length < 4) return null;

  // Pick top frequencies (prefer rem-based literals when both exist for the same px),
  // dedup by px value, then sort ascending by px to assign t-shirt slots.
  const seenPx = new Set();
  const dedup = [];
  for (const e of entries) {
    if (seenPx.has(e.px)) continue;
    seenPx.add(e.px);
    dedup.push(e);
    if (dedup.length >= 12) break; // cap to avoid noise tail
  }
  dedup.sort((a, b) => a.px - b.px);

  // Map ascending values to t-shirt slots. Up to 8 buckets — beyond that the
  // ranking is mostly noise, and the brand is probably using a numeric scale.
  const tiers = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"];
  const scale = {};
  dedup.slice(0, tiers.length).forEach((e, i) => {
    scale[tiers[i]] = e.value;
  });

  // Tailwind-style numeric stops: 0/1/2/3/4/5/6/8/10/12/14/16/20/24
  // (https://tailwindcss.com/docs/spacing). When a brand's extracted px values
  // align with the Tailwind grid (multiples of 4px between 4-96px), emit the
  // numeric stop name (= px/4) so consumers can pick either dialect.
  const TAILWIND_STOPS = [
    { stop: "0", px: 0 },
    { stop: "0.5", px: 2 },
    { stop: "1", px: 4 },
    { stop: "1.5", px: 6 },
    { stop: "2", px: 8 },
    { stop: "2.5", px: 10 },
    { stop: "3", px: 12 },
    { stop: "3.5", px: 14 },
    { stop: "4", px: 16 },
    { stop: "5", px: 20 },
    { stop: "6", px: 24 },
    { stop: "7", px: 28 },
    { stop: "8", px: 32 },
    { stop: "9", px: 36 },
    { stop: "10", px: 40 },
    { stop: "11", px: 44 },
    { stop: "12", px: 48 },
    { stop: "14", px: 56 },
    { stop: "16", px: 64 },
    { stop: "20", px: 80 },
    { stop: "24", px: 96 },
    { stop: "28", px: 112 },
    { stop: "32", px: 128 },
  ];
  const tailwindStops = {};
  for (const e of dedup) {
    const match = TAILWIND_STOPS.find((s) => Math.abs(s.px - e.px) < 0.5);
    if (match) tailwindStops[match.stop] = e.value;
  }

  return {
    scale,
    numeric: Object.keys(tailwindStops).length >= 4 ? tailwindStops : null,
    raw: dedup.map((e) => ({ value: e.value, px: e.px, count: e.count })),
  };
}

// ── Phase 3i: Dark mode detection ───────────────────────────────────
function detectDarkMode(css, cssVars) {
  const signals = [];
  if (/@media[^{]*prefers-color-scheme\s*:\s*dark/i.test(css)) signals.push("prefers-color-scheme: dark media query");
  const themeAttrCount = (css.match(/\[data-theme[~|*]?=["']?dark/gi) || []).length;
  if (themeAttrCount > 0) signals.push(`[data-theme="dark"] selector (${themeAttrCount}× rules)`);
  const darkClassCount = (css.match(/\.dark[\s,.{:>]/g) || []).length;
  if (darkClassCount > 5) signals.push(`.dark class (${darkClassCount}× rules)`);
  const themeDarkClassCount = (css.match(/\.theme-dark[\s,.{:>]/g) || []).length;
  if (themeDarkClassCount > 0) signals.push(`.theme-dark class (${themeDarkClassCount}× rules)`);

  const darkVars = cssVars.filter(v => /\.dark|\.theme-dark|\[data-theme[~|*]?=["']?dark|prefers-color-scheme.*dark/i.test(v.selector));
  return {
    has_dark_mode: signals.length > 0,
    signals,
    dark_var_count: darkVars.length,
    dark_var_sample: darkVars.slice(0, 30).map(v => ({ name: v.name, value: v.value, selector: v.selector.slice(0, 60) })),
  };
}

// ── Phase 3j: Per-component property extraction ─────────────────────

// Canonical component names and their selector aliases.
const KNOWN_COMPONENTS = [
  "button", "card", "input", "badge", "link", "nav", "tab",
  // Extended (B2) — adds the rest of common DS atoms
  "alert", "table", "tooltip", "modal", "avatar", "label", "help_text", "error_text",
];

// Interactive states extracted from CSS pseudo-classes and explicit selectors.
const KNOWN_STATES = ["default", "hover", "focus", "focus-visible", "active", "disabled", "checked", "selected", "expanded"];

// Selector alias map: CSS class prefix → canonical component name.
const _COMPONENT_ALIASES = {
  btn: "button", button: "button", cta: "button", "bb-button": "button", "ds-btn": "button",
  card: "card", "bb-card": "card", "ds-card": "card",
  input: "input", "bb-input": "input", "ds-input": "input", field: "input", "text-field": "input",
  badge: "badge", "bb-badge": "badge", tag: "badge", pill: "badge", chip: "badge",
  a: "link", link: "link", "bb-link": "link",
  nav: "nav", "bb-nav": "nav", navbar: "nav", navigation: "nav",
  tab: "tab", "bb-tab": "tab", tabs: "tab",
  // Extended (B2)
  alert: "alert", "bb-alert": "alert", banner: "alert", notice: "alert", notification: "alert", callout: "alert", toast: "alert",
  table: "table", tbl: "table", "data-table": "table",
  tooltip: "tooltip", "bb-tooltip": "tooltip", popover: "tooltip", tip: "tooltip",
  modal: "modal", dialog: "modal", "bb-modal": "modal", drawer: "modal", sheet: "modal", popup: "modal",
  avatar: "avatar", "bb-avatar": "avatar", "user-avatar": "avatar", "profile-pic": "avatar",
  label: "label", "form-label": "label",
  "help-text": "help_text", helper: "help_text", "form-help": "help_text", description: "help_text",
  "error-text": "error_text", "field-error": "error_text", "form-error": "error_text", invalid: "error_text",
};

// Pseudo-class → canonical state name.
const _STATE_PSEUDO_MAP = {
  hover: "hover", focus: "focus", "focus-visible": "focus-visible",
  active: "active", disabled: "disabled", checked: "checked",
  selected: "selected", expanded: "expanded",
};

/**
 * Parses a CSS selector and returns the component, variant, and interactive state it represents.
 * Handles: base class, pseudo-classes, BEM modifiers (--variant), and [data-variant] attributes.
 * Returns { component: string|null, variant: string|null, state: string }.
 */
function parseSelectorVariantState(selector) {
  const s = (selector || "").trim();

  // Strip leading combinators / whitespace to get the primary simple selector token.
  // We look for the first class, element, or attribute token.
  // Supported forms: .btn, .btn:hover, .btn--primary, .btn--ghost:hover, .btn[data-variant="ghost"],
  //   button:disabled, input:focus, a:hover, nav.active, etc.

  // Extract class name(s) — take the last meaningful class token before any pseudo.
  // E.g. ".btn--ghost:hover" → base=".btn", modifier="ghost", pseudo="hover"
  const classMatch = s.match(/\.([\w-]+)/);
  const elementMatch = !classMatch ? s.match(/^(a|button|input|select|textarea|nav|ul|li|span|div)(?=[:\s\[{,]|$)/i) : null;

  const rawToken = classMatch ? classMatch[1] : (elementMatch ? elementMatch[1].toLowerCase() : null);
  if (!rawToken) return { component: null, variant: null, state: "default" };

  // Resolve BEM modifier: .btn--primary → base="btn", modifier="primary"
  //   Also supports single-dash: .btn-primary (common Bootstrap convention).
  let base = rawToken;
  let variant = null;
  const bemDouble = rawToken.match(/^([\w]+)--([\w-]+)$/);
  const bemSingle = !bemDouble ? rawToken.match(/^(btn|card|badge|input|nav|tab|link|alert|table|tooltip|modal|avatar|label)-([\w-]+)$/) : null;
  if (bemDouble) {
    base = bemDouble[1];
    variant = bemDouble[2];
  } else if (bemSingle) {
    base = bemSingle[1];
    variant = bemSingle[2];
  }

  // COMPOUND CLASS variants — `.btn.btn-primary`, `.button.is-primary`, `.cta.cta-secondary`.
  // After the primary token (rawToken), look for sibling classes carrying a known variant suffix.
  if (!variant) {
    // Find ALL classes in the selector and check each for variant patterns
    const allClasses = [...s.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
    const VARIANT_KEYWORDS = /^(?:primary|secondary|tertiary|ghost|outline|outlined|link|danger|destructive|success|warning|info|neutral|brand|filled|soft|subtle|plain|default|elevated|callout|emphasis|critical|positive|negative|cta|hero|loading|small|medium|large|sm|md|lg|xl)$/i;
    for (const cls of allClasses) {
      if (cls === rawToken) continue;
      // Bulma: `.button.is-primary` → "primary"
      const bulma = cls.match(/^is-([\w-]+)$/i);
      if (bulma && VARIANT_KEYWORDS.test(bulma[1])) { variant = bulma[1].toLowerCase(); break; }
      // Bootstrap: `.btn.btn-primary` → "primary"
      const bsCompound = cls.match(/^(?:btn|button|card|alert|badge|nav|tab|link|input|table|tooltip|modal|avatar|label)-([\w-]+)$/i);
      if (bsCompound && VARIANT_KEYWORDS.test(bsCompound[1])) { variant = bsCompound[1].toLowerCase(); break; }
      // Direct keyword: `.btn.primary`
      if (VARIANT_KEYWORDS.test(cls)) { variant = cls.toLowerCase(); break; }
    }
  }

  // Resolve [data-variant|data-state|data-type|aria-pressed]="value" attribute.
  const dataVariantMatch = s.match(/\[(?:data-(?:variant|kind|appearance|theme|color|tone|size)|aria-(?:current|selected))[=~|]?["']?([\w-]+)["']?\]/);
  if (dataVariantMatch) variant = dataVariantMatch[1];

  // Resolve pseudo-class state.
  let state = "default";
  const pseudoMatch = s.match(/:(?!:)([\w-]+)/);
  if (pseudoMatch) {
    const pseudo = pseudoMatch[1].toLowerCase();
    state = _STATE_PSEUDO_MAP[pseudo] || "default";
  }

  // Resolve component canonical name.
  const component = _COMPONENT_ALIASES[base.toLowerCase()] || null;
  return { component, variant, state };
}

function detectComponentProperties(css) {
  // Regexes to detect whether a selector belongs to a known component family.
  // Pattern strategy:
  //   - element + lookahead `(?=[\s.\[:#{,]|$)` accepts `tag.class`, `tag:hover`, `tag[attr]`, `tag {`, etc.
  //   - class regexes allow CSS modules (`__hash`) by NOT putting `(?![-_])` after the canonical name
  //   - explicit BEM/Bootstrap variant suffixes are still allowed (`.btn-primary`, `.btn--primary`)
  const COMPONENT_KEYS = {
    button: /(?:^|[\s,>+~])(?:\.[\w-]*(?:btn|[Bb]utton)[\w_-]*|button(?=[\s.\[:#{,]|$)|\.cta\b|\[data-(?:component|radix-collection-item)=["']?button|input\[type=["']?(?:submit|button))/,
    card: /(?:^|[\s,>+~])(?:\.[\w-]*(?:card|product[-_](?:card|tile)|cms-block|feature-block|article-card)[\w_-]*|\.tile(?![\w-])|\.tile[-_][\w-]+|\.panel(?![\w-])|\.panel[-_][\w-]+|\.box[-_][\w-]+|article\.[\w-]*(?:card|tile)|\.bb-card|\.ds-card)/,
    input: /(?:^|[\s,>+~])(?:\.[\w-]*(?:input|field|text-field|form-control)[\w_-]*|(?:input|textarea|select)(?=[\s.\[:#{,]|$)|\.bb-input|\.ds-input)/,
    badge: /(?:^|[\s,>+~])(?:\.[\w-]*(?:badge|tag|pill|chip|eyebrow|label[-_](?:tag|chip))[\w_-]*|\.bb-badge)/,
    link: /(?:^|[\s,>+~])(?:\.[\w-]*link[\w_-]*|a(?=[\s.\[:#{,]|$)|\.bb-link)/,
    nav: /(?:^|[\s,>+~])(?:\.[\w-]*(?:nav|navbar|navigation|topbar|globalnav)[\w_-]*|nav(?=[\s.\[:#{,]|$)|\.bb-nav)/,
    tab: /(?:^|[\s,>+~])(?:\.[\w-]*(?:tab|tabs|tablist)[\w_-]*|\[role=["']?tab(?:list|panel)?|\.bb-tab)/,
    alert: /(?:^|[\s,>+~])(?:\.[\w-]*(?:alert|banner|notice|notification|callout|toast|flash|message)[\w_-]*|\[role=["']?(?:alert|status)|\.bb-alert)/,
    table: /(?:^|[\s,>+~])(?:\.[\w-]*(?:table|tbl|data-table|grid-table)[\w_-]*|table(?=[\s.\[:#{,]|$)|(?:thead|tbody|tr|th|td)(?=[\s.\[:#{,]|$))/,
    tooltip: /(?:^|[\s,>+~])(?:\.[\w-]*(?:tooltip|popover|tip)[\w_-]*|\[role=["']?tooltip|\[data-radix-tooltip|\.bb-tooltip)/,
    modal: /(?:^|[\s,>+~])(?:\.[\w-]*(?:modal|dialog|drawer|sheet|popup|overlay)[\w_-]*|dialog(?=[\s.\[:#{,]|$)|\[role=["']?dialog|\[data-radix-dialog|\.bb-modal)/,
    avatar: /(?:^|[\s,>+~])(?:\.[\w-]*(?:avatar|user-image|profile-(?:img|pic|image))[\w_-]*|\.bb-avatar)/,
    label: /(?:^|[\s,>+~])(?:\.[\w-]*(?:form-label|field-label)[\w_-]*|label(?=[\s.\[:#{,]|$)|\.label\b)/,
    help_text: /(?:^|[\s,>+~])(?:\.[\w-]*(?:help-text|form-help|helper-text|hint-text|description-text)[\w_-]*|\.hint(?=[\s.\[:#{,]|$))/,
    error_text: /(?:^|[\s,>+~])(?:\.[\w-]*(?:error-text|field-error|form-error|error-message|invalid-feedback)[\w_-]*|\.is-invalid\b)/,
  };
  const PROPS = [
    // Existing — default state visual contract
    "border-radius", "padding", "font-weight", "font-size",
    "border-width", "background-color", "color",
    // S12-extension: interactive state visual contract (CONCERN-001 fix)
    "opacity",         // disabled greying
    "cursor",          // disabled / interactive affordance
    "outline",         // focus-visible primary signal
    "outline-color",
    "outline-offset",
    "box-shadow",      // hover/focus elevation
    "transform",       // hover/active micro-motion
    "transition",      // duration/easing of state change
  ];

  // Accumulate declarations keyed by (component, state, variant).
  // Structure: acc[comp][state|"__variant__:name"][prop] = [{ selector, value }]
  const acc = {};
  for (const comp of KNOWN_COMPONENTS) {
    acc[comp] = { __default__: {} };
    for (const p of PROPS) acc[comp].__default__[p] = [];
  }

  const ruleRe = /([^{}@]+)\{([^}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(css)) !== null) {
    const selector = m[1].trim();
    const body = m[2];
    if (!selector || selector.length > 200) continue;
    if (/:after|:before|loading|spinner|::backdrop/i.test(selector)) continue;

    // Split comma-separated selectors so ".btn, .button { ... }" hits both.
    const parts = selector.split(",");
    for (const part of parts) {
      const partTrimmed = part.trim();
      let matchedComp = null;
      for (const [comp, regex] of Object.entries(COMPONENT_KEYS)) {
        if (regex.test(partTrimmed)) { matchedComp = comp; break; }
      }
      if (!matchedComp) continue;

      const parsed = parseSelectorVariantState(partTrimmed);
      // If parseSelectorVariantState found a different component, trust COMPONENT_KEYS match (broader).
      const comp = matchedComp;
      const interactiveState = parsed.state || "default";
      const variantKey = parsed.variant ? `__variant__:${parsed.variant}` : null;

      for (const prop of PROPS) {
        // Use (?<![a-z-]) to avoid "color" matching inside "background-color".
        const propRe = new RegExp("(?<![a-z-])" + prop + "\\s*:\\s*([^;}]+)", "i");
        const pm = body.match(propRe);
        if (!pm) continue;
        const value = pm[1].trim();
        const entry = { selector: partTrimmed.slice(0, 120), value };

        // Store under state bucket only when no variant is present OR when state is explicitly
        // interactive (hover/focus/etc.) — avoids polluting default state with variant-only rules.
        if (!variantKey || interactiveState !== "default") {
          if (!acc[comp][interactiveState]) acc[comp][interactiveState] = {};
          if (!acc[comp][interactiveState][prop]) acc[comp][interactiveState][prop] = [];
          acc[comp][interactiveState][prop].push(entry);
        }

        // Store under variant bucket when a variant was parsed.
        if (variantKey) {
          if (!acc[comp][variantKey]) acc[comp][variantKey] = {};
          if (!acc[comp][variantKey][prop]) acc[comp][variantKey][prop] = [];
          acc[comp][variantKey][prop].push(entry);
        }
      }
    }
  }

  // Collapse declarations using most_common heuristic.
  function collapse(propMap) {
    const result = {};
    for (const [prop, decls] of Object.entries(propMap)) {
      if (!decls || decls.length === 0) continue;
      const counts = {};
      for (const d of decls) counts[d.value] = (counts[d.value] || 0) + 1;
      const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      result[prop] = {
        most_common: ranked[0][0],
        most_common_count: ranked[0][1],
        total_declarations: decls.length,
        all_values: ranked.slice(0, 5).map(([v, c]) => ({ value: v, count: c })),
      };
    }
    return result;
  }

  const summary = {};
  for (const comp of KNOWN_COMPONENTS) {
    const bucket = acc[comp];
    const statesObj = {};
    const variantsObj = {};

    for (const [key, propMap] of Object.entries(bucket)) {
      if (key.startsWith("__variant__:")) {
        const variantName = key.slice("__variant__:".length);
        const collapsed = collapse(propMap);
        if (Object.keys(collapsed).length > 0) variantsObj[variantName] = collapsed;
      } else {
        // key is an interactive state (e.g. "default", "hover", "focus")
        const collapsed = collapse(propMap);
        if (Object.keys(collapsed).length > 0) statesObj[key] = collapsed;
      }
    }

    if (Object.keys(statesObj).length === 0 && Object.keys(variantsObj).length === 0) continue;

    // Ensure default exists when we have other states.
    if (!statesObj.default) statesObj.default = {};

    summary[comp] = {
      states: statesObj,
      variants: variantsObj,
      // Backward compat: spread default state properties at component top-level.
      ...statesObj.default,
    };
  }

  return { summary };
}

// ── HTML → markdown ─────────────────────────────────────────────────
function htmlToMarkdown(html) {
  const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  const $ = cheerio.load(html);
  $("script, noscript, style, svg, link").remove();
  return td.turndown($.html());
}

// ── Page copy specimens (for typography preview) ────────────────────
function stripMarkdownInline(s) {
  return String(s || "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/\[([^\]]+)\]/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
    .replace(/(?<!_)_([^_]+)_(?!_)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/https?:\/\/[^\s)]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPageCopy(md) {
  const lines = md.split("\n").map((l) => l.trim()).filter(Boolean);
  const headingLine = lines.find((l) => /^#{1,3}\s/.test(l));
  const headingRaw = headingLine ? headingLine.replace(/^#{1,3}\s+/, "") : "";
  const heading = stripMarkdownInline(headingRaw).slice(0, 80);

  let body = "";
  for (const l of lines) {
    if (l.startsWith("#") || l.startsWith(">") || l.startsWith("-") || l.startsWith("*") || l.startsWith("|") || l.startsWith("!")) continue;
    const stripped = stripMarkdownInline(l);
    const alphaLen = stripped.replace(/[^a-zA-Z]/g, "").length;
    if (alphaLen < 30) continue;
    body = stripped.slice(0, 160);
    break;
  }
  return { heading, body };
}

// ── CSS var resolution (used by tokens.cjs and preview.cjs) ─────────
function resolveCssVar(cssVars, name, seen = new Set()) {
  if (seen.has(name)) return null;
  seen.add(name);
  if (!Array.isArray(cssVars)) return null;
  const rootDecl = cssVars.find((v) => v.name === name && v.selector === ":root");
  const decl = rootDecl || cssVars.find((v) => v.name === name);
  if (!decl) return null;
  let value = decl.value;
  const aliasMatch = value.match(/^var\(\s*(--[a-zA-Z][\w-]*)\s*(?:,([^)]+))?\)\s*$/);
  if (aliasMatch) {
    const resolved = resolveCssVar(cssVars, aliasMatch[1], seen);
    if (resolved) return resolved;
    if (aliasMatch[2]) return aliasMatch[2].trim();
    return null;
  }
  return value;
}

// ── L3/L4 EXTRA DETECTORS ────────────────────────────────────────────
// Each returns a structured object suitable for tokens-extended.json.

function detectGradients(css) {
  const re = /(linear-gradient|radial-gradient|conic-gradient)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi;
  const counts = new Map();
  let m;
  while ((m = re.exec(css)) !== null) {
    const full = `${m[1]}(${m[2]})`;
    counts.set(full, (counts.get(full) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return {
    primary: sorted[0]?.[0] || null,
    secondary: sorted[1]?.[0] || null,
    total_unique: sorted.length,
    top: sorted.slice(0, 10).map(([value, count]) => ({ value, count })),
  };
}

function detectBackdropBlur(css) {
  const re = /backdrop-filter\s*:\s*([^;}]+)/gi;
  const blurs = new Map();
  let m;
  while ((m = re.exec(css)) !== null) {
    const blurMatch = m[1].match(/blur\(\s*([\d.]+)(px|rem|em)?\s*\)/i);
    if (!blurMatch) continue;
    const px = blurMatch[2] === "rem" || blurMatch[2] === "em"
      ? parseFloat(blurMatch[1]) * 16
      : parseFloat(blurMatch[1]);
    if (!isNaN(px) && px > 0) blurs.set(px, (blurs.get(px) || 0) + 1);
  }
  if (blurs.size === 0) return { has_backdrop_blur: false };
  const sorted = [...blurs.keys()].sort((a, b) => a - b);
  const out = { has_backdrop_blur: true, total_unique: sorted.length };
  if (sorted.length >= 1) out.sm = sorted[0] + "px";
  if (sorted.length >= 2) out.md = sorted[Math.floor(sorted.length / 2)] + "px";
  if (sorted.length >= 1) out.lg = sorted[sorted.length - 1] + "px";
  return out;
}

function detectZIndex(css) {
  const re = /z-index\s*:\s*(-?\d+)/gi;
  const counts = new Map();
  let m;
  while ((m = re.exec(css)) !== null) {
    const z = parseInt(m[1], 10);
    if (!isNaN(z) && z >= 0 && z < 100000) counts.set(z, (counts.get(z) || 0) + 1);
  }
  if (counts.size === 0) return { all: [] };
  const sorted = [...counts.entries()].sort((a, b) => a[0] - b[0]);
  // Bucket: base / dropdown / modal / toast / tooltip
  const out = { all: sorted.map(([value, count]) => ({ value, count })) };
  const values = sorted.map((e) => e[0]);
  if (values.length >= 1) out.base = values[0];
  if (values.length >= 2) out.dropdown = values[Math.floor(values.length * 0.4)];
  if (values.length >= 3) out.modal = values[Math.floor(values.length * 0.7)];
  if (values.length >= 4) out.toast = values[Math.floor(values.length * 0.85)];
  if (values.length >= 1) out.tooltip = values[values.length - 1];
  return out;
}

function detectContainerMaxWidth(css) {
  // Look for max-width declarations INSIDE rule bodies for container-ish classes.
  // Broader selector list + utility-style (.max-w-*) + body-level fallback.
  // Excludes @media/@container queries (where max-width appears inside parens).
  const counts = new Map();

  // Pass 1: known container class names
  const re1 = /\.(container|wrapper|layout|content|main|inner|page|site|app|root|shell|frame|holder|grid-container|max-w-[\w-]+)[^{}]*\{([^{}]*)\}/gi;
  let m;
  while ((m = re1.exec(css)) !== null) {
    const mw = m[2].match(/max-width\s*:\s*([^;}]+)/i);
    if (!mw) continue;
    const v = mw[1].trim();
    if (!v || v === "none" || v === "100%" || v === "auto") continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }

  // Pass 2: rules where max-width >= 768px (likely container) — lower threshold
  // than before. Excludes very small values that are usually image/widget caps.
  const re2 = /\{[^{}]*max-width\s*:\s*([\d.]+)(px|rem|em)[^{}]*\}/g;
  let m2;
  while ((m2 = re2.exec(css)) !== null) {
    const num = parseFloat(m2[1]);
    const unit = m2[2];
    const px = unit === "px" ? num : (unit === "rem" || unit === "em") ? num * 16 : num;
    if (px < 768) continue; // tablet+ only
    if (px > 4000) continue; // probably an outlier
    const v = num + unit;
    // Already counted from Pass 1? add extra weight if already present.
    counts.set(v, (counts.get(v) || 0) + 1);
  }

  if (counts.size === 0) return { value: null };
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return { value: sorted[0][0], all: sorted.slice(0, 5).map(([v, c]) => ({ value: v, count: c })) };
}

function detectOpacityScale(css) {
  const re = /(?<!\w)opacity\s*:\s*(0?\.\d+|0|1|\d+%)/gi;
  const counts = new Map();
  let m;
  while ((m = re.exec(css)) !== null) {
    let v = m[1];
    if (v.endsWith("%")) v = (parseFloat(v) / 100).toString();
    const n = parseFloat(v);
    if (isNaN(n) || n <= 0 || n > 1) continue;
    if (n === 1) continue; // skip "fully visible" — doesn't represent a token
    counts.set(n, (counts.get(n) || 0) + 1);
  }
  if (counts.size === 0) return null;
  const sorted = [...counts.entries()].sort((a, b) => a[0] - b[0]);
  const out = { all: sorted.map(([v, c]) => ({ value: v, count: c })) };
  // Bucket: disabled (lowest), muted (mid-low), hover (mid-high)
  const values = sorted.map((e) => e[0]);
  if (values.length >= 1) out.disabled = values[0];
  if (values.length >= 2) out.muted = values[Math.floor(values.length / 2)];
  if (values.length >= 1) out.hover = values[values.length - 1];
  return out;
}

// Detect the THEME the site renders by default (dark vs light).
// Signals (in priority order):
//   1. <meta name="color-scheme" content="dark light"> — first word is preferred
//   2. <html data-theme="dark|light">, <html data-color-mode="dark|light">
//   3. <body class="...dark...">
//   4. <meta name="theme-color" content="#hex"> — luminance heuristic (<0.3 = dark)
// Returns { default: "dark"|"light", confidence: "high"|"medium"|"low", signals: [...] }
function detectDefaultTheme(html, css = null) {
  if (!html) return { default: "light", confidence: "low", signals: ["no-html-fallback"] };
  const signals = [];
  let pick = null;

  // 1. color-scheme meta — strongest signal
  const csMatch = html.match(/<meta[^>]+name=["']color-scheme["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  if (csMatch) {
    const tokens = csMatch[1].toLowerCase().trim().split(/\s+/);
    const first = tokens[0];
    if (first === "dark" || first === "light") {
      pick = first;
      signals.push(`meta color-scheme="${csMatch[1]}" → ${first}`);
    }
  }

  // 2. html data-theme / data-color-mode
  if (!pick) {
    const htmlTag = (html.match(/<html[^>]*>/i) || [""])[0];
    const dataTheme = htmlTag.match(/data-(?:theme|color-mode)\s*=\s*["']([^"']+)["']/i);
    if (dataTheme) {
      const v = dataTheme[1].toLowerCase();
      if (v === "dark" || v === "light") {
        pick = v;
        signals.push(`<html data-theme="${v}">`);
      }
    }
  }

  // 3a. html class — Tailwind/Next-themes convention: <html class="dark">
  if (!pick) {
    const htmlTag2 = (html.match(/<html[^>]*>/i) || [""])[0];
    const htmlClass = htmlTag2.match(/class\s*=\s*["']([^"']+)["']/i);
    if (htmlClass) {
      const cls = htmlClass[1].toLowerCase();
      if (/\bdark(-theme|-mode)?\b/.test(cls)) {
        pick = "dark";
        signals.push(`<html class*="dark*">`);
      } else if (/\blight(-theme|-mode)?\b/.test(cls)) {
        pick = "light";
        signals.push(`<html class*="light*">`);
      }
    }
  }

  // 3b. body class
  if (!pick) {
    const bodyMatch = html.match(/<body[^>]+class=["']([^"']+)["']/i);
    if (bodyMatch) {
      const cls = bodyMatch[1].toLowerCase();
      if (/\bdark(-theme|-mode)?\b/.test(cls)) {
        pick = "dark";
        signals.push(`<body class*="dark*">`);
      } else if (/\blight(-theme|-mode)?\b/.test(cls)) {
        pick = "light";
        signals.push(`<body class*="light*">`);
      }
    }
  }

  // 4. theme-color luminance fallback
  if (!pick) {
    const tcMatches = [...html.matchAll(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["'][^>]*>/gi)];
    if (tcMatches.length > 0) {
      // Pick first non-media-prefixed theme-color (the "default")
      const defaultTc = tcMatches.find((m) => !/(prefers-color-scheme:\s*(?:dark|light))/.test(m[0])) || tcMatches[0];
      const hex = defaultTc[1].replace("#", "").trim();
      const luminance = computeLuminance(hex);
      if (luminance != null) {
        pick = luminance < 0.4 ? "dark" : "light";
        signals.push(`theme-color="${defaultTc[1]}" luminance=${luminance.toFixed(2)} → ${pick}`);
      }
    }
  }

  // 5. CSS-based fallback — when HTML emits no theme signal (common in
  //    Tailwind sites that toggle `.dark` on the client), inspect the
  //    background-related custom properties declared in global selectors
  //    (`:root`, `html`, `body`). Most-frequent value wins; the average
  //    luminance of those values picks the default mode.
  if (!pick && css) {
    const cssPick = inferThemeFromCssBackgrounds(css);
    if (cssPick) {
      pick = cssPick.mode;
      signals.push(`css-bg vars luminance avg=${cssPick.luminance.toFixed(2)} → ${pick}`);
    }
  }

  if (!pick) return { default: "light", confidence: "low", signals: signals.length ? signals : ["no-signal-fallback"] };

  // Confidence:
  //   - high: color-scheme meta or html data-attr (explicit declaration)
  //   - low: CSS-inferred (statistical heuristic)
  //   - medium: everything else (class selector, theme-color luminance)
  let confidence;
  if (/color-scheme|data-theme|data-color-mode/.test(signals.join(" "))) {
    confidence = "high";
  } else if (/css-bg vars/.test(signals.join(" "))) {
    confidence = "low";
  } else {
    confidence = "medium";
  }
  return { default: pick, confidence, signals };
}

const BG_VAR_RE = /--(?:color-)?(?:background|bg|bg-base|bg-canvas|surface|page-bg)(?:-default)?\s*:\s*([^;}]+)/gi;
const BG_PROP_RE = /(?:^|[^-])(?:background|background-color)\s*:\s*([^;}]+)/gi;

function inferThemeFromCssBackgrounds(css) {
  // Walk every block declared on a global selector (:root, :host, html, body).
  // We classify each block's "default-ness":
  //
  //   - Selectors like `:root:not(:where(.light))` apply BY DEFAULT, when no
  //     class is set. They're the dark-default pattern shadcn / Tailwind use
  //     to ship dark-first themes. Any background declared here is the
  //     real default.
  //   - Selectors like `:root,:where(.light)` apply when EITHER root OR a
  //     `.light` class is present — these are explicit light-state rules,
  //     not the implicit default.
  //   - Plain `:root`, `html`, `body` apply by default.
  //
  // We prefer evidence from default-applying selectors. If any are found,
  // they win. Otherwise, fall back to averaging all explicit declarations.
  const BLOCK_RE = /([^{}]+)\{([^{}]+)\}/g;
  const defaultLuminances = [];
  const fallbackLuminances = [];
  let block;
  while ((block = BLOCK_RE.exec(css)) !== null) {
    const selector = block[1].trim().toLowerCase();
    const isGlobal = /^(?::root|:host|html|body)\b/.test(selector) || /[\s,]body\b/.test(selector);
    if (!isGlobal) continue;
    if (/\.dark|\bdata-theme\s*=\s*["']?dark|\bdata-color-mode\s*=\s*["']?dark|prefers-color-scheme:\s*dark/.test(selector)) continue;

    // shadcn-style dark-first: `:root:not(:where(.light))` declares the
    // background that wins when no .light class is present.
    const isDefaultDark = /:not\(\s*:where\(\s*\.light\b|:not\(\s*\.light\b/.test(selector);
    // Inverse: `:not(.dark)` selectors apply when no .dark class is set.
    const isDefaultLight = /:not\(\s*:where\(\s*\.dark\b|:not\(\s*\.dark\b/.test(selector);
    // Selector explicitly opts into a light state (`.light` class active).
    // Skip those — they're not the implicit default. But don't skip the
    // negated form `:not(:where(.light))`, which fires precisely when the
    // light class is ABSENT (i.e. the default).
    const isExplicitLightState =
      /:where\(\s*\.light\b|\.light\b/.test(selector) && !isDefaultDark && !isDefaultLight;
    if (isExplicitLightState) continue;

    const body = block[2];
    const bucket = (isDefaultDark || isDefaultLight) ? defaultLuminances : fallbackLuminances;

    BG_VAR_RE.lastIndex = 0;
    let m;
    while ((m = BG_VAR_RE.exec(body)) !== null) {
      const value = m[1].trim().replace(/!important/gi, "").trim();
      const lum = luminanceFromCssColor(value);
      if (lum != null) bucket.push(lum);
    }

    BG_PROP_RE.lastIndex = 0;
    while ((m = BG_PROP_RE.exec(body)) !== null) {
      const value = m[1].trim().replace(/!important/gi, "").trim();
      const lum = luminanceFromCssColor(value);
      if (lum != null) bucket.push(lum);
    }
  }
  // Default-applying selectors always win when present — they're the most
  // direct signal of "what does the page paint when nothing is toggled".
  const source = defaultLuminances.length > 0 ? defaultLuminances : fallbackLuminances;
  if (source.length === 0) return null;
  const avg = source.reduce((a, b) => a + b, 0) / source.length;
  if (avg < 0.42) return { mode: "dark", luminance: avg };
  if (avg > 0.6) return { mode: "light", luminance: avg };
  return null;
}

function luminanceFromCssColor(value) {
  if (!value) return null;
  const v = value.trim();
  if (v.startsWith("var(")) return null; // self-referential, skip
  if (v.startsWith("#")) return computeLuminance(v.replace("#", ""));
  // rgb(0, 0, 0) / rgba(0,0,0,1)
  const rgb = v.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i);
  if (rgb) {
    const r = Number(rgb[1]) / 255;
    const g = Number(rgb[2]) / 255;
    const b = Number(rgb[3]) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  // Common named shorthand
  if (/^white$/i.test(v)) return 1;
  if (/^black$/i.test(v)) return 0;
  return null;
}

function computeLuminance(hex) {
  let h = hex;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  if ([r, g, b].some((v) => isNaN(v))) return null;
  // Relative luminance approximation (sRGB)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function detectFocusRing(css) {
  // Extract outline / box-shadow declarations within :focus-visible rules
  const re = /:focus(?:-visible)?\s*\{([^{}]*)\}/gi;
  const outlines = new Map();
  const shadows = new Map();
  let m;
  while ((m = re.exec(css)) !== null) {
    const body = m[1];
    const outlineMatch = body.match(/outline\s*:\s*([^;}]+)/i);
    if (outlineMatch) {
      const v = outlineMatch[1].trim();
      if (v && v !== "none" && v !== "0") outlines.set(v, (outlines.get(v) || 0) + 1);
    }
    const offsetMatch = body.match(/outline-offset\s*:\s*([^;}]+)/i);
    if (offsetMatch) outlines.set("__offset__:" + offsetMatch[1].trim(), 1);
    const shadowMatch = body.match(/box-shadow\s*:\s*([^;}]+)/i);
    if (shadowMatch) {
      const v = shadowMatch[1].trim();
      if (v && v !== "none") shadows.set(v, (shadows.get(v) || 0) + 1);
    }
  }
  const out = { detected: outlines.size > 0 || shadows.size > 0 };
  if (outlines.size > 0) {
    const sorted = [...outlines.entries()].sort((a, b) => b[1] - a[1]);
    const topOutline = sorted.find((e) => !e[0].startsWith("__offset__:"));
    if (topOutline) out.outline = topOutline[0];
    const topOffset = sorted.find((e) => e[0].startsWith("__offset__:"));
    if (topOffset) out.outline_offset = topOffset[0].slice("__offset__:".length);
  }
  if (shadows.size > 0) {
    const sorted = [...shadows.entries()].sort((a, b) => b[1] - a[1]);
    out.box_shadow = sorted[0][0];
  }
  return out;
}

// ── v2.2 canonical-feeders ──────────────────────────────────────────
// Functions added 2026-05-02 to capture data needed for the v2.2 canonical
// schema in apps/design/src/data/designs/{slug}/. Each is pure (HTML/MD in,
// JSON-serialisable structure out). The translator (squads/design-ops/scripts/
// translate/) reads these alongside the existing extractors to assemble:
//   meta.json, assets.json, fonts.json (already), preview.json, audit.json,
//   design.md (frontmatter + prose).

/**
 * extractMetaAssets — assets.json + meta.json defaults.
 * Captures Open Graph tags, Twitter card, apple-touch-icon, manifest icons,
 * theme-color, and content-type signals from the document <head>.
 *
 * Output shape mirrors what apps/design/src/data/designs/{slug}/assets.json
 * needs (logoUrl/faviconUrl already come from fetch.cjs).
 */
function extractMetaAssets(html) {
  const $ = cheerio.load(html || "");
  const meta = (name) =>
    $(`meta[property="${name}"]`).attr("content") ||
    $(`meta[name="${name}"]`).attr("content") ||
    null;
  const link = (rel) =>
    $(`link[rel="${rel}"]`).attr("href") ||
    $(`link[rel~="${rel}"]`).first().attr("href") ||
    null;
  return {
    appleTouchIconUrl: link("apple-touch-icon"),
    manifestUrl: link("manifest"),
    ogImageUrl: meta("og:image") || meta("og:image:secure_url") || null,
    ogTitle: meta("og:title") || $("title").first().text().trim() || null,
    ogDescription: meta("og:description") || meta("description") || null,
    ogType: meta("og:type") || null,
    ogSiteName: meta("og:site_name") || null,
    ogLocale: meta("og:locale") || null,
    twitterCard: meta("twitter:card") || null,
    twitterImage: meta("twitter:image") || null,
    twitterCreator: meta("twitter:creator") || null,
    themeColor: meta("theme-color") || null,
    canonicalUrl: link("canonical") || null,
  };
}

/**
 * extractHeroBlock — page-copy.json upgrade.
 * Today extractPageCopy returns { heading, body } as plain text.
 * v2.2 needs structured hero: kicker (eyebrow above h1), headline (with
 * inline whitelisted markup like <u>, <em>, <strong>), lead (first
 * substantial paragraph after h1), and ctas (visible CTA labels in hero
 * region).
 *
 * Heuristics:
 *  - First visible <h1> in <main> / <article> / <section> / <body> (in order).
 *  - Kicker = preceding <p> / <span> / <small> / <[data-eyebrow]> within ~150px.
 *  - Lead = first <p> after the h1 with ≥ 30 alpha chars.
 *  - CTAs = first 3 <a class*="btn"|"button"> or <button> after the h1, sibling
 *    or descendant of the same parent.
 */
function extractHeroBlock(html) {
  const $ = cheerio.load(html || "");
  // Strip noisy elements early
  $("script, style, noscript, template, iframe").remove();
  // Strip aria-hidden duplicates — these are responsive/animation overlays
  // (Linear pattern: 3 nested h1 versions for mobile/tablet/desktop with
  // aria-hidden=true). Keep only the visible text.
  $("[aria-hidden='true']").remove();

  // Find h1 in priority order: main → article → section → body.
  // Skip h1s that are clearly logos: short single-word text inside
  // <header>/<nav>/<a> ancestors are brand-marks, not headlines.
  function isLogoH1($candidate) {
    if (!$candidate || $candidate.length === 0) return true;
    const txt = $candidate.text().trim();
    const alphaCount = txt.replace(/[^a-zA-Z]/g, "").length;
    // Logos are short. Real headlines have spaces and ≥ 8 alpha chars.
    if (alphaCount < 8) return true;
    if (!/\s/.test(txt) && alphaCount < 12) return true;
    // Logos sit inside header/nav or are wrapped by an anchor pointing home
    if ($candidate.closest("header, nav").length > 0) return true;
    if ($candidate.closest("a[href='/'], a[href='#']").length > 0) return true;
    return false;
  }

  function pickH1($scope) {
    const $h1s = $scope ? $scope.find("h1") : $("h1");
    if (!$h1s || $h1s.length === 0) return null;
    let pick = null;
    $h1s.each((_, el) => {
      if (pick) return;
      const $el = $(el);
      if (!isLogoH1($el)) pick = $el;
    });
    return pick;
  }

  const h1 =
    pickH1($("main").first()) ||
    pickH1($("article").first()) ||
    pickH1($("section").first()) ||
    pickH1(null) ||
    $("h1").first();
  if (!h1 || h1.length === 0) return { kicker: null, headline: null, headlineHtml: null, lead: null, ctas: [] };

  // Hero region: walk up to find a container that includes BOTH h1 and a
  // substantive <p> (the lead). Webflow-style sites split hero into grid
  // columns where h1 is in one column and lead is in a sibling column.
  // Try h1.parent → grandparent → great-grandparent.
  let heroRegion = h1.parent();
  for (let depth = 0; depth < 4; depth++) {
    if (heroRegion.find("p").filter((_, el) => {
      const t = $(el).text().trim();
      return t.replace(/[^a-zA-Z]/g, "").length >= 30;
    }).length > 0) break;
    if (heroRegion.is("body") || heroRegion.length === 0) break;
    heroRegion = heroRegion.parent();
  }
  if (heroRegion.length === 0 || heroRegion.is("body")) heroRegion = h1.parent().parent();

  // Kicker: previous text element before h1 inside hero region (eyebrow pattern).
  // Look for short uppercase / small / data-eyebrow elements.
  let kicker = null;
  const candidates = heroRegion.find("[data-eyebrow], .eyebrow, [class*='eyebrow'], [class*='kicker']").first();
  if (candidates.length > 0) {
    const txt = candidates.text().trim();
    if (txt && txt.length <= 80) kicker = txt;
  }
  // Fallback: previous sibling of h1 if it's a small/p with short text
  if (!kicker) {
    let prev = h1.prev();
    for (let i = 0; i < 3 && prev.length > 0 && !kicker; i++) {
      const tag = prev.prop("tagName") ? prev.prop("tagName").toLowerCase() : "";
      if (["p", "span", "small", "div"].includes(tag)) {
        const txt = prev.text().trim();
        if (txt && txt.length > 0 && txt.length <= 60 && !/\b(get started|sign up|try|read more|talk to|contact|sales)\b/i.test(txt)) {
          kicker = txt;
        }
      }
      prev = prev.prev();
    }
  }

  // Headline: text + html (preserving whitelisted inline tags).
  // Linear (and other Tailwind-heavy sites) often nest the same headline
  // multiple times via responsive/aria/screen-reader spans, so the raw
  // h1.text() contains 2-3 concatenations of the same string. Detect and
  // dedupe by checking if the second half repeats the first.
  function dedupeHeadline(raw) {
    if (!raw || typeof raw !== "string") return raw;
    const cleaned = raw.replace(/\s+/g, " ").trim();
    if (cleaned.length < 30) return cleaned;
    // Try halves: if the second half is a near-prefix of the first, drop it.
    for (let split = Math.floor(cleaned.length / 4); split <= Math.floor(cleaned.length * 3 / 4); split++) {
      const head = cleaned.slice(0, split).trim();
      const tail = cleaned.slice(split).trim();
      // Match when tail starts with head (typical Linear pattern)
      if (head.length >= 15 && tail.startsWith(head)) {
        return head;
      }
    }
    // Try thirds: same idea but for triple-nested cases
    if (cleaned.length > 60) {
      const third = Math.floor(cleaned.length / 3);
      const a = cleaned.slice(0, third).trim();
      const b = cleaned.slice(third, third * 2).trim();
      const c = cleaned.slice(third * 2).trim();
      if (a.length > 10 && (b.startsWith(a.slice(0, 10)) || c.startsWith(a.slice(0, 10)))) {
        return a;
      }
    }
    return cleaned;
  }
  // Replace <br> with spaces before extracting text — otherwise Behance-style
  // headlines ("The World's<br>Best Creators<br>Are On Behance") collapse to
  // "The World'sBest CreatorsAre On Behance".
  const $h1Clone = h1.clone();
  $h1Clone.find("br").replaceWith(" ");
  const rawHeadline = $h1Clone.text().replace(/\s+/g, " ").trim();
  const headline = dedupeHeadline(rawHeadline);
  const headlineHtml = sanitizeHeroInlineHtml(h1.html() || "").trim();

  // Lead: first substantive <p> in hero region (after h1 in document order)
  let lead = null;
  heroRegion.find("p").each((_, el) => {
    if (lead) return;
    const txt = $(el).text().trim();
    const alpha = txt.replace(/[^a-zA-Z]/g, "").length;
    if (alpha >= 30 && txt !== headline) {
      lead = txt;
    }
  });

  // CTAs: visible buttons/links in hero region. Broader selector + dedupe.
  // Modern sites (Vercel, Linear) place CTAs in sibling containers of the h1,
  // not always inside heroRegion's tight bounding box. We try heroRegion first;
  // if that yields nothing, widen to the closest `<main>` / `<section>` / first
  // 1500 chars of body so we still capture the brand's primary buttons.
  const ctas = [];
  const seenLabels = new Set();
  const ctaSelectors = [
    "a.btn", "a.button",
    "a[class*='btn']", "a[class*='button']",
    "a[class*='cta']", "a[class*='Cta']",
    "button", "a[role='button']",
    "a[class*='pill']", "a[data-cta]",
  ].join(", ");
  function harvestCtas($region) {
    $region.find(ctaSelectors).each((_, el) => {
      if (ctas.length >= 3) return;
      // Skip CTAs that live INSIDE the h1 (those are inline emphasis links,
      // already captured as <u> in headlineHtml — not navigation buttons).
      if ($(el).closest("h1, h2, h3").length > 0) return;
      const txt = $(el).text().trim().replace(/\s+/g, " ");
      if (!txt || txt.length > 50 || txt.length < 2) return;
      if (seenLabels.has(txt.toLowerCase())) return;
      // Skip nav-ish labels — but allow conversion-y verbs that nav uses too
      if (/^(home|about|blog|news|careers|login|sign in|menu|search|pricing|docs|company)$/i.test(txt)) return;
      seenLabels.add(txt.toLowerCase());
      const href = $(el).attr("href") || null;
      const variant = $(el).attr("class") || "";
      ctas.push({ label: txt, href, classes: variant.slice(0, 80) || null });
    });
  }
  harvestCtas(heroRegion);
  // Widen the search if nothing was found in the tight hero region.
  if (ctas.length === 0) {
    const $main = h1.closest("main").length > 0 ? h1.closest("main") : h1.closest("section");
    if ($main.length > 0) harvestCtas($main);
  }
  // Final fallback: scan the first nav-bypassed body region (skip elements
  // inside <nav>/<header>/<footer> by filtering during harvest above).
  if (ctas.length === 0) {
    const $body = $("body").first();
    if ($body.length > 0) harvestCtas($body);
  }

  return { kicker, headline, headlineHtml, lead, ctas, hero_region_class: heroRegion.attr("class") || null };
}

// Whitelist of inline tags safe to preserve in headlineHtml. Anything else is
// stripped (text content kept). Attributes are dropped.
//
// Note: <a> in hero h1 is converted to <u> because:
//   1. Showcase YAML in design.md is read by AI consumers as semantic copy,
//      not as interactive HTML — links would not be navigable in that context.
//   2. The visual treatment of an <a> inside an h1 on marketing sites is
//      typically an underline (Anthropic, Stripe, Vercel pattern). <u> matches.
//   3. Preserves the editorial intent (key terms emphasized) without leaking
//      brand-specific URLs that are out of scope for the canonical schema.
const HERO_INLINE_WHITELIST = new Set(["u", "em", "strong", "i", "b", "br", "span", "mark"]);
const HERO_TAG_REWRITE = new Map([
  ["a", "u"], // links inside headlines → underlined emphasis
]);

/**
 * detectInlineEmphasis — when a span lacks <em>/<strong>/<u> wrapping but
 * carries a class or inline style that signals emphasis, return the
 * canonical inline tag to wrap it with. Otherwise null.
 *
 * Signals (cheap, false-positive-tolerant):
 *   - class contains "highlight" / "emphasis" / "accent" / "italic" / "bold" → strong
 *     (mapping italic→em, bold→strong, others→strong by default)
 *   - inline style includes `font-style: italic` → em
 *   - inline style includes `font-weight: 700|bold|...` → strong
 *   - inline style includes `text-decoration: underline` → u
 */
function detectInlineEmphasis(child, $) {
  if (!child || !child.attribs) return null;
  const cls = String(child.attribs.class || "").toLowerCase();
  const style = String(child.attribs.style || "").toLowerCase();
  if (/font-style\s*:\s*italic/.test(style)) return "em";
  if (/text-decoration\s*:\s*underline/.test(style)) return "u";
  // Match weights ≥600 (bold-leaning) inline
  const weightMatch = style.match(/font-weight\s*:\s*(\w+)/);
  if (weightMatch) {
    const w = weightMatch[1];
    if (w === "bold" || w === "bolder" || (parseInt(w, 10) >= 600)) return "strong";
  }
  if (/\b(highlight|accent|emphasis|emphasized|callout|underline|highlighted)\b/.test(cls)) return "u";
  if (/\b(italic)\b/.test(cls)) return "em";
  if (/\b(bold|strong|emphasis-bold)\b/.test(cls)) return "strong";
  return null;
}

function sanitizeHeroInlineHtml(html) {
  if (!html) return "";
  // Use cheerio to walk and rebuild
  const $ = cheerio.load(`<div id="__root__">${html}</div>`, { decodeEntities: false });
  const root = $("#__root__");
  function walk(node) {
    const out = [];
    node.contents().each((_, child) => {
      if (child.type === "text") {
        out.push(child.data);
      } else if (child.type === "tag") {
        let tag = (child.name || "").toLowerCase();
        if (HERO_TAG_REWRITE.has(tag)) tag = HERO_TAG_REWRITE.get(tag);
        // Auto-detect emphasis on plain <span> with class/style hints.
        // When a span has no emphasis signal, drop the wrapper entirely
        // (preserves text only).
        if (tag === "span") {
          const emph = detectInlineEmphasis(child, $);
          if (emph) {
            tag = emph;
          } else {
            // Span is structural noise (responsive wrappers, etc.) — emit text only.
            out.push(walk($(child)));
            return;
          }
        }
        if (HERO_INLINE_WHITELIST.has(tag)) {
          const inner = walk($(child));
          if (tag === "br") out.push("<br>");
          else out.push(`<${tag}>${inner}</${tag}>`);
        } else {
          // Unknown tag — keep text, drop wrapper
          out.push(walk($(child)));
        }
      }
    });
    return out.join("");
  }
  // Collapse whitespace artifacts from rewriting
  return walk(root).replace(/\s+/g, " ").replace(/\s*<br>\s*/g, "<br>");
}

/**
 * detectVoiceHeuristic — voice tone signals from page markdown.
 * Returns objective signals; brand voice classification (Editorial/Playful/...)
 * happens in the translator (which can also use LLM as fallback).
 */
function detectVoiceHeuristic(pageMd) {
  const md = pageMd || "";
  if (!md.trim()) {
    return { signal: "empty", uppercase_pct: 0, exclamation_per_para: 0, emoji_count: 0, sentence_avg_len: 0, formality: "unknown" };
  }

  // Filter out noise: nav/menu lines, list markers, link-only lines, headings.
  // These pollute "sentence" stats — a marketing nav with 60 single-link items
  // would show sentence_avg_len ≈ 1, making the page look "punchy" when it's
  // actually editorial.
  //
  // Strategy: collapse consecutive non-empty lines into paragraphs (split on blank line),
  // then filter paragraphs by alpha-density and structural markers. This handles
  // turndown output where editorial prose can span multiple lines but should be
  // measured as a single paragraph.
  const rawParagraphs = md.split(/\n\s*\n/).map((p) =>
    p.split("\n").map((l) => l.trim()).filter(Boolean).join(" ")
  );
  const proseLines = rawParagraphs.filter((p) => {
    if (!p) return false;
    if (p.startsWith("#")) return false;            // heading
    if (p.startsWith(">")) return false;             // blockquote
    if (p.startsWith("]") || p.startsWith("[")) return false;  // link fragment
    if (/^[-*+]\s/.test(p)) return false;            // list bullet
    if (/^\d+\.\s/.test(p)) return false;            // numbered list
    if (/^\|/.test(p)) return false;                 // table row
    if (/^!\[/.test(p)) return false;                // image
    if (/^\[[^\]]+\]\([^)]+\)\s*$/.test(p)) return false;  // single-link line
    if (p.replace(/[^a-zA-Z]/g, "").length < 30) return false;
    // Drop paragraphs where >25% of chars are markdown link/format syntax
    // (real prose has very few brackets/parens — only inline links here and there)
    const formatChars = (p.match(/[\[\]()*_`~|]/g) || []).length;
    if (formatChars / p.length > 0.15) return false;
    // Drop paragraphs that contain more URLs than sentences (link list)
    const urlCount = (p.match(/https?:\/\//g) || []).length;
    const sentCount = (p.match(/[.!?]/g) || []).length;
    if (urlCount > 0 && urlCount >= sentCount) return false;
    return true;
  });
  const proseText = proseLines.join("\n\n");

  // Sentence split on prose only
  const sentences = proseText.match(/[^.!?]+[.!?]/g) || [];
  const wordsAll = md.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  const wordsProse = proseText.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  const totalWords = wordsAll.length || 1;
  const upperWords = wordsAll.filter((w) => /^[A-Z]{2,}$/.test(w.replace(/[^A-Za-z]/g, "")));
  const uppercasePct = (upperWords.length / totalWords) * 100;

  const paragraphs = md.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const proseParagraphs = proseLines.length;
  const exclamations = (proseText.match(/!/g) || []).length;
  const exclamationPerPara = proseParagraphs > 0 ? exclamations / proseParagraphs : 0;

  // Emoji rough count via surrogate pair / pictographic ranges
  const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
  const emojiCount = (md.match(emojiRe) || []).length;

  const sentenceAvgLen =
    sentences.length > 0
      ? sentences.reduce((a, s) => a + s.trim().split(/\s+/).length, 0) / sentences.length
      : 0;

  // Formality signal — composite (priority order: loud → casual → literary → punchy → neutral)
  let formality = "neutral";
  if (uppercasePct > 25 || exclamationPerPara > 0.5) formality = "loud";
  else if (emojiCount > 5) formality = "casual";
  else if (sentenceAvgLen > 18) formality = "literary";
  else if (sentenceAvgLen > 0 && sentenceAvgLen < 8) formality = "punchy";
  else if (sentenceAvgLen >= 12) formality = "editorial";

  return {
    signal: "computed",
    uppercase_pct: Number(uppercasePct.toFixed(2)),
    exclamation_per_para: Number(exclamationPerPara.toFixed(3)),
    emoji_count: emojiCount,
    sentence_avg_len: Number(sentenceAvgLen.toFixed(2)),
    sentence_count: sentences.length,
    paragraph_count: paragraphs.length,
    prose_paragraph_count: proseParagraphs,
    word_count: totalWords,
    word_count_prose: wordsProse.length,
    formality,
    suggested_tones: deriveSuggestedTones({ uppercasePct, exclamationPerPara, emojiCount, sentenceAvgLen }),
  };
}

function deriveSuggestedTones({ uppercasePct, exclamationPerPara, emojiCount, sentenceAvgLen }) {
  const tones = [];
  if (uppercasePct > 25) tones.push("aggressive");
  if (exclamationPerPara > 0.5) tones.push("energetic");
  if (emojiCount > 5) tones.push("playful");
  if (sentenceAvgLen > 18) tones.push("literary");
  else if (sentenceAvgLen >= 12) tones.push("editorial");
  if (sentenceAvgLen > 0 && sentenceAvgLen < 8) tones.push("punchy");
  if (tones.length === 0) tones.push("calm");
  return tones;
}

/**
 * detectHeroVariant — classify hero layout pattern.
 * Reads HTML structure + CSS rules around the hero region to decide:
 *   - "split"     → grid with 2 columns (h1 left, lead right). Anthropic, Stripe.
 *   - "centered"  → flex column with items-center. Vercel, Linear.
 *   - "split-left"  → grid 2-col with h1 in left wider column.
 *   - "split-right" → grid 2-col with h1 in right wider column.
 *   - "stacked"   → vertical block layout (default editorial).
 *   - "default"   → fallback when no clear signal.
 *
 * Heuristics (score-based, not greedy):
 *   1. region children count = 2 + grid in CSS → split-*
 *   2. flex-direction: column + items-center / justify-center → centered
 *   3. Tailwind class signals: "items-center justify-center" → centered;
 *      "grid grid-cols-2", "u-grid-tablet", "*_grid", "*_columns" → split
 *   4. text-align in hero h1 = "center" → centered
 *   5. otherwise → stacked / default
 */
function detectHeroVariant(html, css) {
  const $ = cheerio.load(html || "");
  $("script, style, noscript").remove();
  const h1 = $("h1").first();
  if (!h1 || h1.length === 0) return { variant: "default", confidence: "low", signals: ["no-h1"] };

  // Walk up to hero region (same heuristic as extractHeroBlock)
  let region = h1.parent();
  for (let d = 0; d < 4; d++) {
    if (region.find("p").filter((_, el) => $(el).text().trim().replace(/[^a-zA-Z]/g, "").length >= 30).length > 0) break;
    if (region.is("body") || region.length === 0) break;
    region = region.parent();
  }
  if (region.length === 0 || region.is("body")) {
    region = h1.parent().parent();
  }

  const regionClasses = (region.attr("class") || "").toLowerCase();
  const childrenCount = region.children().length;
  const signals = [];

  // Tailwind / utility-class signals
  const TW_CENTER = /\bitems-center\b|\btext-center\b|\bjustify-center\b|\bmx-auto\b/;
  const TW_GRID2 = /\bgrid-cols-2\b|\bgrid-cols-12\b|\bmd:grid-cols-2\b|\blg:grid-cols-2\b/;
  const TW_FLEX_COL = /\bflex-col\b|\bflex-column\b/;
  const TW_GRID = /\bgrid\b/;
  // Webflow / generic patterns
  const WEBFLOW_GRID = /_grid\b|_columns\b|u-grid|u-columns/;

  if (TW_CENTER.test(regionClasses)) signals.push("util-center");
  if (TW_GRID2.test(regionClasses)) signals.push("util-grid2");
  if (TW_FLEX_COL.test(regionClasses)) signals.push("util-flex-col");
  if (TW_GRID.test(regionClasses)) signals.push("util-grid");
  if (WEBFLOW_GRID.test(regionClasses)) signals.push("webflow-grid");

  // CSS rule lookup for the region's primary class
  const cssBlob = css || "";
  const primaryCls = regionClasses.split(/\s+/).find((c) => c && !c.startsWith("u-")) || regionClasses.split(/\s+/)[0];
  if (primaryCls) {
    const re = new RegExp(`\\.${primaryCls.replace(/[^\w-]/g, "")}\\b[^{}]*\\{([^{}]+)\\}`, "i");
    const m = cssBlob.match(re);
    if (m) {
      const body = m[1];
      if (/display\s*:\s*grid/i.test(body)) signals.push("css-grid");
      if (/grid-template-columns\s*:[^;]*\d+/i.test(body)) signals.push("css-grid-cols");
      if (/display\s*:\s*flex/i.test(body)) signals.push("css-flex");
      if (/flex-direction\s*:\s*column/i.test(body)) signals.push("css-flex-col");
      if (/align-items\s*:\s*(center|end)/i.test(body)) signals.push("css-align-" + RegExp.$1);
      if (/justify-(content|items)\s*:\s*center/i.test(body)) signals.push("css-justify-center");
      if (/text-align\s*:\s*center/i.test(body)) signals.push("css-text-center");
    }
  }

  // h1 text-align (inline style or computed via class regex)
  const h1Style = (h1.attr("style") || "").toLowerCase();
  if (/text-align\s*:\s*center/.test(h1Style)) signals.push("h1-text-center");

  // Decide variant by signal priority
  let variant = "default";
  let confidence = "low";

  const hasGrid = signals.some((s) => s.includes("grid"));
  const hasCenter = signals.some((s) => s.includes("center"));
  const hasFlexCol = signals.some((s) => s.includes("flex-col"));

  if (hasGrid && childrenCount === 2) {
    // Determine which column has the h1 (left/right by DOM index)
    const h1Col = region.children().filter((_, el) => $(el).find("h1").length > 0).first();
    const h1Index = region.children().index(h1Col);
    if (h1Index === 0) variant = "split";
    else if (h1Index === 1) variant = "split-right";
    else variant = "split";
    confidence = "high";
  } else if (hasGrid && childrenCount > 2) {
    variant = "split"; // multi-column grid
    confidence = "medium";
  } else if (hasCenter && (hasFlexCol || childrenCount <= 3)) {
    variant = "centered";
    confidence = "high";
  } else if (hasCenter) {
    variant = "centered";
    confidence = "medium";
  } else if (hasFlexCol) {
    variant = "stacked";
    confidence = "medium";
  } else if (childrenCount === 2) {
    // Two children but no grid CSS — likely a stacked text+visual or text+cta
    variant = "stacked";
    confidence = "low";
  }

  return {
    variant,
    confidence,
    signals,
    region_tag: region.prop("tagName") || null,
    region_class: region.attr("class") || null,
    region_children_count: childrenCount,
  };
}

/**
 * detectCtaVariants — classify the top buttons/links into primary/secondary/ghost.
 * Reads detectComponentProperties output + raw selector inspection to identify
 * which CSS classes correspond to which CTA role.
 *
 * Heuristics:
 *   primary   → solid background fill (most-used non-transparent bg)
 *   secondary → transparent or surface bg + border
 *   ghost     → transparent, no border, text-only (often used for tertiary)
 *
 * Returns up to 3 named recipes with selector + extracted properties:
 *   { primary: { selector, bg, color, border, radius, padding },
 *     secondary: { ... },
 *     ghost: { ... },
 *     unclassified: [...remaining selectors] }
 */
function detectCtaVariants(css, componentProps, primaryColor) {
  const out = { primary: null, secondary: null, ghost: null, unclassified: [] };
  if (!css) return out;
  const primaryHex = (primaryColor || "").toLowerCase();

  // Find all rules where the selector mentions button/btn/cta and capture properties.
  const ruleRe = /([^{}]+)\{([^{}]+)\}/g;
  const candidates = [];
  let m;
  // Match: .btn, .button, .Button, .cta, .pill (anywhere in token name) + role=button
  // Examples that match:
  //   .btn-primary, .Button, .cta-button, .pill-button, .signup-button,
  //   button.primary, [role="button"]
  // Examples that DON'T match (descendant pollution):
  //   .nav .item, .header img
  const buttonTokenRe = /(^|[\s,>])(\.[a-z0-9_-]*(btn|button|cta|pill)[a-z0-9_-]*|button|\[role=["']button["']\])([\s,>:.]|$)/i;
  while ((m = ruleRe.exec(css)) !== null) {
    const selector = m[1].trim();
    const body = m[2];
    if (selector.length > 200) continue;
    if (!buttonTokenRe.test(selector)) continue;
    // Skip pseudo-states for primary classification (we want default state)
    if (/:hover|:focus|:active|:disabled|:checked|:before|:after/.test(selector)) continue;
    // Skip descendant selectors with nav/header/footer (likely wrapper, not the CTA itself)
    if (/\b(nav|header|footer|menu|sidebar|toolbar)\s+\./i.test(selector)) continue;
    const props = parseDeclarations(body);
    if (!props.background && !props["background-color"] && !props.color && !props.border && !props.padding && !props["border-radius"]) continue;
    candidates.push({ selector, props });
  }

  // Score each candidate as primary/secondary/ghost
  function classify(props) {
    const bg = props["background-color"] || props.background || "";
    const bgIsTransparent = !bg || /^transparent\b|^none\b|rgba\([^)]*,\s*0\s*\)/i.test(bg);
    const hasBorder = /border\s*:[^;]*solid/i.test(JSON.stringify(props)) ||
      props.border || props["border-width"] ||
      (props["border-style"] && props["border-style"] !== "none");
    if (!bgIsTransparent) return "primary";       // solid fill
    if (hasBorder) return "secondary";             // transparent + border
    return "ghost";                                 // transparent + no border
  }

  // Group: primary candidates first (by largest bg color frequency, fallback to first)
  const grouped = { primary: [], secondary: [], ghost: [] };
  for (const c of candidates) {
    grouped[classify(c.props)].push(c);
  }

  // Score each candidate by canonical-fitness:
  //  + matches primary brand color (high signal)
  //  + simple selector (single class, no BEM modifier)
  //  - selectors with ::moz/::webkit/::-internal pseudo-elements
  //  - selectors with nested descendants
  //  - selectors that look library-default (.w-button, .icon-*, .badge-*)
  // Webflow's stock CTA color (`.button { background: #146ef5 }`) — never a real
  // brand decision. Same goes for the focus-ring blue and a few other classroom
  // defaults that ship with Webflow's blank-canvas template.
  const WEBFLOW_DEFAULT_BG = new Set([
    "#146ef5", // .button background
    "#3898ec", // focus ring + secondary defaults
    "#0073e6",
  ]);

  function score(cand) {
    let s = 0;
    const sel = cand.selector;
    const bgRaw = (cand.props["background-color"] || cand.props.background || "");
    const bg = bgRaw.toLowerCase();
    const allDeclVals = Object.values(cand.props).join(" ").toLowerCase();

    // Pseudo-element / vendor prefix penalties (these are resets, not CTAs)
    if (/::?-?(moz|webkit|ms|o|internal)-/i.test(sel)) s -= 100;

    // Library/framework default class penalties
    if (/\bw-button\b/.test(sel)) s -= 50;     // Webflow default reset
    // `.button` (no namespace) on Webflow sites is the stock template style —
    // not the brand's authored CTA. Don't kill it entirely (some greenfield
    // sites legitimately use `.button`), just down-rank it below brand-named
    // selectors like `.btn_main_wrap`.
    if (/^\.button(\s|,|$)/.test(sel)) s -= 25;
    if (/\b(icon|badge|chip)-/.test(sel)) s -= 30;
    if (/--[a-z]+--[a-z]+/.test(sel)) s -= 20; // deep BEM modifier (button--variant--state)

    // Webflow stock CTA hex — strong negative signal that this is a default.
    if (WEBFLOW_DEFAULT_BG.has(bg.replace(/\s+/g, "").trim())) s -= 60;

    // Reward primary color match
    if (primaryHex && bg.includes(primaryHex)) s += 50;

    // Reward declarations that reference brand-authored CSS variables anywhere
    // (button-style, cta, brand). These signal "the site author wired this CTA
    // up to the design system" — much stronger than a selector heuristic.
    if (/var\(--[^)]*\b(button|btn|cta|brand|primary)[^)]*\)/i.test(allDeclVals)) s += 40;

    // Reward simple .xyz selectors
    const classCount = (sel.match(/\./g) || []).length;
    if (classCount === 1) s += 10;
    if (classCount === 2) s += 3;

    // Reward shorter selectors (less specific, more canonical)
    s += Math.max(0, 50 - sel.length) / 5;

    // Reward presence of border-radius declaration
    if (cand.props["border-radius"]) s += 5;

    return s;
  }

  function pick(group) {
    if (group.length === 0) return null;
    return group.map((c) => ({ ...c, _score: score(c) })).sort((a, b) => b._score - a._score)[0];
  }

  const p = pick(grouped.primary);
  const s = pick(grouped.secondary);
  const g = pick(grouped.ghost);
  if (p) out.primary = compactCta(p);
  if (s) out.secondary = compactCta(s);
  if (g) out.ghost = compactCta(g);

  // Anything left over → unclassified (informative, not blocking)
  const sortGroup = (group) => group.map((c) => ({ ...c, _score: score(c) })).sort((a, b) => b._score - a._score);
  out.unclassified = []
    .concat(sortGroup(grouped.primary).slice(1))
    .concat(sortGroup(grouped.secondary).slice(1))
    .concat(sortGroup(grouped.ghost).slice(1))
    .map(compactCta)
    .slice(0, 5);

  return out;
}

function parseDeclarations(body) {
  const out = {};
  const decls = body.split(/;/);
  for (const d of decls) {
    const idx = d.indexOf(":");
    if (idx === -1) continue;
    const name = d.slice(0, idx).trim().toLowerCase();
    const value = d.slice(idx + 1).trim();
    if (!name || !value) continue;
    out[name] = value;
  }
  return out;
}

function compactCta({ selector, props }) {
  // Validate border: only emit if shorthand has a meaningful value
  // (not "0", "none", "0px", etc — those are reset declarations)
  let border = null;
  const rawBorder = props.border;
  if (rawBorder && !/^(0|0px|none)$/i.test(rawBorder.trim())) {
    border = rawBorder;
  } else if (props["border-width"] && props["border-style"] && props["border-style"] !== "none") {
    const bw = String(props["border-width"]).trim();
    if (!/^(0|0px)$/i.test(bw)) {
      border = `${bw} ${props["border-style"]} ${props["border-color"] || "currentColor"}`;
    }
  }
  return {
    selector: selector.slice(0, 120),
    bg: props["background-color"] || props.background || null,
    color: props.color || null,
    border,
    radius: props["border-radius"] || null,
    padding: props.padding || null,
    height: props.height || null,
    "font-weight": props["font-weight"] || null,
    "font-size": props["font-size"] || null,
  };
}

/**
 * generateMetaDefaults — aggregator producing the seeds for apps/design/src/data/designs/{slug}/meta.json.
 *
 * Reads everything else the extract has produced (tokens, meta-assets, hero-block,
 * style-fingerprint, voice-heuristic) and synthesises:
 *   - glyph         → first letter of brand name (uppercased)
 *   - heroColor     → tokens.colors.primary (hero accent for the gallery card)
 *   - canvasColor   → tokens.colors.surface || tokens.colors.background
 *   - suggestedBlurb → og:description trimmed to 120 chars (one sentence ideal)
 *   - suggestedTags → from style-fingerprint.classification.style_tags
 *   - suggestedCat  → mapped from og:type and stack signals
 *   - companySlug   → derived from URL host
 *   - name          → og:site_name || og:title || URL host
 *
 * The translator (squads/design-ops/scripts/translate/) merges these into the
 * final meta.json, allowing humans to override curated fields (cat, featured,
 * trending) without re-running the extract.
 */
/**
 * deriveBrandChips — synthesise 3-4 short identity chips from extracted
 * tokens. Mechanical, no LLM. Each chip is one of:
 *
 *   1. Font dialect      ("Serif body", "Sans display", "Mono UI")
 *   2. Primary CTA       ("Slate CTA #141413")
 *   3. Accent token      ("Clay accent #d97757")
 *   4. Radius signature  ("Radius 8px") OR canvas mode ("Light canvas")
 *
 * Returns string[] (length 3-4). Skips items that have no signal.
 */
function deriveBrandChips(tokens, voiceHeuristic, themeDefault) {
  if (!tokens) return null;
  const chips = [];
  const fonts = tokens.fonts || {};
  const colors = tokens.colors || {};
  const rounded = tokens.rounded || {};

  // Chip 1 — font dialect
  const familyOf = (val) => (typeof val === "string" ? val.split(",")[0].trim().replace(/['"]/g, "") : null);
  const sansName = familyOf(fonts.sans);
  const serifName = familyOf(fonts.serif);
  const monoName = familyOf(fonts.mono);
  const displayName = familyOf(fonts.display);
  if (serifName && /serif/i.test(serifName)) chips.push(`Serif body`);
  else if (sansName) chips.push(`Sans body`);
  else if (displayName) chips.push(`${displayName} display`);

  // Chip 2 — primary CTA
  const primary = typeof colors.primary === "string" ? colors.primary : colors.primary?.value;
  if (primary && /^#[0-9a-f]{3,8}$/i.test(primary)) {
    chips.push(`Primary CTA ${primary.toLowerCase()}`);
  }

  // Chip 3 — accent or signature swatch
  const accent = typeof colors.accent === "string" ? colors.accent : colors.accent?.value;
  if (accent && /^#[0-9a-f]{3,8}$/i.test(accent) && accent.toLowerCase() !== (primary || "").toLowerCase()) {
    chips.push(`Accent ${accent.toLowerCase()}`);
  } else if (monoName && monoName !== sansName) {
    chips.push(`${monoName} mono`);
  }

  // Chip 4 — radius signature OR canvas mode
  const buttonRadius = rounded.button || rounded.md || rounded.lg;
  if (buttonRadius && /^[\d.]+(px|rem|em)$/i.test(String(buttonRadius))) {
    chips.push(`Radius ${buttonRadius}`);
  } else {
    const canvas = themeDefault?.default;
    if (canvas === "light" || canvas === "dark") {
      chips.push(`${canvas.charAt(0).toUpperCase() + canvas.slice(1)} canvas`);
    }
  }

  // Voice fallback — when a chip slot is still empty, surface tone
  if (chips.length < 3 && voiceHeuristic?.suggested_tones?.length) {
    const tone = voiceHeuristic.suggested_tones[0];
    if (tone) chips.push(`${tone.charAt(0).toUpperCase() + tone.slice(1)} voice`);
  }

  return chips.slice(0, 4);
}

/**
 * deriveBrandDescription — synthesise a one-line description from extracted
 * signals. Priority:
 *   1. meta-assets.json description (og:description / meta name="description")
 *   2. heroBlock.lead (first sentence)
 *   3. mechanical synth from chips ("[archetype]. [font dialect]. [primary CTA].")
 *
 * Returns string or null.
 */
function deriveBrandDescription({ metaAssets, heroBlock, archetype, chips }) {
  // Priority 1: meta description
  const meta = metaAssets || {};
  const description = meta.description || meta.metaDescription || meta.ogDescription;
  if (description && typeof description === "string" && description.length >= 20 && description.length <= 280) {
    const firstSent = description.split(/(?<=[.!?])\s+/)[0] || description;
    return firstSent.trim().length > 0 ? firstSent.trim() : null;
  }

  // Priority 2: hero lead
  if (heroBlock?.lead && typeof heroBlock.lead === "string") {
    const firstSent = heroBlock.lead.split(/(?<=[.!?])\s+/)[0];
    if (firstSent && firstSent.length >= 20 && firstSent.length <= 280) {
      return firstSent.trim();
    }
  }

  // Priority 3: synth from archetype + chips (no LLM)
  if (archetype && Array.isArray(chips) && chips.length >= 2) {
    return `${archetype}. ${chips.slice(0, 2).join(", ")}.`;
  }

  return null;
}

function generateMetaDefaults({ tokens, metaAssets, heroBlock, styleFingerprint, voiceHeuristic, url, slug }) {
  const t = tokens || {};
  const ma = metaAssets || {};
  const hb = heroBlock || {};
  const sf = styleFingerprint || {};
  const vh = voiceHeuristic || {};

  // Brand name: og:site_name → og:title (cleaned) → slug
  let name = ma.ogSiteName || null;
  if (!name && ma.ogTitle) {
    // Strip noise like "Home \\ Anthropic", "BrandName · Tagline"
    name = ma.ogTitle.split(/[\\\\→·|–—:]/)[0].trim();
    if (!name || name.toLowerCase() === "home") {
      const parts = ma.ogTitle.split(/[\\\\→·|–—:]/).map((s) => s.trim()).filter(Boolean);
      name = parts[parts.length - 1] || ma.ogTitle.trim();
    }
  }
  // Sanitize: bot-detection / error pages bleed corrupted titles into og:title
  // ("Your request has been blocked", "Access Denied", "404 Not Found", etc.).
  // Reject any name that matches error patterns, is multiline, > 80 chars, has
  // ellipsis truncation, or contains HTML markup. Fall back to titled slug.
  if (name) {
    const NAME_CORRUPT = /your request|has been blocked|access denied|forbidden|temporarily unavailable|please verify|are you human|404 not found|page not found|service unavailable|cloudflare|bot detection|captcha/i;
    const isMultiline = /\n/.test(name);
    const tooLong = name.length > 80;
    const hasEllipsis = /\.{3,}|…/.test(name);
    const looksLikeHtml = /<[a-z]/i.test(name);
    if (NAME_CORRUPT.test(name) || isMultiline || tooLong || hasEllipsis || looksLikeHtml) {
      name = null;
    }
  }
  if (!name) name = slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : null;

  const glyph = name ? name.replace(/[^A-Za-z]/g, "").charAt(0).toUpperCase() : null;

  // Colors from tokens
  const heroColor = (t.colors && (t.colors.primary?.value || t.colors.primary)) || null;
  const canvasColor =
    (t.colors && (t.colors.surface?.value || t.colors.surface)) ||
    (t.colors && (t.colors.background?.value || t.colors.background)) ||
    null;

  // Blurb: prefer og:description first sentence, fall back to hero lead
  let suggestedBlurb = null;
  if (ma.ogDescription) {
    const firstSent = ma.ogDescription.split(/(?<=[.!?])\s+/)[0] || ma.ogDescription;
    suggestedBlurb = firstSent.length > 140 ? firstSent.slice(0, 137) + "..." : firstSent;
  } else if (hb.lead) {
    const firstSent = hb.lead.split(/(?<=[.!?])\s+/)[0] || hb.lead;
    suggestedBlurb = firstSent.length > 140 ? firstSent.slice(0, 137) + "..." : firstSent;
  }

  // Tags: from style fingerprint + voice signals
  const suggestedTags = [];
  if (sf.classification?.style_tags?.length) {
    suggestedTags.push(...sf.classification.style_tags.slice(0, 4));
  }
  if (vh.suggested_tones?.length) {
    suggestedTags.push(...vh.suggested_tones.slice(0, 2));
  }
  // Light/dark signal
  if (t.theme_default || sf.classification?.canvas) {
    const canvas = (t.theme_default || sf.classification?.canvas || "").toLowerCase();
    if (canvas === "light" || canvas === "dark") suggestedTags.push(canvas);
  }
  // De-dupe
  const seenTags = new Set();
  const uniqueTags = suggestedTags.filter((tag) => {
    const k = tag.toLowerCase();
    if (seenTags.has(k)) return false;
    seenTags.add(k);
    return true;
  });

  // Category: rough mapping from og:type + stack signals
  let suggestedCat = null;
  const ogType = (ma.ogType || "").toLowerCase();
  if (ogType.includes("article") || ogType.includes("blog")) suggestedCat = "Editorial";
  else if (ogType.includes("product")) suggestedCat = "Product";
  else if (ogType.includes("profile")) suggestedCat = "Profile";
  else if (ogType === "website") suggestedCat = null; // too generic; let curator decide
  // Refine using stack hints
  if (Array.isArray(sf.stack_signals)) {
    const hasAi = sf.stack_signals.some((s) => /ai|llm|claude|openai|anthropic|gpt/i.test(s.name || ""));
    if (hasAi && !suggestedCat) suggestedCat = "AI & LLM";
  }

  // Archetype
  const archetype = sf.classification?.primary_archetype || null;

  // Auto-derived chips + description (deterministic, no LLM)
  const chips = deriveBrandChips(t, vh, t.theme_default ? { default: t.theme_default } : null);
  const description = deriveBrandDescription({
    metaAssets: ma,
    heroBlock: hb,
    archetype,
    chips,
  });

  return {
    name,
    companySlug: slug || null,
    glyph,
    heroColor,
    canvasColor,
    suggestedBlurb,
    suggestedTags: uniqueTags.slice(0, 6),
    suggestedCat,
    archetype,
    chips,
    description,
    sourceUrl: url || null,
    voice: vh.formality ? { formality: vh.formality, tones: vh.suggested_tones } : null,
  };
}

module.exports = {
  detectTokens,
  detectCssVars,
  detectFontFaces,
  detectStack,
  classifyStyle,
  truncateCssForLlm,
  DEFAULT_CSS_BUDGET_BYTES,
  summarizeStackForPrompt,
  detectShadows,
  filterShadows,
  splitShadows,
  extractNamedShadows,
  detectMotion,
  detectBreakpoints,
  detectSpacingScale,
  detectDarkMode,
  detectComponentProperties,
  parseSelectorVariantState,
  KNOWN_COMPONENTS,
  KNOWN_STATES,
  buildUsageGraph,
  htmlToMarkdown,
  stripMarkdownInline,
  extractPageCopy,
  resolveCssVar,
  STACK_SUPPRESSIONS,
  // L3/L4 extras
  detectGradients,
  detectBackdropBlur,
  detectZIndex,
  detectContainerMaxWidth,
  detectOpacityScale,
  detectFocusRing,
  // Theme default detection (dark vs light)
  detectDefaultTheme,
  computeLuminance,
  // v2.2 canonical-feeders (2026-05-02)
  extractMetaAssets,
  extractHeroBlock,
  sanitizeHeroInlineHtml,
  HERO_INLINE_WHITELIST,
  detectVoiceHeuristic,
  detectHeroVariant,
  detectCtaVariants,
  generateMetaDefaults,
  deriveBrandChips,
  deriveBrandDescription,
  // filters.* primitives (Constituição §8 compliant — return null instead of fallback)
  bucketHue,
  bucketHues,
};
