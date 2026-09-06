# Rebuilding `excalidraw-bundle.js`

`render_template.html` loads this bundle from disk as a classic script. It was
originally an ES-module import from `https://esm.sh/@excalidraw/excalidraw?bundle`,
which does not return a single bundled file — it returns an entry that fans out into
hundreds of ES modules. Headless Chromium never finished loading them, so every render
died on the 30 s `__moduleReady` timeout.

Current bundle: Excalidraw `0.18.1` (see `VERSION`), ~8 MB minified, fonts inlined as
data URIs, React + React DOM included. The generated bundle is gitignored and is built
locally from the versions pinned in `../package-lock.json`.

From the `references` directory, install and build with:

```bash
npm ci
npm run build:bundle
```

`./setup_renderer.sh` also performs these steps. When upgrading Excalidraw, update the
exact version in `../package.json`, regenerate `../package-lock.json`, update `VERSION`,
then rebuild and run the renderer tests from `references`:

```bash
uv run python -m unittest discover -s tests -v
```

Notes:
- `--format=iife` (not `esm`): the template uses a plain `<script>` tag, so no module
  resolution happens in the browser at all.
- `--loader:.woff2=dataurl` is what keeps rendering offline — otherwise the exported SVG
  references font files that Chromium would try to fetch.
- `--define:process.env.*` is required: the source reads `process.env`, which does not
  exist in the browser, and esbuild would otherwise emit a runtime crash.
