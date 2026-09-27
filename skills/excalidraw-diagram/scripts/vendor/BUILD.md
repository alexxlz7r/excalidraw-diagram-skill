# Renderer bundle

`excalidraw-bundle.js` is a generated local browser bundle and is intentionally
gitignored. `setup_renderer.sh` builds it from the exact versions in
`package-lock.json`, copies the Excalidraw fonts to `fonts/` (also gitignored,
about 13 MB, most of it the Xiaolai CJK fallback), then prunes the build-only
Excalidraw, React, and esbuild packages.

Exporting is offline after setup. Excalidraw requests its fonts from esm.sh;
`export_excalidraw.mjs` answers these requests from `fonts/` and blocks every
other network request. If a font is missing, the export fails instead of
linking the CDN in the SVG.

Current Excalidraw version: `0.18.1` (also recorded in `VERSION`). At the last
check this was the latest npm release. Full `npm audit` still reports findings
inside Excalidraw's build-only transitive tree; `npm audit --omit=dev` checks the
retained runtime. Do not use `npm audit fix --force`, which proposes an unwanted
downgrade.

To upgrade, change the exact versions in `package.json`, regenerate the lock,
update `VERSION`, and run:

```bash
./setup_renderer.sh
npm test
```
