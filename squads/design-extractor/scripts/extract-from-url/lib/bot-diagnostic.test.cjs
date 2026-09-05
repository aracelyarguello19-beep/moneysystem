"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { classifyResponse, hasSpaShellMarker, extractSpaPayloads } = require("./bot-diagnostic.cjs");

// ── classifyResponse — verdict surface ──────────────────────────────

test("classifyResponse: AWS WAF challenge with awsWafCookie marker", () => {
  const html = `<!DOCTYPE html><html><script>window.awsWafCookieDomainList=[];</script></html>`;
  const result = classifyResponse({ html, headers: { server: "Server" }, status: 202 });
  assert.equal(result.verdict, "aws-waf-challenge");
  assert.ok(result.recommendation.length > 20);
});

test("classifyResponse: Akamai Bot Manager via AkamaiGHost server", () => {
  const html = `<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD></HTML>`;
  const result = classifyResponse({ html, headers: { server: "AkamaiGHost" }, status: 403 });
  assert.equal(result.verdict, "akamai-bot-manager");
});

test("classifyResponse: Cloudflare via cf-ray header", () => {
  const html = `<html><head><title>Just a moment...</title></head><body>checking</body></html>`;
  const result = classifyResponse({ html, headers: { "cf-ray": "abc123-GRU" }, status: 200 });
  assert.equal(result.verdict, "cloudflare-challenge");
  assert.equal(result.signals.cf_ray, "abc123-GRU");
});

test("classifyResponse: SPA shell when html has __NEXT_DATA__ marker", () => {
  const html = `<html><head><title>App</title></head><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">{}</script></body></html>`;
  const result = classifyResponse({ html, headers: {}, status: 200 });
  assert.equal(result.verdict, "spa-shell");
});

test("classifyResponse: paywall verdict for subscription-locked content", () => {
  const html = `<html><head><title>Subscribe to read</title></head><body><div class="paywall">premium content</div></body></html>`;
  const result = classifyResponse({ html, headers: {}, status: 200 });
  assert.equal(result.verdict, "paywall");
});

test("classifyResponse: unknown-thin for short response without markers", () => {
  const html = `<html><head><title>Welcome</title></head><body><p>Hello</p></body></html>`;
  const result = classifyResponse({ html, headers: { server: "nginx" }, status: 200 });
  assert.equal(result.verdict, "unknown-thin");
});

// ── hasSpaShellMarker ───────────────────────────────────────────────

test("hasSpaShellMarker: detects __NEXT_DATA__", () => {
  assert.equal(hasSpaShellMarker(`<script id="__NEXT_DATA__" type="application/json">{}</script>`), true);
});

test("hasSpaShellMarker: detects __NUXT__", () => {
  assert.equal(hasSpaShellMarker(`<script>window.__NUXT__={}</script>`), true);
});

test("hasSpaShellMarker: detects JSON-LD script", () => {
  assert.equal(hasSpaShellMarker(`<script type="application/ld+json">{"@context":"x"}</script>`), true);
});

test("hasSpaShellMarker: false for plain HTML", () => {
  assert.equal(hasSpaShellMarker(`<html><body><h1>x</h1></body></html>`), false);
});

// ── extractSpaPayloads ──────────────────────────────────────────────

test("extractSpaPayloads: recovers colors from __NEXT_DATA__ JSON", () => {
  const html = `<html><body><script id="__NEXT_DATA__" type="application/json">
    {"props":{"theme":{"colors":{"primary":"#ff6200","secondary":"#0066b2","accent":"rgb(255,98,0)"}}}}
  </script></body></html>`;
  const result = extractSpaPayloads(html);
  assert.equal(result.found, true);
  assert.ok(result.colorsRecovered >= 3);
  assert.ok(result.synthCss.includes("#ff6200"));
});

test("extractSpaPayloads: recovers font-family from JSON payload", () => {
  const html = `<html><body><script type="application/json">
    {"theme":{"font-family":"Inter, sans-serif","fontFamily":"Roboto"}}
  </script></body></html>`;
  const result = extractSpaPayloads(html);
  assert.ok(result.fontFamiliesRecovered >= 1);
});

test("extractSpaPayloads: recovers CSS variable pairs from inline JSON", () => {
  const html = `<html><body><script id="__NEXT_DATA__" type="application/json">
    {"vars":{"--brand-primary":"#0066ff","--space-md":"16px","--radius-button":"8px"}}
  </script></body></html>`;
  const result = extractSpaPayloads(html);
  assert.ok(result.cssVarsRecovered >= 3);
  assert.ok(result.synthCss.includes("--brand-primary"));
});

test("extractSpaPayloads: returns empty result for HTML with no payloads", () => {
  const html = `<html><body><h1>plain</h1></body></html>`;
  const result = extractSpaPayloads(html);
  assert.equal(result.found, false);
  assert.equal(result.colorsRecovered, 0);
});
