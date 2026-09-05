"use strict";

const axios = require("axios");
const cheerio = require("cheerio");
const { URL: NodeURL } = require("url");

// Whitelist of diagnostic headers to preserve (AC6.2)
// Excludes cookie, set-cookie, authorization and other sensitive headers
const HEADER_WHITELIST = [
  "server", "x-powered-by", "x-vercel-id", "cf-ray", "x-fastly-request-id",
  "x-amz-cf-id", "x-cdn", "via", "x-shopify-stage", "x-shopid",
  "x-github-request-id", "x-cache", "x-nf-request-id",
];

// Honest UA — declares itself as a non-browser extractor instead of impersonating
// Chrome. Bot detectors split into two opposing schools:
//   - AWS WAF (amazon.com): cross-checks UA against TLS fingerprint + header
//     coherence. A fake-Chrome UA from Node trips the challenge; honest passes.
//   - Akamai Bot Manager (itau.com.br, santander.com.br): demands full
//     browser-coherence (UA + Sec-Ch-Ua + Sec-Fetch + Accept-Encoding br) and
//     blocks anything that doesn't look like a real browser; honest is 403'd.
// Strategy: try honest first (faster, ethical, wins on AWS-WAF + neutral sites),
// fall back to browser-full only when the response signals a bot block.
//
// Validated 2026-05-03 across 9 sites — fallback chain covers 8/9 (anthropic,
// stripe, cloudflare, github = honest parity; netflix +5×; amazon: 2KB →
// 947KB; itau, santander: 403 → 142KB/199KB via browser fallback). Bradesco
// remains an SPA-shell case handled separately by Phase 2.6 SPA-payload
// extractor (B3) — when even that fails, only a real headless browser would
// help, which is out of scope per skill anti-pattern.
const EXTRACTOR_UA = "Sinkra-DesignOps-Extractor/1.0 (+mailto:devops@sinkra.ai)";
const HONEST_HEADERS = {
  "User-Agent": EXTRACTOR_UA,
  Accept: "text/html,application/xhtml+xml",
};
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Sec-Ch-Ua":
    '"Chromium";v="126", "Google Chrome";v="126", "Not.A/Brand";v="8"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"macOS"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

// Block detection — heuristics for "this response is a bot challenge / refusal,
// not real content". Tuned to the patterns observed across AWS WAF (amazon),
// Akamai Bot Manager (itau, santander), and generic CDN refusals.
function isBlockedResponse(status, html) {
  if (status >= 400) return true;
  if (status === 202 && /awsWafCookie|awswaf|captcha-delivery|challenge/i.test(html)) return true;
  if (typeof html !== "string" || html.length < 5000) {
    const titleMatch = html && html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : "";
    if (/access denied|robot check|forbidden|attention required|just a moment|captcha|are you a human/i.test(title)) {
      return true;
    }
    if (status === 202) return true;
  }
  return false;
}

async function tryFetch(url, headers) {
  return axios.get(url, {
    timeout: 30000,
    headers,
    maxRedirects: 5,
    decompress: true,
    validateStatus: () => true,
  });
}

// ── HTML fetch ──────────────────────────────────────────────────────
// Returns { html, headers } where headers contains only whitelisted diagnostic keys (lowercased).
// Internally runs a 2-stage strategy: honest UA first, then browser-coherent
// headers if the first stage looks blocked. The strategy used is recorded in
// responseHeaders["x-sinkra-fetch-strategy"] for telemetry.
async function fetchHtml(url) {
  let strategy = "honest";
  let res = await tryFetch(url, HONEST_HEADERS);
  let html = typeof res.data === "string" ? res.data : "";

  if (isBlockedResponse(res.status, html)) {
    const browserRes = await tryFetch(url, BROWSER_HEADERS);
    const browserHtml = typeof browserRes.data === "string" ? browserRes.data : "";
    // Adopt browser response only if it's a real improvement over the honest one.
    if (!isBlockedResponse(browserRes.status, browserHtml) || browserHtml.length > html.length * 2) {
      res = browserRes;
      html = browserHtml;
      strategy = "browser";
    }
  }

  if (res.status >= 400) {
    const err = new Error(`Request failed with status code ${res.status}`);
    err.status = res.status;
    err.code = "HTTP_ERROR";
    throw err;
  }

  const rawHeaders = res.headers || {};
  const responseHeaders = {};
  for (const key of HEADER_WHITELIST) {
    const val = rawHeaders[key];
    if (val !== undefined && val !== null) {
      responseHeaders[key] = String(val);
    }
  }
  responseHeaders["x-sinkra-fetch-strategy"] = strategy;
  responseHeaders["x-sinkra-status"] = String(res.status);

  return { html, headers: responseHeaders, status: res.status, strategy };
}

// Asset fetcher with honest→browser fallback. Same strategy as fetchHtml but
// for CSS/font/binary URLs. Returns the response object or throws.
async function tryFetchAsset(url, { responseType = "text", timeout = 15000, preferredStrategy = "auto" } = {}) {
  if (preferredStrategy === "browser") {
    const browserRes = await axios.get(url, {
      timeout,
      responseType,
      headers: BROWSER_HEADERS,
      decompress: true,
      validateStatus: () => true,
    });
    if (browserRes.status < 400) return browserRes;
    const err = new Error(`Request failed with status code ${browserRes.status}`);
    err.status = browserRes.status;
    err.code = "HTTP_ERROR";
    throw err;
  }

  const honestRes = await axios.get(url, {
    timeout,
    responseType,
    headers: { "User-Agent": EXTRACTOR_UA },
    decompress: true,
    validateStatus: () => true,
  });
  if (honestRes.status < 400) return honestRes;
  const browserRes = await axios.get(url, {
    timeout,
    responseType,
    headers: BROWSER_HEADERS,
    decompress: true,
    validateStatus: () => true,
  });
  if (browserRes.status < 400) return browserRes;
  const err = new Error(`Request failed with status code ${browserRes.status}`);
  err.status = browserRes.status;
  err.code = "HTTP_ERROR";
  throw err;
}

// ── CSS fetching with @import recursion ─────────────────────────────
async function fetchCssOnce(absolute, fetched, options = {}) {
  if (fetched.has(absolute)) return null;
  fetched.add(absolute);
  try {
    const res = await tryFetchAsset(absolute, { responseType: "text", preferredStrategy: options.preferredFetchStrategy || "auto" });
    return typeof res.data === "string" ? res.data : "";
  } catch (err) {
    return `/* FAILED ${absolute}: ${err.message} */`;
  }
}

async function resolveImports(cssText, baseUrl, fetched, depth = 0, options = {}) {
  if (depth >= 2) return cssText;
  const re = /@import\s+(?:url\(\s*)?["']?([^"')\s]+)["']?\s*\)?\s*([^;]*);/gi;
  const matches = [...cssText.matchAll(re)];
  if (!matches.length) return cssText;

  let resolved = cssText;
  for (const m of matches) {
    const importUrl = m[1];
    try {
      const absolute = new NodeURL(importUrl, baseUrl).toString();
      const importedCss = await fetchCssOnce(absolute, fetched, options);
      if (importedCss == null) continue;
      const recursive = await resolveImports(importedCss, absolute, fetched, depth + 1, options);
      resolved = resolved.replace(
        m[0],
        `/* ── @import → ${absolute} ── */\n${recursive}\n/* ── /@import ── */`
      );
    } catch {
      // ignore unresolvable
    }
  }
  return resolved;
}

async function collectCss(html, baseUrl, options = {}) {
  const $ = cheerio.load(html);
  const cssChunks = [];
  const meta = {
    external: [],
    preload: [],
    inline_style_blocks: 0,
    inline_style_attrs: 0,
    imports_resolved: 0,
    failed: [],
    fetch_strategy: options.preferredFetchStrategy || "auto",
  };
  const fetched = new Set();

  const stylesheetHrefs = [];
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) stylesheetHrefs.push(href);
  });

  const preloadHrefs = [];
  $('link[rel="preload"][as="style"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) preloadHrefs.push(href);
  });

  $('link[href$=".css"], link[href*=".css?"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href && !stylesheetHrefs.includes(href) && !preloadHrefs.includes(href)) {
      stylesheetHrefs.push(href);
    }
  });

  // B4: fetch external CSS in parallel batches of 6. Sites with 30+ stylesheets
  // × 2 attempts (honest + browser fallback) used to serialize 60+ requests.
  // Note: @import resolution is still sequential per file (correct ordering).
  const allHrefs = [...stylesheetHrefs, ...preloadHrefs];
  const CONCURRENCY = 6;
  const fetchOne = async (href) => {
    try {
      const absolute = new NodeURL(href, baseUrl).toString();
      let cssText = await fetchCssOnce(absolute, fetched, options);
      if (cssText == null) return null;
      const before = fetched.size;
      cssText = await resolveImports(cssText, absolute, fetched, 0, options);
      const importsResolved = fetched.size - before;
      return { ok: true, href, absolute, cssText, importsResolved, isPreload: preloadHrefs.includes(href) };
    } catch (err) {
      return { ok: false, href, error: err.message };
    }
  };
  for (let i = 0; i < allHrefs.length; i += CONCURRENCY) {
    const batch = allHrefs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(fetchOne));
    for (const r of results) {
      if (!r) continue;
      if (r.ok) {
        meta.imports_resolved += r.importsResolved;
        cssChunks.push(`/* ── ${r.absolute} ── */\n${r.cssText}\n`);
        if (r.isPreload) meta.preload.push(r.absolute);
        else meta.external.push(r.absolute);
      } else {
        meta.failed.push({ href: r.href, error: r.error });
        cssChunks.push(`/* ── FAILED ${r.href}: ${r.error} ── */\n`);
      }
    }
  }

  for (const el of $("style").toArray()) {
    let css = $(el).html();
    if (!css || !css.trim()) continue;
    css = await resolveImports(css, baseUrl, fetched, 0, options);
    cssChunks.push(`/* ── inline <style> #${++meta.inline_style_blocks} ── */\n${css}\n`);
  }

  $("[style]").each((_, el) => {
    const s = $(el).attr("style");
    if (s) {
      cssChunks.push(`/* ── inline style="" attr ── */\n.__inline${++meta.inline_style_attrs} { ${s} }\n`);
    }
  });

  return { css: cssChunks.join("\n"), meta };
}

// ── Favicon (best-effort, multi-path fallback) ──────────────────────
async function fetchFavicon(html, baseUrl) {
  const $ = cheerio.load(html);
  const candidates = [];
  const seen = new Set();
  const pushIfNew = (href) => {
    if (!href || seen.has(href)) return;
    seen.add(href);
    candidates.push(href);
  };
  $('link[rel="apple-touch-icon"]').each((_, el) => pushIfNew($(el).attr("href")));
  $('link[rel="apple-touch-icon-precomposed"]').each((_, el) => pushIfNew($(el).attr("href")));
  $('link[rel="icon"]').each((_, el) => pushIfNew($(el).attr("href")));
  $('link[rel="shortcut icon"]').each((_, el) => pushIfNew($(el).attr("href")));
  $('meta[property="og:image"]').each((_, el) => pushIfNew($(el).attr("content")));
  pushIfNew("/favicon.svg");
  pushIfNew("/favicon.ico");
  pushIfNew("/apple-touch-icon.png");

  for (const href of candidates) {
    try {
      const absolute = new NodeURL(href, baseUrl).toString();
      const res = await tryFetchAsset(absolute, { responseType: "arraybuffer", timeout: 8000 });
      if (!res.data || res.data.length === 0) continue;
      const ct = res.headers["content-type"] || "";
      if (/^text\/html/i.test(ct)) continue;
      const mime =
        /svg/i.test(ct) ? "image/svg+xml" :
        /png/i.test(ct) ? "image/png" :
        /jpe?g/i.test(ct) ? "image/jpeg" :
        /ico|x-icon/i.test(ct) ? "image/x-icon" :
        /webp/i.test(ct) ? "image/webp" :
        href.endsWith(".svg") ? "image/svg+xml" :
        href.endsWith(".png") ? "image/png" :
        href.endsWith(".ico") ? "image/x-icon" : "image/png";
      const b64 = Buffer.from(res.data).toString("base64");
      return { dataUrl: `data:${mime};base64,${b64}`, sourceUrl: absolute, size: res.data.length, mime };
    } catch {
      // try next candidate
    }
  }
  return null;
}

// ── Logo (priority hierarchy + sprite/icon rejection) ───────────────
async function fetchLogo(html, baseUrl) {
  const $ = cheerio.load(html);
  const candidates = [];
  const pushIfNew = (src, scope, priority) => {
    if (!src) return;
    if (candidates.some(c => c.src === src)) return;
    candidates.push({ src, scope, priority });
  };

  const isLikelyLogo = (svgOuter) => {
    if (!svgOuter) return false;
    if (/<use\s/i.test(svgOuter) && (svgOuter.match(/<path/g) || []).length === 0) return false;
    const pathCount = (svgOuter.match(/<path/g) || []).length;
    const hasText = /<text|<tspan/i.test(svgOuter);
    return pathCount >= 2 || hasText;
  };

  // P1: <svg>/<img> inside link with logo signals
  $('a').each((_, anchor) => {
    const $anchor = $(anchor);
    const cls = ($anchor.attr("class") || "").toLowerCase();
    const aria = ($anchor.attr("aria-label") || "").toLowerCase();
    const id = ($anchor.attr("id") || "").toLowerCase();
    const href = $anchor.attr("href") || "";
    const isHomeLink = href === "/" || href === "./" || href === "#" || href === "" ||
      /home|brand|logo/i.test(cls) || /home|brand|logo/i.test(aria) || /home|brand|logo/i.test(id);
    if (!isHomeLink) return;
    $anchor.find("img").each((_, el) => {
      pushIfNew($(el).attr("src") || $(el).attr("data-src"), `<a class="${cls.slice(0,40)}"> > <img>`, 1);
    });
    $anchor.find("svg").each((_, el) => {
      const outer = $.html(el);
      if (outer && outer.length >= 150 && outer.length < 50000 && isLikelyLogo(outer)) {
        candidates.push({ inlineSvg: outer, scope: `<a> > <svg>`, priority: 1 });
      }
    });
  });

  // P2: <img class*="logo">
  $('img[class*="logo" i], img[id*="logo" i]').each((_, el) => {
    const $el = $(el);
    const src = $el.attr("src") || $el.attr("data-src");
    if (!src) return;
    if (/hero|banner|cover|wallpaper|product|gallery|story|illustration/i.test(src)) return;
    pushIfNew(src, `<img class="${($el.attr("class") || "").slice(0, 40)}">`, 2);
  });

  // P3: <img alt="logo">
  $('img[alt*="logo" i]').each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src");
    if (!src) return;
    if (/hero|banner|cover|wallpaper|product|gallery|story|illustration/i.test(src)) return;
    pushIfNew(src, `<img alt="logo">`, 3);
  });

  // P4: header/nav scoped svgs
  $('header [class*="logo" i] svg, header [id*="logo" i] svg, nav [class*="logo" i] svg, nav [id*="logo" i] svg, [class*="brand-logo" i] svg, [class*="brandmark" i] svg, [class*="globalnav" i] svg').slice(0, 5).each((_, el) => {
    const outer = $.html(el);
    if (outer && outer.length >= 150 && outer.length < 50000 && isLikelyLogo(outer)) {
      candidates.push({ inlineSvg: outer, scope: `inline svg in branded scope`, priority: 4 });
    }
  });

  // P5: header/nav direct child svg
  $('header > svg, header > a > svg, header > div > svg, header > div > a > svg, nav > svg, nav > a > svg').slice(0, 3).each((_, el) => {
    const outer = $.html(el);
    if (outer && outer.length >= 150 && outer.length < 50000 && isLikelyLogo(outer)) {
      candidates.push({ inlineSvg: outer, scope: `header/nav direct child svg`, priority: 5 });
    }
  });

  // P6: <noscript> fallback (Next.js SPA static HTML escape hatch)
  $('noscript').each((_, el) => {
    const noscriptHtml = $(el).html() || "";
    if (!noscriptHtml) return;
    const $$ = cheerio.load(noscriptHtml);
    $$('a img').each((_, img) => {
      const src = $$(img).attr("src");
      const cls = ($$(img).attr("class") || "").toLowerCase();
      const alt = ($$(img).attr("alt") || "").toLowerCase();
      if (src && (/logo|brand/i.test(cls) || /logo|brand/i.test(alt))) {
        pushIfNew(src, "<noscript> > <img>", 6);
      }
    });
  });

  // P7: og:logo / og:image:logo / og:image
  $('meta[property="og:logo"], meta[property="og:image:logo"]').each((_, el) => {
    pushIfNew($(el).attr("content"), $(el).attr("property"), 7);
  });
  $('meta[property="og:image"]').each((_, el) => {
    pushIfNew($(el).attr("content"), "og:image", 8);
  });

  // P9: PWA manifest icons
  const manifestHrefs = [];
  $('link[rel="manifest"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) manifestHrefs.push(href);
  });
  for (const mhref of manifestHrefs) {
    try {
      const absoluteManifest = new NodeURL(mhref, baseUrl).toString();
      const res = await axios.get(absoluteManifest, { timeout: 6000, responseType: "json" });
      const manifest = typeof res.data === "object" ? res.data : null;
      if (manifest && Array.isArray(manifest.icons)) {
        const sortedIcons = [...manifest.icons].sort((a, b) => {
          const parseSize = (s) => parseInt(String(s || "0").split("x")[0], 10) || 0;
          return parseSize(b.sizes) - parseSize(a.sizes);
        });
        for (const icon of sortedIcons) {
          if (!icon.src) continue;
          try {
            const iconAbsolute = new NodeURL(icon.src, absoluteManifest).toString();
            pushIfNew(iconAbsolute, `manifest icon ${icon.sizes || ""}`, 9);
          } catch {}
        }
      }
    } catch {}
  }

  candidates.sort((a, b) => a.priority - b.priority);

  for (const c of candidates) {
    if (c.inlineSvg) {
      const svgClean = c.inlineSvg.replace(/^(<svg[^>]*)\s(width|height)\s*=\s*["'][^"']*["']/g, "$1");
      const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgClean)}`;
      return { dataUrl, sourceUrl: null, size: svgClean.length, mime: "image/svg+xml", source: c.scope, kind: "svg-inline" };
    }
    try {
      const absolute = new NodeURL(c.src, baseUrl).toString();
      const res = await tryFetchAsset(absolute, { responseType: "arraybuffer", timeout: 8000 });
      if (!res.data || res.data.length === 0) continue;
      const ct = res.headers["content-type"] || "";
      if (/^text\/html/i.test(ct)) continue;
      if (res.data.length > 200 * 1024) continue;
      const mime =
        /svg/i.test(ct) ? "image/svg+xml" :
        /png/i.test(ct) ? "image/png" :
        /jpe?g/i.test(ct) ? "image/jpeg" :
        /webp/i.test(ct) ? "image/webp" :
        absolute.endsWith(".svg") ? "image/svg+xml" :
        absolute.endsWith(".png") ? "image/png" :
        "image/png";
      if (mime === "image/jpeg" && res.data.length > 30 * 1024) continue;
      const b64 = Buffer.from(res.data).toString("base64");
      return { dataUrl: `data:${mime};base64,${b64}`, sourceUrl: absolute, size: res.data.length, mime, source: c.scope, kind: mime.includes("svg") ? "svg" : "img" };
    } catch {
      continue;
    }
  }

  return null;
}

// ── Font file embedding (cross-origin CORS bypass via data: URL) ────
const KNOWN_GOOGLE_FONTS = new Set([
  "inter", "manrope", "geist", "geist sans", "geist mono", "roboto", "open sans",
  "lato", "montserrat", "poppins", "noto sans", "noto serif", "playfair display",
  "merriweather", "raleway", "ubuntu", "oswald", "source sans pro", "source code pro",
  "fira code", "fira sans", "ibm plex sans", "ibm plex serif", "ibm plex mono",
  "jetbrains mono", "space grotesk", "space mono", "dm sans", "dm serif display",
  "instrument serif", "instrument sans", "outfit", "plus jakarta sans", "figtree",
  "work sans", "rubik", "barlow", "karla", "nunito", "nunito sans", "quicksand",
  "pt sans", "pt serif", "crimson text", "lora", "bitter", "cormorant",
]);

async function embedFontFiles(fontFaces, sourceUrl, requestedFamilies) {
  const embedded = {};
  if (!Array.isArray(fontFaces) || fontFaces.length === 0) return embedded;
  const requested = new Set((requestedFamilies || []).map(f => String(f).trim().toLowerCase().replace(/^"|"$/g, "")));
  const familyWeights = {};
  for (const face of fontFaces) {
    if (!face.family || !face.src_urls || face.src_urls.length === 0) continue;
    const familyLower = String(face.family).toLowerCase().replace(/^"|"$/g, "").trim();
    if (KNOWN_GOOGLE_FONTS.has(familyLower)) continue;
    if (requested.size > 0 && !requested.has(familyLower)) continue;
    if (!familyWeights[familyLower]) familyWeights[familyLower] = [];
    if (familyWeights[familyLower].length >= 2) continue;
    familyWeights[familyLower].push(face);
  }
  const allFaces = Object.values(familyWeights).flat().slice(0, 8);

  for (const face of allFaces) {
    const sortedUrls = [...face.src_urls.entries()]
      .sort((a, b) => {
        const fa = (face.src_formats && face.src_formats[a[0]]) || "";
        const fb = (face.src_formats && face.src_formats[b[0]]) || "";
        const score = (f) => /woff2/i.test(f) ? 0 : /woff/i.test(f) ? 1 : /truetype|ttf/i.test(f) ? 2 : 3;
        return score(fa) - score(fb);
      })
      .map(([, u]) => u);

    const baseUrl = face.source_css_url || sourceUrl;
    for (const u of sortedUrls.slice(0, 1)) {
      try {
        const absolute = new NodeURL(u, baseUrl).toString();
        if (embedded[absolute]) break;
        const res = await tryFetchAsset(absolute, { responseType: "arraybuffer", timeout: 10000 });
        if (!res.data || res.data.length === 0) continue;
        const ct = res.headers["content-type"] || "";
        const mime =
          /woff2/i.test(ct) || absolute.endsWith(".woff2") ? "font/woff2" :
          /woff/i.test(ct) || absolute.endsWith(".woff") ? "font/woff" :
          /ttf|truetype/i.test(ct) || absolute.endsWith(".ttf") ? "font/ttf" :
          /otf/i.test(ct) || absolute.endsWith(".otf") ? "font/otf" :
          "font/woff2";
        const b64 = Buffer.from(res.data).toString("base64");
        embedded[absolute] = `data:${mime};base64,${b64}`;
        break;
      } catch {
        continue;
      }
    }
  }
  return embedded;
}

module.exports = {
  fetchHtml,
  fetchCssOnce,
  resolveImports,
  collectCss,
  fetchFavicon,
  fetchLogo,
  embedFontFiles,
  KNOWN_GOOGLE_FONTS,
  HEADER_WHITELIST,
  // Exposed for unit testing the fallback chain (B7).
  isBlockedResponse,
  tryFetchAsset,
  HONEST_HEADERS,
  BROWSER_HEADERS,
  EXTRACTOR_UA,
};
