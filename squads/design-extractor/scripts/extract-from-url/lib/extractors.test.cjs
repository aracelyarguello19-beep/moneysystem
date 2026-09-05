"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  detectTokens, detectCssVars, detectFontFaces, detectStack,
  classifyStyle,
  truncateCssForLlm,
  summarizeStackForPrompt,
  detectShadows, detectMotion, detectBreakpoints, detectDarkMode,
  detectDefaultTheme,
  detectComponentProperties, parseSelectorVariantState, KNOWN_COMPONENTS, KNOWN_STATES,
  buildUsageGraph, resolveCssVar,
  stripMarkdownInline, extractPageCopy,
  STACK_SUPPRESSIONS,
} = require("./extractors.cjs");

test("detectTokens captures hex colors", () => {
  const css = "body { color: #ff0000; background: #00ff00; } a { color: rgb(0, 0, 255); }";
  const t = detectTokens(css);
  assert.ok(t.colors.hex.includes("#ff0000"));
  assert.ok(t.colors.hex.includes("#00ff00"));
  assert.equal(t.colors.rgb.length, 1);
});

test("detectCssVars captures --vars with selector scope", () => {
  const css = ":root { --primary: #ff0000; --bg: var(--primary); } .dark { --primary: #00ff00; }";
  const vars = detectCssVars(css);
  const root = vars.find(v => v.selector === ":root" && v.name === "--primary");
  assert.equal(root.value, "#ff0000");
  assert.equal(root.is_alias, false);
  const alias = vars.find(v => v.name === "--bg");
  assert.equal(alias.is_alias, true);
});

test("detectFontFaces parses family + weight + urls", () => {
  const css = `@font-face { font-family: "Inter"; font-weight: 400; font-style: normal; src: url("/inter.woff2") format("woff2"), url("/inter.woff") format("woff"); }`;
  const faces = detectFontFaces(css);
  assert.equal(faces.length, 1);
  assert.equal(faces[0].family, "Inter");
  assert.equal(faces[0].weight, "400");
  assert.deepEqual(faces[0].src_urls, ["/inter.woff2", "/inter.woff"]);
  assert.deepEqual(faces[0].src_formats, ["woff2", "woff"]);
});

test("detectStack matches Next.js + Tailwind", () => {
  const html = `<html><body><div id="__next">x</div><script src="/_next/static/chunks/x.js"></script></body></html>`;
  const css = "/* tailwindcss v4.2.1 */";
  const stack = detectStack(html, css, { external: [] });
  const names = stack.map(s => s.name);
  assert.ok(names.some(n => n.startsWith("Next.js")));
  assert.ok(names.some(n => n.startsWith("Tailwind CSS")));
});

test("detectStack matches Webflow + GSAP", () => {
  const html = `<html><body data-wf-page="abc"><script src="//gsap.com/gsap.js"></script></body></html>`;
  const stack = detectStack(html, "", { external: [] });
  const names = stack.map(s => s.name);
  assert.ok(names.includes("Webflow"));
  assert.ok(names.includes("GSAP"));
});

test("detectShadows aggregates by uniqueness + count", () => {
  const css = `.a { box-shadow: 0 1px 2px #0001; } .b { box-shadow: 0 1px 2px #0001; } .c { box-shadow: 0 4px 8px #0002; }`;
  const shadows = detectShadows(css);
  assert.equal(shadows.length, 2);
  assert.equal(shadows[0].count, 2);
  assert.match(shadows[0].value, /0 1px 2px/);
});

test("detectMotion finds durations + easings + keyframes", () => {
  const css = `
    .a { transition: opacity 200ms ease-out; }
    .b { animation-duration: 300ms; }
    @keyframes spin { from {} to {} }
    .c { transition: 200ms cubic-bezier(0.4, 0, 0.2, 1); }
  `;
  const m = detectMotion(css);
  assert.ok(m.durations.find(d => d.value === "200ms"));
  assert.ok(m.easings.length > 0);
  assert.ok(m.keyframes.includes("spin"));
});

test("detectMotion pairs property with duration + timing in transitions[]", () => {
  // Medium-style declaration: only bg-color and color transition, both 300ms linear.
  const css = `
    .em { transition: background-color 300ms linear, color 300ms linear; }
    .em:hover { background-color: #156d12; }
    .a { transition: opacity 200ms ease-out; }
    .multi { transition: 250ms ease, transform 400ms cubic-bezier(0.4, 0, 0.2, 1) 50ms; }
  `;
  const m = detectMotion(css);
  assert.ok(Array.isArray(m.transitions));
  const bg = m.transitions.find(t => t.property === "background-color" && t.duration === "300ms");
  assert.ok(bg, "expected background-color 300ms entry");
  assert.equal(bg.timing, "linear");
  const color = m.transitions.find(t => t.property === "color" && t.duration === "300ms");
  assert.ok(color, "expected color 300ms entry");
  assert.equal(color.timing, "linear");
  const op = m.transitions.find(t => t.property === "opacity" && t.duration === "200ms");
  assert.ok(op, "expected opacity 200ms entry");
  assert.equal(op.timing, "ease-out");
  const all = m.transitions.find(t => t.property === "all" && t.duration === "250ms");
  assert.ok(all, "expected fallback 'all' when property missing in shorthand");
  const cb = m.transitions.find(t => t.property === "transform" && t.duration === "400ms");
  assert.ok(cb, "expected transform with cubic-bezier timing");
  assert.match(cb.timing, /^cubic-bezier/);
});

test("detectMotion captures keyframe bodies in keyframe_bodies{}", () => {
  // Medium k1 spinner — rotate 0→360deg.
  const css = `
    @keyframes k1 {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes fade {
      0% { opacity: 0; }
      100% { opacity: 1; }
    }
  `;
  const m = detectMotion(css);
  assert.ok(m.keyframe_bodies);
  assert.ok(m.keyframe_bodies.k1, "expected keyframe_bodies.k1 to be populated");
  assert.match(m.keyframe_bodies.k1, /rotate\(0deg\)/);
  assert.match(m.keyframe_bodies.k1, /rotate\(360deg\)/);
  assert.ok(m.keyframe_bodies.fade);
  assert.match(m.keyframe_bodies.fade, /opacity:\s*0/);
  assert.match(m.keyframe_bodies.fade, /opacity:\s*1/);
});

test("detectDefaultTheme uses CSS background fallback when HTML has no theme signal", () => {
  const html = "<html><head></head><body><main>Product</main></body></html>";
  const css = ":root:not(:where(.light)) { --background: #050505; --foreground: #ffffff; }";
  const theme = detectDefaultTheme(html, css);
  assert.equal(theme.default, "dark");
  assert.equal(theme.confidence, "low");
  assert.ok(theme.signals.some((signal) => signal.includes("css-bg vars")));
});

test("detectBreakpoints aggregates media query widths", () => {
  const css = `@media (min-width: 768px) {} @media (max-width: 1024px) {} @media (min-width: 768px) {}`;
  const bp = detectBreakpoints(css);
  assert.equal(bp.find(b => b.value === "768px").count, 2);
});

test("detectDarkMode finds prefers-color-scheme + .dark class", () => {
  const css = `@media (prefers-color-scheme: dark) {} .dark .foo {} .dark .bar {} .dark .baz {} .dark .qux {} .dark .quux {} .dark .six {}`;
  const dm = detectDarkMode(css, []);
  assert.equal(dm.has_dark_mode, true);
  assert.ok(dm.signals.length >= 1);
});

test("detectComponentProperties surfaces .btn { border-radius: 0 } override", () => {
  const css = `:root { --radius-md: 8px; } .btn { border-radius: 0; padding: 8px 16px; } .btn { border-radius: 0; }`;
  const cp = detectComponentProperties(css);
  assert.equal(cp.summary.button["border-radius"].most_common, "0");
});

test("buildUsageGraph counts declarations vs references", () => {
  const css = ":root { --primary: red; } .a { color: var(--primary); } .b { color: var(--primary); }";
  const vars = detectCssVars(css);
  const graph = buildUsageGraph(css, vars);
  const primary = graph.find(g => g.name === "--primary");
  assert.equal(primary.declarations, 1);
  assert.equal(primary.references, 2);
});

test("resolveCssVar follows alias chain", () => {
  const vars = [
    { name: "--primary", value: "#ff0000", selector: ":root", is_alias: false },
    { name: "--bg", value: "var(--primary)", selector: ":root", is_alias: true },
    { name: "--surface", value: "var(--bg)", selector: ":root", is_alias: true },
  ];
  assert.equal(resolveCssVar(vars, "--surface"), "#ff0000");
  assert.equal(resolveCssVar(vars, "--missing"), null);
});

test("resolveCssVar handles cycles", () => {
  const vars = [
    { name: "--a", value: "var(--b)", selector: ":root", is_alias: true },
    { name: "--b", value: "var(--a)", selector: ":root", is_alias: true },
  ];
  assert.equal(resolveCssVar(vars, "--a"), null);
});

test("stripMarkdownInline removes link syntax", () => {
  assert.equal(stripMarkdownInline("[click here](url)"), "click here");
  assert.equal(stripMarkdownInline("**bold** and *italic*"), "bold and italic");
  assert.equal(stripMarkdownInline("`code` text"), "code text");
});

test("extractPageCopy returns clean heading + body", () => {
  const md = `# Hello [world](https://x.com)

This is some text inside of a div block that should be picked as the body specimen.`;
  const c = extractPageCopy(md);
  assert.equal(c.heading, "Hello world");
  assert.match(c.body, /text inside of a div block/);
});

// ── S2: Confidence ladder ────────────────────────────────────────────

test("S2: Webflow via data-wf-page is confidence high", () => {
  const html = `<html><body data-wf-page="abc123"></body></html>`;
  const stack = detectStack(html, "", { external: [] });
  const webflow = stack.find(s => s.name === "Webflow");
  assert.ok(webflow, "Webflow should be detected");
  assert.equal(webflow.confidence, "high");
});

test("S2: Tailwind via --tw-* vars without banner is confidence medium", () => {
  const css = `.a { --tw-translate-x: 0; }`;
  const stack = detectStack("", css, { external: [] });
  const tw = stack.find(s => s.name === "Tailwind CSS");
  assert.ok(tw, "Tailwind should be detected");
  assert.equal(tw.confidence, "medium");
});

test("S2: Tailwind via explicit banner is confidence high", () => {
  const css = `/* tailwindcss v3.4.0 */`;
  const stack = detectStack("", css, { external: [] });
  const tw = stack.find(s => s.name && s.name.startsWith("Tailwind CSS"));
  assert.ok(tw, "Tailwind with banner should be detected");
  assert.equal(tw.confidence, "high");
});

test("S2: shadcn via --popover-foreground is confidence high", () => {
  const css = `:root { --popover-foreground: 222 84% 5%; }`;
  const stack = detectStack("", css, { external: [] });
  const shadcn = stack.find(s => s.name === "shadcn/ui");
  assert.ok(shadcn, "shadcn/ui should be detected");
  assert.equal(shadcn.confidence, "high");
});

// ── S3: Cross-signal suppression ─────────────────────────────────────

test("S3: Next.js suppresses React — suppressed_by set", () => {
  const html = `<html><body><div id="__next"><div data-reactroot></div><script src="/_next/static/x.js"></script></div></body></html>`;
  const stack = detectStack(html, "", { external: [] });
  const react = stack.find(s => s.name === "React");
  const nextjs = stack.find(s => s.name === "Next.js");
  assert.ok(nextjs, "Next.js should be detected");
  assert.ok(react, "React should still be in matches");
  assert.equal(react.suppressed_by, "Next.js");
});

test("S3: Astro suppresses React and Vue when both present", () => {
  const html = `<html><body><astro-island></astro-island><div data-reactroot></div><div data-vue-meta="{}"></div><script src="/_astro/x.js"></script></body></html>`;
  const stack = detectStack(html, "", { external: [] });
  const react = stack.find(s => s.name === "React");
  const vue = stack.find(s => s.name === "Vue");
  const astro = stack.find(s => s.name === "Astro");
  assert.ok(astro, "Astro should be detected");
  if (react) assert.equal(react.suppressed_by, "Astro");
  if (vue) assert.equal(vue.suppressed_by, "Astro");
});

test("S3: SvelteKit alone — no suppression applied", () => {
  const html = `<html><body><div data-svelte-kit="yes"></div></body></html>`;
  const stack = detectStack(html, "", { external: [] });
  const sveltekit = stack.find(s => s.name === "SvelteKit");
  // SvelteKit detected but no Svelte separately → nothing to suppress
  if (sveltekit) assert.equal(sveltekit.suppressed_by, undefined);
});

test("S3: STACK_SUPPRESSIONS constant exists with expected keys", () => {
  assert.ok(typeof STACK_SUPPRESSIONS === "object");
  assert.ok(Array.isArray(STACK_SUPPRESSIONS["Next.js"]));
  assert.ok(STACK_SUPPRESSIONS["Next.js"].includes("React"));
  assert.ok(STACK_SUPPRESSIONS["Astro"].includes("React"));
  assert.ok(STACK_SUPPRESSIONS["Astro"].includes("Vue"));
});

// ── S6: HTTP headers signals ──────────────────────────────────────────

test("S6: x-vercel-id header detects Vercel with confidence high", () => {
  const stack = detectStack("", "", { external: [] }, { "x-vercel-id": "iad1::abc-123" });
  const vercel = stack.find(s => s.name === "Vercel" && s.kind === "hosting");
  assert.ok(vercel, "Vercel should be detected from header");
  assert.equal(vercel.confidence, "high");
});

test("S6: cf-ray header detects Cloudflare with confidence high", () => {
  const stack = detectStack("", "", { external: [] }, { "cf-ray": "8abc123-IAD" });
  const cf = stack.find(s => s.name === "Cloudflare" && s.kind === "cdn");
  assert.ok(cf, "Cloudflare should be detected from cf-ray");
  assert.equal(cf.confidence, "high");
});

test("S6: x-shopify-stage header detects Shopify with confidence high", () => {
  const stack = detectStack("", "", { external: [] }, { "x-shopify-stage": "production" });
  const shopify = stack.find(s => s.name === "Shopify" && s.kind === "ecommerce");
  assert.ok(shopify, "Shopify should be detected from header");
  assert.equal(shopify.confidence, "high");
});

test("S6: Cloudflare from header dedups with CSS URL detection — only one entry per (name, kind)", () => {
  const headers = { "cf-ray": "8abc123-IAD" };
  const cssMeta = { external: ["https://cdnjs.cloudflare.com/x.css"] };
  const stack = detectStack("", "", cssMeta, headers);
  const cfMatches = stack.filter(s => s.name === "Cloudflare" && s.kind === "cdn");
  assert.equal(cfMatches.length, 1, "Cloudflare cdn should appear only once (header wins)");
});

test("S6: detectStack backward compat — 3 args still works (headers defaults to {})", () => {
  const html = `<html><body data-wf-page="x"></body></html>`;
  // Should not throw with 3 args
  const stack = detectStack(html, "", { external: [] });
  assert.ok(Array.isArray(stack));
});

// ── S4: summarizeStackForPrompt ───────────────────────────────────────

test("S4: summarizeStackForPrompt filters suppressed entries", () => {
  const html = `<html><body><div id="__next"><div data-reactroot></div><script src="/_next/static/x.js"></script></div></body></html>`;
  const stack = detectStack(html, "", { external: [] });
  const summary = summarizeStackForPrompt(stack);
  const reactInSummary = summary.find(s => s.name === "React");
  assert.equal(reactInSummary, undefined, "React suppressed by Next.js should not appear in summary");
});

test("S4: summarizeStackForPrompt orders high > medium > low", () => {
  const stack = [
    { name: "B", kind: "x", confidence: "medium", evidence: "e" },
    { name: "A", kind: "x", confidence: "high", evidence: "e" },
    { name: "C", kind: "x", confidence: "low", evidence: "e" },
  ];
  const summary = summarizeStackForPrompt(stack);
  assert.equal(summary[0].name, "A");
  assert.equal(summary[1].name, "B");
  assert.equal(summary[2].name, "C");
});

test("S4: summarizeStackForPrompt limits to top 8", () => {
  const stack = Array.from({ length: 12 }, (_, i) => ({
    name: `Tech${i}`, kind: "x", confidence: "medium", evidence: "e",
  }));
  const summary = summarizeStackForPrompt(stack);
  assert.equal(summary.length, 8);
});

test("S4: summarizeStackForPrompt emits compact objects without evidence or suppressed_by", () => {
  const stack = [{ name: "Next.js", kind: "framework", confidence: "high", evidence: "long evidence string here" }];
  const summary = summarizeStackForPrompt(stack);
  assert.equal(summary.length, 1);
  assert.equal(summary[0].name, "Next.js");
  assert.equal(summary[0].kind, "framework");
  assert.equal(summary[0].confidence, "high");
  assert.equal(summary[0].evidence, undefined, "evidence should not be in summary");
  assert.equal(summary[0].suppressed_by, undefined, "suppressed_by should not be in summary");
});

// ── classifyStyle (visual archetype classification) ──────────────────
test("classifyStyle returns shape per output_contract", () => {
  const result = classifyStyle({}, [], { declarations: [] }, [], "");
  assert.ok(result.extracted_signals, "has extracted_signals");
  assert.ok(result.classification, "has classification");
  assert.ok(result.archetype_distance, "has archetype_distance");
  assert.equal(typeof result.classification.confidence_score, "number");
  // Empty input → no archetype reaches threshold
  assert.equal(result.classification.primary_archetype, null);
});

test("classifyStyle detects glass surface only with MULTIPLE backdrop-filter (threshold)", () => {
  // Single isolated backdrop-filter is common in modern sites (header, modal) and is NOT glass
  const cssSingle = ".header { backdrop-filter: blur(8px); background: rgba(0,0,0,0.5); }";
  const single = classifyStyle({}, [], {}, [], cssSingle);
  assert.notEqual(single.extracted_signals.surface_treatment, "glass",
    "Single backdrop-filter should NOT trigger glass (false positive in batch 2026-04-27)");

  // Apple-glass signature: ≥3 backdrop-filter blocks
  const cssMany = `.panel-1 { backdrop-filter: blur(20px); }
                   .panel-2 { backdrop-filter: blur(20px); }
                   .panel-3 { backdrop-filter: blur(15px); background: rgba(255,255,255,0.7); }`;
  const many = classifyStyle({}, [], {}, [], cssMany);
  assert.equal(many.extracted_signals.surface_treatment, "glass");
});

test("classifyStyle: glass also triggers with 1 blur + many translucent bgs", () => {
  // ≥1 backdrop + ≥5 translucent bgs + frosted light surfaces = apple-glass companion pattern
  const css = `.modal { backdrop-filter: blur(20px); }
               .a { background: rgba(255,255,255,0.6); }
               .b { background: rgba(255,255,255,0.4); }
               .c { background-color: rgba(255,255,255,0.3); }
               .d { background: rgba(245,245,245,0.5); }
               .e { background: rgba(250,250,250,0.7); }`;
  const result = classifyStyle({}, [], {}, [], css);
  assert.equal(result.extracted_signals.surface_treatment, "glass");
});

test("classifyStyle does not treat one duplicated dark blur block as apple-glass", () => {
  const css = `.streaming-card {
                 -webkit-backdrop-filter: blur(30px);
                 backdrop-filter: blur(30px);
                 background: linear-gradient(91deg, #261733, #151a3f);
               }
               .select { background: rgba(22,22,22,0.7); }
               .dialog { background: rgba(0,0,0,0.7); }
               .input { background-color: rgba(22,22,22,0.2); }
               .overlay { background: rgba(0,0,0,0.5); }
               .scrim { background: rgba(0,0,0,0.8); }`;
  const result = classifyStyle({}, [], {}, [], css);
  assert.notEqual(result.extracted_signals.surface_treatment, "glass");
});

test("classifyStyle detects gradient only with MULTIPLE gradient declarations OR full-surface", () => {
  // Single hero gradient is universal in modern marketing — NOT enough
  const cssSingle = ".hero { background: linear-gradient(135deg, #00d4ff 0%, #ff00ff 100%); }";
  const single = classifyStyle({}, [], {}, [], cssSingle);
  assert.notEqual(single.extracted_signals.surface_treatment, "gradient",
    "Single gradient should NOT trigger gradient archetype");

  // ≥3 gradient declarations
  const cssMany = `.hero { background: linear-gradient(135deg, #00d4ff, #ff00ff); }
                   .card { background: linear-gradient(180deg, #f00, #00f); }
                   .button { background: radial-gradient(circle, #abc, #def); }`;
  const many = classifyStyle({}, [], {}, [], cssMany);
  assert.equal(many.extracted_signals.surface_treatment, "gradient");

  // OR full-surface gradient (body/html/main)
  const cssFull = "body { background: linear-gradient(180deg, #fff, #000); }";
  const full = classifyStyle({}, [], {}, [], cssFull);
  assert.equal(full.extracted_signals.surface_treatment, "gradient");
});

test("classifyStyle scores shadcn-neutral from monochrome oklch tokens", () => {
  const tokensDetected = {
    colors: {
      hex: ["#fafafa", "#18181b", "#27272a"],
      rgb: [],
      hsl: [],
    },
    radii: ["0.625rem", "0.5rem", "0.75rem"],
    spacing: ["1rem", "0.5rem", "1.5rem", "2rem"],
    fontWeights: ["400", "500", "600", "700"],
  };
  const result = classifyStyle(tokensDetected, [], { declarations: [] }, [], "");
  assert.ok(
    result.classification.primary_archetype === "shadcn-neutral" ||
    result.classification.secondary_archetype === "shadcn-neutral",
    `Expected shadcn-neutral in primary/secondary; got primary=${result.classification.primary_archetype} secondary=${result.classification.secondary_archetype}`
  );
});

test("classifyStyle scores carbon-enterprise from saturated blue + sharp corners", () => {
  const tokensDetected = {
    colors: {
      hex: ["#0f62fe", "#161616", "#525252", "#0353e9"],
      rgb: [],
      hsl: [],
    },
    radii: ["0", "2px", "4px"],
    spacing: ["8px", "16px", "24px", "32px", "40px", "48px", "64px", "80px", "96px", "112px"],
    fontWeights: ["400", "600"],
  };
  const result = classifyStyle(tokensDetected, [], { declarations: [] }, [], "");
  // Carbon-enterprise should rank in top 3
  const ranked = Object.entries(result.archetype_distance).sort((a, b) => b[1] - a[1]);
  const top3 = ranked.slice(0, 3).map(([n]) => n);
  assert.ok(
    top3.includes("carbon-enterprise"),
    `Expected carbon-enterprise in top 3; got ${top3.join(", ")}`
  );
});

test("classifyStyle scores cinematic-streaming from Netflix-like dark red gradient tokens", () => {
  const tokensDetected = {
    colors: {
      hex: ["#000000", "#141414", "#161616", "#e50914", "#c11119", "#ffffff", "#b3b3b3"],
      rgb: ["rgb(229,9,20)", "rgb(193,17,25)", "rgba(0,0,0,0.8)", "rgba(255,255,255,0.7)"],
      hsl: [],
    },
    radii: ["0.25rem", "0.5rem", "1rem"],
    spacing: ["0.5rem", "1rem", "1.5rem", "2rem", "3rem"],
    fontWeights: ["400", "700", "900"],
  };
  const css = `.hero { background: linear-gradient(180deg, rgba(0,0,0,0.8), rgba(0,0,0,0.4)); }
               .billboard { background: linear-gradient(91deg, #261733, #151a3f); }
               .cta { background: linear-gradient(180deg, #e50914, #c11119); }
               .modal { box-shadow: 0 0.25rem 0.5rem 0 rgba(0,0,0,0.8); }`;
  const result = classifyStyle(tokensDetected, [], {
    declarations: [{ value: "0 0.25rem 0.5rem 0 rgba(0,0,0,0.8)" }],
  }, [], css);

  assert.equal(result.classification.primary_archetype, "cinematic-streaming");
});

test("classifyStyle does NOT classify orange/light-surface marketing site as cinematic-streaming (A2 regression guard)", () => {
  // Itaú-like: orange brand (#FF6200) on light surface — NOT red-on-black.
  // Pre-A2 fix this returned cinematic-streaming at 91% confidence.
  const tokensDetected = {
    colors: {
      hex: ["#FF6200", "#1F2D40", "#F5F6F8", "#FFFFFF", "#535D74", "#0066B2"],
      rgb: [],
      hsl: [],
    },
    radii: ["4px", "8px", "16px"],
    spacing: ["8px", "16px", "24px", "32px"],
    fontWeights: ["400", "500", "700"],
  };
  const result = classifyStyle(tokensDetected, [], { declarations: [] }, [], "");
  assert.notEqual(result.classification.primary_archetype, "cinematic-streaming",
    "Orange brand on light surface MUST NOT be classified as cinematic-streaming");
});

test("classifyStyle does NOT classify Amazon-like orange marketing as cinematic-streaming (A2 regression guard)", () => {
  // Amazon-like: orange brand (#ff9900) on light surface
  const tokensDetected = {
    colors: {
      hex: ["#ff9900", "#232f3e", "#ffffff", "#f3f3f3", "#0F1111", "#007185"],
      rgb: [],
      hsl: [],
    },
    radii: ["4px", "8px"],
    spacing: ["8px", "12px", "16px", "24px"],
    fontWeights: ["400", "700"],
  };
  const result = classifyStyle(tokensDetected, [], { declarations: [] }, [], "");
  assert.notEqual(result.classification.primary_archetype, "cinematic-streaming",
    "Amazon orange palette MUST NOT match cinematic-streaming");
});

test("classifyStyle does NOT classify light retail banking red CTA as cinematic-streaming", () => {
  const tokensDetected = {
    colors: {
      hex: ["#cc0000", "#ffffff", "#000000", "#222222", "#f5f5f5", "#cccccc"],
      rgb: [],
      hsl: [],
      hex_usage: { "#cc0000": 40, "#ffffff": 120, "#000000": 20, "#222222": 60 },
    },
    radii: ["4px", "8px", "16px"],
    spacing: ["8px", "16px", "24px", "32px", "48px"],
    fontWeights: ["400", "700"],
  };
  const css = `
    .hero { background: #cc0000; color: #ffffff; }
    .card { background: #ffffff; }
    .section { background-color: #f5f5f5; }
    .body { background: #ffffff; color: #222222; }
  `;
  const result = classifyStyle(tokensDetected, [], { declarations: [] }, [], css);
  assert.notEqual(result.classification.primary_archetype, "cinematic-streaming",
    "Light banking surfaces with red CTAs MUST NOT be cinematic-streaming");
});

// ── truncateCssForLlm (Sprint 4 — cost discipline) ──────────────────
test("truncateCssForLlm: small CSS untouched", () => {
  const css = ":root { --x: red; } .btn { color: var(--x); }";
  const r = truncateCssForLlm(css);
  assert.equal(r.dropped, false);
  assert.equal(r.truncated, css);
});

test("truncateCssForLlm: large CSS truncated to budget", () => {
  const blocks = [];
  blocks.push(":root { --primary: #f00; --secondary: #00f; }");
  blocks.push(".dark { --primary: #800; }");
  for (let i = 0; i < 1000; i++) {
    blocks.push(`.utility-${i} { padding: ${i % 16}px; margin: ${i % 8}px; transform: rotate(${i}deg); transition: all 0.2s; }`);
  }
  const css = blocks.join("\n");
  assert.ok(css.length > 50000);
  const r = truncateCssForLlm(css, { budgetBytes: 10 * 1024 });
  assert.equal(r.dropped, true);
  assert.ok(r.kept_bytes < r.original_bytes);
  assert.ok(r.truncated.includes(":root"), "kept :root block");
  assert.ok(r.truncated.includes(".dark"), "kept dark mode block");
});

test("truncateCssForLlm: empty input safe", () => {
  const r = truncateCssForLlm("");
  assert.equal(r.dropped, false);
  assert.equal(r.truncated, "");
});

test("truncateCssForLlm: prioritizes :root over utilities", () => {
  const utilities = Array.from({ length: 500 }, (_, i) =>
    `.util-${i} { padding: ${i}px; margin: ${i}px; }`
  ).join("\n");
  const css = utilities + "\n:root { --critical: #f00; --secondary: #0f0; }";
  const r = truncateCssForLlm(css, { budgetBytes: 5 * 1024 });
  assert.equal(r.dropped, true);
  assert.ok(r.truncated.includes(":root"), "kept :root despite ordering");
  assert.ok(r.truncated.includes("--critical"), "kept critical var");
});

// ── S12: Variant Matrix Extraction ──────────────────────────────────

test("parseSelectorVariantState: .btn → default state, no variant", () => {
  const r = parseSelectorVariantState(".btn");
  assert.equal(r.component, "button");
  assert.equal(r.variant, null);
  assert.equal(r.state, "default");
});

test("parseSelectorVariantState: .btn:hover → hover state", () => {
  const r = parseSelectorVariantState(".btn:hover");
  assert.equal(r.component, "button");
  assert.equal(r.variant, null);
  assert.equal(r.state, "hover");
});

test("parseSelectorVariantState: .btn:focus-visible → focus-visible state", () => {
  const r = parseSelectorVariantState(".btn:focus-visible");
  assert.equal(r.component, "button");
  assert.equal(r.variant, null);
  assert.equal(r.state, "focus-visible");
});

test("parseSelectorVariantState: .btn:active → active state", () => {
  const r = parseSelectorVariantState(".btn:active");
  assert.equal(r.component, "button");
  assert.equal(r.state, "active");
});

test("parseSelectorVariantState: .btn:disabled → disabled state", () => {
  const r = parseSelectorVariantState(".btn:disabled");
  assert.equal(r.component, "button");
  assert.equal(r.state, "disabled");
});

test("parseSelectorVariantState: .btn--primary → primary variant, default state", () => {
  const r = parseSelectorVariantState(".btn--primary");
  assert.equal(r.component, "button");
  assert.equal(r.variant, "primary");
  assert.equal(r.state, "default");
});

test("parseSelectorVariantState: .btn--ghost:hover → ghost variant + hover state", () => {
  const r = parseSelectorVariantState(".btn--ghost:hover");
  assert.equal(r.component, "button");
  assert.equal(r.variant, "ghost");
  assert.equal(r.state, "hover");
});

test("parseSelectorVariantState: .btn[data-variant=\"ghost\"] → ghost variant", () => {
  const r = parseSelectorVariantState('.btn[data-variant="ghost"]');
  assert.equal(r.component, "button");
  assert.equal(r.variant, "ghost");
  assert.equal(r.state, "default");
});

test("parseSelectorVariantState: unknown selector → component null", () => {
  const r = parseSelectorVariantState(".unknown-widget");
  assert.equal(r.component, null);
});

test("KNOWN_COMPONENTS and KNOWN_STATES exported with expected values", () => {
  assert.ok(Array.isArray(KNOWN_COMPONENTS));
  assert.ok(KNOWN_COMPONENTS.includes("button"));
  assert.ok(KNOWN_COMPONENTS.includes("card"));
  assert.ok(KNOWN_COMPONENTS.includes("input"));
  assert.ok(KNOWN_COMPONENTS.includes("badge"));
  assert.ok(KNOWN_COMPONENTS.includes("link"));
  assert.ok(KNOWN_COMPONENTS.includes("nav"));
  assert.ok(KNOWN_COMPONENTS.includes("tab"));
  assert.ok(Array.isArray(KNOWN_STATES));
  assert.ok(KNOWN_STATES.includes("default"));
  assert.ok(KNOWN_STATES.includes("hover"));
  assert.ok(KNOWN_STATES.includes("focus"));
  assert.ok(KNOWN_STATES.includes("focus-visible"));
  assert.ok(KNOWN_STATES.includes("disabled"));
});

test("detectComponentProperties: button states schema from sample CSS", () => {
  const css = `
    .btn { border-radius: 4px; padding: 8px 16px; }
    .btn:hover { background-color: #0066cc; }
    .btn:focus-visible { color: #fff; }
    .btn:disabled { background-color: #ccc; color: #999; }
  `;
  const cp = detectComponentProperties(css);
  const btn = cp.summary.button;
  assert.ok(btn, "button component detected");
  assert.ok(btn.states, "states object exists");
  assert.ok(btn.states.default, "default state exists");
  assert.equal(btn.states.default["border-radius"].most_common, "4px");
  assert.ok(btn.states.hover, "hover state exists");
  assert.equal(btn.states.hover["background-color"].most_common, "#0066cc");
  assert.ok(btn.states["focus-visible"], "focus-visible state exists");
  assert.ok(btn.states.disabled, "disabled state exists");
  assert.equal(btn.states.disabled["background-color"].most_common, "#ccc");
});

test("detectComponentProperties: BEM variants populated", () => {
  const css = `
    .btn { border-radius: 0; padding: 12px 24px; }
    .btn--primary { background-color: #007bff; color: #fff; }
    .btn--ghost { background-color: transparent; border-width: 1px; }
  `;
  const cp = detectComponentProperties(css);
  const btn = cp.summary.button;
  assert.ok(btn.variants, "variants object exists");
  assert.ok(btn.variants.primary, "primary variant exists");
  assert.equal(btn.variants.primary["background-color"].most_common, "#007bff");
  assert.ok(btn.variants.ghost, "ghost variant exists");
  assert.equal(btn.variants.ghost["background-color"].most_common, "transparent");
});

test("detectComponentProperties: backward compat — legacy top-level keys equivalent to states.default", () => {
  const css = `.btn { border-radius: 8px; padding: 10px 20px; font-weight: 600; }`;
  const cp = detectComponentProperties(css);
  const btn = cp.summary.button;
  assert.equal(btn["border-radius"].most_common, btn.states.default["border-radius"].most_common);
  assert.equal(btn["padding"].most_common, btn.states.default["padding"].most_common);
  assert.equal(btn["font-weight"].most_common, btn.states.default["font-weight"].most_common);
});

test("detectComponentProperties: simple component with no interactives has only default state", () => {
  const css = `.card { border-radius: 12px; padding: 24px; }`;
  const cp = detectComponentProperties(css);
  const card = cp.summary.card;
  assert.ok(card, "card detected");
  assert.ok(card.states, "states exists");
  assert.ok(card.states.default, "default state exists");
  assert.deepEqual(Object.keys(card.states), ["default"], "only default state present");
  assert.deepEqual(card.variants, {}, "no variants");
});

// ── S12 CONCERN-001: PROPS whitelist expansion ───────────────────────

test("detectComponentProperties: disabled state captures opacity + cursor (CONCERN-001)", () => {
  const css = `.btn { border-radius: 0; } .btn:disabled { opacity: 0.5; cursor: not-allowed; }`;
  const cp = detectComponentProperties(css);
  const disabled = cp.summary.button?.states?.disabled;
  assert.ok(disabled, "disabled state exists");
  assert.equal(disabled.opacity.most_common, "0.5");
  assert.equal(disabled.cursor.most_common, "not-allowed");
});

test("detectComponentProperties: focus-visible state captures outline (CONCERN-001)", () => {
  const css = `.btn { padding: 8px; } .btn:focus-visible { outline: 2px solid blue; }`;
  const cp = detectComponentProperties(css);
  const focusVisible = cp.summary.button?.states?.["focus-visible"];
  assert.ok(focusVisible, "focus-visible state exists");
  assert.equal(focusVisible.outline.most_common, "2px solid blue");
});

test("detectComponentProperties: hover state captures box-shadow + transform (CONCERN-001)", () => {
  const css = `.btn { padding: 8px; } .btn:hover { box-shadow: 0 4px 8px rgba(0,0,0,.1); transform: translateY(-2px); }`;
  const cp = detectComponentProperties(css);
  const hover = cp.summary.button?.states?.hover;
  assert.ok(hover, "hover state exists");
  assert.equal(hover["box-shadow"].most_common, "0 4px 8px rgba(0,0,0,.1)");
  assert.equal(hover.transform.most_common, "translateY(-2px)");
});

// ────────────────────────────────────────────────────────────────────
// v2.2 canonical-feeders (2026-05-02)
// ────────────────────────────────────────────────────────────────────
const {
  extractMetaAssets,
  extractHeroBlock,
  sanitizeHeroInlineHtml,
  detectVoiceHeuristic,
} = require("./extractors.cjs");

test("extractMetaAssets captures OG + apple-touch-icon + canonical", () => {
  const html = `<html><head>
    <title>Brand Page</title>
    <meta property="og:title" content="Brand Title">
    <meta property="og:description" content="Brand description.">
    <meta property="og:image" content="https://cdn/og.jpg">
    <meta property="og:type" content="website">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:creator" content="@brand">
    <link rel="apple-touch-icon" href="https://cdn/apple-icon.png">
    <link rel="canonical" href="https://brand.com">
  </head><body>x</body></html>`;
  const m = extractMetaAssets(html);
  assert.equal(m.ogTitle, "Brand Title");
  assert.equal(m.ogDescription, "Brand description.");
  assert.equal(m.ogImageUrl, "https://cdn/og.jpg");
  assert.equal(m.ogType, "website");
  assert.equal(m.twitterCard, "summary_large_image");
  assert.equal(m.twitterCreator, "@brand");
  assert.equal(m.appleTouchIconUrl, "https://cdn/apple-icon.png");
  assert.equal(m.canonicalUrl, "https://brand.com");
});

test("extractMetaAssets falls back to <title> + name=description", () => {
  const html = `<html><head>
    <title>Plain Page</title>
    <meta name="description" content="Plain desc.">
  </head><body>x</body></html>`;
  const m = extractMetaAssets(html);
  assert.equal(m.ogTitle, "Plain Page");
  assert.equal(m.ogDescription, "Plain desc.");
  assert.equal(m.ogImageUrl, null);
});

test("sanitizeHeroInlineHtml preserves <u> and rewrites <a> → <u>", () => {
  const html = 'AI <a href="/research">research</a> and <a href="/products">products</a> at the frontier';
  const out = sanitizeHeroInlineHtml(html);
  assert.equal(out, "AI <u>research</u> and <u>products</u> at the frontier");
});

test("sanitizeHeroInlineHtml strips unknown tags but keeps text", () => {
  const html = 'Hello <div class="x">world</div> <em>now</em>';
  const out = sanitizeHeroInlineHtml(html);
  assert.equal(out, "Hello world <em>now</em>");
});

test("extractHeroBlock captures headline + headlineHtml + lead from grid layout", () => {
  const html = `<html><body><main>
    <div class="hero-grid">
      <div class="col-7"><h1>AI <a href="/r">research</a> at the frontier</h1></div>
      <div class="col-5"><p>This is a substantive lead paragraph that describes what we build and why we build it.</p></div>
    </div>
  </main></body></html>`;
  const h = extractHeroBlock(html);
  assert.equal(h.headline, "AI research at the frontier");
  assert.equal(h.headlineHtml, "AI <u>research</u> at the frontier");
  assert.match(h.lead, /substantive lead paragraph/);
});

test("extractHeroBlock excludes inner-h1 links from CTAs", () => {
  const html = `<html><body><main>
    <div class="hero">
      <h1><a href="/r">research</a> at the frontier</h1>
      <p>This is a paragraph about the product mission and the work we are doing.</p>
      <a class="btn-primary" href="/start">Get started</a>
      <a class="btn-secondary" href="/learn">Learn more</a>
    </div>
  </main></body></html>`;
  const h = extractHeroBlock(html);
  assert.equal(h.ctas.length, 2);
  assert.equal(h.ctas[0].label, "Get started");
  assert.equal(h.ctas[1].label, "Learn more");
  // "research" should NOT be a CTA (it's an inner-h1 emphasis link)
  assert.ok(!h.ctas.some(c => c.label === "research"));
});

test("detectVoiceHeuristic returns non-loud signal for measured prose", () => {
  const md = `# Title

This is a paragraph of editorial prose that has multiple thoughtful sentences with reasonable length and considered word choice throughout the entire passage. Each sentence has substantive content beyond merely a few words and reads as calm rather than punchy.

This is another paragraph with similar editorial characteristics where we are speaking deliberately and not loudly across the entire structure. The system reads as composed and unhurried.

Yet another paragraph reinforcing the same tone with thoughtful word selection and considered sentence rhythm. We use sentence case throughout the document. We avoid exclamation points and uppercase shouting in every paragraph here.`;
  const v = detectVoiceHeuristic(md);
  assert.equal(v.signal, "computed");
  assert.notEqual(v.formality, "loud");
  assert.notEqual(v.formality, "casual");
  assert.ok(v.uppercase_pct < 5, `uppercase_pct should be low, got ${v.uppercase_pct}`);
  assert.equal(v.exclamation_per_para, 0);
});

test("detectVoiceHeuristic flags loud voice from uppercase + exclamations", () => {
  const md = `# Title

WE ARE THE BEST! THIS IS AMAZING! YOU NEED THIS NOW!

BUY TODAY! LIMITED TIME OFFER! ACT FAST!`;
  const v = detectVoiceHeuristic(md);
  assert.equal(v.formality, "loud");
});

test("detectVoiceHeuristic filters markdown link fragments from prose stats", () => {
  const md = `# Nav

](https://example.com/a) *   [
](https://example.com/b) *   [
](https://example.com/c) *   [

This is real prose that should drive the sentence average length calculation correctly.

Another real paragraph with thoughtful sentences and a calm rhythm.`;
  const v = detectVoiceHeuristic(md);
  assert.ok(v.prose_paragraph_count <= 3, "link fragments should not count as prose paragraphs");
  assert.ok(v.sentence_avg_len >= 5, "real prose should yield sentence_avg >= 5");
});

const {
  detectHeroVariant,
  detectCtaVariants,
  generateMetaDefaults,
} = require("./extractors.cjs");

test("detectHeroVariant identifies split layout from grid + 2 children", () => {
  const html = `<html><body><main>
    <div class="home_hero_grid u-grid-tablet">
      <div class="col-7"><h1>Headline</h1></div>
      <div class="col-5"><p>This is a substantive lead paragraph with enough text content here.</p></div>
    </div>
  </main></body></html>`;
  const css = `.home_hero_grid { display: grid; grid-template-columns: 7fr 5fr; align-items: end; }`;
  const v = detectHeroVariant(html, css);
  assert.equal(v.variant, "split");
  assert.equal(v.confidence, "high");
  assert.equal(v.region_children_count, 2);
  assert.ok(v.signals.some(s => s.includes("grid")));
});

test("detectHeroVariant identifies centered layout from items-center", () => {
  const html = `<html><body><main>
    <div class="flex flex-col items-center justify-start gap-2">
      <h1>Headline</h1>
      <p>This is a centered hero with enough lead text content here for detection.</p>
    </div>
  </main></body></html>`;
  const css = `.flex { display: flex; }`;
  const v = detectHeroVariant(html, css);
  assert.equal(v.variant, "centered");
  assert.ok(v.signals.includes("util-center"));
  assert.ok(v.signals.includes("util-flex-col"));
});

test("detectHeroVariant returns default when no signal", () => {
  const html = `<html><body><main><h1>Plain</h1></main></body></html>`;
  const v = detectHeroVariant(html, "");
  assert.equal(v.variant, "default");
});

test("detectCtaVariants prefers selectors matching primary brand color", () => {
  const css = `
    .btn-primary { background-color: #d97757; color: #fff; padding: 14px 24px; border-radius: 4px; }
    .btn-secondary { background-color: transparent; color: #141413; border: 1px solid #141413; padding: 14px 24px; }
    .btn-ghost { background-color: transparent; color: #141413; padding: 8px 16px; }
  `;
  const ctas = detectCtaVariants(css, null, "#d97757");
  assert.ok(ctas.primary, "primary should be detected");
  assert.ok(ctas.primary.bg && ctas.primary.bg.toLowerCase().includes("#d97757"));
  assert.ok(ctas.secondary);
  assert.ok(ctas.secondary.border && ctas.secondary.border.includes("solid"));
});

test("detectCtaVariants penalises Webflow default .w-button", () => {
  const css = `
    .w-button { background-color: #3898ec; padding: 9px 15px; }
    .my-cta { background-color: #d97757; color: #fff; padding: 14px 24px; border-radius: 8px; }
  `;
  const ctas = detectCtaVariants(css, null, "#d97757");
  // .my-cta should win over .w-button due to color match + selector simplicity reward
  assert.ok(ctas.primary);
  assert.ok(/my-cta/.test(ctas.primary.selector), `expected .my-cta winner, got ${ctas.primary.selector}`);
});

test("generateMetaDefaults composes seed meta from extracts", () => {
  const m = generateMetaDefaults({
    tokens: { colors: { primary: { value: "#d97757" }, surface: { value: "#faf9f5" } } },
    metaAssets: {
      ogTitle: "Home \\\\ BrandName",
      ogDescription: "BrandName is a research company. We build careful systems.",
      ogType: "website",
    },
    heroBlock: { headline: "AI safety", lead: "We focus on calm careful work." },
    styleFingerprint: { classification: { primary_archetype: "warm-editorial", style_tags: ["warm", "editorial"] } },
    voiceHeuristic: { formality: "neutral", suggested_tones: ["calm"] },
    url: "https://brandname.com/",
    slug: "brandname",
  });
  assert.equal(m.name, "BrandName");
  assert.equal(m.glyph, "B");
  assert.equal(m.heroColor, "#d97757");
  assert.equal(m.canvasColor, "#faf9f5");
  assert.match(m.suggestedBlurb, /BrandName is a research company/);
  assert.ok(m.suggestedTags.includes("warm"));
  assert.equal(m.archetype, "warm-editorial");
  assert.equal(m.companySlug, "brandname");
});

test("generateMetaDefaults handles missing fields gracefully", () => {
  const m = generateMetaDefaults({
    tokens: {},
    metaAssets: {},
    heroBlock: {},
    styleFingerprint: {},
    voiceHeuristic: {},
    url: "https://example.com/",
    slug: "example",
  });
  assert.equal(m.companySlug, "example");
  assert.equal(m.name, "Example");
  assert.equal(m.glyph, "E");
  assert.equal(m.heroColor, null);
  assert.equal(m.canvasColor, null);
  assert.equal(m.suggestedBlurb, null);
});

// ── filterShadows / detectShadows noise filtering ─────────────────────
const { filterShadows, detectSpacingScale, splitShadows } = require("./extractors.cjs");

test("splitShadows separates inset from elevation shadows", () => {
  const input = [
    { value: "0 1px 3px rgba(0,0,0,.1)", count: 5 },
    { value: "inset 0 0 0 1px #ddd", count: 3 },
    { value: "0 4px 8px rgba(0,0,0,.15), inset 0 1px #fff1", count: 1 },
  ];
  const out = splitShadows(input);
  assert.equal(out.elevation.length, 2);
  assert.equal(out.inset.length, 1);
  assert.equal(out.mixed.length, 1);
  assert.equal(out.inset[0].value, "inset 0 0 0 1px #ddd");
});

test("splitShadows handles multi-layer all-inset (hairline pattern)", () => {
  const input = [
    { value: "inset 0 -1px #0001, inset 0 1px #fff2", count: 8 },
  ];
  const out = splitShadows(input);
  assert.equal(out.inset.length, 1);
  assert.equal(out.elevation.length, 0);
});

test("splitShadows tolerates string-only entries", () => {
  const out = splitShadows(["inset 0 0 0 1px red", "0 1px 2px black"]);
  assert.equal(out.inset.length, 1);
  assert.equal(out.elevation.length, 1);
});

test("filterShadows drops unset / none / 0 / inherit", () => {
  const out = filterShadows([
    { value: "unset", count: 1 },
    { value: "none", count: 5 },
    { value: "0", count: 1 },
    { value: "inherit", count: 1 },
    { value: "0 1px 2px rgba(0,0,0,.1)", count: 4 },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].value, "0 1px 2px rgba(0,0,0,.1)");
});

test("filterShadows drops all-transparent stops (#0000, rgba(*,0))", () => {
  const out = filterShadows([
    { value: "0 0 0 1px #0000", count: 2 },
    { value: "0 4px 12px rgba(0,0,0,0)", count: 1 },
    { value: "0 4px 12px rgba(0,0,0,0.2)", count: 3 },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].count, 3);
});

test("filterShadows drops single-layer focus rings (0 0 Npx Mpx color)", () => {
  const out = filterShadows([
    { value: "0 0 3px 1px #3898ec", count: 10 },
    { value: "0 1px 3px rgba(0,0,0,.1)", count: 4 },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].value, "0 1px 3px rgba(0,0,0,.1)");
});

test("filterShadows preserves multi-layer shadows with non-zero Y offsets", () => {
  const multilayer = "0 1px 2px #00000005, 0 4px 4px #00000008, 0 16px 24px #0000000a";
  const out = filterShadows([{ value: multilayer, count: 8 }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].value, multilayer);
});

test("filterShadows accepts string-only entries (legacy raw lists)", () => {
  const out = filterShadows(["unset", "0 1px 3px rgba(0,0,0,.12)"]);
  assert.equal(out.length, 1);
  assert.equal(out[0].count, 1);
});

// ── detectSpacingScale ────────────────────────────────────────────────
test("detectSpacingScale returns null when CSS yields fewer than 4 distinct values", () => {
  const css = ".a { padding: 8px; } .b { margin: 8px; }";
  assert.equal(detectSpacingScale(css), null);
});

test("detectSpacingScale assigns top-frequency values to t-shirt buckets ordered by px", () => {
  const css = `
    .a { padding: 4px; padding: 4px; padding: 4px; }
    .b { padding: 8px; padding: 8px; padding: 8px; padding: 8px; }
    .c { margin: 16px; margin: 16px; margin: 16px; margin: 16px; margin: 16px; }
    .d { gap: 24px; gap: 24px; gap: 24px; }
    .e { padding-left: 32px; padding-left: 32px; }
  `;
  const out = detectSpacingScale(css);
  assert.ok(out, "expected scale output");
  assert.equal(out.scale.xs, "4px");
  assert.equal(out.scale.sm, "8px");
  assert.equal(out.scale.md, "16px");
  assert.equal(out.scale.lg, "24px");
  assert.equal(out.scale.xl, "32px");
});

test("detectSpacingScale tokenizes shorthand padding/margin values", () => {
  const css = `
    .a { padding: 4px 8px 12px 16px; }
    .a { padding: 4px 8px 12px 16px; }
    .b { margin: 24px 32px; }
    .b { margin: 24px 32px; }
  `;
  const out = detectSpacingScale(css);
  assert.ok(out);
  // Six distinct px values: 4, 8, 12, 16, 24, 32
  assert.equal(Object.keys(out.scale).length, 6);
});

test("detectSpacingScale ignores 0, negative, var(), calc()", () => {
  const css = `
    .a { padding: 0 var(--x) calc(100% - 8px) -4px; }
    .b { padding: 4px; padding: 4px; }
    .c { padding: 8px; padding: 8px; padding: 8px; }
    .d { padding: 16px; padding: 16px; padding: 16px; padding: 16px; }
    .e { padding: 24px; padding: 24px; padding: 24px; padding: 24px; padding: 24px; }
  `;
  const out = detectSpacingScale(css);
  assert.ok(out);
  // Should pick only literal 4/8/16/24 — not 0, not -4 from negative
  const values = Object.values(out.scale);
  assert.ok(!values.includes("0"));
  assert.ok(!values.includes("-4px"));
  assert.ok(values.includes("4px"));
});

// ── enrich.cjs: assignMotionRoles + extractDarkSlots + resolveVarChain ─
const {
  assignMotionRoles,
  extractDarkSlots,
  computePrimarySwap,
  resolveToHex,
  computeElevationLadder,
} = require("./enrich.cjs");

test("assignMotionRoles maps raw durations to Fluentui scale via proximity", () => {
  // 100ms → faster (target 100), 250ms → normal (target 250), 500ms → slower (target 500)
  const motion = {
    durations: [
      { value: "100ms", count: 5 },
      { value: "250ms", count: 8 },
      { value: "500ms", count: 3 },
    ],
    easings: [
      { value: "cubic-bezier(0.4,0,0.2,1)", count: 10 },
    ],
  };
  const roles = assignMotionRoles(motion);
  assert.ok(roles, "assignMotionRoles should return an object");
  // At least one of the duration roles should be populated
  const durationKeys = ["duration-ultra-fast", "duration-faster", "duration-fast", "duration-normal", "duration-gentle", "duration-slow", "duration-slower", "duration-ultra-slow"];
  const populated = durationKeys.filter((k) => roles[k]);
  assert.ok(populated.length >= 2, `expected ≥2 duration roles populated, got ${populated.length}`);
});

test("assignMotionRoles handles empty motion gracefully", () => {
  assert.equal(assignMotionRoles(null), null);
  assert.equal(assignMotionRoles({}), null);
  assert.equal(assignMotionRoles({ durations: [] }), null);
});

test("extractDarkSlots returns null when has_dark_mode is false", () => {
  assert.equal(extractDarkSlots({ has_dark_mode: false }, []), null);
  assert.equal(extractDarkSlots(null, []), null);
});

test("extractDarkSlots maps .dark-scoped vars to shadcn slots", () => {
  const darkMode = { has_dark_mode: true };
  const cssVars = [
    { name: "--background", value: "#0a0a0a", selector: ".dark" },
    { name: "--foreground", value: "#fafafa", selector: ".dark" },
    { name: "--text", value: "#eee", selector: ":where(.dark)" },     // legacy synonym
    { name: "--background", value: "#fff", selector: ":root" },        // not dark scope
  ];
  const slots = extractDarkSlots(darkMode, cssVars);
  assert.ok(slots);
  assert.equal(slots.background, "#0a0a0a");
  assert.equal(slots.foreground, "#fafafa");
});

test("computePrimarySwap refuses library-default and webflow selectors", () => {
  const cta = { primary: { selector: ".button", bg: "#146ef5" } };
  const result = computePrimarySwap(cta, { colors: { primary: "#000" } }, []);
  assert.equal(result.applied, false);
  assert.equal(result.reason, "library_default_selector");

  const cta2 = { primary: { selector: ".w-button", bg: "#146ef5" } };
  const result2 = computePrimarySwap(cta2, { colors: { primary: "#000" } }, []);
  assert.equal(result2.applied, false);
  assert.equal(result2.reason, "webflow_default_selector");
});

test("computePrimarySwap refuses third-party domain selectors", () => {
  const cta = { primary: { selector: ".tweet-button", bg: "#1d9bf0" } };
  const result = computePrimarySwap(cta, { colors: { primary: "#000" } }, []);
  assert.equal(result.applied, false);
  assert.equal(result.reason, "third_party_selector");
});

test("computePrimarySwap refuses extreme luminance (white/black surfaces)", () => {
  const cta = { primary: { selector: ".btn-brand", bg: "#ffffff" } };
  const result = computePrimarySwap(cta, { colors: { primary: "#5e6ad2" } }, []);
  assert.equal(result.applied, false);
  assert.equal(result.reason, "extreme_luminance");
});

test("computePrimarySwap applies when CTA bg is brand-authored hex", () => {
  const cta = { primary: { selector: ".btn-cta-primary", bg: "#533afd" } };
  const result = computePrimarySwap(cta, { colors: { primary: "#999999" } }, []);
  assert.equal(result.applied, true);
  assert.equal(result.resolved, "#533afd");
});

test("computePrimarySwap is no-op when CTA bg matches existing tokens.colors.primary", () => {
  const cta = { primary: { selector: ".btn-cta-primary", bg: "#533afd" } };
  const result = computePrimarySwap(cta, { colors: { primary: "#533afd" } }, []);
  assert.equal(result.applied, false);
  assert.equal(result.reason, "already_matches");
});

test("resolveToHex passes through bare hex and rgb/hsl()", () => {
  assert.equal(resolveToHex("#141413", []), "#141413");
  assert.equal(resolveToHex("rgb(0, 0, 0)", []), "rgb(0, 0, 0)");
  assert.equal(resolveToHex("hsla(220, 100%, 50%, 1)", []), "hsla(220, 100%, 50%, 1)");
});

test("resolveToHex resolves var() chains via cssVars", () => {
  const cssVars = [
    { name: "--brand-primary", value: "#533afd", selector: ":root" },
  ];
  assert.equal(resolveToHex("var(--brand-primary)", cssVars), "#533afd");
});

test("resolveToHex returns null when var chain doesn't end in literal", () => {
  // Var without declaration in cssVars
  assert.equal(resolveToHex("var(--undefined-var)", []), null);
});

// ── computeElevationLadder ────────────────────────────────────────────
test("computeElevationLadder buckets by max blur radius", () => {
  const shadows = [
    { value: "0 1px 2px rgba(0,0,0,.05)", count: 10 }, // blur 2 → flat
    { value: "0 4px 8px rgba(0,0,0,.1)", count: 5 },   // blur 8 → raised
    { value: "0 8px 16px rgba(0,0,0,.15)", count: 3 }, // blur 16 → floating
    { value: "0 16px 48px rgba(0,0,0,.2)", count: 2 },  // blur 48 → overlay
    { value: "0 64px 96px rgba(0,0,0,.25)", count: 1 }, // blur 96 → modal
  ];
  const ladder = computeElevationLadder(shadows);
  assert.ok(ladder);
  assert.ok(ladder.flat);
  assert.ok(ladder.raised);
  assert.ok(ladder.floating);
  assert.ok(ladder.overlay);
  assert.ok(ladder.modal);
});

test("computeElevationLadder returns null for empty input", () => {
  assert.equal(computeElevationLadder([]), null);
  assert.equal(computeElevationLadder(null), null);
});

// Regression — applyEnrichmentToTokens crashed when tokens.colors.dark was a
// string (Layer 5 brand swatch) instead of a slot map. Behaviour: preserve
// the string under `_dark_swatch` and surface dark slots in the canonical key.
test("applyEnrichmentToTokens handles tokens.colors.dark as Layer 5 string swatch", () => {
  const { applyEnrichmentToTokens } = require("./enrich.cjs");
  const tokens = { colors: { primary: "#5e6ad2", dark: "#050505" } };
  const darkSlots = { background: "#0a0a0a", foreground: "#fafafa" };
  applyEnrichmentToTokens(tokens, null, null, darkSlots, null, null, null, null);
  // String swatch preserved under _dark_swatch
  assert.equal(tokens.colors._dark_swatch, "#050505");
  // Slot map populated under canonical key
  assert.equal(typeof tokens.colors.dark, "object");
  assert.equal(tokens.colors.dark.background, "#0a0a0a");
  assert.equal(tokens.colors.dark.foreground, "#fafafa");
});

test("computeElevationLadder picks highest-count shadow per tier", () => {
  const shadows = [
    { value: "0 4px 4px rgba(0,0,0,.05)", count: 2 },   // raised, count 2
    { value: "0 6px 6px rgba(0,0,0,.10)", count: 10 },  // raised, count 10 (winner)
  ];
  const ladder = computeElevationLadder(shadows);
  assert.equal(ladder.raised, "0 6px 6px rgba(0,0,0,.10)");
});

// ── Webflow private vars (--_*) capture + chain resolution ────────────
test("detectCssVars captures Webflow private vars (--_button-style*)", () => {
  const css = `
    :root {
      --swatch--slate-dark: #141413;
      --_color-theme---button-primary--background: var(--swatch--slate-dark);
      --_button-style---background: var(--_color-theme---button-primary--background);
    }
  `;
  const vars = detectCssVars(css);
  const names = vars.map((v) => v.name);
  assert.ok(names.includes("--_button-style---background"));
  assert.ok(names.includes("--_color-theme---button-primary--background"));
  assert.ok(names.includes("--swatch--slate-dark"));
});

const { resolveVarChain } = require("./enrich.cjs");

test("resolveVarChain handles Webflow private vars with multi-hop chain", () => {
  const cssVars = [
    { name: "--swatch--slate-dark", value: "#141413", selector: ":root" },
    { name: "--_color-theme---button-primary--background", value: "var(--swatch--slate-dark)", selector: ":root" },
    { name: "--_button-style---background", value: "var(--_color-theme---button-primary--background)", selector: ":root" },
  ];
  const result = resolveVarChain("var(--_button-style---background)", cssVars, "light");
  assert.equal(result, "#141413");
});

test("resolveVarChain handles digit-prefixed vars (Webflow column-width)", () => {
  const cssVars = [
    { name: "--column-width--4", value: "0px", selector: ":root" },
  ];
  const result = resolveVarChain("var(--column-width--4)", cssVars, "light");
  assert.equal(result, "0px");
});
