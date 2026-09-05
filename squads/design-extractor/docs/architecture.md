# Design Extractor — Architecture

Wrapper squad (`level: none`): one agent over the embedded `extract-from-url` tooling.

- **design-extractor** (entry) — orchestrates extraction from a call-time URL.
- **Embedded tooling:** `scripts/extract-from-url/` (97 files) — carved from the
  `design-ops` squad. Entry: `run.cjs --url <url>`; MCP server: `mcp-server.cjs`.
- Output: `DESIGN.md` + tokens per `templates/design-extract-report-tmpl.md` → `outputs/design-extractor/{slug}/`.
- Quality gate: `checklists/extraction-quality-checklist.md` (extraction-no-fallbacks).

## Why a wrapper

The original "design extractor" was a 97-file script subsystem with zero agents inside the
large `design-ops` squad — not a SINKRA squad. This squad carves that subsystem out and
adds the minimal agent + contracts to make it activatable and portable. The tooling itself
has no workspace coupling (verified: zero `workspace/businesses`, `.sinkra`, `_system` refs).

## Runtime note

Structural portability ≠ tooling runtime. The embedded scripts have their own runtime deps
(headless browser, optional model keys). A destination must provide those for `*extract` to
run; absence is reported as a gap, never guessed. See `scripts/extract-from-url/README.md`.

Portable: passes export-squad PORTABLE + activation-test. See `docs/stories/STORY-EXPORT-SQUAD.md`.
