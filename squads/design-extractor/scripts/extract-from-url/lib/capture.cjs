"use strict";

/**
 * Visual capture module — Phase 1.5 of extract-from-url.
 *
 * Drives a headless Chromium (via puppeteer) to capture screenshots of the
 * target URL at multiple viewports. Default tier is WebP @ 1x deviceScaleFactor
 * q85 (≈85% smaller than PNG @ 2x with no visible loss for design analysis).
 *
 * Each capture passes a quality gate (file_size + DOM text length + heading
 * count). Failures retry with PNG @ 2x and longer wait — page may not have
 * fully rendered (slow JS, animations, lazy-loaded content).
 *
 * Outputs:
 *   <inputsDir>/captures/{NN-name}.{webp|png}
 *   <inputsDir>/captures-manifest.json
 *
 * The manifest is consumed downstream by:
 *   - inputs-manifest.json (sha256 + reuse tracking)
 *   - LLM prompt (visual evidence summary in text form)
 *   - vision LLM (when configured) for richer aesthetic descriptions
 */

const fs = require("fs");
const path = require("path");

// Tier definitions ─────────────────────────────────────────────────────
// TIER_WEBP: default, fast, small. Adequate for ≥90% of marketing pages.
// TIER_PNG : fallback when quality gate fails. Lossless, slower, more faithful.
const TIER_WEBP = { type: "webp", quality: 85, scale: 1, ext: "webp", waitUntil: "networkidle2", settleMs: 800,  timeoutMs: 30000 };
const TIER_PNG  = { type: "png",                scale: 2, ext: "png",  waitUntil: "networkidle0", settleMs: 2000, timeoutMs: 60000 };

// Default capture set — covers above-fold + full-scroll across 3 viewports.
// Future sectioned-capture work will append section-by-section variants.
const DEFAULT_VIEWPORTS = [
  { id: "01-hero-desktop",     w: 1440, h: 900,  fullPage: false, label: "Desktop hero (above-fold)",    minSizeKb: 20 },
  { id: "02-fullpage-desktop", w: 1440, h: 900,  fullPage: true,  label: "Desktop full-page",            minSizeKb: 80 },
  { id: "03-fullpage-tablet",  w: 768,  h: 1024, fullPage: true,  label: "Tablet full-page",             minSizeKb: 60 },
  { id: "04-fullpage-mobile",  w: 390,  h: 844,  fullPage: true,  label: "Mobile full-page (iPhone 14)", minSizeKb: 50 },
];

function evaluateQualityGate({ bytes, dom, vp }) {
  const sizeKb = bytes / 1024;
  const failures = [];
  if (sizeKb < vp.minSizeKb) failures.push(`size_too_small (${sizeKb.toFixed(1)}KB < ${vp.minSizeKb}KB threshold)`);
  if ((dom.text_length || 0) < 300) failures.push(`text_length_too_short (${dom.text_length || 0} chars)`);
  if ((dom.headings || 0) < 1) failures.push(`no_headings_detected`);
  return {
    passed: failures.length === 0,
    failures,
    signals: {
      size_kb: +sizeKb.toFixed(1),
      text_length: dom.text_length,
      headings: dom.headings,
      images: dom.images,
    },
  };
}

async function captureOnce(page, vp, tier, url, filePath) {
  await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: tier.scale });
  await page.goto(url, { waitUntil: tier.waitUntil, timeout: tier.timeoutMs });
  await new Promise((r) => setTimeout(r, tier.settleMs));

  const opts = { path: filePath, fullPage: vp.fullPage, type: tier.type };
  if (tier.quality != null) opts.quality = tier.quality;
  await page.screenshot(opts);

  const dom = await page.evaluate(() => ({
    text_length: document.body ? document.body.innerText.length : 0,
    headings: document.querySelectorAll("h1, h2, h3").length,
    images: document.images.length,
    title: document.title || "",
  }));

  return { dom, bytes: fs.statSync(filePath).size };
}

/**
 * Run capture pipeline against `url`, writing PNG/WebP files into
 * `<inputsDir>/captures/` and a `captures-manifest.json` summary.
 *
 * @param {object} options
 * @param {string} options.url            Target URL.
 * @param {string} options.inputsDir      Run inputs/ dir (captures land in inputs/captures/).
 * @param {object} [options.logger]       Optional logger with .log/.warn/.error. Defaults to console.
 * @param {Array}  [options.viewports]    Override default viewports list.
 * @param {object} [options.puppeteer]    Inject a puppeteer module (for tests).
 * @returns {Promise<object>}             Manifest written to disk.
 */
async function runCapture({ url, inputsDir, logger = console, viewports = DEFAULT_VIEWPORTS, puppeteer: puppeteerOverride } = {}) {
  if (!url) throw new Error("runCapture: url is required");
  if (!inputsDir) throw new Error("runCapture: inputsDir is required");

  const puppeteer = puppeteerOverride || require("puppeteer");
  const capturesDir = path.join(inputsDir, "captures");
  fs.mkdirSync(capturesDir, { recursive: true });

  const t0 = Date.now();
  logger.log(`     captures: launching headless chromium…`);
  const browser = await puppeteer.launch({ headless: true });

  const manifest = {
    schema_version: "1.0",
    url,
    captured_at: new Date().toISOString(),
    tiers: { default: "webp@1x_q85", fallback: "png@2x" },
    viewports: [],
  };

  try {
    for (const vp of viewports) {
      const page = await browser.newPage();
      let final = null;

      try {
        const webpPath = path.join(capturesDir, `${vp.id}.${TIER_WEBP.ext}`);
        const r = await captureOnce(page, vp, TIER_WEBP, url, webpPath);
        const gate = evaluateQualityGate({ bytes: r.bytes, dom: r.dom, vp });
        logger.log(`     captures: ${vp.id} webp ${(r.bytes / 1024).toFixed(1)}KB · text=${r.dom.text_length} · h=${r.dom.headings} · gate=${gate.passed ? "PASS" : "FAIL"}`);

        if (gate.passed) {
          final = { format: "webp", file: path.relative(inputsDir, webpPath), bytes: r.bytes, dom: r.dom, retried: false, gate };
        } else {
          logger.warn(`     captures: ${vp.id} quality-gate failed (${gate.failures.join(", ")}) — retrying PNG@2x`);
          const pngPath = path.join(capturesDir, `${vp.id}.${TIER_PNG.ext}`);
          const r2 = await captureOnce(page, vp, TIER_PNG, url, pngPath);
          const gate2 = evaluateQualityGate({ bytes: r2.bytes, dom: r2.dom, vp });
          logger.log(`     captures: ${vp.id} png  ${(r2.bytes / 1024).toFixed(1)}KB · text=${r2.dom.text_length} · h=${r2.dom.headings} · gate=${gate2.passed ? "PASS" : "FAIL"}`);
          // Drop the failed webp to avoid confusion downstream
          try { fs.unlinkSync(webpPath); } catch {}
          final = { format: "png", file: path.relative(inputsDir, pngPath), bytes: r2.bytes, dom: r2.dom, retried: true, retry_reason: gate.failures, gate: gate2 };
        }
      } catch (err) {
        logger.error(`     captures: ${vp.id} failed — ${err.message}`);
        final = { error: err.message };
      } finally {
        await page.close();
      }

      manifest.viewports.push({
        id: vp.id,
        label: vp.label,
        viewport: `${vp.w}×${vp.h}`,
        fullPage: vp.fullPage,
        ...final,
      });
    }
  } finally {
    await browser.close();
  }

  manifest.total_wall_ms = Date.now() - t0;
  const ok = manifest.viewports.filter((v) => v.format && !v.error).length;
  const retries = manifest.viewports.filter((v) => v.retried).length;
  const totalBytes = manifest.viewports.reduce((s, v) => s + (v.bytes || 0), 0);
  manifest.summary = { count: manifest.viewports.length, ok, retries, errors: manifest.viewports.length - ok, total_bytes: totalBytes };

  fs.writeFileSync(path.join(inputsDir, "captures-manifest.json"), JSON.stringify(manifest, null, 2));
  logger.log(`     captures: ${ok}/${manifest.viewports.length} ok · ${retries} png-fallback · ${(totalBytes / 1024 / 1024).toFixed(2)}MB · ${(manifest.total_wall_ms / 1000).toFixed(1)}s`);

  return manifest;
}

module.exports = {
  runCapture,
  evaluateQualityGate,
  captureOnce,
  DEFAULT_VIEWPORTS,
  TIER_WEBP,
  TIER_PNG,
};
