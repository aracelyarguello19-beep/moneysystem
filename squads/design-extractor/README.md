# Design Extractor Squad

Agnostic (standalone-ready) squad that extracts a **design system from a URL** (tokens,
colors, typography, spacing, components) into a `DESIGN.md`. `workspace_integration.level:
none` — the URL/inputs are provided at call time; no business workspace is read.

## Entry

`/design-extractor:design-extractor` — the Design Extraction Specialist.

## How it works

Wraps the embedded `extract-from-url` tooling (`scripts/extract-from-url/`, entry
`run.cjs --url <url>`). The agent orchestrates the run and assembles a `DESIGN.md` +
tokens, marking honest `extraction_gap`s (extraction-no-fallbacks — no default stamping).

## Output

`outputs/design-extractor/{slug}/DESIGN.md` (+ tokens), per
`templates/design-extract-report-tmpl.md`.

## Runtime

The tooling has its own runtime deps (headless browser, optional model keys) documented in
`scripts/extract-from-url/README.md`. Structural portability is proven; running `*extract`
at a destination requires those deps present.

## Provenance

Carved from the `design-ops` squad's `extract-from-url` subsystem (97 files, zero workspace
coupling) into a standalone wrapper squad. See `docs/stories/STORY-EXPORT-SQUAD.md`.
