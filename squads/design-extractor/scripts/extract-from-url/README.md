# extract-from-url — Universal URL → DESIGN.md Pipeline

Extracts a Google-spec [`DESIGN.md`](https://github.com/google-labs-code/design.md)
from any public URL using static HTML/CSS analysis (no headless browser).

**Universal mode (2026-05-03):** Works with **any** LLM — no Claude CLI required.
Pick the provider that fits your environment (Codex, Manus, CI runner,
self-hosted, etc.) via env vars or `--provider`.

## Providers

| Provider | Env vars | Default model | When to use |
|---|---|---|---|
| `openrouter` | `OPENROUTER_API_KEY` | `anthropic/claude-haiku-4-5` | **Recommended.** One key, any model: `openai/gpt-5`, `google/gemini-2.5-pro`, `meta-llama/llama-4-405b`, claude family, etc. |
| `anthropic-api` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` | Native Anthropic API. No CLI required. Lowest latency for Claude. |
| `openai` | `OPENAI_API_KEY` | `gpt-5-mini` | Native OpenAI API. Includes Codex backends. |
| `generic-http` | `GENERIC_HTTP_ENDPOINT` + `GENERIC_HTTP_API_KEY` | `auto` (set via `GENERIC_HTTP_DEFAULT_MODEL`) | Together, Groq, Mistral, Manus, Fireworks, vLLM, Ollama — anything OpenAI-compatible. |
| `claude-cli` | (none — needs `claude` on PATH) | `claude-opus-4-7` | Local dev with Claude Code CLI installed. |

Auto-detection priority: `OPENROUTER_API_KEY` > `ANTHROPIC_API_KEY` > `OPENAI_API_KEY`
> `GENERIC_HTTP_ENDPOINT+KEY` > `claude-cli` (only if `claude` binary on PATH).
Fails fast with an actionable error message if none configured.

## Quick run

```bash
# OpenRouter (universal — any model)
OPENROUTER_API_KEY=sk-or-... \
  node squads/design-ops/scripts/extract-from-url/run.cjs \
  --url https://stripe.com/

# OpenAI native (Codex / GPT family)
OPENAI_API_KEY=sk-... \
  node squads/design-ops/scripts/extract-from-url/run.cjs \
  --url https://stripe.com/ \
  --provider openai \
  --model gpt-5

# Anthropic API direct (no CLI needed)
ANTHROPIC_API_KEY=sk-ant-... \
  node squads/design-ops/scripts/extract-from-url/run.cjs \
  --url https://stripe.com/ \
  --provider anthropic-api \
  --model claude-sonnet-4-6

# Generic OpenAI-compatible (e.g. Groq, Together, Manus)
GENERIC_HTTP_ENDPOINT=https://api.groq.com/openai/v1/chat/completions \
GENERIC_HTTP_API_KEY=gsk_... \
GENERIC_HTTP_DEFAULT_MODEL=llama-3.3-70b-versatile \
  node squads/design-ops/scripts/extract-from-url/run.cjs \
  --url https://stripe.com/ \
  --provider generic-http
```

## Use as MCP server (Codex / Cursor / Manus / any MCP host)

The `mcp-server.cjs` exposes the pipeline as a Model Context Protocol tool over
stdio. Add to your MCP client config:

```json
{
  "mcpServers": {
    "design-md": {
      "command": "node",
      "args": ["/abs/path/to/squads/design-ops/scripts/extract-from-url/mcp-server.cjs"],
      "env": { "OPENROUTER_API_KEY": "sk-or-..." }
    }
  }
}
```

The host calls `tools/list` to discover the `extract_design_md` tool, then
invokes it with `{ url, provider?, model?, ... }`.

Smoke test:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | node squads/design-ops/scripts/extract-from-url/mcp-server.cjs
```

## Output protocol — inline-mode (universal)

The LLM returns the full DESIGN.md content as its response body (starting with
`---` frontmatter). The host script writes it to disk. This works for **every**
provider — providers without filesystem tools (OpenRouter, OpenAI, Anthropic API,
generic HTTP) and providers that have them (Claude CLI). The previous "use Write
tool" instruction has been replaced; inline body is the contract.

If a provider also writes to `OUTPUT_PATH` via a Write tool (Claude CLI), the
inline body wins — it's the source of truth.

Each run also emits `extraction-class.json`, the first audit file to inspect
before comparing quality numbers. It records `operational_mode`
(`live_extraction`, `imported_curated_md`, `curated_orphan`,
`scratch_orphan`, `partial_failed`, or `manual_or_legacy`), `coverage_real`,
mode-specific completeness, `extraction_gap_count`, fallback suspects, and
recommended next action. New telemetry is annotated with the same mode fields.
Promotion is blocked when `no-fallbacks-report.json` records a failing
`GATE-FALLBACKS` result; the run is archived to `history/{timestamp}` instead
of replacing the current root extraction.

Each run also copies the machine-readable process contract to
`inputs/process-contract.json` and injects it into `inputs/prompt.txt`. The
contract materializes the no-fallback doctrine and required DESIGN.md structure
as data loaded by the authoring process itself.

## Flags

| Flag | Default | Notes |
|---|---|---|
| `--url <url>` | required | Public http(s) URL |
| `--out <dir>` | `outputs/design-ops/url-extracts/<slug>/` | Override output directory |
| `--prompt <file>` | `squads/design-ops/data/url-extract-prompt.txt` | Custom prompt template |
| `--compare <file>` | — | Local DESIGN.md to drift-check against |
| `--no-content-gate` | off | Skip content-validation gate (R1) |
| `--no-llm-retry` | off | Fail hard on first LLM error (CI mode) |
| `--no-reuse` | off | Force cold run, no phase reuse |
| `--no-learning` | off | Skip `.aiox/learning/logs/extract-from-url/` execution-log emission |
| `--provider <id>` | auto-detect | `claude-cli` \| `openrouter` \| `openai` \| `anthropic-api` \| `generic-http` |
| `--model <id>` | provider default | Model id for the chosen provider |
| `--max-tokens <n>` | 32768 | HTTP providers only; override lower if a provider/model rejects large completions |
| `--manual-recovery` | off | Mark the current run as hand-recovered from static evidence instead of live LLM-authored |
| `--scaffold` | off | After extract+enrich, emit `apps/design/src/data/designs/<slug>/design.md` |
| `--scaffold-out <path>` | derived | Override scaffold output path |
| `--scaffold-force` | off | Overwrite existing scaffold file |
| `--emit-showcase` | off | Emit `showcase.html` with Tailwind v4 Browser CDN, literal `@theme`, and extracted `.preview-*` component classes |
| `--emit-tailwind` | off | Deprecated alias for `--emit-showcase` |

## Environment variables

| Var | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | Required for `--provider openrouter` |
| `OPENROUTER_DEFAULT_MODEL` | Override OpenRouter default model |
| `OPENAI_API_KEY` | Required for `--provider openai` |
| `OPENAI_DEFAULT_MODEL` | Override OpenAI default model |
| `OPENAI_ENDPOINT` | Override OpenAI endpoint (default: api.openai.com) |
| `ANTHROPIC_API_KEY` | Required for `--provider anthropic-api` |
| `ANTHROPIC_DEFAULT_MODEL` | Override Anthropic default model |
| `ANTHROPIC_ENDPOINT` | Override Anthropic endpoint |
| `GENERIC_HTTP_ENDPOINT` | Required for `--provider generic-http` (full /v1/chat/completions URL) |
| `GENERIC_HTTP_API_KEY` | Required for `--provider generic-http` |
| `GENERIC_HTTP_DEFAULT_MODEL` | Default model for generic-http |
| `GENERIC_HTTP_HEADERS` | Optional JSON of extra headers (e.g. `'{"X-Custom":"v"}'`) |
| `GENERIC_HTTP_AUTH_HEADER` | Override auth header name (default: `Authorization`) |
| `GENERIC_HTTP_AUTH_PREFIX` | Override auth prefix (default: `Bearer `) |
| `DESIGN_MD_OUTPUTS_DIR` | Override outputs root for the helper scripts |
| `DESIGN_MD_POST_HOOK` | Optional Node script invoked as `node $HOOK $outDir` after each extract |
| `DESIGN_MD_SKIP_HOOK` | Set to `1` to bypass the post-hook |
| `DESIGN_MD_MAX_TURNS` | Override claude-cli max-turns (default 90) |
| `DESIGN_MD_TIMEOUT_MS` | Override claude-cli subprocess timeout (default 900000) |
| `DESIGN_MD_MAX_TOKENS` | Override HTTP provider max_tokens default (default 32768) |
| `DESIGN_MD_RETRY_MAX_TOKENS` | Override retry max_tokens ceiling after length failures (default 65536) |
| `DESIGN_MD_SKIP_LEARNING` | Set to `1` to bypass `.aiox/learning` execution-log emission |

## Pipeline (8 phases)

1. `axios.get(url)` → HTML
2. `cheerio` walks `<link rel="stylesheet">`, inline `<style>`, `style=""` →
   fetches and concatenates all CSS (preload + `@import` resolved)
3. Regex pass detects: hex/rgb/hsl, font properties, border-radius, padding/
   margin/gap, Google Fonts URLs, component states, selector provenance,
   asymmetry signals, atomic selector buckets, motion transitions, and keyframe
   bodies. Emits `stack.json` (Next.js, Tailwind, Radix, GSAP, …) and
   `style-fingerprint.json` (shadcn-neutral, carbon-enterprise, apple-glass,
   polaris-friendly, marketing-gradient, …)
4. `turndown` HTML → markdown; first heading + first long paragraph become the
   type specimen `pageCopy`
5. Templates `data/url-extract-prompt.txt` with input file paths (HTML, CSS,
   page-copy, tokens-detected, css-vars, font-faces, stack-summary)
6. Invoke LLM via `lib/llm.cjs` (provider-agnostic). LLM returns DESIGN.md
   inline; host writes to disk. Normalize + lint (`@google/design.md@0.1.0`)
   + retry once on length / missing sections
7. Parse YAML frontmatter → `tokens.json`. Build `tokens-extended.json` with
   `atomic_layer` and `pattern_tokens`, `render-contract.json` with
   `slot_contract`, `extraction-log.yaml`, quality score, and drift report
   (if `--compare`). Record font source URLs in `inputs/embedded-fonts.json`;
   do not inline font binaries as base64 by default.
8. Render single-file `preview.html` — color swatches, typography (Google
   Fonts), spacing/radius scales, raw DESIGN.md (Prism CDN), audit panel with
   fingerprint summary
9. If `--emit-showcase` is set, render `showcase.html` from extracted sidecars
   only: palette, typography, button states, motion, and asymmetry sections.
   The artifact is a visualization of DESIGN.md tokens; DESIGN.md remains the
   source of truth.

## Learning Loop

Every completed run writes a SINKRA execution log to:

```bash
.aiox/learning/logs/extract-from-url/extract-from-url-<slug>-<runTs>.yaml
```

Failures caught by the crash handler also emit a failed execution log. These
logs use the existing `.aiox/learning/schemas/execution-log-schema.yaml`
shape and populate `epilogue.what_worked`, `what_failed`, and
`decision_drift`, so `npm run dream-cycle` can process them in D10 via
`scripts/learning-digester.js --min-score 0.5`. The digester creates draft
Observations under `.aiox/learning/entries/extract-from-url/`; it does not
create or promote Learning Entries automatically. Promotion still requires
explicit human `RECORD`.

## ADR-052 Atomic Taxonomy Outputs

`tokens-extended.json` now annotates extracted component entries with:

- `atomic_layer`: `atom`, `molecule`, `organism`, `layout`, `page`, `pattern`, or `null`.
- `atomic_layer_reasoning`: the deterministic question that matched.
- `atomic_layer_gap`: explicit `extraction_gap(...)` when classification is not supported by evidence.

`tokens-extended.json#pattern_tokens` separates cross-component patterns from foundations:

- `motion`
- `focus`
- `elevation`
- `z_index_scale`

When a pattern category has no extracted signal, the value is `null` plus a sibling `*_gap` marker. `render-contract.json#slot_contract` emits extracted layout slots (`header`, `rail`, `main`, `aside`, `footer`) and responsive-rule evidence or an explicit gap.

## Testing

```bash
cd squads/design-ops/scripts/extract-from-url
node --test lib/*.test.cjs lib/providers/*.test.cjs
```

## Deterministic Backfills

From the repository root:

```bash
node squads/design-ops/scripts/extract-from-url/scripts/backfill-render-contract.cjs --only=youtube
node squads/design-ops/scripts/extract-from-url/scripts/backfill-quality-score.cjs --only=youtube
node squads/design-ops/scripts/extract-from-url/scripts/audit-corpus.cjs --write --history --annotate-telemetry
```

Use these after renderer or scoring logic changes. They do not call the LLM; they only rebuild derived artifacts from existing extraction inputs.
`audit-corpus.cjs` writes `extraction-class.json` for existing roots/history and
generates `outputs/design-ops/url-extracts/_reports/corpus-audit-latest.md`.

## Anti-patterns

- **No fallbacks in extraction** (per `.claude/rules/extraction-no-fallbacks.md`).
  Extractors emit only extracted/aliased/derived-from-brand values OR
  `null  # extraction_gap(...)` markers. Never universal hex/scale defaults.
  Coverage from fallbacks is false coverage.
  Runtime source of truth: `data/extraction-process-contract.json`, copied to
  each run at `inputs/process-contract.json`.
- **No headless browser.** Static analysis + LLM only. Don't add Playwright /
  Puppeteer / Hyperbrowser.
- **No bypass of content-validation gate** without `--no-content-gate`.
  Thin content (bot blocks, paywalls, JS shells) wastes LLM turns.

## References

- **Spec:** [`@google/design.md`](https://github.com/google-labs-code/design.md) v0.1.0
- **Awesome catalog:** [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)
- **Loaded process contract:** `squads/design-ops/scripts/extract-from-url/data/extraction-process-contract.json`
- **MCP spec:** [modelcontextprotocol.io](https://modelcontextprotocol.io)
