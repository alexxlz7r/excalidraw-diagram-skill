# Renderer bundle

`excalidraw-bundle.js` is a generated local browser bundle and is intentionally
gitignored. `setup_renderer.sh` builds it from the exact versions in
`package-lock.json`, then prunes the build-only Excalidraw, React, and esbuild
packages. Exporting is offline after setup.

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
