#!/usr/bin/env bash
# Build the local Excalidraw bundle and retain only the Playwright runtime.
set -euo pipefail

renderer_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$renderer_dir"

npm ci --no-audit --no-fund
npm run build:bundle
# The exporter serves these fonts to Excalidraw, so SVGs embed them offline.
rm -rf vendor/fonts
cp -R node_modules/@excalidraw/excalidraw/dist/prod/fonts vendor/fonts
npm prune --omit=dev --no-audit --no-fund

if [ "${EXCALIDRAW_SKIP_BROWSER_INSTALL:-0}" != "1" ]; then
  npx playwright install chromium
fi

echo "Excalidraw exporter is ready."
