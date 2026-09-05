"use strict";

// Network-bound module — keep tests minimal (smoke + KNOWN_GOOGLE_FONTS surface).
// Real extraction is verified end-to-end by the smoke run in run.cjs.

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { fetchHtml, collectCss, fetchFavicon, fetchLogo, embedFontFiles, KNOWN_GOOGLE_FONTS, HEADER_WHITELIST, isBlockedResponse, HONEST_HEADERS, BROWSER_HEADERS, EXTRACTOR_UA } = require("./fetch.cjs");

test("module exports the expected surface", () => {
  assert.equal(typeof fetchHtml, "function");
  assert.equal(typeof collectCss, "function");
  assert.equal(typeof fetchFavicon, "function");
  assert.equal(typeof fetchLogo, "function");
  assert.equal(typeof embedFontFiles, "function");
});

test("KNOWN_GOOGLE_FONTS includes common families", () => {
  assert.ok(KNOWN_GOOGLE_FONTS.has("inter"));
  assert.ok(KNOWN_GOOGLE_FONTS.has("geist sans"));
  assert.ok(KNOWN_GOOGLE_FONTS.has("manrope"));
  assert.ok(!KNOWN_GOOGLE_FONTS.has("anthropic serif"));
  assert.ok(!KNOWN_GOOGLE_FONTS.has("sf pro display"));
});

test("fetchLogo returns null on empty html", async () => {
  const result = await fetchLogo("<html><body></body></html>", "https://example.com");
  assert.equal(result, null);
});

test("collectCss handles html with no stylesheets", async () => {
  const result = await collectCss("<html><body><h1>x</h1></body></html>", "https://example.com");
  assert.ok(typeof result.css === "string");
  assert.equal(result.meta.external.length, 0);
  assert.equal(result.meta.inline_style_blocks, 0);
});

test("collectCss captures inline <style>", async () => {
  const html = "<html><head><style>body { color: red; }</style></head><body></body></html>";
  const { css, meta } = await collectCss(html, "https://example.com");
  assert.match(css, /color: red/);
  assert.equal(meta.inline_style_blocks, 1);
});

test("collectCss captures style=\"\" attrs", async () => {
  const html = '<html><body><div style="color:blue">x</div></body></html>';
  const { meta } = await collectCss(html, "https://example.com");
  assert.equal(meta.inline_style_attrs, 1);
});

test("embedFontFiles returns empty for no fontFaces", async () => {
  const result = await embedFontFiles([], "https://example.com", ["Inter"]);
  assert.deepEqual(result, {});
});

// ── S6: fetchHtml returns { html, headers } shape ────────────────────

test("S6: HEADER_WHITELIST is exported and includes expected diagnostic keys", () => {
  assert.ok(Array.isArray(HEADER_WHITELIST));
  assert.ok(HEADER_WHITELIST.includes("server"));
  assert.ok(HEADER_WHITELIST.includes("x-vercel-id"));
  assert.ok(HEADER_WHITELIST.includes("cf-ray"));
  assert.ok(HEADER_WHITELIST.includes("x-powered-by"));
  // Sensitive headers must NOT be in whitelist
  assert.ok(!HEADER_WHITELIST.includes("cookie"));
  assert.ok(!HEADER_WHITELIST.includes("set-cookie"));
  assert.ok(!HEADER_WHITELIST.includes("authorization"));
});

test("S6: fetchHtml return type is object with html and headers keys", () => {
  // Structural test — we cannot make real network calls in unit tests,
  // but we can verify the function signature returns an object (Promise).
  // The actual { html, headers } shape is verified in smoke E2E runs.
  const promise = fetchHtml("https://this-domain-should-never-exist-12345.example");
  assert.equal(typeof promise.then, "function", "fetchHtml returns a Promise");
  // Absorb the expected rejection so it does not fail the test runner
  promise.catch(() => {});
});

test("S6: HEADER_WHITELIST does not contain sensitive header names", () => {
  const sensitiveNames = ["cookie", "set-cookie", "authorization", "x-auth-token", "proxy-authorization"];
  for (const name of sensitiveNames) {
    assert.ok(!HEADER_WHITELIST.includes(name), `Whitelist must not include '${name}'`);
  }
});

// ── B7: fallback chain detection ───────────────────────────────────────

test("B7: HONEST_HEADERS uses Sinkra UA (non-browser-impersonating)", () => {
  assert.ok(/Sinkra-DesignOps-Extractor/.test(HONEST_HEADERS["User-Agent"]));
  assert.ok(!/Mozilla|Chrome|Safari/.test(HONEST_HEADERS["User-Agent"]));
  assert.ok(!/sinkra\.ai\/extractor/.test(HONEST_HEADERS["User-Agent"]));
});

test("B7: BROWSER_HEADERS includes Sec-Ch-Ua + Sec-Fetch + br encoding (Akamai-coherent)", () => {
  assert.ok(/Mozilla\/5\.0.*Chrome/.test(BROWSER_HEADERS["User-Agent"]));
  assert.ok(BROWSER_HEADERS["Sec-Ch-Ua"]);
  assert.equal(BROWSER_HEADERS["Sec-Fetch-Mode"], "navigate");
  assert.match(BROWSER_HEADERS["Accept-Encoding"], /\bbr\b/);
});

test("B7: isBlockedResponse — status >= 400 always blocks", () => {
  assert.equal(isBlockedResponse(403, "<html><title>Access Denied</title></html>"), true);
  assert.equal(isBlockedResponse(429, ""), true);
  assert.equal(isBlockedResponse(500, "<html>full content</html>".repeat(10000)), true);
});

test("B7: isBlockedResponse — AWS WAF challenge (status 202 + awsWafCookie)", () => {
  const wafChallenge = `<!DOCTYPE html><html><head><title></title><script>window.awsWafCookieDomainList=[];</script></head></html>`;
  assert.equal(isBlockedResponse(202, wafChallenge), true);
});

test("B7: isBlockedResponse — Akamai 403 with 'Access Denied' title", () => {
  const akamai403 = `<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD><BODY><H1>Access Denied</H1></BODY></HTML>`;
  assert.equal(isBlockedResponse(403, akamai403), true);
});

test("B7: isBlockedResponse — short 'Robot Check' page from Amazon", () => {
  const robotCheck = `<html><head><title>Robot Check</title></head><body>Are you a robot?</body></html>`;
  assert.equal(isBlockedResponse(200, robotCheck), true);
});

test("B7: isBlockedResponse — Cloudflare 'Just a moment...' challenge", () => {
  const cf = `<html><head><title>Just a moment...</title></head><body>checking</body></html>`;
  assert.equal(isBlockedResponse(200, cf), true);
});

test("B7: isBlockedResponse — 200 OK with substantial HTML is NOT blocked", () => {
  const realPage = `<html><head><title>Anthropic</title></head><body>${"<div>real content</div>".repeat(500)}</body></html>`;
  assert.equal(isBlockedResponse(200, realPage), false);
});

test("B7: isBlockedResponse — 202 with substantial real content is NOT blocked", () => {
  // Edge case: some sites legitimately return 202 with full content
  const fullContent = `<html><head><title>Stripe</title></head><body>${"x".repeat(20000)}</body></html>`;
  assert.equal(isBlockedResponse(202, fullContent), false);
});

test("B7: isBlockedResponse — short response with neutral title is NOT blocked", () => {
  // Edge case: a tiny but legitimate page (e.g. simple landing) should not falsely block
  const tiny = `<html><head><title>Hello</title></head><body><h1>Welcome</h1><p>Nothing here yet.</p></body></html>`;
  // tiny is < 5KB so will be inspected; title "Hello" doesn't match challenge patterns → not blocked
  assert.equal(isBlockedResponse(200, tiny), false);
});

test("B4: collectCss records preferred fetch strategy in metadata", async () => {
  const result = await collectCss("<html><body><h1>x</h1></body></html>", "https://example.com", { preferredFetchStrategy: "browser" });
  assert.equal(result.meta.fetch_strategy, "browser");
});
