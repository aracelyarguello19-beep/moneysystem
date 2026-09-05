"use strict";

// Bot-detection diagnostic + SPA-shell payload extractor.
//
// When the content-validation gate would otherwise abort (thin html/css/colors),
// we want to (1) explain WHY content was thin in machine-readable form, and
// (2) try to recover real signal from inline JSON payloads typical of SPA
// shells (Next.js __NEXT_DATA__, Nuxt __NUXT__, Apollo state, JSON-LD, generic
// <script type="application/json">).
//
// The diagnostic file is always written to inputs/bot-detection-diagnostic.json
// when the gate fires, even if --no-content-gate lets the run continue. That
// gives operators (and downstream tools) ground truth about why a site was
// thin without forcing a 2nd run.

// ── Bot detection classification ─────────────────────────────────────
function classifyResponse({ html, headers, status }) {
  const h = (headers && typeof headers === "object") ? headers : {};
  const lower = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
  const server = String(lower.server || "").toLowerCase();
  const cfRay = lower["cf-ray"];
  const xAmznWaf = lower["x-amz-waf-action"] || lower["x-amzn-waf-action"];
  const titleMatch = typeof html === "string" ? html.match(/<title[^>]*>([^<]*)<\/title>/i) : null;
  const title = titleMatch ? titleMatch[1].trim() : "";
  const lowHtml = typeof html === "string" ? html.toLowerCase() : "";

  // AWS WAF — challenge JS, awsWafCookie, status 202 with bm-verify or wafv2 markers
  if (lowHtml.includes("awswafcookie") || lowHtml.includes("/aws-waf-token") || xAmznWaf || lowHtml.includes("captcha-delivery") || lowHtml.includes("bm-verify")) {
    return {
      verdict: "aws-waf-challenge",
      signals: { server, status, title: title || null, has_aws_waf_marker: true },
      recommendation: "AWS WAF (Amazon/Akamai-front) detected browser-impersonation incoherence. Re-run later from a different IP/User-Agent or accept this URL is unscrapable without a full browser session.",
    };
  }

  // Akamai Bot Manager — narrow markers only (AkamaiGHost server, _abck cookie
  // probe, "Access Denied" title). DO NOT match generic "akamai" substring —
  // legitimate sites embed Akamai CDN URLs in markup, which would false-positive.
  if (server.includes("akamaighost") || /access denied|attention required/i.test(title) || lowHtml.includes('"_abck"') || lowHtml.includes("akamaibotmanager")) {
    return {
      verdict: "akamai-bot-manager",
      signals: { server, status, title: title || null },
      recommendation: "Akamai Bot Manager requires full browser-coherence (Sec-Ch-Ua, Sec-Fetch, JA3 fingerprint). Honest UA is rejected. Browser-coherent fallback chain should kick in; if the next attempt fails too, only a real headless browser will pass.",
    };
  }

  // Cloudflare — cf-ray, cf-mitigated, "Just a moment...", "Checking your browser"
  if (cfRay || lower["cf-mitigated"] || /just a moment|checking your browser|cloudflare/i.test(title) || lowHtml.includes("__cf_bm")) {
    return {
      verdict: "cloudflare-challenge",
      signals: { server, status, title: title || null, cf_ray: cfRay || null },
      recommendation: "Cloudflare bot-fight is active. Site requires JS challenge solving. The static-CSS pipeline cannot resolve this without a headless browser.",
    };
  }

  // Paywall — common keywords in title/meta/HTML when the body is thin
  if (/subscribe|paywall|sign in to read|create an account/i.test(title) || /paywall|subscribe-now|premium-content/i.test(lowHtml)) {
    return {
      verdict: "paywall",
      signals: { server, status, title: title || null },
      recommendation: "Site appears to gate content behind a paywall. Try a public landing page (e.g. brand homepage instead of an article URL) or extract the brand DESIGN.md from a different surface.",
    };
  }

  // SPA shell — short HTML but with <script type="application/json"> or hydration markers
  if (typeof html === "string" && hasSpaShellMarker(html)) {
    return {
      verdict: "spa-shell",
      signals: { server, status, title: title || null, html_bytes: html.length },
      recommendation: "Site ships a thin HTML shell that hydrates via JS. Phase 2.6 (SPA-payload extractor) will try to mine __NEXT_DATA__ / __NUXT__ / JSON-LD inline payloads. If it finds nothing, only a headless-browser pass would help.",
    };
  }

  // Generic — short response without obvious markers
  return {
    verdict: "unknown-thin",
    signals: { server: server || null, status, title: title || null, html_bytes: typeof html === "string" ? html.length : 0 },
    recommendation: "Server returned thin content without identifiable bot-detection markers. This URL may be down, redirecting, or geo-restricted. Try a different country IP or check the URL in a browser.",
  };
}

function hasSpaShellMarker(html) {
  if (typeof html !== "string") return false;
  return (
    /__NEXT_DATA__/.test(html) ||
    /<script[^>]*id=["']__NUXT_DATA__["']/i.test(html) ||
    /window\.__NUXT__/.test(html) ||
    /<script[^>]*application\/(?:ld\+json|json)/i.test(html) ||
    /__APOLLO_STATE__|__INITIAL_STATE__|__PRELOADED_STATE__/.test(html) ||
    /<div[^>]*id=["']__next["']/i.test(html) ||
    /<div[^>]*id=["']root["']/i.test(html)
  );
}

// ── SPA payload extraction (B3) ──────────────────────────────────────
// Pull design-relevant signals from common SPA hydration payloads. We look
// for hex/rgb color literals, font-family strings, and CSS-var-shaped names
// inside the JSON. Anything we find is treated as additive evidence —
// concatenated as a synthetic CSS block so downstream detection can run
// unchanged against it.
function extractSpaPayloads(html) {
  if (typeof html !== "string") return { found: false, sources: [], synthCss: "", colorsRecovered: 0, fontFamiliesRecovered: 0 };

  const sources = [];
  const colors = new Set();
  const fontFamilies = new Set();
  const cssVarPairs = new Map();

  const harvest = (text, source) => {
    if (typeof text !== "string" || !text.length) return;
    sources.push({ source, bytes: text.length });
    // Hex colors
    const hexMatches = text.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || [];
    for (const c of hexMatches) colors.add(c);
    // rgb/rgba
    const rgbMatches = text.match(/rgba?\([^)]+\)/g) || [];
    for (const c of rgbMatches) colors.add(c);
    // hsl/hsla
    const hslMatches = text.match(/hsla?\([^)]+\)/g) || [];
    for (const c of hslMatches) colors.add(c);
    // font-family declarations inside JSON strings
    const ffMatches = text.match(/"font[-_]?family"\s*:\s*"([^"]+)"/gi) || [];
    for (const m of ffMatches) {
      const inner = m.match(/"([^"]+)"\s*$/);
      if (inner) fontFamilies.add(inner[1]);
    }
    // CSS custom properties referenced inline (e.g. "--brand-primary": "#0066ff")
    const varPairMatches = text.match(/"(--[a-z][a-z0-9_-]+)"\s*:\s*"([^"]+)"/gi) || [];
    for (const m of varPairMatches) {
      const pair = m.match(/"(--[^"]+)"\s*:\s*"([^"]+)"/i);
      if (pair) cssVarPairs.set(pair[1], pair[2]);
    }
  };

  // 1. <script id="__NEXT_DATA__" type="application/json">…</script>
  const nextData = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextData) harvest(nextData[1], "__NEXT_DATA__");

  // 2. <script>window.__NUXT__=…</script>
  const nuxt = html.match(/window\.__NUXT__\s*=\s*([\s\S]*?)<\/script>/i);
  if (nuxt) harvest(nuxt[1], "__NUXT__");

  // 3. <script type="application/ld+json">…</script>
  const ldRe = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch;
  while ((ldMatch = ldRe.exec(html))) harvest(ldMatch[1], "json-ld");

  // 4. <script type="application/json" …>…</script>
  const jsonRe = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonMatch;
  while ((jsonMatch = jsonRe.exec(html))) harvest(jsonMatch[1], "application/json");

  // 5. Apollo / Redux preloaded state
  const apollo = html.match(/window\.__APOLLO_STATE__\s*=\s*([\s\S]*?)<\/script>/i);
  if (apollo) harvest(apollo[1], "__APOLLO_STATE__");
  const initial = html.match(/window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script>/i);
  if (initial) harvest(initial[1], "__INITIAL_STATE__");
  const preloaded = html.match(/window\.__PRELOADED_STATE__\s*=\s*([\s\S]*?)<\/script>/i);
  if (preloaded) harvest(preloaded[1], "__PRELOADED_STATE__");

  // 6. Inline <style> tags inside SPA shells
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch;
  while ((styleMatch = styleRe.exec(html))) harvest(styleMatch[1], "inline-style");

  const found = colors.size > 0 || fontFamilies.size > 0 || cssVarPairs.size > 0;

  // Synthesize a CSS block carrying the recovered signal so the detection
  // pipeline can consume it without changes.
  const lines = [];
  if (cssVarPairs.size) {
    lines.push(":root {");
    for (const [name, value] of cssVarPairs) lines.push(`  ${name}: ${value};`);
    lines.push("}");
  }
  if (colors.size) {
    lines.push("/* SPA-recovered colors */");
    let i = 0;
    for (const c of colors) lines.push(`.spa-color-${i++} { color: ${c}; }`);
  }
  if (fontFamilies.size) {
    lines.push("/* SPA-recovered font families */");
    let i = 0;
    for (const ff of fontFamilies) lines.push(`.spa-font-${i++} { font-family: ${JSON.stringify(ff)}; }`);
  }
  const synthCss = lines.join("\n");

  return {
    found,
    sources,
    synthCss,
    colorsRecovered: colors.size,
    fontFamiliesRecovered: fontFamilies.size,
    cssVarsRecovered: cssVarPairs.size,
  };
}

module.exports = { classifyResponse, hasSpaShellMarker, extractSpaPayloads };
