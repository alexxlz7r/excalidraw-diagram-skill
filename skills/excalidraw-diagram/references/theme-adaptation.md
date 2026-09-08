# Adapting a Diagram Theme

Read this reference for a user-specified style, visual reference, or diagram
inside a known presentation, document, site, application, or brand system.
Resolve one coherent diagram theme before layout, using the precedence and
whole-diagram scope in [SKILL.md](../SKILL.md#route-the-task).

## Resolution sequence

1. Read the user's style description and inspect any reference supplied for
   that purpose. When a host artifact is available, inspect its presentation
   master, document styles, site tokens, or brand colors for remaining values.
2. Translate the brief into background, foreground hierarchy, accent colors,
   typography, line weight, corner/roughness character, and transparency. For
   example, hand-drawn can use a handwriting font and rough strokes; clean
   technical can use monospace and smooth lines; minimal presentation can use
   sans-serif, thin lines, and restrained fills. These are starting directions,
   adjustable to the user's description.
3. Map the resolved colors into the semantic contract below. Derive missing
   tints or shades for readable fills, strokes, and states. Fill unspecified
   values from the existing scene, host, or standalone fallback as applicable.
4. Check every text/background pair. Require at least 4.5:1 for normal text and
   3:1 for large text (at least 24 px regular or 18.5 px bold).
5. Check semantic states as a set. Pair important color distinctions with
   labels, shape, stroke style, or icons so meaning survives grayscale and color
   vision differences.
6. Apply the resolved theme across the complete scene. Reuse it for related
   diagrams in the same artifact unless the user requests a different style.

When you create an artifact-local `diagram-theme.json`, validate its contract
and normal-text pairs before applying it:

```bash
node <skill-dir>/scripts/validate_theme.mjs <path-to-diagram-theme.json>
```

For a new presentation or site, establish its theme first. For an existing
artifact, derive unspecified values from the actual destination.

## Semantic contract

Resolve every field that the diagram uses:

```json
{
  "canvas": {
    "background": "#RRGGBB",
    "exportBackground": true
  },
  "text": {
    "primary": "#RRGGBB",
    "secondary": "#RRGGBB",
    "onFill": "#RRGGBB"
  },
  "accents": {
    "primary": { "fill": "#RRGGBB", "stroke": "#RRGGBB" },
    "secondary": { "fill": "#RRGGBB", "stroke": "#RRGGBB" },
    "tertiary": { "fill": "#RRGGBB", "stroke": "#RRGGBB" }
  },
  "states": {
    "start": { "fill": "#RRGGBB", "stroke": "#RRGGBB", "cue": "entry marker" },
    "success": { "fill": "#RRGGBB", "stroke": "#RRGGBB", "cue": "check label" },
    "warning": { "fill": "#RRGGBB", "stroke": "#RRGGBB", "cue": "warning label" },
    "decision": { "fill": "#RRGGBB", "stroke": "#RRGGBB", "cue": "diamond" },
    "ai": { "fill": "#RRGGBB", "stroke": "#RRGGBB", "cue": "AI label" },
    "error": { "fill": "#RRGGBB", "stroke": "#RRGGBB", "cue": "error label" },
    "inactive": { "fill": "#RRGGBB", "stroke": "#RRGGBB", "cue": "dashed outline" }
  },
  "lines": {
    "arrow": "#RRGGBB",
    "structural": "#RRGGBB"
  },
  "evidence": {
    "background": "#RRGGBB",
    "codeText": "#RRGGBB",
    "dataText": "#RRGGBB",
    "mutedText": "#RRGGBB"
  },
  "style": {
    "roughness": 0,
    "strokeWidth": { "structural": 1, "standard": 2, "emphasis": 3 },
    "fillStyle": "solid",
    "opacity": 100,
    "fontFamily": 3
  }
}
```

Each state also needs a `cue` string describing its non-color cue. The contract
describes semantics, not a requirement to create a sidecar. Write
values directly into a single scene. For multi-diagram or iterative work, an
artifact-local temporary `diagram-theme.json` may make the resolution durable
and resumable.

## Derivation rules

- Reuse the host background and foreground when they already meet contrast.
- Prefer host accents for primary, secondary, and tertiary roles. Create lighter
  fills or darker strokes from those hues only when the originals cannot support
  readable text and clear boundaries.
- Preserve familiar host semantic colors for success, warning, and error. When
  the host does not define a state, choose a distinct hue that still harmonizes
  with its accents.
- Adjust semantic fills until the resolved on-fill text color passes against
  every fill; the base contract assumes labels may be normal-sized text.
- Match line weight, roughness, corner character, and typography to the resolved
  brief, inheriting unspecified details from the host while keeping text legible.
- Use `canvas.exportBackground: false` when the host background should show
  through, which is often appropriate for slides. Still set the scene's
  `viewBackgroundColor` to the host background so preview decisions are made in
  context.

## Contrast check

Use WCAG relative luminance: linearize each sRGB channel, compute
`0.2126R + 0.7152G + 0.0722B`, then calculate
`(lighter + 0.05) / (darker + 0.05)`. Record or recompute the ratios whenever a
foreground or background changes. Stroke/fill contrast can support boundaries,
but it does not replace the text contrast requirement.

## State and immutability

Treat `default-theme.md` and this file as read-only. Store any resolved theme
beside the working artifact or in a temporary directory, never inside the
installed skill. This prevents concurrent tasks, read-only plugin caches, and
plugin upgrades from changing one another's output.
