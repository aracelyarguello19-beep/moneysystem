"use strict";

// atomic-section-tools.cjs
//
// Validate and reorder atomic-design preview-HTML sections per the canonical
// 13-section taxonomy at squads/design-ops/data/atomic-section-taxonomy.yaml.
//
// Operates on HTML where each section is preceded by a marker comment:
//   <!-- 01 ATOMS · Color palette -->
//   <section class="md-section"> ... </section>
//
// Critical bugfix encoded from the 30-hour transform-html-tailwind-gold-standard
// session: section block extraction MUST bound by the NEXT-MARKER-START
// position, NEVER by `</section>`. Non-greedy `</section>` matching truncates
// at the FIRST nested close tag (e.g. inner `<section class="md-feed">` inside
// app-shell's Section 09), eating ~4kB of content.

const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

let _cachedTaxonomy = null;

function loadTaxonomy(taxonomyPath) {
  if (_cachedTaxonomy && !taxonomyPath) return _cachedTaxonomy;
  const target = taxonomyPath || path.join(__dirname, "..", "..", "..", "data", "atomic-section-taxonomy.yaml");
  const raw = fs.readFileSync(target, "utf8");
  const parsed = YAML.parse(raw);
  if (!taxonomyPath) _cachedTaxonomy = parsed;
  return parsed;
}

// Locate every section marker in the HTML. Returns an array of:
//   { n, marker_text, marker_start, marker_end, signature_match }
// where marker_start is the index of `<!--` and marker_end is the index AFTER `-->`.
function locateMarkers(html) {
  if (!html || typeof html !== "string") return [];
  const re = /<!--\s*(\d{2})\s+([^\n]*?)\s*-->/g;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push({
      n: m[1],
      marker_text: m[2].trim(),
      marker_start: m.index,
      marker_end: m.index + m[0].length,
    });
  }
  return out;
}

// Extract the block for each marker, bounded by the next marker's start
// (or the start of `<footer` / end-of-string for the last block).
// Returns array of { n, marker_text, block_start, block_end, content }.
function extractBlocks(html, markers) {
  if (!Array.isArray(markers) || markers.length === 0) return [];
  // Find the "tail boundary" — typically `<footer` start or end of HTML.
  const footerIdx = html.search(/<footer\b/i);
  const tail = footerIdx === -1 ? html.length : footerIdx;

  const blocks = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].marker_start;
    const end = i + 1 < markers.length ? markers[i + 1].marker_start : tail;
    blocks.push({
      n: markers[i].n,
      marker_text: markers[i].marker_text,
      block_start: start,
      block_end: end,
      content: html.slice(start, end),
    });
  }
  return blocks;
}

function matchSignatureToTaxonomy(markerText, content, taxonomy) {
  if (!taxonomy || !Array.isArray(taxonomy.sections)) return null;
  for (const section of taxonomy.sections) {
    const sig = section.content_signature || "";
    if (!sig) continue;
    if (markerText.includes(sig) || content.includes(sig)) {
      return section;
    }
  }
  return null;
}

// Validate that the section markers in the HTML follow canonical atomic order.
// Returns { valid: bool, sequence: [], errors: [], warnings: [] }
function validateAtomicOrder(html, options) {
  const opts = options || {};
  const taxonomy = opts.taxonomy || loadTaxonomy(opts.taxonomyPath);
  const markers = locateMarkers(html);
  const blocks = extractBlocks(html, markers);

  const errors = [];
  const warnings = [];
  const sequence = [];
  let lastN = 0;

  for (const block of blocks) {
    const matched = matchSignatureToTaxonomy(block.marker_text, block.content, taxonomy);
    const expectedN = matched ? parseInt(matched.n, 10) : null;
    const actualN = parseInt(block.n, 10);

    sequence.push({
      n: block.n,
      marker_text: block.marker_text,
      matched_id: matched ? matched.id : null,
      matched_n: matched ? matched.n : null,
    });

    if (!matched) {
      warnings.push(`Section ${block.n} ("${block.marker_text}") did not match any taxonomy signature.`);
    }
    if (matched && expectedN !== actualN) {
      errors.push(`Section ${block.n} ("${block.marker_text}") matches taxonomy entry ${matched.n} (${matched.id}); marker number is wrong.`);
    }
    if (actualN <= lastN) {
      errors.push(`Section ${block.n} appears after section ${lastN.toString().padStart(2, "0")} — order is not monotonic.`);
    }
    lastN = actualN;
  }

  // Detect missing canonical sections — warning only (per "Allowed deviations"
  // policy in the taxonomy YAML).
  const seen = new Set(blocks.map((b) => b.n));
  for (const section of taxonomy.sections) {
    if (!seen.has(section.n)) {
      warnings.push(`Canonical section ${section.n} (${section.id}) is missing.`);
    }
  }

  return {
    valid: errors.length === 0,
    sequence,
    errors,
    warnings,
    block_count: blocks.length,
    canonical_count: taxonomy.sections.length,
  };
}

// Reorder + renumber sections according to canonical taxonomy.
// Strategy:
//   1. Extract all blocks with extractBlocks (next-marker-start bounded).
//   2. Match each block to a canonical taxonomy entry via signature.
//   3. When the same canonical entry has multiple matching blocks, keep the
//      LARGEST (preserves the most-evolved iteration after iterative
//      composition, per the gold-standard reorder learning).
//   4. Reassemble in canonical order with renumbered markers (and renumbered
//      `<span class="num">NN</span>` if present inside blocks).
//   5. Replace the original block range in the HTML with the reordered version.
function reorderSections(html, options) {
  const opts = options || {};
  const taxonomy = opts.taxonomy || loadTaxonomy(opts.taxonomyPath);
  const markers = locateMarkers(html);
  if (markers.length === 0) {
    return { html, changed: false, message: "No markers found — nothing to reorder.", report: [] };
  }
  const blocks = extractBlocks(html, markers);

  // Build canonical-id → [blocks] map; pick largest per id
  const byId = new Map();
  const orphans = [];
  const matchedBlockStarts = new Set();
  for (const block of blocks) {
    const matched = matchSignatureToTaxonomy(block.marker_text, block.content, taxonomy);
    if (!matched) {
      orphans.push(block);
      continue;
    }
    matchedBlockStarts.add(block.block_start);
    const list = byId.get(matched.id) || [];
    list.push({ block, matched });
    byId.set(matched.id, list);
  }
  for (const [id, list] of byId.entries()) {
    list.sort((a, b) => b.block.content.length - a.block.content.length);
    byId.set(id, [list[0]]);
  }

  // Reassemble matched blocks in canonical order, but never drop unmatched
  // custom sections. We insert the canonical block group at the first matched
  // section position and preserve orphan blocks as the scan encounters them.
  const reordered = [];
  for (const section of taxonomy.sections) {
    const list = byId.get(section.id);
    if (!list || list.length === 0) continue;
    const { block } = list[0];
    let content = block.content;
    // Renumber the marker line itself
    content = content.replace(
      /<!--\s*\d{2}\s+([^\n]*?)\s*-->/,
      `<!-- ${section.n} ${section.title} -->`
    );
    // Renumber any inline number spans within the block (Medium-style)
    content = content.replace(
      /<span class="num">\d{2}<\/span>/g,
      `<span class="num">${section.n}</span>`
    );
    reordered.push({ id: section.id, n: section.n, content });
  }

  if (reordered.length === 0) {
    return { html, changed: false, message: "No blocks matched taxonomy.", report: [] };
  }

  // Replace [first marker_start, last block_end] with reordered concatenation
  const firstStart = blocks[0].block_start;
  const lastEnd = blocks[blocks.length - 1].block_end;
  const before = html.slice(0, firstStart);
  const after = html.slice(lastEnd);

  const selectedBlockStarts = new Set();
  for (const list of byId.values()) {
    for (const item of list) selectedBlockStarts.add(item.block.block_start);
  }
  let canonicalInserted = false;
  const rebuilt = [];
  for (const block of blocks) {
    if (selectedBlockStarts.has(block.block_start)) {
      if (!canonicalInserted) {
        rebuilt.push(...reordered.map((item) => item.content));
        canonicalInserted = true;
      }
      continue;
    }
    if (matchedBlockStarts.has(block.block_start)) {
      continue;
    }
    rebuilt.push(block.content);
  }
  if (!canonicalInserted) {
    rebuilt.push(...reordered.map((item) => item.content));
  }

  const newHtml = before + rebuilt.join("\n") + after;

  const report = reordered.map((item) => ({
    canonical_n: item.n,
    canonical_id: item.id,
  }));

  return {
    html: newHtml,
    changed: newHtml !== html,
    message: `Reordered ${reordered.length} sections (${orphans.length} orphan section${orphans.length === 1 ? "" : "s"} preserved).`,
    report,
    orphan_count: orphans.length,
  };
}

module.exports = {
  loadTaxonomy,
  locateMarkers,
  extractBlocks,
  validateAtomicOrder,
  reorderSections,
  matchSignatureToTaxonomy,
};
