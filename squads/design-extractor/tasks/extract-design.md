# Task: Extract Design from URL

**Executor:** design-extractor
**Inputs (call-time):** target URL (or raw CSS/HTML/screenshot inputs) + extraction focus.
**Output:** `outputs/design-extractor/{slug}/DESIGN.md` (+ tokens) — lifecycle: draft

## Steps

1. **Confirm input:** URL (or raw inputs) and focus (full system vs. tokens-only).
2. **Run the pipeline:** `node scripts/extract-from-url/run.cjs --url <url> [flags]` (see the tooling README for provider/flag options).
3. **Assess coverage honestly:** list extracted slots vs. `extraction_gap` slots. No fallbacks.
4. **Assemble** the design extract report per `templates/design-extract-report-tmpl.md`.

## Done criteria

- Pipeline run on the real URL/inputs provided.
- Tokens + component inventory captured; gaps marked `null # extraction_gap(...)`.
- No fabricated/default values (extraction-no-fallbacks respected).
- Output validates against the template; lifecycle = draft.
