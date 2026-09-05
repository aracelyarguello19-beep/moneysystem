"use strict";

// atomic-classifier.cjs
//
// Heuristic classifier that buckets extracted selectors into atomic-design
// taxonomy: atoms / molecules / organisms / templates / pages.
//
// IMPORTANT — this is a v1 conservative classifier:
//   - Only assigns classifications when a selector matches a known pattern
//     OR is present in `component-properties.json` (canonical extractor output)
//   - Selectors that do not match any pattern are left in `unclassified`
//   - The `unclassified_count` metric is the truthful signal of classifier
//     reach. CSS Modules / hashed-class brands (medium uses .em / .ep / .ct)
//     produce HIGH unclassified counts — this is correct and expected.
//
// Per .claude/rules/extraction-no-fallbacks.md: do NOT guess organisms or
// pages from absent evidence. Classifier reports what it can prove and
// nothing else.
//
// Per .claude/rules/kiss-no-overengineering.md: this module starts as a
// dictionary-of-regexes. Sophistication added only when real failure data
// shows the dictionary is insufficient.

const { tokenizeRules } = require("./component-state-extractor.cjs");

// Pattern dictionaries. Each key is a canonical id (atomic vocabulary).
// Each value is an array of RegExp matchers; OR semantics across the array.
const ATOM_PATTERNS = {
  button: [/^button$/, /^\.btn(-|$)/, /^\.button(-|$)/, /^\.cta(-|$)/, /^a\.btn/i, /^a\.button/i],
  input: [/^input$/, /^textarea$/, /^select$/, /^\.input(-|$)/, /^\.form-input/, /^\.field-input/],
  card: [/^\.card(-|$)/, /^\.tile(-|$)/, /^\.feed-card/, /^\.story-card/, /^article(\.|$|\s)/i],
  badge: [/^\.badge(-|$)/, /^\.tag(-|$)/, /^\.chip(-|$)/, /^\.label(-|$)/, /^\.pill(-|$)/],
  avatar: [/^\.avatar(-|$)/, /^\.profile-image/, /^\.user-image/, /^\.userpic/],
  link: [/^a$/, /^\.link(-|$)/, /^a:hover$/, /^\.anchor(-|$)/],
  icon: [/^\.icon(-|$)/, /^svg$/, /^\.svg(-|$)/, /^\.glyph(-|$)/],
  divider: [/^hr$/, /^\.divider(-|$)/, /^\.separator(-|$)/, /^\.rule(-|$)/],
  spinner: [/^\.spinner(-|$)/, /^\.loader(-|$)/, /^\.loading(-|$)/],
  toggle: [/^\.toggle(-|$)/, /^\.switch(-|$)/, /^input\[type="?checkbox"?\]/],
  progress: [/^progress$/, /^\.progress(-|$)/, /^\.progress-bar/],
  tooltip: [/^\.tooltip(-|$)/, /^\[role="tooltip"\]/, /^\[data-tooltip\]/],
};

const MOLECULE_PATTERNS = {
  // Molecule = group of atoms used together. Conservative — most molecules
  // require HTML/component-tree analysis to identify reliably.
  "button-group": [/^\.btn-group(-|$)/, /^\.button-group(-|$)/, /^\.action-group(-|$)/],
  "form-field": [/^\.form-field(-|$)/, /^\.field(-|$)/, /^label\s/i, /^\.input-group/],
  "breadcrumb": [/^\.breadcrumb(-|$)/, /^nav\.breadcrumb/i],
  "search": [/^\.search(-|$)/, /^\.search-bar/, /^\.searchbox/],
  "tabs": [/^\.tabs(-|$)/, /^\.tablist(-|$)/, /^\[role="tablist"\]/],
  "alert": [/^\.alert(-|$)/, /^\.notification(-|$)/, /^\.banner(-|$)/, /^\[role="alert"\]/],
  "highlight-popover": [/^\.highlight-popover/, /^\.selection-toolbar/, /^\.text-highlight/],
};

const ORGANISM_PATTERNS = {
  nav: [/^nav$/, /^\.nav$/, /^\.navbar(-|$)/, /^\.navigation(-|$)/, /^\.menu(-|$)/, /^header$/, /^\.header(-|$)/],
  footer: [/^footer$/, /^\.footer(-|$)/, /^\.site-footer/, /^\.page-footer/],
  sidebar: [/^aside$/, /^\.sidebar(-|$)/, /^\.side-panel/, /^\.sidenav(-|$)/],
  hero: [/^\.hero(-|$)/, /^\.jumbotron(-|$)/, /^\.feature-block/, /^\.lead-section/],
  paywall: [/^\.paywall(-|$)/, /^\.member-bar/, /^\.upgrade-prompt/, /^\.subscription-bar/],
  "story-card-list": [/^\.story-list/, /^\.feed(-|$)/, /^\.timeline(-|$)/, /^\.article-list/],
  "card-grid": [/^\.card-grid/, /^\.tile-grid/, /^\.gallery(-|$)/, /^\.collection(-|$)/],
  modal: [/^\.modal(-|$)/, /^\.dialog(-|$)/, /^\[role="dialog"\]/],
  drawer: [/^\.drawer(-|$)/, /^\.offcanvas(-|$)/],
  toast: [/^\.toast(-|$)/, /^\.snackbar(-|$)/, /^\.flash-message/],
};

const TEMPLATE_PATTERNS = {
  "app-shell": [/^\.shell(-|$)/, /^\.app-shell/, /^\.application(-|$)/, /^body$/, /^main$/],
  layout: [/^\.layout(-|$)/, /^\.page-layout/, /^\.container(-|$)/, /^\.wrapper(-|$)/],
  grid: [/^\.grid(-|$)/, /^\.row(-|$)/, /^\.col-/, /^\.column(-|$)/],
};

const PAGE_PATTERNS = {
  // Pages are concrete instances. Without HTML structure, only explicit
  // page-class signals classify here.
  "home-page": [/^\.home-page/, /^\.landing-page/, /^body\.home$/, /^body\.landing$/],
  "profile-page": [/^\.profile-page/, /^\.user-page/, /^body\.profile$/],
  "article-page": [/^\.article-page/, /^\.story-page/, /^\.post-page/, /^body\.article$/],
  "editor-page": [/^\.editor-page/, /^\.write-page/, /^body\.editor$/],
};

// Strip a selector down to a "head" form for pattern matching. Drops state
// pseudos (handled separately by component-state-extractor) and child/descendant
// combinators that are not part of the head atom.
function selectorHead(selector) {
  if (!selector) return "";
  // Take the first segment before > + ~ or whitespace (descendant combinator)
  // BUT preserve element[attr] and pseudos attached to the head.
  let head = selector.trim();
  // Strip @media / @supports remnants (defensive)
  head = head.replace(/^@[\w-]+\s+/, "");
  // Take first comma-separated alternative
  head = head.split(",")[0].trim();
  // Take first whitespace-bounded token (descendant combinator) — but keep
  // adjacent attributes/pseudos. Simple heuristic: stop at the first space
  // outside of [] and () groups.
  let bracket = 0;
  let paren = 0;
  let end = head.length;
  for (let i = 0; i < head.length; i++) {
    const ch = head[i];
    if (ch === "[") bracket++;
    else if (ch === "]") bracket = Math.max(0, bracket - 1);
    else if (ch === "(") paren++;
    else if (ch === ")") paren = Math.max(0, paren - 1);
    else if (/\s/.test(ch) && bracket === 0 && paren === 0) {
      end = i;
      break;
    }
    else if ((ch === ">" || ch === "+" || ch === "~") && bracket === 0 && paren === 0) {
      end = i;
      break;
    }
  }
  return head.slice(0, end).trim();
}

function matchAny(selectorHeadValue, patterns) {
  for (const re of patterns) {
    if (re.test(selectorHeadValue)) return true;
  }
  return false;
}

function classifySelector(selector) {
  const head = selectorHead(selector);
  if (!head) return null;
  for (const [id, patterns] of Object.entries(ATOM_PATTERNS)) {
    if (matchAny(head, patterns)) return { layer: "atoms", id };
  }
  for (const [id, patterns] of Object.entries(MOLECULE_PATTERNS)) {
    if (matchAny(head, patterns)) return { layer: "molecules", id };
  }
  for (const [id, patterns] of Object.entries(ORGANISM_PATTERNS)) {
    if (matchAny(head, patterns)) return { layer: "organisms", id };
  }
  for (const [id, patterns] of Object.entries(TEMPLATE_PATTERNS)) {
    if (matchAny(head, patterns)) return { layer: "templates", id };
  }
  for (const [id, patterns] of Object.entries(PAGE_PATTERNS)) {
    if (matchAny(head, patterns)) return { layer: "pages", id };
  }
  return null;
}

function classifyAtomic({ css, componentProperties }) {
  const result = {
    atoms: {},
    molecules: {},
    organisms: {},
    templates: {},
    pages: {},
    unclassified: { selectors: [], count: 0 },
  };

  // Pass 1: ingest component-properties.json declared keys as atom evidence.
  // The detectComponentProperties extractor already has its own canonical
  // vocabulary (button, card, input, badge) — surface them as atoms with
  // explicit provenance.
  if (componentProperties && typeof componentProperties === "object") {
    const summary = componentProperties.summary || {};
    for (const componentId of Object.keys(summary)) {
      const entry = summary[componentId];
      if (entry && typeof entry === "object" && Object.keys(entry).length > 0) {
        if (!result.atoms[componentId]) {
          result.atoms[componentId] = {
            id: componentId,
            evidence: { from_component_properties: true, selector_matches: [] },
            selector_count: 0,
          };
        } else {
          result.atoms[componentId].evidence.from_component_properties = true;
        }
      }
    }
  }

  // Pass 2: walk CSS rules and classify each selector
  if (css && typeof css === "string") {
    const rules = tokenizeRules(css);
    for (const rule of rules) {
      // For multi-comma selectors, classify each part
      const parts = rule.selector.split(",").map((s) => s.trim()).filter(Boolean);
      for (const part of parts) {
        const cls = classifySelector(part);
        if (!cls) {
          result.unclassified.count++;
          if (result.unclassified.selectors.length < 50) {
            result.unclassified.selectors.push(part);
          }
          continue;
        }
        const layer = result[cls.layer];
        if (!layer[cls.id]) {
          layer[cls.id] = {
            id: cls.id,
            evidence: { from_component_properties: false, selector_matches: [] },
            selector_count: 0,
          };
        }
        if (layer[cls.id].evidence.selector_matches.length < 30) {
          layer[cls.id].evidence.selector_matches.push(part);
        }
        layer[cls.id].selector_count++;
      }
    }
  }

  // Convert each layer object to a sorted array for consistent output
  const layers = ["atoms", "molecules", "organisms", "templates", "pages"];
  const out = {};
  for (const layer of layers) {
    out[layer] = Object.values(result[layer]).sort((a, b) => b.selector_count - a.selector_count);
  }
  out.unclassified = result.unclassified;

  // Summary counts
  const totalClassified = layers.reduce((sum, l) => sum + out[l].length, 0);
  const totalSelectors = totalClassified + result.unclassified.count;
  out.summary = {
    atom_count: out.atoms.length,
    molecule_count: out.molecules.length,
    organism_count: out.organisms.length,
    template_count: out.templates.length,
    page_count: out.pages.length,
    classified_distinct: totalClassified,
    unclassified_count: result.unclassified.count,
    classification_coverage_pct: totalSelectors > 0
      ? Math.round((totalClassified / totalSelectors) * 1000) / 10
      : 0,
  };

  return out;
}

module.exports = {
  classifyAtomic,
  // exported for tests
  classifySelector,
  selectorHead,
  ATOM_PATTERNS,
  MOLECULE_PATTERNS,
  ORGANISM_PATTERNS,
  TEMPLATE_PATTERNS,
  PAGE_PATTERNS,
};
