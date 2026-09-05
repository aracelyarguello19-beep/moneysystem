# Checklist: Design Extraction Quality

## Extraction integrity (extraction-no-fallbacks)
- [ ] Pipeline run on the real URL/inputs (not assumed)
- [ ] Every unfilled slot marked `null # extraction_gap(...)` — NOT a default
- [ ] No universal hex/scale/CTA defaults stamped
- [ ] Coverage % reflects real extraction (not inflated by fallbacks)

## Completeness
- [ ] Color, typography, spacing, radius, shadow, motion attempted
- [ ] Component inventory attempted
- [ ] Provider + flags + runtime caveats noted

## Output
- [ ] Report conforms to design-extract template; lifecycle = draft
