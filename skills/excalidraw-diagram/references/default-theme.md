# Default Diagram Theme

Use [default-theme.json](default-theme.json) as the immutable fallback for
standalone diagrams and whenever the destination artifact is unknown. Copy its
resolved values into the working Excalidraw scene; do not edit the installed
JSON or this file at runtime.

The theme intentionally uses light semantic fills, dark boundaries, and a
single dark on-fill text color. Every normal text pairing passes 4.5:1 contrast;
the lowest on-fill pairing is 13.20:1. Semantic states also carry a non-color cue
such as shape, label, or stroke style.

Map the theme to the scene as follows:

- `canvas.background` → `appState.viewBackgroundColor`;
- `canvas.exportBackground` → `appState.exportBackground`;
- `text.*` → free-floating or on-fill text `strokeColor`;
- accent/state `fill` and `stroke` → shape `backgroundColor` and
  `strokeColor`;
- `lines.*` → arrow and structural-line `strokeColor`;
- `style.*` → the corresponding element properties.

Before using the fallback after any maintained change, validate it with:

```bash
node scripts/validate_theme.mjs references/default-theme.json
```
